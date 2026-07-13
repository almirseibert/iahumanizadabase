import type { FastifyInstance } from "fastify";
import { externalConnectorSchema } from "@iah/shared";
import { prisma } from "../../lib/prisma.js";
import { encrypt } from "../../lib/crypto.js";
import { NotFoundError } from "../../lib/errors.js";

export async function connectorsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.requireRole("SUPERADMIN", "ADMIN"));

  app.get("/connectors", async (req) => {
    const tenantId = req.resolveTenantId();
    const connectors = await prisma.externalConnector.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    // Nunca expor headers (criptografados) ao dashboard
    return {
      connectors: connectors.map((c) => {
        const config = c.config as { baseUrl?: string; headersEnc?: string };
        return {
          id: c.id,
          name: c.name,
          type: c.type,
          baseUrl: config.baseUrl ?? "",
          hasAuthHeaders: Boolean(config.headersEnc),
          endpoints: c.endpoints,
          active: c.active,
        };
      }),
    };
  });

  app.post("/connectors", async (req, reply) => {
    const tenantId = req.resolveTenantId();
    const input = externalConnectorSchema.parse(req.body);
    const connector = await prisma.externalConnector.create({
      data: {
        tenantId,
        name: input.name,
        type: "REST",
        config: {
          baseUrl: input.baseUrl,
          ...(input.headers && Object.keys(input.headers).length
            ? { headersEnc: encrypt(JSON.stringify(input.headers)) }
            : {}),
        },
        endpoints: input.endpoints,
        active: input.active,
      },
    });
    return reply.code(201).send({ connector: { id: connector.id } });
  });

  app.patch("/connectors/:id", async (req) => {
    const tenantId = req.resolveTenantId();
    const { id } = req.params as { id: string };
    const existing = await prisma.externalConnector.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundError("Conector não encontrado");

    const input = externalConnectorSchema.partial().parse(req.body);
    const currentConfig = existing.config as { baseUrl?: string; headersEnc?: string };

    await prisma.externalConnector.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.endpoints ? { endpoints: input.endpoints } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        config: {
          baseUrl: input.baseUrl ?? currentConfig.baseUrl,
          ...(input.headers && Object.keys(input.headers).length
            ? { headersEnc: encrypt(JSON.stringify(input.headers)) }
            : currentConfig.headersEnc
              ? { headersEnc: currentConfig.headersEnc }
              : {}),
        },
      },
    });
    return { ok: true };
  });

  app.delete("/connectors/:id", async (req, reply) => {
    const tenantId = req.resolveTenantId();
    const { id } = req.params as { id: string };
    await prisma.externalConnector.deleteMany({ where: { id, tenantId } });
    return reply.code(204).send();
  });
}
