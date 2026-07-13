import type { AiConfig } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { buildProvider } from "./providers/factory.js";

// Memória comprimida: quando a conversa cresce além da janela, um resumo
// barato substitui o histórico antigo (injetado no system prompt).

export async function maybeSummarizeConversation(
  conversationId: string,
  aiConfig: AiConfig,
  totalMessages: number,
): Promise<void> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return;

  // Re-sumariza quando acumulou uma janela inteira de mensagens novas
  const newSinceSummary = totalMessages - conversation.summaryMessageCount;
  if (totalMessages <= aiConfig.maxHistoryMessages || newSinceSummary < aiConfig.maxHistoryMessages) {
    return;
  }

  const messages = await prisma.message.findMany({
    where: { conversationId, authorType: { in: ["CUSTOMER", "BOT", "AGENT"] } },
    orderBy: { createdAt: "asc" },
    take: totalMessages, // tudo até aqui
  });

  const transcript = messages
    .map((m) => `${m.direction === "IN" ? "Cliente" : m.authorType === "AGENT" ? "Atendente" : "IA"}: ${m.text ?? `[${m.type.toLowerCase()}]`}`)
    .join("\n")
    .slice(0, 20_000);

  const provider = buildProvider(aiConfig);
  const response = await provider.chat({
    system:
      "Resuma a conversa de atendimento abaixo em até 150 palavras, em português. Preserve: nome/dados do cliente, o que ele quer, o que já foi combinado (pedidos, agendamentos, valores) e pendências.",
    messages: [{ role: "user", content: [{ type: "text", text: transcript }] }],
    tools: [],
    model: aiConfig.model,
    maxTokens: 512,
    temperature: 0.2,
  });

  const summary = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!summary) return;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { summary, summaryMessageCount: totalMessages },
  });
  logger.debug({ conversationId }, "conversa sumarizada");
}
