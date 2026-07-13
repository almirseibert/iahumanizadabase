// Eventos Socket.io compartilhados entre API e dashboard

export const WS_EVENTS = {
  /** Nova mensagem (IN ou OUT) numa conversa do tenant */
  MESSAGE_NEW: "message:new",
  /** Status de mensagem atualizado (sent/delivered/read/failed) */
  MESSAGE_STATUS: "message:status",
  /** Conversa criada/atualizada (modo, status, unread) */
  CONVERSATION_UPDATED: "conversation:updated",
  /** IA escalou para humano — alerta no dashboard */
  HANDOFF_REQUESTED: "handoff:requested",
  /** Pagamento aprovado */
  PAYMENT_APPROVED: "payment:approved",
} as const;

/** Sala por tenant: dashboard entra em `tenant:{id}` após autenticar */
export const tenantRoom = (tenantId: string) => `tenant:${tenantId}`;
