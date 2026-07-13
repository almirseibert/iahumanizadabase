import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

// Base de conhecimento por tenant com busca full-text em português.
// Upgrade futuro: embeddings + pgvector (ver ROADMAP).

export async function hasKnowledge(tenantId: string): Promise<boolean> {
  return (await prisma.knowledgeChunk.count({ where: { tenantId } })) > 0;
}

interface SearchRow {
  id: string;
  title: string;
  content: string;
  rank: number;
}

/** Busca por relevância (tsvector português); fallback ILIKE se a query FTS não casar */
export async function searchKnowledge(
  tenantId: string,
  query: string,
  limit = 4,
): Promise<Array<{ title: string; content: string }>> {
  const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    SELECT id, title, content,
      ts_rank(
        to_tsvector('portuguese', title || ' ' || content),
        plainto_tsquery('portuguese', ${query})
      ) AS rank
    FROM "KnowledgeChunk"
    WHERE "tenantId" = ${tenantId}
      AND to_tsvector('portuguese', title || ' ' || content)
          @@ plainto_tsquery('portuguese', ${query})
    ORDER BY rank DESC
    LIMIT ${limit}
  `);

  if (rows.length > 0) {
    return rows.map((r) => ({ title: r.title, content: r.content }));
  }

  // Fallback: busca por substring (útil para termos curtos/siglas)
  const fallback = await prisma.knowledgeChunk.findMany({
    where: {
      tenantId,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
      ],
    },
    take: limit,
  });
  return fallback.map((r) => ({ title: r.title, content: r.content }));
}
