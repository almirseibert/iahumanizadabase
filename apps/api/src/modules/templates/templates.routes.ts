import type { FastifyInstance } from "fastify";
import { request } from "undici";
import { waTemplateSchema } from "@iah/shared";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { decrypt } from "../../lib/crypto.js";
import { AppError, NotFoundError } from "../../lib/errors.js";

interface MetaTemplate {
  name: string;
  language: string;
  status: string;
  components?: Array<{ type: string; text?: string }>;
}

export async function templatesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/templates", async (req) => {
    const tenantId = req.resolveTenantId();
    const templates = await prisma.waTemplate.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return { templates };
  });

  app.post("/templates", async (req, reply) => {
    const tenantId = req.resolveTenantId();
    const input = waTemplateSchema.parse(req.body);
    const template = await prisma.waTemplate.upsert({
      where: {
        tenantId_name_language: { tenantId, name: input.name, language: input.language },
      },
      create: { ...input, tenantId },
      update: { body: input.body, paramCount: input.paramCount, purpose: input.purpose },
    });
    return reply.code(201).send({ template });
  });

  app.delete("/templates/:id", async (req, reply) => {
    const tenantId = req.resolveTenantId();
    const { id } = req.params as { id: string };
    await prisma.waTemplate.deleteMany({ where: { id, tenantId } });
    return reply.code(204).send();
  });

  // Importa os templates aprovados direto do painel da Meta (WABA)
  app.post("/templates/sync", async (req) => {
    const tenantId = req.resolveTenantId();
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError();
    if (!tenant.waBusinessAccountId || !tenant.waAccessTokenEnc) {
      throw new AppError("Configure o WhatsApp Business Account ID e o token do tenant primeiro");
    }

    const res = await request(
      `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${tenant.waBusinessAccountId}/message_templates?limit=100`,
      { headers: { authorization: `Bearer ${decrypt(tenant.waAccessTokenEnc)}` } },
    );
    const data = (await res.body.json()) as { data?: MetaTemplate[]; error?: { message: string } };
    if (res.statusCode >= 400 || data.error) {
      throw new AppError(`Meta retornou erro: ${data.error?.message ?? res.statusCode}`);
    }

    let imported = 0;
    for (const t of data.data ?? []) {
      const body = t.components?.find((c) => c.type === "BODY")?.text ?? "";
      const paramCount = (body.match(/\{\{\d+\}\}/g) ?? []).length;
      await prisma.waTemplate.upsert({
        where: { tenantId_name_language: { tenantId, name: t.name, language: t.language } },
        create: { tenantId, name: t.name, language: t.language, body, paramCount, metaStatus: t.status },
        update: { body, paramCount, metaStatus: t.status },
      });
      imported++;
    }
    return { imported };
  });
}
