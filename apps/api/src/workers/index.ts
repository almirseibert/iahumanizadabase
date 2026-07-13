import { Worker } from "bullmq";
import { createBullConnection } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import {
  QUEUE_NAMES,
  followupQueue,
  type AiProcessJob,
  type CampaignJob,
  type FollowupJob,
  type WaInboundJob,
  type WaOutboundJob,
} from "../queues/index.js";
import { processInboundValue } from "../modules/whatsapp/inbound.service.js";
import { processOutboundMessage } from "../modules/whatsapp/outbound.service.js";
import { runAiPipeline } from "../modules/ai/pipeline.js";
import { processCampaignSend } from "../modules/campaigns/campaigns.service.js";
import {
  processAbandonedOrder,
  processAppointmentReminder,
  processReactivationScan,
} from "../modules/followups/followups.service.js";
import { generateWeeklyReports } from "../modules/reports/weekly-report.service.js";
import type { WaWebhookValue } from "../modules/whatsapp/wa-types.js";

/**
 * Inicia os workers BullMQ. Na fase 1 rodam no mesmo processo da API;
 * para escalar, rode `node dist/worker.js` como serviço separado no EasyPanel.
 */
export function startWorkers(): Worker[] {
  const workers: Worker[] = [
    new Worker<WaInboundJob>(
      QUEUE_NAMES.WA_INBOUND,
      async (job) => processInboundValue(job.data.value as WaWebhookValue),
      { connection: createBullConnection(), concurrency: 10 },
    ),

    new Worker<AiProcessJob>(
      QUEUE_NAMES.AI_PROCESS,
      async (job) =>
        runAiPipeline(job.data.tenantId, job.data.conversationId, job.data.lastMessageId),
      { connection: createBullConnection(), concurrency: 5 },
    ),

    new Worker<WaOutboundJob>(
      QUEUE_NAMES.WA_OUTBOUND,
      async (job) => processOutboundMessage(job.data.messageId),
      {
        connection: createBullConnection(),
        concurrency: 5,
        // Rate limit global de envio (limite da Cloud API por número é maior,
        // mas 20 msg/s protege contra rajadas)
        limiter: { max: 20, duration: 1000 },
      },
    ),

    new Worker<FollowupJob>(
      QUEUE_NAMES.FOLLOWUP,
      async (job) => {
        switch (job.data.kind) {
          case "appointment-reminder":
            return processAppointmentReminder(job.data.appointmentId, job.data.label);
          case "abandoned-order":
            return processAbandonedOrder(job.data.orderId);
          case "reactivation-scan":
            return processReactivationScan();
          case "weekly-report":
            return generateWeeklyReports();
        }
      },
      { connection: createBullConnection(), concurrency: 3 },
    ),

    new Worker<CampaignJob>(
      QUEUE_NAMES.CAMPAIGN,
      async (job) => processCampaignSend(job.data.campaignId, job.data.contactId),
      {
        connection: createBullConnection(),
        concurrency: 3,
        // Broadcast bem mais lento que conversas (proteção de reputação do número)
        limiter: { max: 5, duration: 1000 },
      },
    ),
  ];

  // Jobs recorrentes (horários em UTC; 12:00 UTC ≈ 9h em Brasília)
  void followupQueue.upsertJobScheduler(
    "reactivation-scan-daily",
    { pattern: "0 13 * * *" },
    { name: "reactivation-scan", data: { kind: "reactivation-scan" } },
  );
  void followupQueue.upsertJobScheduler(
    "weekly-report-monday",
    { pattern: "0 12 * * 1" },
    { name: "weekly-report", data: { kind: "weekly-report" } },
  );

  for (const worker of workers) {
    worker.on("failed", (job, err) => {
      logger.error({ queue: worker.name, jobId: job?.id, err: err.message }, "job falhou");
    });
    worker.on("error", (err) => {
      logger.error({ queue: worker.name, err: err.message }, "erro no worker");
    });
  }

  logger.info("workers BullMQ iniciados");
  return workers;
}
