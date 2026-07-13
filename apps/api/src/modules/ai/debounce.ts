import { redis } from "../../lib/redis.js";
import { aiJobId, aiProcessQueue } from "../../queues/index.js";

// Clientes mandam várias mensagens curtas em sequência ("oi", "queria saber",
// "o preço do bolo"). Agrupamos antes de chamar a IA: cada mensagem nova
// substitui o job agendado; a IA só roda 8s após a última mensagem.

const DEBOUNCE_MS = 8000;
const debounceKey = (conversationId: string) => `debounce:${conversationId}`;

export async function scheduleAiDebounced(
  tenantId: string,
  conversationId: string,
  messageId: string,
): Promise<void> {
  const key = debounceKey(conversationId);
  const previousMessageId = await redis.getset(key, messageId);
  await redis.expire(key, 120);

  if (previousMessageId) {
    // Remove o job anterior (se ainda não rodou) — jobId determinístico
    await aiProcessQueue.remove(aiJobId(conversationId, previousMessageId)).catch(() => {});
  }

  await aiProcessQueue.add(
    "process",
    { tenantId, conversationId, lastMessageId: messageId },
    { delay: DEBOUNCE_MS, jobId: aiJobId(conversationId, messageId) },
  );
}

/** No worker: confirma que este job ainda é o mais recente da conversa */
export async function isLatestDebounced(
  conversationId: string,
  messageId: string,
): Promise<boolean> {
  const current = await redis.get(debounceKey(conversationId));
  return current === null || current === messageId;
}

/** Cancela debounce pendente (takeover humano) */
export async function cancelPendingAi(conversationId: string): Promise<void> {
  const key = debounceKey(conversationId);
  const messageId = await redis.get(key);
  if (messageId) {
    await aiProcessQueue.remove(aiJobId(conversationId, messageId)).catch(() => {});
    await redis.del(key);
  }
}
