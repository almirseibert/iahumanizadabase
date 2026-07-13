import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { getNpsSummary } from "../nps/nps.service.js";
import { generateReportForTenant } from "../reports/weekly-report.service.js";

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/metrics/daily", async (req) => {
    const tenantId = req.resolveTenantId();
    const { days } = req.query as { days?: string };
    const since = new Date();
    since.setDate(since.getDate() - Math.min(Number(days) || 30, 365));

    const metrics = await prisma.metricDaily.findMany({
      where: { tenantId, date: { gte: since } },
      orderBy: { date: "asc" },
    });
    return { metrics };
  });

  app.get("/metrics/summary", async (req) => {
    const tenantId = req.resolveTenantId();
    const [openConversations, waitingConversations, contacts, appointments] = await Promise.all([
      prisma.conversation.count({ where: { tenantId, status: "OPEN" } }),
      prisma.conversation.count({ where: { tenantId, status: "WAITING" } }),
      prisma.contact.count({ where: { tenantId } }),
      prisma.appointment.count({
        where: { tenantId, startsAt: { gte: new Date() }, status: { in: ["PENDING", "CONFIRMED"] } },
      }),
    ]);
    return { summary: { openConversations, waitingConversations, contacts, appointments } };
  });

  app.get("/metrics/nps", async (req) => {
    const tenantId = req.resolveTenantId();
    const { days } = req.query as { days?: string };
    return { nps: await getNpsSummary(tenantId, Math.min(Number(days) || 90, 365)) };
  });

  app.get("/reports/weekly", async (req) => {
    const tenantId = req.resolveTenantId();
    const reports = await prisma.weeklyReport.findMany({
      where: { tenantId },
      orderBy: { weekStart: "desc" },
      take: 8,
    });
    return { reports };
  });

  // Gera o relatório da última semana sob demanda (além do job automático)
  app.post("/reports/weekly/generate", async (req) => {
    const tenantId = req.resolveTenantId();
    const content = await generateReportForTenant(tenantId);
    return { content };
  });
}
