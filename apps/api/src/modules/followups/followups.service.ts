import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { followupQueue } from "../../queues/index.js";
import { formatTimeInZone } from "../../lib/timezone.js";
import { queueTextOrTemplate } from "../whatsapp/messaging.service.js";

// Follow-ups automáticos: lembretes de agendamento (reduz no-show),
// pedido abandonado e reativação de clientes sumidos.

const H = 60 * 60 * 1000;

/** Agenda lembretes 24h e 2h antes do horário (chamado ao criar o Appointment) */
export async function scheduleAppointmentReminders(
  appointmentId: string,
  startsAt: Date,
): Promise<void> {
  const now = Date.now();
  for (const [label, msBefore] of [["24h", 24 * H], ["2h", 2 * H]] as const) {
    const fireAt = startsAt.getTime() - msBefore;
    if (fireAt <= now) continue;
    await followupQueue.add(
      "appointment-reminder",
      { kind: "appointment-reminder", appointmentId, label },
      { delay: fireAt - now, jobId: `reminder-${appointmentId}-${label}` },
    );
  }
}

/** Agenda checagem de pedido abandonado (1h após criação) */
export async function scheduleAbandonedOrderCheck(orderId: string): Promise<void> {
  await followupQueue.add(
    "abandoned-order",
    { kind: "abandoned-order", orderId },
    { delay: 1 * H, jobId: `abandoned-${orderId}` },
  );
}

export async function processAppointmentReminder(
  appointmentId: string,
  label: "24h" | "2h",
): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { tenant: true, catalogItem: true, contact: true },
  });
  if (!appointment || !["PENDING", "CONFIRMED"].includes(appointment.status)) return;
  if (appointment.contact.optOut) return;

  const hora = formatTimeInZone(appointment.startsAt, appointment.tenant.timezone);
  const data = appointment.startsAt.toLocaleDateString("pt-BR", {
    timeZone: appointment.tenant.timezone,
  });
  const servico = appointment.catalogItem?.name ?? "seu horário";
  const quando = label === "24h" ? `amanhã (${data})` : `hoje às ${hora}`;
  const text = `⏰ Lembrete: você tem ${servico} agendado ${quando} às ${hora} em ${appointment.tenant.name}. Se precisar remarcar, é só responder aqui!`;

  const sent = await queueTextOrTemplate(
    appointment.tenantId,
    appointment.contactId,
    text,
    "REMINDER",
    [servico, `${data} às ${hora}`],
  );
  if (!sent) {
    logger.warn(
      { appointmentId },
      "lembrete não enviado: janela de 24h fechada e sem template REMINDER cadastrado",
    );
  }
}

export async function processAbandonedOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { tenant: true, contact: true },
  });
  if (!order || !["DRAFT", "AWAITING_PAYMENT"].includes(order.status)) return;
  if (order.contact.optOut) return;

  const total = (order.totalCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  await queueTextOrTemplate(
    order.tenantId,
    order.contactId,
    `Oi! Vi que seu pedido de ${total} em ${order.tenant.name} ficou pendente. Quer que eu finalize para você? 😊`,
    "REACTIVATION",
    [order.tenant.name],
  );
}

/** Varredura diária: reativa contatos sem interação há 30 dias (1 tentativa) */
export async function processReactivationScan(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * H);
  const tenants = await prisma.tenant.findMany({ where: { status: "ACTIVE" } });

  for (const tenant of tenants) {
    // Só reativa quem tem template REACTIVATION (fora da janela é o único caminho)
    const template = await prisma.waTemplate.findFirst({
      where: { tenantId: tenant.id, purpose: "REACTIVATION" },
    });
    if (!template) continue;

    const inactive = await prisma.contact.findMany({
      where: {
        tenantId: tenant.id,
        optOut: false,
        lastInteractionAt: { lt: cutoff },
        // uma única tentativa por contato
        NOT: { tags: { has: "reativacao-enviada" } },
      },
      take: 50, // lote diário por tenant
    });

    for (const contact of inactive) {
      await queueTextOrTemplate(
        tenant.id,
        contact.id,
        `Sentimos sua falta em ${tenant.name}! 💚 Posso ajudar com alguma coisa?`,
        "REACTIVATION",
        [tenant.name],
      );
      await prisma.contact.update({
        where: { id: contact.id },
        data: { tags: { push: "reativacao-enviada" } },
      });
    }
    if (inactive.length > 0) {
      logger.info({ tenantId: tenant.id, count: inactive.length }, "reativações enviadas");
    }
  }
}
