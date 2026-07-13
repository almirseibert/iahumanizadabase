import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env, isProd } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { waInboundQueue } from "../../queues/index.js";
import type { WaWebhookPayload } from "./wa-types.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

function verifySignature(req: FastifyRequest): boolean {
  if (!env.META_APP_SECRET) {
    if (isProd) return false;
    logger.warn("META_APP_SECRET vazio — assinatura NÃO verificada (apenas dev)");
    return true;
  }
  const signature = req.headers["x-hub-signature-256"];
  if (typeof signature !== "string" || !req.rawBody) return false;
  const expected = `sha256=${createHmac("sha256", env.META_APP_SECRET).update(req.rawBody).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function whatsappWebhookRoutes(app: FastifyInstance): Promise<void> {
  // Parser escopado que preserva o corpo bruto (necessário para o HMAC)
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body: Buffer, done) => {
      req.rawBody = body;
      try {
        done(null, JSON.parse(body.toString("utf8")));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // Verificação do webhook (configuração inicial no painel da Meta)
  app.get("/webhooks/whatsapp", async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    if (mode === "subscribe" && token === env.META_VERIFY_TOKEN && challenge) {
      return reply.code(200).send(challenge);
    }
    return reply.code(403).send("Forbidden");
  });

  // Recepção de eventos — responde 200 imediato, processa via fila
  app.post("/webhooks/whatsapp", async (req, reply) => {
    if (!verifySignature(req)) {
      logger.warn("webhook WhatsApp com assinatura inválida — descartado");
      return reply.code(401).send();
    }

    const payload = req.body as WaWebhookPayload;
    if (payload.object !== "whatsapp_business_account") {
      return reply.code(200).send();
    }

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages") continue;
        await waInboundQueue.add("inbound", { value: change.value });
      }
    }
    return reply.code(200).send();
  });
}
