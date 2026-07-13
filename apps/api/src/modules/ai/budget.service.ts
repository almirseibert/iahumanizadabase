import type { AiConfig } from "@prisma/client";
import { WS_EVENTS } from "@iah/shared";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { emitToTenant } from "../../realtime/io.js";

// Proteção de custo: se o tenant estourar o orçamento diário de tokens,
// a IA para de responder e a conversa vai para a fila humana (uma vez).

export async function checkTokenBudget(
  tenantId: string,
  aiConfig: AiConfig,
  conversationId: string,
): Promise<boolean> {
  if (!aiConfig.dailyTokenBudget) return true;

  const today = new Date();
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const metric = await prisma.metricDaily.findUnique({
    where: { tenantId_date: { tenantId, date } },
  });
  const used = (metric?.tokensIn ?? 0) + (metric?.tokensOut ?? 0);
  if (used < aiConfig.dailyTokenBudget) return true;

  logger.warn({ tenantId, used, budget: aiConfig.dailyTokenBudget }, "orçamento diário de tokens estourado");

  // Escala para humano uma única vez por conversa
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (conversation && conversation.mode === "BOT") {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { mode: "HUMAN", status: "WAITING" },
    });
    await prisma.message.create({
      data: {
        tenantId,
        conversationId,
        direction: "OUT",
        authorType: "SYSTEM",
        type: "TEXT",
        text: "⚠️ Limite diário de IA atingido — conversa transferida para atendimento humano",
        status: "SENT",
      },
    });
    emitToTenant(tenantId, WS_EVENTS.HANDOFF_REQUESTED, {
      conversationId,
      motivo: "Orçamento diário de tokens atingido",
    });
  }
  return false;
}
