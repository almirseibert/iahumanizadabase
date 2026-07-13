import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Prisma, Tenant } from "@prisma/client";
import { createTenantSchema, updateAiConfigSchema, updateTenantSchema } from "@iah/shared";
import { prisma } from "../../lib/prisma.js";
import { encrypt } from "../../lib/crypto.js";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";

function toTenantDto(tenant: Tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    segment: tenant.segment,
    status: tenant.status,
    timezone: tenant.timezone,
    description: tenant.description,
    address: tenant.address,
    phoneDisplay: tenant.phoneDisplay,
    businessHours: tenant.businessHours,
    waPhoneNumberId: tenant.waPhoneNumberId,
    waConfigured: Boolean(tenant.waPhoneNumberId && tenant.waAccessTokenEnc),
    ownerWaId: tenant.ownerWaId,
    loyaltyPointsPerReal: tenant.loyaltyPointsPerReal,
    createdAt: tenant.createdAt.toISOString(),
  };
}

/** ADMIN/AGENT só acessam o próprio tenant; SUPERADMIN acessa qualquer um */
function assertTenantAccess(req: FastifyRequest, tenantId: string): void {
  if (req.user.role === "SUPERADMIN") return;
  if (req.user.tenantId !== tenantId) throw new ForbiddenError();
}

export async function tenantsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/tenants", async (req) => {
    const where: Prisma.TenantWhereInput =
      req.user.role === "SUPERADMIN" ? {} : { id: req.user.tenantId ?? "___none___" };
    const tenants = await prisma.tenant.findMany({ where, orderBy: { createdAt: "desc" } });
    return { tenants: tenants.map(toTenantDto) };
  });

  app.post("/tenants", { preHandler: [app.requireRole("SUPERADMIN")] }, async (req, reply) => {
    const input = createTenantSchema.parse(req.body);
    const { waAccessToken, ...rest } = input;
    const tenant = await prisma.tenant.create({
      data: {
        ...rest,
        waAccessTokenEnc: waAccessToken ? encrypt(waAccessToken) : undefined,
        aiConfig: { create: {} },
      },
    });
    return reply.code(201).send({ tenant: toTenantDto(tenant) });
  });

  app.get("/tenants/:id", async (req) => {
    const { id } = req.params as { id: string };
    assertTenantAccess(req, id);
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundError("Tenant não encontrado");
    return { tenant: toTenantDto(tenant) };
  });

  app.patch("/tenants/:id", { preHandler: [app.requireRole("SUPERADMIN", "ADMIN")] }, async (req) => {
    const { id } = req.params as { id: string };
    assertTenantAccess(req, id);
    const input = updateTenantSchema.parse(req.body);
    const { waAccessToken, ...rest } = input;
    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        ...rest,
        ...(waAccessToken ? { waAccessTokenEnc: encrypt(waAccessToken) } : {}),
      },
    });
    return { tenant: toTenantDto(tenant) };
  });

  app.delete("/tenants/:id", { preHandler: [app.requireRole("SUPERADMIN")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.tenant.delete({ where: { id } });
    return reply.code(204).send();
  });

  // ---------- Configuração de IA (persona) ----------

  app.get("/tenants/:id/ai-config", async (req) => {
    const { id } = req.params as { id: string };
    assertTenantAccess(req, id);
    const config =
      (await prisma.aiConfig.findUnique({ where: { tenantId: id } })) ??
      (await prisma.aiConfig.create({ data: { tenantId: id } }));
    return {
      aiConfig: {
        provider: config.provider,
        model: config.model,
        hasOwnApiKey: Boolean(config.apiKeyEnc),
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        enabledTools: config.enabledTools,
        greetingMessage: config.greetingMessage,
        escalationMessage: config.escalationMessage,
        maxHistoryMessages: config.maxHistoryMessages,
        dailyTokenBudget: config.dailyTokenBudget,
        npsEnabled: config.npsEnabled,
      },
    };
  });

  app.put(
    "/tenants/:id/ai-config",
    { preHandler: [app.requireRole("SUPERADMIN", "ADMIN")] },
    async (req) => {
      const { id } = req.params as { id: string };
      assertTenantAccess(req, id);
      const input = updateAiConfigSchema.parse(req.body);
      const { apiKey, ...rest } = input;
      const config = await prisma.aiConfig.upsert({
        where: { tenantId: id },
        create: {
          tenantId: id,
          ...rest,
          apiKeyEnc: apiKey ? encrypt(apiKey) : undefined,
        },
        update: {
          ...rest,
          // apiKey === null limpa a chave própria; undefined mantém
          ...(apiKey === null ? { apiKeyEnc: null } : apiKey ? { apiKeyEnc: encrypt(apiKey) } : {}),
        },
      });
      return { ok: true, provider: config.provider };
    },
  );

  // ---------- Integrações ----------

  app.put(
    "/tenants/:id/integrations/mercadopago",
    { preHandler: [app.requireRole("SUPERADMIN", "ADMIN")] },
    async (req) => {
      const { id } = req.params as { id: string };
      assertTenantAccess(req, id);
      const input = z
        .object({ accessToken: z.string().optional(), active: z.boolean() })
        .parse(req.body);
      await prisma.paymentIntegration.upsert({
        where: { tenantId: id },
        create: {
          tenantId: id,
          active: input.active,
          mpAccessTokenEnc: input.accessToken ? encrypt(input.accessToken) : undefined,
        },
        update: {
          active: input.active,
          ...(input.accessToken ? { mpAccessTokenEnc: encrypt(input.accessToken) } : {}),
        },
      });
      return { ok: true };
    },
  );

  app.get("/tenants/:id/integrations", async (req) => {
    const { id } = req.params as { id: string };
    assertTenantAccess(req, id);
    const [calendar, payment, connectors] = await Promise.all([
      prisma.calendarIntegration.findUnique({ where: { tenantId: id } }),
      prisma.paymentIntegration.findUnique({ where: { tenantId: id } }),
      prisma.externalConnector.count({ where: { tenantId: id, active: true } }),
    ]);
    return {
      integrations: {
        calendar: { active: Boolean(calendar?.active), type: calendar?.type ?? null },
        mercadopago: { active: Boolean(payment?.active) },
        connectors,
      },
    };
  });
}
