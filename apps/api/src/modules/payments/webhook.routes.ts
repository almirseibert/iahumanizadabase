import type { FastifyInstance } from "fastify";
import { createHmac } from "node:crypto";
import { WS_EVENTS } from "@iah/shared";
import { env, isProd } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { emitToTenant } from "../../realtime/io.js";
import { waOutboundQueue } from "../../queues/index.js";
import { incrementMetric } from "../metrics/metrics.service.js";
import { fetchMpPaymentStatus } from "./mercadopago.service.js";

const MP_STATUS_MAP: Record<string, "APPROVED" | "REJECTED" | "EXPIRED" | "REFUNDED" | "PENDING"> = {
  approved: "APPROVED",
  rejected: "REJECTED",
  cancelled: "EXPIRED",
  refunded: "REFUNDED",
  charged_back: "REFUNDED",
  pending: "PENDING",
  in_process: "PENDING",
};

/**
 * Valida o header x-signature do Mercado Pago:
 * HMAC-SHA256 do manifest "id:{data.id};request-id:{x-request-id};ts:{ts};"
 */
function verifyMpSignature(
  signature: string | undefined,
  requestId: string | undefined,
  dataId: string,
): boolean {
  if (!env.MP_WEBHOOK_SECRET) {
    if (isProd) return false;
    logger.warn("MP_WEBHOOK_SECRET vazio — assinatura NÃO verificada (apenas dev)");
    return true;
  }
  if (!signature) return false;
  const parts = Object.fromEntries(
    signature.split(",").map((p) => p.trim().split("=") as [string, string]),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${requestId ?? ""};ts:${ts};`;
  const expected = createHmac("sha256", env.MP_WEBHOOK_SECRET).update(manifest).digest("hex");
  return expected === v1;
}

export async function mercadoPagoWebhookRoutes(app: FastifyInstance): Promise<void> {
  // URL configurada no painel do MP: {PUBLIC_API_URL}/webhooks/mercadopago/{tenantId}
  app.post("/webhooks/mercadopago/:tenantId", async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    const body = req.body as { type?: string; data?: { id?: string | number } };
    const query = req.query as Record<string, string | undefined>;

    const dataId = String(body?.data?.id ?? query["data.id"] ?? "");
    if (!dataId || body?.type !== "payment") return reply.code(200).send();

    const signature = req.headers["x-signature"] as string | undefined;
    const requestId = req.headers["x-request-id"] as string | undefined;
    if (!verifyMpSignature(signature, requestId, dataId)) {
      logger.warn({ tenantId }, "webhook Mercado Pago com assinatura inválida");
      return reply.code(401).send();
    }

    // Idempotência
    const eventKey = `${tenantId}:${dataId}:${body.type}`;
    try {
      await prisma.webhookEvent.create({
        data: { source: "MERCADOPAGO", externalId: eventKey, payload: body as object },
      });
    } catch {
      return reply.code(200).send(); // já processado
    }

    // Responde rápido e processa em background
    reply.code(200).send();

    try {
      await processPaymentUpdate(tenantId, dataId);
    } catch (err) {
      logger.error({ err, tenantId, dataId }, "erro ao processar webhook Mercado Pago");
    }
  });
}

async function processPaymentUpdate(tenantId: string, mpPaymentId: string): Promise<void> {
  // Nunca confiar no payload: rebusca o pagamento na API do MP
  const mpStatus = await fetchMpPaymentStatus(tenantId, mpPaymentId);
  if (!mpStatus) return;

  const newStatus = MP_STATUS_MAP[mpStatus.status] ?? "PENDING";
  const payment = await prisma.payment.findFirst({
    where: { tenantId, mpPaymentId },
    include: { contact: true },
  });
  if (!payment || payment.status === newStatus) return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: newStatus,
      paidAt: newStatus === "APPROVED" ? new Date() : undefined,
    },
  });

  if (newStatus !== "APPROVED") return;

  await incrementMetric(tenantId, { paymentsApprovedCents: payment.amountCents });

  // Fidelidade: credita pontos por real pago (se habilitado no tenant)
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  let earnedPoints = 0;
  if (tenant && tenant.loyaltyPointsPerReal > 0) {
    earnedPoints = Math.floor((payment.amountCents / 100) * tenant.loyaltyPointsPerReal);
    if (earnedPoints > 0) {
      await prisma.loyaltyAccount.upsert({
        where: { tenantId_contactId: { tenantId, contactId: payment.contactId } },
        create: { tenantId, contactId: payment.contactId, points: earnedPoints },
        update: { points: { increment: earnedPoints } },
      });
    }
  }
  emitToTenant(tenantId, WS_EVENTS.PAYMENT_APPROVED, {
    paymentId: payment.id,
    amountCents: payment.amountCents,
    contactId: payment.contactId,
  });

  // Atualiza pedido/agendamento vinculado
  if (payment.orderId) {
    await prisma.order.update({ where: { id: payment.orderId }, data: { status: "PAID" } });
  }

  // Avisa o cliente no WhatsApp (dentro da janela de 24h; fora dela exigiria template)
  const conversation = await prisma.conversation.findFirst({
    where: { tenantId, contactId: payment.contactId },
    orderBy: { updatedAt: "desc" },
  });
  if (!conversation) return;

  const amountBRL = (payment.amountCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const loyaltyNote = earnedPoints > 0 ? ` Você ganhou ${earnedPoints} pontos de fidelidade! ⭐` : "";
  const message = await prisma.message.create({
    data: {
      tenantId,
      conversationId: conversation.id,
      direction: "OUT",
      authorType: "SYSTEM",
      type: "TEXT",
      text: `✅ Pagamento de ${amountBRL} confirmado! Obrigado! 🎉${loyaltyNote}`,
      status: "QUEUED",
    },
  });
  await waOutboundQueue.add("send", { messageId: message.id });
}
