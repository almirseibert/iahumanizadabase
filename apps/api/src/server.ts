import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { AppError } from "./lib/errors.js";
import authPlugin from "./plugins/auth.js";
import { initSocketIO } from "./realtime/io.js";
import { startWorkers } from "./workers/index.js";
import { whatsappWebhookRoutes } from "./modules/whatsapp/webhook.routes.js";
import { mercadoPagoWebhookRoutes } from "./modules/payments/webhook.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { tenantsRoutes } from "./modules/tenants/tenants.routes.js";
import { conversationsRoutes } from "./modules/conversations/conversations.routes.js";
import { catalogRoutes } from "./modules/catalog/catalog.routes.js";
import { metricsRoutes } from "./modules/metrics/metrics.routes.js";
import { calendarOAuthRoutes } from "./modules/calendar/oauth.routes.js";
import { templatesRoutes } from "./modules/templates/templates.routes.js";
import { campaignsRoutes } from "./modules/campaigns/campaigns.routes.js";
import { knowledgeRoutes } from "./modules/knowledge/knowledge.routes.js";
import { connectorsRoutes } from "./modules/connectors/connectors.routes.js";
import { registerBullBoard } from "./plugins/bull-board.js";

async function main(): Promise<void> {
  const app = Fastify({ loggerInstance: logger });

  await app.register(cors, { origin: env.PUBLIC_WEB_URL, credentials: true });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(authPlugin);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "VALIDATION",
        message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    }
    logger.error({ err }, "erro não tratado");
    return reply.code(500).send({ error: "INTERNAL", message: "Erro interno" });
  });

  app.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }));

  // Webhooks (escopo próprio — parser com rawBody para HMAC)
  await app.register(whatsappWebhookRoutes);
  await app.register(mercadoPagoWebhookRoutes);

  // REST do dashboard
  await app.register(authRoutes);
  await app.register(tenantsRoutes);
  await app.register(conversationsRoutes);
  await app.register(catalogRoutes);
  await app.register(metricsRoutes);
  await app.register(calendarOAuthRoutes);
  await app.register(templatesRoutes);
  await app.register(campaignsRoutes);
  await app.register(knowledgeRoutes);
  await app.register(connectorsRoutes);

  // Painel de filas (opcional — só com BULL_BOARD_PASSWORD)
  await registerBullBoard(app);

  await app.ready();

  // Socket.io sobre o mesmo servidor HTTP
  initSocketIO(app.server);

  // Fase 1: workers no mesmo processo. Para separar, rode dist/worker.js.
  if (process.env.RUN_WORKERS !== "false") {
    startWorkers();
  }

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  logger.info(`API rodando em http://localhost:${env.PORT}`);
}

main().catch((err) => {
  logger.error({ err }, "falha ao iniciar API");
  process.exit(1);
});
