// Espelham os enums do Prisma — fonte única para o dashboard (que não importa @prisma/client)

export const SEGMENTS = [
  "PADARIA",
  "LAVANDERIA",
  "SALAO",
  "CLINICA",
  "LAVAJATO",
  "OUTRO",
] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_LABELS: Record<Segment, string> = {
  PADARIA: "Padaria",
  LAVANDERIA: "Lavanderia",
  SALAO: "Salão de beleza",
  CLINICA: "Clínica",
  LAVAJATO: "Lava-rápido",
  OUTRO: "Outro",
};

export const AI_PROVIDERS = ["ANTHROPIC", "OPENAI", "GEMINI"] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

export const CONVERSATION_STATUSES = ["OPEN", "WAITING", "RESOLVED"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_MODES = ["BOT", "HUMAN"] as const;
export type ConversationMode = (typeof CONVERSATION_MODES)[number];

export const MESSAGE_DIRECTIONS = ["IN", "OUT"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const AUTHOR_TYPES = ["CUSTOMER", "BOT", "AGENT", "SYSTEM"] as const;
export type AuthorType = (typeof AUTHOR_TYPES)[number];

export const MESSAGE_TYPES = [
  "TEXT",
  "IMAGE",
  "AUDIO",
  "VIDEO",
  "DOCUMENT",
  "STICKER",
  "LOCATION",
  "INTERACTIVE",
  "TEMPLATE",
  "UNKNOWN",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MESSAGE_STATUSES = [
  "QUEUED",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const USER_ROLES = ["SUPERADMIN", "ADMIN", "AGENT"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PAYMENT_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "REFUNDED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const APPOINTMENT_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "DONE",
  "NO_SHOW",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Tools que podem ser habilitadas por tenant (AiConfig.enabledTools) */
export const AVAILABLE_TOOLS = [
  "consultar_informacoes_negocio",
  "consultar_catalogo",
  "consultar_base_conhecimento",
  "verificar_disponibilidade",
  "agendar_horario",
  "cancelar_agendamento",
  "criar_pedido",
  "criar_cobranca_pix",
  "consultar_pontos",
  "consultar_dados_externos",
  "escalar_para_humano",
] as const;
export type ToolName = (typeof AVAILABLE_TOOLS)[number];

export const TEMPLATE_PURPOSES = [
  "GENERIC",
  "REMINDER",
  "REACTIVATION",
  "CAMPAIGN",
  "REPORT",
] as const;
export type TemplatePurpose = (typeof TEMPLATE_PURPOSES)[number];

export const TEMPLATE_PURPOSE_LABELS: Record<TemplatePurpose, string> = {
  GENERIC: "Genérico",
  REMINDER: "Lembrete de agendamento",
  REACTIVATION: "Reativação de cliente",
  CAMPAIGN: "Campanha",
  REPORT: "Relatório para o dono",
};

export const CAMPAIGN_STATUSES = ["DRAFT", "SENDING", "DONE", "CANCELLED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
