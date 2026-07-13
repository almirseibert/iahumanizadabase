import { MercadoPagoConfig, Payment as MpPayment } from "mercadopago";
import type { Payment } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { decrypt } from "../../lib/crypto.js";
import { AppError } from "../../lib/errors.js";
import type { ToolContext } from "../ai/tools/registry.js";

export async function isPaymentActive(tenantId: string): Promise<boolean> {
  const integration = await prisma.paymentIntegration.findUnique({ where: { tenantId } });
  return Boolean(integration?.active && integration.mpAccessTokenEnc);
}

export async function getMpClient(tenantId: string): Promise<MercadoPagoConfig> {
  const integration = await prisma.paymentIntegration.findUnique({ where: { tenantId } });
  if (!integration?.active || !integration.mpAccessTokenEnc) {
    throw new AppError("Integração Mercado Pago não configurada para este tenant");
  }
  return new MercadoPagoConfig({ accessToken: decrypt(integration.mpAccessTokenEnc) });
}

/** Cria cobrança Pix no Mercado Pago e persiste o Payment (opcionalmente vinculado a um pedido) */
export async function createPixCharge(
  ctx: ToolContext,
  amountCents: number,
  description: string,
  orderId?: string,
): Promise<Payment> {
  const client = await getMpClient(ctx.tenantId);
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: ctx.contactId } });

  // Valida o vínculo com o pedido (mesmo tenant/contato) e marca aguardando pagamento
  let linkedOrderId: string | undefined;
  if (orderId) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId, contactId: ctx.contactId },
    });
    if (order) {
      linkedOrderId = order.id;
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "AWAITING_PAYMENT" },
      });
    }
  }

  const mpPayment = await new MpPayment(client).create({
    body: {
      transaction_amount: amountCents / 100,
      description,
      payment_method_id: "pix",
      payer: {
        // MP exige e-mail do pagador; sem cadastro real usamos um placeholder único
        email: `wa${contact.waId}@clientes.iahumanizada.app`,
        first_name: contact.name ?? contact.profileName ?? "Cliente",
      },
    },
  });

  const pixData = mpPayment.point_of_interaction?.transaction_data;

  return prisma.payment.create({
    data: {
      tenantId: ctx.tenantId,
      contactId: ctx.contactId,
      orderId: linkedOrderId,
      provider: "MERCADOPAGO",
      method: "PIX",
      mpPaymentId: String(mpPayment.id),
      amountCents,
      description,
      status: "PENDING",
      pixQrCode: pixData?.qr_code_base64 ?? null,
      pixCopiaECola: pixData?.qr_code ?? null,
    },
  });
}

/** Busca o status real do pagamento na API do MP (nunca confiar no payload do webhook) */
export async function fetchMpPaymentStatus(
  tenantId: string,
  mpPaymentId: string,
): Promise<{ status: string; amountCents: number } | null> {
  const client = await getMpClient(tenantId);
  const payment = await new MpPayment(client).get({ id: mpPaymentId });
  if (!payment.id) return null;
  return {
    status: payment.status ?? "unknown",
    amountCents: Math.round((payment.transaction_amount ?? 0) * 100),
  };
}
