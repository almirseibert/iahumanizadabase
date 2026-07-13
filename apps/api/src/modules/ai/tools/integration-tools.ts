import { z } from "zod";
import { prisma } from "../../../lib/prisma.js";
import {
  cancelCalendarAppointment,
  createCalendarAppointment,
  getAvailableSlots,
  isCalendarActive,
} from "../../calendar/google-calendar.service.js";
import { createPixCharge, isPaymentActive } from "../../payments/mercadopago.service.js";
import { callConnectorEndpoint, describeConnectors } from "../../connectors/connector.service.js";
import { registerTool } from "./registry.js";

// ---------- verificar_disponibilidade ----------

registerTool({
  def: {
    name: "verificar_disponibilidade",
    description:
      "Verifica horários disponíveis para agendamento em uma data. Use antes de agendar. Retorna os horários livres considerando a agenda e o horário de funcionamento.",
    schema: z.object({
      data: z.string().describe("Data desejada no formato AAAA-MM-DD"),
      servico: z.string().optional().describe("Nome do serviço (para calcular a duração)"),
    }),
  },
  isAvailable: (ctx) => isCalendarActive(ctx.tenantId),
  execute: async (ctx, input) => {
    const { data, servico } = input as { data: string; servico?: string };
    let durationMin = 30;
    if (servico) {
      const item = await prisma.catalogItem.findFirst({
        where: {
          tenantId: ctx.tenantId,
          active: true,
          name: { contains: servico, mode: "insensitive" },
        },
      });
      if (item?.durationMin) durationMin = item.durationMin;
    }
    const slots = await getAvailableSlots(ctx.tenant, data, durationMin);
    if (slots.length === 0) {
      return `Nenhum horário disponível em ${data}. Sugira outra data ao cliente.`;
    }
    return `Horários disponíveis em ${data} (duração ${durationMin} min): ${slots.join(", ")}`;
  },
});

// ---------- agendar_horario ----------

registerTool({
  def: {
    name: "agendar_horario",
    description:
      "Agenda um horário para o cliente. SEMPRE confirme data, horário e serviço com o cliente antes de agendar. Use verificar_disponibilidade primeiro.",
    schema: z.object({
      data: z.string().describe("Data no formato AAAA-MM-DD"),
      horario: z.string().describe("Horário de início no formato HH:MM"),
      servico: z.string().optional().describe("Nome do serviço do catálogo"),
      observacoes: z.string().optional().describe("Observações do cliente"),
    }),
  },
  isAvailable: (ctx) => isCalendarActive(ctx.tenantId),
  execute: async (ctx, input) => {
    const { data, horario, servico, observacoes } = input as {
      data: string;
      horario: string;
      servico?: string;
      observacoes?: string;
    };
    const result = await createCalendarAppointment(ctx, { data, horario, servico, observacoes });
    return `Agendamento confirmado para ${data} às ${horario}${servico ? ` (${servico})` : ""}. Código: ${result.appointmentId}. Informe o cliente que está confirmado.`;
  },
});

// ---------- cancelar_agendamento ----------

registerTool({
  def: {
    name: "cancelar_agendamento",
    description:
      "Cancela um agendamento existente do cliente. Se o cliente não informar qual, a ferramenta lista os agendamentos futuros dele.",
    schema: z.object({
      codigo: z
        .string()
        .optional()
        .describe("Código do agendamento (se souber). Vazio = listar agendamentos do cliente"),
    }),
  },
  isAvailable: (ctx) => isCalendarActive(ctx.tenantId),
  execute: async (ctx, input) => {
    const { codigo } = input as { codigo?: string };
    if (!codigo) {
      const upcoming = await prisma.appointment.findMany({
        where: {
          tenantId: ctx.tenantId,
          contactId: ctx.contactId,
          startsAt: { gte: new Date() },
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        include: { catalogItem: true },
        orderBy: { startsAt: "asc" },
      });
      if (upcoming.length === 0) return "O cliente não tem agendamentos futuros.";
      return upcoming
        .map(
          (a) =>
            `Código ${a.id}: ${a.startsAt.toLocaleString("pt-BR", { timeZone: ctx.tenant.timezone })}${a.catalogItem ? ` — ${a.catalogItem.name}` : ""}`,
        )
        .join("\n");
    }
    await cancelCalendarAppointment(ctx, codigo);
    return `Agendamento ${codigo} cancelado com sucesso.`;
  },
});

// ---------- criar_cobranca_pix ----------

registerTool({
  def: {
    name: "criar_cobranca_pix",
    description:
      "Cria uma cobrança Pix para o cliente pagar. SEMPRE confirme o valor e o que está sendo cobrado antes de gerar. Retorna o código copia-e-cola que você deve enviar ao cliente.",
    schema: z.object({
      valor_reais: z.number().positive().describe("Valor em reais, ex.: 45.90"),
      descricao: z.string().describe("Descrição curta do que está sendo cobrado"),
      codigo_pedido: z.string().optional().describe("Código do pedido criado com criar_pedido, se houver"),
    }),
  },
  isAvailable: (ctx) => isPaymentActive(ctx.tenantId),
  execute: async (ctx, input) => {
    const { valor_reais, descricao, codigo_pedido } = input as {
      valor_reais: number;
      descricao: string;
      codigo_pedido?: string;
    };
    const amountCents = Math.round(valor_reais * 100);
    const payment = await createPixCharge(ctx, amountCents, descricao, codigo_pedido);
    return [
      `Cobrança Pix criada: ${(amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} — ${descricao}.`,
      `Envie este código copia-e-cola ao cliente:`,
      payment.pixCopiaECola ?? "(código indisponível)",
      `O sistema avisará automaticamente quando o pagamento for confirmado.`,
    ].join("\n");
  },
});

// ---------- consultar_dados_externos ----------

registerTool({
  def: {
    name: "consultar_dados_externos",
    description:
      "Consulta dados no sistema externo do estabelecimento (ERP, sistema de pedidos etc.). Chame primeiro sem parâmetros para ver as consultas disponíveis.",
    schema: z.object({
      conector: z.string().optional().describe("Nome do conector"),
      consulta: z.string().optional().describe("Nome da consulta/endpoint"),
      parametros: z
        .record(z.string())
        .optional()
        .describe("Parâmetros da consulta, ex.: { \"cpf\": \"...\" }"),
    }),
  },
  isAvailable: async (ctx) => {
    const count = await prisma.externalConnector.count({
      where: { tenantId: ctx.tenantId, active: true },
    });
    return count > 0;
  },
  execute: async (ctx, input) => {
    const { conector, consulta, parametros } = input as {
      conector?: string;
      consulta?: string;
      parametros?: Record<string, string>;
    };
    if (!conector || !consulta) {
      return describeConnectors(ctx.tenantId);
    }
    return callConnectorEndpoint(ctx.tenantId, conector, consulta, parametros ?? {});
  },
});
