import { google, type calendar_v3 } from "googleapis";
import type { Tenant } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { decrypt } from "../../lib/crypto.js";
import { env } from "../../config/env.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { formatTimeInZone, weekdayInZone, zonedTimeToUtc } from "../../lib/timezone.js";
import { scheduleAppointmentReminders } from "../followups/followups.service.js";
import type { ToolContext } from "../ai/tools/registry.js";

export async function isCalendarActive(tenantId: string): Promise<boolean> {
  const integration = await prisma.calendarIntegration.findUnique({ where: { tenantId } });
  return Boolean(integration?.active);
}

async function getCalendarClient(tenantId: string): Promise<{
  calendar: calendar_v3.Calendar;
  calendarId: string;
}> {
  const integration = await prisma.calendarIntegration.findUnique({ where: { tenantId } });
  if (!integration?.active) throw new AppError("Integração de agenda não configurada");

  if (integration.type === "SERVICE_ACCOUNT" && integration.serviceAccountJsonEnc) {
    const credentials = JSON.parse(decrypt(integration.serviceAccountJsonEnc)) as {
      client_email: string;
      private_key: string;
    };
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    return { calendar: google.calendar({ version: "v3", auth }), calendarId: integration.calendarId };
  }

  if (integration.type === "OAUTH" && integration.refreshTokenEnc) {
    const oauth2 = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      `${env.PUBLIC_API_URL}/calendar/oauth/callback`,
    );
    oauth2.setCredentials({ refresh_token: decrypt(integration.refreshTokenEnc) });
    return { calendar: google.calendar({ version: "v3", auth: oauth2 }), calendarId: integration.calendarId };
  }

  throw new AppError("Integração de agenda sem credenciais válidas");
}

interface DayInterval {
  inicio: string;
  fim: string;
}

/** Slots livres numa data, cruzando horário de funcionamento com o freebusy do Google */
export async function getAvailableSlots(
  tenant: Tenant,
  dateStr: string,
  durationMin: number,
): Promise<string[]> {
  const { calendar, calendarId } = await getCalendarClient(tenant.id);

  const hours = (tenant.businessHours ?? {}) as unknown as Record<string, DayInterval[]>;
  const weekday = weekdayInZone(dateStr, tenant.timezone);
  const intervals = hours[weekday] ?? [{ inicio: "08:00", fim: "18:00" }];
  if (intervals.length === 0) return [];

  const dayStart = zonedTimeToUtc(dateStr, "00:00", tenant.timezone);
  const dayEnd = zonedTimeToUtc(dateStr, "23:59", tenant.timezone);

  const freebusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      items: [{ id: calendarId }],
    },
  });
  const busy = (freebusy.data.calendars?.[calendarId]?.busy ?? []).map((b) => ({
    start: new Date(b.start!).getTime(),
    end: new Date(b.end!).getTime(),
  }));

  const slots: string[] = [];
  const stepMs = 30 * 60 * 1000;
  const durationMs = durationMin * 60 * 1000;
  const now = Date.now();

  for (const interval of intervals) {
    const openMs = zonedTimeToUtc(dateStr, interval.inicio, tenant.timezone).getTime();
    const closeMs = zonedTimeToUtc(dateStr, interval.fim, tenant.timezone).getTime();
    for (let start = openMs; start + durationMs <= closeMs; start += stepMs) {
      if (start < now) continue;
      const end = start + durationMs;
      const conflict = busy.some((b) => start < b.end && end > b.start);
      if (!conflict) {
        slots.push(formatTimeInZone(new Date(start), tenant.timezone));
      }
    }
  }
  return slots.slice(0, 20);
}

export async function createCalendarAppointment(
  ctx: ToolContext,
  params: { data: string; horario: string; servico?: string; observacoes?: string },
): Promise<{ appointmentId: string }> {
  const { tenant } = ctx;
  const catalogItem = params.servico
    ? await prisma.catalogItem.findFirst({
        where: {
          tenantId: tenant.id,
          active: true,
          name: { contains: params.servico, mode: "insensitive" },
        },
      })
    : null;

  const durationMin = catalogItem?.durationMin ?? 30;
  const startsAt = zonedTimeToUtc(params.data, params.horario, tenant.timezone);
  const endsAt = new Date(startsAt.getTime() + durationMin * 60 * 1000);

  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: ctx.contactId } });
  const customerName = contact.name ?? contact.profileName ?? contact.waId;

  const { calendar, calendarId } = await getCalendarClient(tenant.id);
  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `${catalogItem?.name ?? "Atendimento"} — ${customerName}`,
      description: [
        `Cliente: ${customerName} (WhatsApp ${contact.waId})`,
        params.observacoes ? `Observações: ${params.observacoes}` : null,
        "Agendado pela IA Humanizada",
      ]
        .filter(Boolean)
        .join("\n"),
      start: { dateTime: startsAt.toISOString() },
      end: { dateTime: endsAt.toISOString() },
    },
  });

  const appointment = await prisma.appointment.create({
    data: {
      tenantId: tenant.id,
      contactId: ctx.contactId,
      conversationId: ctx.conversationId,
      catalogItemId: catalogItem?.id,
      startsAt,
      endsAt,
      status: "CONFIRMED",
      googleEventId: event.data.id,
      notes: params.observacoes,
    },
  });

  // Lembretes automáticos 24h e 2h antes (anti no-show)
  await scheduleAppointmentReminders(appointment.id, startsAt);

  return { appointmentId: appointment.id };
}

export async function cancelCalendarAppointment(ctx: ToolContext, appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId: ctx.tenantId, contactId: ctx.contactId },
  });
  if (!appointment) throw new NotFoundError("Agendamento não encontrado para este cliente");

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "CANCELLED" },
  });

  if (appointment.googleEventId) {
    try {
      const { calendar, calendarId } = await getCalendarClient(ctx.tenantId);
      await calendar.events.delete({ calendarId, eventId: appointment.googleEventId });
    } catch {
      // evento pode já ter sido removido manualmente — cancelamento local vale
    }
  }
}
