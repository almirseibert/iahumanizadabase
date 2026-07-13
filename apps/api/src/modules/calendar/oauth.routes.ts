import type { FastifyInstance } from "fastify";
import { google } from "googleapis";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { encrypt } from "../../lib/crypto.js";
import { AppError } from "../../lib/errors.js";

// Fluxo OAuth do Google Calendar por tenant, iniciado no dashboard.

function buildOAuthClient() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.PUBLIC_API_URL}/calendar/oauth/callback`,
  );
}

export async function calendarOAuthRoutes(app: FastifyInstance): Promise<void> {
  // Gera a URL de consentimento (dashboard redireciona o dono do negócio)
  app.get(
    "/calendar/oauth/start",
    { preHandler: [app.requireRole("SUPERADMIN", "ADMIN")] },
    async (req) => {
      if (!env.GOOGLE_CLIENT_ID) throw new AppError("GOOGLE_CLIENT_ID não configurado");
      const tenantId = req.resolveTenantId();
      const url = buildOAuthClient().generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["https://www.googleapis.com/auth/calendar"],
        state: tenantId,
      });
      return { url };
    },
  );

  // Callback do Google — salva o refresh token criptografado
  app.get("/calendar/oauth/callback", async (req, reply) => {
    const { code, state: tenantId } = req.query as { code?: string; state?: string };
    if (!code || !tenantId) return reply.code(400).send("Parâmetros ausentes");

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return reply.code(404).send("Tenant não encontrado");

    const { tokens } = await buildOAuthClient().getToken(code);
    if (!tokens.refresh_token) {
      return reply
        .code(400)
        .send("Google não retornou refresh token. Remova o acesso em myaccount.google.com/permissions e tente novamente.");
    }

    await prisma.calendarIntegration.upsert({
      where: { tenantId },
      create: {
        tenantId,
        type: "OAUTH",
        refreshTokenEnc: encrypt(tokens.refresh_token),
        active: true,
      },
      update: {
        type: "OAUTH",
        refreshTokenEnc: encrypt(tokens.refresh_token),
        active: true,
      },
    });

    return reply.redirect(`${env.PUBLIC_WEB_URL}/configuracoes?calendar=ok`);
  });
}
