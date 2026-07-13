import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { buildProvider } from "../ai/providers/factory.js";
import { getNpsSummary } from "../nps/nps.service.js";
import { queueTextOrTemplate } from "../whatsapp/messaging.service.js";

// Relatório semanal escrito pela IA para o dono do negócio.
// Roda toda segunda (job repetível) — agrega a semana anterior, gera o texto
// e envia ao WhatsApp do dono (tenant.ownerWaId), além de ficar no dashboard.

function lastWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function generateWeeklyReports(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    include: { aiConfig: true },
  });
  for (const tenant of tenants) {
    try {
      await generateReportForTenant(tenant.id);
    } catch (err) {
      logger.error({ err, tenantId: tenant.id }, "falha ao gerar relatório semanal");
    }
  }
}

export async function generateReportForTenant(tenantId: string): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { aiConfig: true },
  });
  if (!tenant?.aiConfig) return null;

  const { start, end } = lastWeekRange();

  // Idempotência: um relatório por semana
  const existing = await prisma.weeklyReport.findUnique({
    where: { tenantId_weekStart: { tenantId, weekStart: start } },
  });
  if (existing) return existing.content;

  const metrics = await prisma.metricDaily.findMany({
    where: { tenantId, date: { gte: start, lt: end } },
  });
  const totals = metrics.reduce(
    (acc, m) => ({
      messagesIn: acc.messagesIn + m.messagesIn,
      messagesOut: acc.messagesOut + m.messagesOut,
      aiCalls: acc.aiCalls + m.aiCalls,
      handoffs: acc.handoffs + m.handoffs,
      paymentsApprovedCents: acc.paymentsApprovedCents + m.paymentsApprovedCents,
    }),
    { messagesIn: 0, messagesOut: 0, aiCalls: 0, handoffs: 0, paymentsApprovedCents: 0 },
  );

  const [newContacts, appointments, nps] = await Promise.all([
    prisma.contact.count({ where: { tenantId, createdAt: { gte: start, lt: end } } }),
    prisma.appointment.count({ where: { tenantId, createdAt: { gte: start, lt: end } } }),
    getNpsSummary(tenantId, 7),
  ]);

  // Sem movimento: não gera relatório vazio
  if (totals.messagesIn === 0 && newContacts === 0) return null;

  const dataBlock = [
    `Negócio: ${tenant.name}`,
    `Mensagens recebidas: ${totals.messagesIn} | enviadas: ${totals.messagesOut}`,
    `Novos contatos: ${newContacts}`,
    `Agendamentos criados: ${appointments}`,
    `Transferências para humano: ${totals.handoffs}`,
    `Pagamentos aprovados: R$ ${(totals.paymentsApprovedCents / 100).toFixed(2)}`,
    nps.total > 0 ? `NPS da semana: ${nps.nps} (média ${nps.average}, ${nps.total} respostas)` : "NPS: sem respostas",
  ].join("\n");

  const provider = buildProvider(tenant.aiConfig);
  const response = await provider.chat({
    system:
      "Você escreve um resumo semanal curto e amigável para o dono de um pequeno negócio brasileiro, com base nos números do atendimento via WhatsApp. Português brasileiro, tom positivo e direto, no máximo 120 palavras, com 1-2 sugestões práticas no final. Pode usar emojis com moderação.",
    messages: [{ role: "user", content: [{ type: "text", text: dataBlock }] }],
    tools: [],
    model: tenant.aiConfig.model,
    maxTokens: 512,
    temperature: 0.5,
  });
  const content = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!content) return null;

  const report = await prisma.weeklyReport.create({
    data: { tenantId, weekStart: start, content },
  });

  // Envia ao dono, se cadastrado
  if (tenant.ownerWaId) {
    const ownerContact = await prisma.contact.upsert({
      where: { tenantId_waId: { tenantId, waId: tenant.ownerWaId } },
      create: { tenantId, waId: tenant.ownerWaId, name: "Dono (relatórios)" },
      update: {},
    });
    const sent = await queueTextOrTemplate(
      tenantId,
      ownerContact.id,
      `📈 Resumo semanal — ${tenant.name}\n\n${content}`,
      "REPORT",
      [tenant.name],
    );
    if (sent) {
      await prisma.weeklyReport.update({
        where: { id: report.id },
        data: { sentAt: new Date() },
      });
    }
  }
  return content;
}
