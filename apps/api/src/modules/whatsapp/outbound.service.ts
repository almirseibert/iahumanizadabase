import { WS_EVENTS } from "@iah/shared";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { decrypt } from "../../lib/crypto.js";
import { emitToTenant } from "../../realtime/io.js";
import { incrementMetric } from "../metrics/metrics.service.js";
import {
  sendButtons,
  sendImage,
  sendList,
  sendTemplate,
  sendText,
  type WaCredentials,
} from "./wa-client.js";

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

/** Conteúdo estruturado opcional gravado em Message.content para envios ricos */
interface OutboundContent {
  buttons?: Array<{ id: string; title: string }>;
  list?: { buttonLabel: string; rows: Array<{ id: string; title: string; description?: string }> };
  imageUrl?: string;
  /** Template aprovado — único formato aceito fora da janela de 24h */
  template?: { name: string; language: string; bodyParams?: string[] };
}

/** Envia uma Message com status QUEUED via Cloud API, respeitando a janela de 24h */
export async function processOutboundMessage(messageId: string): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      conversation: { include: { contact: true } },
      tenant: true,
    },
  });
  if (!message || message.status !== "QUEUED") return;

  const { tenant, conversation } = message;

  const fail = async (errorCode: string) => {
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "FAILED", errorCode },
    });
    emitToTenant(tenant.id, WS_EVENTS.MESSAGE_STATUS, {
      messageId: message.id,
      status: "FAILED",
      errorCode,
    });
  };

  if (!tenant.waPhoneNumberId || !tenant.waAccessTokenEnc) {
    logger.warn({ tenantId: tenant.id }, "tenant sem credenciais WhatsApp — mensagem não enviada");
    await fail("WA_NOT_CONFIGURED");
    return;
  }

  const content = (message.content ?? {}) as OutboundContent;

  // Janela de 24h: fora dela só template aprovado
  const lastIn = conversation.lastCustomerMessageAt?.getTime() ?? 0;
  if (!content.template && Date.now() - lastIn > WINDOW_24H_MS) {
    logger.warn({ conversationId: conversation.id }, "fora da janela de 24h — envio bloqueado");
    await fail("OUTSIDE_24H_WINDOW");
    return;
  }

  const creds: WaCredentials = {
    phoneNumberId: tenant.waPhoneNumberId,
    accessToken: decrypt(tenant.waAccessTokenEnc),
  };
  const to = conversation.contact.waId;

  try {
    let result;
    if (content.template) {
      result = await sendTemplate(
        creds,
        to,
        content.template.name,
        content.template.language,
        content.template.bodyParams ?? [],
      );
    } else if (content.buttons?.length) {
      result = await sendButtons(creds, to, message.text ?? "", content.buttons);
    } else if (content.list) {
      result = await sendList(creds, to, message.text ?? "", content.list.buttonLabel, content.list.rows);
    } else if (content.imageUrl) {
      result = await sendImage(creds, to, content.imageUrl, message.text ?? undefined);
    } else {
      result = await sendText(creds, to, message.text ?? "");
    }

    await prisma.message.update({
      where: { id: message.id },
      data: { status: "SENT", waMessageId: result.waMessageId },
    });
    await incrementMetric(tenant.id, { messagesOut: 1 });
    emitToTenant(tenant.id, WS_EVENTS.MESSAGE_STATUS, {
      messageId: message.id,
      status: "SENT",
    });
  } catch (err) {
    logger.error({ err, messageId: message.id }, "falha no envio WhatsApp");
    await fail("SEND_ERROR");
  }
}
