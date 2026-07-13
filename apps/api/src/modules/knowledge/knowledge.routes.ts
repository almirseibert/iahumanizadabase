import type { FastifyInstance } from "fastify";
import { knowledgeChunkSchema } from "@iah/shared";
import { prisma } from "../../lib/prisma.js";

export async function knowledgeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/knowledge", async (req) => {
    const tenantId = req.resolveTenantId();
    const chunks = await prisma.knowledgeChunk.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return { chunks };
  });

  app.post("/knowledge", async (req, reply) => {
    const tenantId = req.resolveTenantId();
    const input = knowledgeChunkSchema.parse(req.body);
    const chunk = await prisma.knowledgeChunk.create({ data: { ...input, tenantId } });
    return reply.code(201).send({ chunk });
  });

  app.delete("/knowledge/:id", async (req, reply) => {
    const tenantId = req.resolveTenantId();
    const { id } = req.params as { id: string };
    await prisma.knowledgeChunk.deleteMany({ where: { id, tenantId } });
    return reply.code(204).send();
  });
}
