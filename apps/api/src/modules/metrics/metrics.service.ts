import { prisma } from "../../lib/prisma.js";

type MetricField =
  | "conversationsCount"
  | "messagesIn"
  | "messagesOut"
  | "aiCalls"
  | "tokensIn"
  | "tokensOut"
  | "handoffs"
  | "paymentsApprovedCents";

/** Incrementa contadores diários do tenant (linha única por tenant/dia) */
export async function incrementMetric(
  tenantId: string,
  increments: Partial<Record<MetricField, number>>,
): Promise<void> {
  const today = new Date();
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const update: Record<string, { increment: number }> = {};
  const create: Record<string, number> = {};
  for (const [field, amount] of Object.entries(increments)) {
    if (!amount) continue;
    update[field] = { increment: amount };
    create[field] = amount;
  }
  if (Object.keys(update).length === 0) return;

  await prisma.metricDaily.upsert({
    where: { tenantId_date: { tenantId, date } },
    update,
    create: { tenantId, date, ...create },
  });
}
