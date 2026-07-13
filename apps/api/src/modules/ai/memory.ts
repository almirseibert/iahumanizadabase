import type { Message } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { AiMessage } from "./providers/types.js";

// Memória de conversa: janela das últimas N mensagens + resumo comprimido
// do que ficou para trás (Conversation.summary, gerado na fase 3).

export interface ConversationContext {
  history: AiMessage[];
  summary: string | null;
  /** Mensagens IN ainda não respondidas (viram o "user turn" atual) */
  pendingTexts: string[];
  /** Imagens recebidas no turno atual (para providers com visão) */
  pendingImages: Array<{ mediaId: string; mimeType: string }>;
  /** Total de mensagens da conversa (controle de sumarização) */
  totalMessages: number;
}

function describeInbound(msg: Message): string {
  switch (msg.type) {
    case "TEXT":
    case "INTERACTIVE":
      return msg.text ?? "";
    case "IMAGE":
      return `[cliente enviou uma imagem${msg.text ? `: ${msg.text}` : ""}]`;
    case "AUDIO":
      // Com Whisper ativo o texto já vem transcrito (prefixo 🎤)
      return msg.text ?? "[cliente enviou um áudio sem transcrição disponível; peça para escrever]";
    case "VIDEO":
      return "[cliente enviou um vídeo]";
    case "DOCUMENT":
      return `[cliente enviou um documento${msg.text ? `: ${msg.text}` : ""}]`;
    case "LOCATION":
      return `[cliente enviou localização${msg.text ? `: ${msg.text}` : ""}]`;
    default:
      return "[mensagem não suportada]";
  }
}

export async function loadConversationContext(
  conversationId: string,
  maxHistoryMessages: number,
): Promise<ConversationContext> {
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
  });

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      authorType: { in: ["CUSTOMER", "BOT", "AGENT"] },
    },
    orderBy: { createdAt: "desc" },
    take: maxHistoryMessages,
  });
  messages.reverse();

  // Divide: tudo até a última resposta OUT vira histórico; INs após ela são o turno atual
  let lastOutIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.direction === "OUT") {
      lastOutIndex = i;
      break;
    }
  }

  const history: AiMessage[] = [];
  for (let i = 0; i <= lastOutIndex; i++) {
    const msg = messages[i]!;
    const text = msg.direction === "IN" ? describeInbound(msg) : (msg.text ?? "");
    if (!text) continue;
    const role = msg.direction === "IN" ? "user" : "assistant";
    const prefix = msg.authorType === "AGENT" ? "[atendente humano] " : "";
    const last = history[history.length - 1];
    if (last && last.role === role) {
      // Junta mensagens consecutivas do mesmo lado num único turno
      const firstBlock = last.content[0];
      if (firstBlock?.type === "text") {
        firstBlock.text += `\n${prefix}${text}`;
      }
    } else {
      history.push({ role, content: [{ type: "text", text: `${prefix}${text}` }] });
    }
  }

  const pendingMessages = messages.slice(lastOutIndex + 1).filter((m) => m.direction === "IN");
  const pendingTexts = pendingMessages.map(describeInbound).filter(Boolean);

  // Imagens do turno atual — baixadas no pipeline se o provider suportar visão
  const pendingImages: Array<{ mediaId: string; mimeType: string }> = [];
  for (const msg of pendingMessages) {
    if (msg.type !== "IMAGE") continue;
    const media = msg.content as { id?: string; mime_type?: string } | null;
    if (media?.id) {
      pendingImages.push({ mediaId: media.id, mimeType: media.mime_type ?? "image/jpeg" });
    }
  }

  const totalMessages = await prisma.message.count({
    where: { conversationId, authorType: { in: ["CUSTOMER", "BOT", "AGENT"] } },
  });

  return {
    history,
    summary: conversation.summary,
    pendingTexts,
    pendingImages: pendingImages.slice(0, 3),
    totalMessages,
  };
}
