import type { FastifyInstance } from "fastify";
import { catalogItemSchema } from "@iah/shared";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/catalog", async (req) => {
    const tenantId = req.resolveTenantId();
    const items = await prisma.catalogItem.findMany({
      where: { tenantId },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return { items };
  });

  app.post("/catalog", async (req, reply) => {
    const tenantId = req.resolveTenantId();
    const input = catalogItemSchema.parse(req.body);
    const item = await prisma.catalogItem.create({ data: { ...input, tenantId } });
    return reply.code(201).send({ item });
  });

  app.patch("/catalog/:id", async (req) => {
    const tenantId = req.resolveTenantId();
    const { id } = req.params as { id: string };
    const input = catalogItemSchema.partial().parse(req.body);
    const existing = await prisma.catalogItem.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundError("Item não encontrado");
    const item = await prisma.catalogItem.update({ where: { id }, data: input });
    return { item };
  });

  app.delete("/catalog/:id", async (req, reply) => {
    const tenantId = req.resolveTenantId();
    const { id } = req.params as { id: string };
    await prisma.catalogItem.deleteMany({ where: { id, tenantId } });
    return reply.code(204).send();
  });
}
