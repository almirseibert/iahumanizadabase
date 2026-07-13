import { Queue } from "bullmq";
import { createBullConnection } from "../lib/redis.js";

export const QUEUE_NAMES = {
  WA_INBOUND: "wa-inbound",
  AI_PROCESS: "ai-process",
  WA_OUTBOUND: "wa-outbound",
  FOLLOWUP: "followup",
  CAMPAIGN: "campaign",
} as const;

// ---------- Payloads ----------

/** Um "value" do webhook da Meta (messages ou statuses) já validado/assinado */
export interface WaInboundJob {
  value: unknown;
}

export interface AiProcessJob {
  tenantId: string;
  conversationId: string;
  /** Última mensagem que disparou o debounce — confere antes de processar */
  lastMessageId: string;
}

export interface WaOutboundJob {
  /** Id da Message (status QUEUED) a enviar */
  messageId: string;
}

export type FollowupJob =
  | { kind: "appointment-reminder"; appointmentId: string; label: "24h" | "2h" }
  | { kind: "abandoned-order"; orderId: string }
  | { kind: "reactivation-scan" }
  | { kind: "weekly-report" };

export interface CampaignJob {
  campaignId: string;
  contactId: string;
}

// ---------- Filas (producers) ----------

const connection = createBullConnection();

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600 },
};

export const waInboundQueue = new Queue<WaInboundJob>(QUEUE_NAMES.WA_INBOUND, {
  connection,
  defaultJobOptions,
});

export const aiProcessQueue = new Queue<AiProcessJob>(QUEUE_NAMES.AI_PROCESS, {
  connection,
  // IA não deve re-tentar automaticamente (evita resposta duplicada em erro parcial)
  defaultJobOptions: { ...defaultJobOptions, attempts: 1 },
});

export const waOutboundQueue = new Queue<WaOutboundJob>(QUEUE_NAMES.WA_OUTBOUND, {
  connection,
  defaultJobOptions,
});

export const followupQueue = new Queue<FollowupJob>(QUEUE_NAMES.FOLLOWUP, {
  connection,
  defaultJobOptions,
});

export const campaignQueue = new Queue<CampaignJob>(QUEUE_NAMES.CAMPAIGN, {
  connection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 1 },
});

/** jobId determinístico do debounce: nova msg remove o job anterior e reagenda */
export const aiJobId = (conversationId: string, messageId: string) =>
  `ai-${conversationId}-${messageId}`;
