import { prisma } from "../../lib/prisma.js";
import { queueSystemText } from "../whatsapp/messaging.service.js";

// Pesquisa NPS pós-atendimento: pergunta 0-10 ao resolver a conversa e
// captura a resposta numérica sem acionar a IA.

const NPS_EXPIRY_MS = 48 * 60 * 60 * 1000;

/** Envia a pergunta NPS (chamado ao resolver a conversa, se npsEnabled) */
export async function sendNpsSurvey(tenantId: string, conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true, tenant: { include: { aiConfig: true } } },
  });
  if (!conversation || !conversation.tenant.aiConfig?.npsEnabled) return;
  if (conversation.contact.optOut) return;
  // Só se a janela de 24h permite texto livre
  const lastIn = conversation.lastCustomerMessageAt?.getTime() ?? 0;
  if (Date.now() - lastIn > 24 * 60 * 60 * 1000) return;

  await queueSystemText(
    tenantId,
    conversation.contactId,
    "Antes de ir: de 0 a 10, qual a chance de você recomendar nosso atendimento a um amigo? É só responder com o número 🙏",
  );
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { npsPendingAt: new Date() },
  });
}

/** Captura a resposta 0-10. Retorna true se a mensagem foi consumida pelo NPS. */
export async function handleNpsReply(
  tenantId: string,
  conversationId: string,
  contactId: string,
  text: string,
): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation?.npsPendingAt) return false;

  // Pesquisa expirada — segue fluxo normal
  if (Date.now() - conversation.npsPendingAt.getTime() > NPS_EXPIRY_MS) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { npsPendingAt: null },
    });
    return false;
  }

  const match = text.trim().match(/^(10|[0-9])$/);
  if (!match) {
    // Não é uma nota — cancela a pesquisa e deixa a IA responder
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { npsPendingAt: null },
    });
    return false;
  }

  const score = Number(match[1]);
  await prisma.npsResponse.create({
    data: { tenantId, conversationId, contactId, score },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { npsPendingAt: null },
  });

  const thanks =
    score >= 9
      ? "Que ótimo! Muito obrigado pela nota! 💚"
      : score >= 7
        ? "Obrigado pela avaliação! Vamos continuar melhorando 🙌"
        : "Obrigado pela sinceridade — vamos trabalhar para melhorar. Se quiser contar o que aconteceu, estou aqui.";
  await queueSystemText(tenantId, contactId, thanks);
  return true;
}

/** Resumo NPS: média, promotores, detratores, score NPS clássico */
export async function getNpsSummary(tenantId: string, days = 90) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const responses = await prisma.npsResponse.findMany({
    where: { tenantId, createdAt: { gte: since } },
    select: { score: true },
  });
  const total = responses.length;
  if (total === 0) return { total: 0, average: null, nps: null };

  const promoters = responses.filter((r) => r.score >= 9).length;
  const detractors = responses.filter((r) => r.score <= 6).length;
  const average = responses.reduce((sum, r) => sum + r.score, 0) / total;
  const nps = Math.round(((promoters - detractors) / total) * 100);
  return { total, average: Math.round(average * 10) / 10, nps };
}
