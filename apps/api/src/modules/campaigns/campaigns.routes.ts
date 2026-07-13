import type { FastifyInstance } from "fastify";
import { createCampaignSchema } from "@iah/shared";
import { prisma } from "../../lib/prisma.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { campaignQueue } from "../../queues/index.js";

export async function campaignsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/campaigns", async (req) => {
    const tenantId = req.resolveTenantId();
    const campaigns = await prisma.campaign.findMany({
      where: { tenantId },
      include: { template: { select: { name: true, body: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { campaigns };
  });

  // Cria e já dispara a campanha (fila com rate limit cuida do ritmo)
  app.post("/campaigns", { preHandler: [app.requireRole("SUPERADMIN", "ADMIN")] }, async (req, reply) => {
    const tenantId = req.resolveTenantId();
    const input = createCampaignSchema.parse(req.body);

    const template = await prisma.waTemplate.findFirst({
      where: { id: input.templateId, tenantId },
    });
    if (!template) throw new NotFoundError("Template não encontrado");
    if (input.bodyParams.length !== template.paramCount) {
      throw new AppError(
        `O template "${template.name}" espera ${template.paramCount} parâmetro(s), recebidos ${input.bodyParams.length}`,
      );
    }

    // Público: contatos opt-in com TODAS as tags do filtro
    const contacts = await prisma.contact.findMany({
      where: {
        tenantId,
        optOut: false,
        ...(input.filterTags.length ? { tags: { hasEvery: input.filterTags } } : {}),
      },
      select: { id: true },
    });
    if (contacts.length === 0) throw new AppError("Nenhum contato corresponde ao filtro");

    const campaign = await prisma.campaign.create({
      data: {
        tenantId,
        name: input.name,
        templateId: template.id,
        bodyParams: input.bodyParams,
        filterTags: input.filterTags,
        status: "SENDING",
        totalCount: contacts.length,
        startedAt: new Date(),
      },
    });

    await campaignQueue.addBulk(
      contacts.map((c) => ({
        name: "send",
        data: { campaignId: campaign.id, contactId: c.id },
      })),
    );

    return reply.code(201).send({ campaign });
  });

  app.post("/campaigns/:id/cancel", async (req) => {
    const tenantId = req.resolveTenantId();
    const { id } = req.params as { id: string };
    await prisma.campaign.updateMany({
      where: { id, tenantId, status: "SENDING" },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    return { ok: true };
  });
}
