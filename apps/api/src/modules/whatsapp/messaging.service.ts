import type { TemplatePurpose } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { waOutboundQueue } from "../../queues/index.js";

// Envio proativo (campanhas, lembretes, relatórios): cria a Message QUEUED
// e deixa o worker outbound resolver janela de 24h / template.

async function resolveConversation(tenantId: string, contactId: string): Promise<string> {
  const existing = await prisma.conversation.findFirst({
    where: { tenantId, contactId, status: { not: "RESOLVED" } },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing.id;
  const created = await prisma.conversation.create({ data: { tenantId, contactId } });
  return created.id;
}

/** Enfileira texto livre (só chega se a janela de 24h estiver aberta) */
export async function queueSystemText(
  tenantId: string,
  contactId: string,
  text: string,
): Promise<string> {
  const conversationId = await resolveConversation(tenantId, contactId);
  const message = await prisma.message.create({
    data: {
      tenantId,
      conversationId,
      direction: "OUT",
      authorType: "SYSTEM",
      type: "TEXT",
      text,
      status: "QUEUED",
    },
  });
  await waOutboundQueue.add("send", { messageId: message.id });
  return message.id;
}

/** Enfileira um template aprovado (funciona fora da janela de 24h) */
export async function queueSystemTemplate(
  tenantId: string,
  contactId: string,
  template: { name: string; language: string },
  bodyParams: string[],
  previewText?: string,
): Promise<string> {
  const conversationId = await resolveConversation(tenantId, contactId);
  const message = await prisma.message.create({
    data: {
      tenantId,
      conversationId,
      direction: "OUT",
      authorType: "SYSTEM",
      type: "TEMPLATE",
      text: previewText ?? `[template ${template.name}]`,
      content: {
        template: { name: template.name, language: template.language, bodyParams },
      },
      status: "QUEUED",
    },
  });
  await waOutboundQueue.add("send", { messageId: message.id });
  return message.id;
}

/**
 * Tenta texto livre se a janela de 24h está aberta; senão usa o template
 * do propósito indicado (se o tenant tiver um). Retorna null se nada pôde ser enviado.
 */
export async function queueTextOrTemplate(
  tenantId: string,
  contactId: string,
  text: string,
  purpose: TemplatePurpose,
  templateParams: string[],
): Promise<string | null> {
  const conversation = await prisma.conversation.findFirst({
    where: { tenantId, contactId },
    orderBy: { updatedAt: "desc" },
  });
  const lastIn = conversation?.lastCustomerMessageAt?.getTime() ?? 0;
  const windowOpen = Date.now() - lastIn < 24 * 60 * 60 * 1000;

  if (windowOpen) {
    return queueSystemText(tenantId, contactId, text);
  }
  const template = await prisma.waTemplate.findFirst({
    where: { tenantId, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (!template) return null;
  return queueSystemTemplate(
    tenantId,
    contactId,
    { name: template.name, language: template.language },
    templateParams,
    text,
  );
}
