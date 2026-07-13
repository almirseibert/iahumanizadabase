import type { MessageType, Prisma } from "@prisma/client";
import { WS_EVENTS } from "@iah/shared";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { decrypt } from "../../lib/crypto.js";
import { emitToTenant } from "../../realtime/io.js";
import { scheduleAiDebounced } from "../ai/debounce.js";
import { incrementMetric } from "../metrics/metrics.service.js";
import { markAsRead } from "./wa-client.js";
import { downloadMedia } from "./wa-media.js";
import {
  isTranscriptionAvailable,
  transcribeAudio,
} from "../ai/transcription.service.js";
import { handleNpsReply } from "../nps/nps.service.js";
import type { WaInboundMessage, WaStatusUpdate, WaWebhookValue } from "./wa-types.js";

const STATUS_MAP: Record<WaStatusUpdate["status"], "SENT" | "DELIVERED" | "READ" | "FAILED"> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

const OPT_OUT_REGEX = /^\s*(parar|sair|cancelar inscrição|stop)\s*$/i;

function extractContent(msg: WaInboundMessage): {
  type: MessageType;
  text: string | null;
  content: Prisma.InputJsonValue;
} {
  switch (msg.type) {
    case "text":
      return { type: "TEXT", text: msg.text?.body ?? "", content: {} };
    case "interactive": {
      const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
      return {
        type: "INTERACTIVE",
        text: reply?.title ?? null,
        content: (msg.interactive ?? {}) as unknown as Prisma.InputJsonValue,
      };
    }
    case "button":
      return {
        type: "INTERACTIVE",
        text: msg.button?.text ?? null,
        content: (msg.button ?? {}) as unknown as Prisma.InputJsonValue,
      };
    case "image":
      return {
        type: "IMAGE",
        text: msg.image?.caption ?? null,
        content: (msg.image ?? {}) as unknown as Prisma.InputJsonValue,
      };
    case "audio":
      return { type: "AUDIO", text: null, content: (msg.audio ?? {}) as unknown as Prisma.InputJsonValue };
    case "video":
      return {
        type: "VIDEO",
        text: msg.video?.caption ?? null,
        content: (msg.video ?? {}) as unknown as Prisma.InputJsonValue,
      };
    case "document":
      return {
        type: "DOCUMENT",
        text: msg.document?.caption ?? null,
        content: (msg.document ?? {}) as unknown as Prisma.InputJsonValue,
      };
    case "sticker":
      return { type: "STICKER", text: null, content: (msg.sticker ?? {}) as unknown as Prisma.InputJsonValue };
    case "location":
      return {
        type: "LOCATION",
        text: msg.location ? `📍 ${msg.location.name ?? ""} ${msg.location.address ?? ""}`.trim() : null,
        content: (msg.location ?? {}) as unknown as Prisma.InputJsonValue,
      };
    default:
      return { type: "UNKNOWN", text: null, content: {} };
  }
}

/** Processa um "value" de webhook (mensagens recebidas ou atualizações de status) */
export async function processInboundValue(value: WaWebhookValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const tenant = await prisma.tenant.findUnique({
    where: { waPhoneNumberId: phoneNumberId },
  });
  if (!tenant) {
    logger.warn({ phoneNumberId }, "webhook para phone_number_id sem tenant — ignorado");
    return;
  }
  if (tenant.status !== "ACTIVE") return;

  // --- Atualizações de status de mensagens enviadas ---
  for (const status of value.statuses ?? []) {
    const newStatus = STATUS_MAP[status.status];
    if (!newStatus) continue;
    const updated = await prisma.message.updateMany({
      where: { waMessageId: status.id, tenantId: tenant.id },
      data: {
        status: newStatus,
        errorCode: status.errors?.[0] ? String(status.errors[0].code) : undefined,
      },
    });
    if (updated.count > 0) {
      emitToTenant(tenant.id, WS_EVENTS.MESSAGE_STATUS, {
        waMessageId: status.id,
        status: newStatus,
      });
    }
  }

  // --- Mensagens recebidas ---
  for (const msg of value.messages ?? []) {
    await processInboundMessage(tenant.id, tenant.waAccessTokenEnc, phoneNumberId, value, msg);
  }
}

async function processInboundMessage(
  tenantId: string,
  waAccessTokenEnc: string | null,
  phoneNumberId: string,
  value: WaWebhookValue,
  msg: WaInboundMessage,
): Promise<void> {
  // Dedup: waMessageId é unique — se a Meta reenviar o webhook, ignora
  const existing = await prisma.message.findUnique({ where: { waMessageId: msg.id } });
  if (existing) return;

  const profileName = value.contacts?.find((c) => c.wa_id === msg.from)?.profile.name;

  const contact = await prisma.contact.upsert({
    where: { tenantId_waId: { tenantId, waId: msg.from } },
    create: { tenantId, waId: msg.from, profileName, lastInteractionAt: new Date() },
    update: { profileName: profileName ?? undefined, lastInteractionAt: new Date() },
  });

  // Conversa mais recente não-resolvida, ou cria uma nova
  let conversation = await prisma.conversation.findFirst({
    where: { tenantId, contactId: contact.id, status: { not: "RESOLVED" } },
    orderBy: { updatedAt: "desc" },
  });
  conversation ??= await prisma.conversation.create({
    data: { tenantId, contactId: contact.id },
  });

  const extracted = extractContent(msg);
  const { type, content } = extracted;
  let { text } = extracted;

  // Transcrição de áudio (Whisper) — o áudio vira texto para a IA e o dashboard
  if (type === "AUDIO" && waAccessTokenEnc && isTranscriptionAvailable() && msg.audio?.id) {
    const media = await downloadMedia(msg.audio.id, decrypt(waAccessTokenEnc));
    if (media) {
      const transcript = await transcribeAudio(media.buffer, media.mimeType);
      if (transcript) text = `🎤 ${transcript}`;
    }
  }

  let message;
  try {
    message = await prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: "IN",
        authorType: "CUSTOMER",
        waMessageId: msg.id,
        type,
        text,
        content,
        status: "DELIVERED",
      },
    });
  } catch (err: unknown) {
    // P2002 = corrida entre webhooks duplicados — outro worker já gravou
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") return;
    throw err;
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastCustomerMessageAt: new Date(),
      unreadCount: { increment: 1 },
      status: "OPEN",
    },
  });

  await incrementMetric(tenantId, { messagesIn: 1 });

  emitToTenant(tenantId, WS_EVENTS.MESSAGE_NEW, {
    conversationId: conversation.id,
    message: {
      id: message.id,
      conversationId: conversation.id,
      direction: message.direction,
      authorType: message.authorType,
      type: message.type,
      text: message.text,
      mediaUrl: message.mediaUrl,
      status: message.status,
      createdAt: message.createdAt.toISOString(),
    },
    contact: { id: contact.id, waId: contact.waId, profileName: contact.profileName },
  });

  // Marca como lida (melhor esforço — não bloqueia o fluxo)
  if (waAccessTokenEnc) {
    markAsRead({ phoneNumberId, accessToken: decrypt(waAccessTokenEnc) }, msg.id).catch(() => {});
  }

  // LGPD: cliente pediu para parar
  if (text && OPT_OUT_REGEX.test(text)) {
    await prisma.contact.update({ where: { id: contact.id }, data: { optOut: true } });
    logger.info({ contactId: contact.id }, "contato optou por sair (LGPD)");
    return;
  }
  if (contact.optOut) return;

  // Pesquisa NPS pendente: captura a nota 0-10 sem acionar a IA
  if (conversation.npsPendingAt && text) {
    const handled = await handleNpsReply(tenantId, conversation.id, contact.id, text);
    if (handled) return;
  }

  // Takeover humano: IA pausada, apenas notifica o dashboard
  if (conversation.mode === "HUMAN") return;

  await scheduleAiDebounced(tenantId, conversation.id, message.id);
}
