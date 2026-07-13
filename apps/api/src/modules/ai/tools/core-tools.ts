import { z } from "zod";
import { WS_EVENTS } from "@iah/shared";
import { prisma } from "../../../lib/prisma.js";
import { emitToTenant } from "../../../realtime/io.js";
import { incrementMetric } from "../../metrics/metrics.service.js";
import { registerTool } from "./registry.js";

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------- consultar_informacoes_negocio ----------

registerTool({
  def: {
    name: "consultar_informacoes_negocio",
    description:
      "Consulta informações do estabelecimento: descrição, endereço, telefone e horário de funcionamento. Use sempre que o cliente perguntar onde fica, quando abre, como funciona etc.",
    schema: z.object({}),
  },
  execute: async (ctx) => {
    const { tenant } = ctx;
    const parts: string[] = [`Nome: ${tenant.name}`];
    if (tenant.description) parts.push(`Sobre: ${tenant.description}`);
    if (tenant.address) parts.push(`Endereço: ${tenant.address}`);
    if (tenant.phoneDisplay) parts.push(`Telefone: ${tenant.phoneDisplay}`);
    if (tenant.businessHours) {
      parts.push(`Horário de funcionamento: ${JSON.stringify(tenant.businessHours)}`);
    }
    return parts.join("\n");
  },
});

// ---------- consultar_catalogo ----------

registerTool({
  def: {
    name: "consultar_catalogo",
    description:
      "Consulta o catálogo de produtos/serviços com preços. Pode filtrar por categoria ou termo de busca. Use quando o cliente perguntar preços, produtos ou serviços disponíveis.",
    schema: z.object({
      busca: z.string().optional().describe("Termo para buscar no nome/descrição"),
      categoria: z.string().optional().describe("Filtrar por categoria exata"),
    }),
  },
  execute: async (ctx, input) => {
    const { busca, categoria } = input as { busca?: string; categoria?: string };
    const items = await prisma.catalogItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        active: true,
        ...(categoria ? { category: { equals: categoria, mode: "insensitive" } } : {}),
        ...(busca
          ? {
              OR: [
                { name: { contains: busca, mode: "insensitive" } },
                { description: { contains: busca, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: 50,
    });
    if (items.length === 0) {
      return "Nenhum item encontrado no catálogo com esses critérios.";
    }
    return items
      .map((i) => {
        const duration = i.durationMin ? ` (${i.durationMin} min)` : "";
        const desc = i.description ? ` — ${i.description}` : "";
        return `[${i.category}] ${i.name}: ${formatBRL(i.priceCents)}${duration}${desc}`;
      })
      .join("\n");
  },
});

// ---------- escalar_para_humano ----------

registerTool({
  def: {
    name: "escalar_para_humano",
    description:
      "Transfere a conversa para um atendente humano. Use quando o cliente pedir explicitamente para falar com uma pessoa, quando estiver insatisfeito, ou quando você não conseguir resolver o problema. Após chamar esta ferramenta, envie uma última mensagem avisando que um atendente vai assumir.",
    schema: z.object({
      motivo: z.string().describe("Motivo resumido da transferência"),
    }),
  },
  execute: async (ctx, input) => {
    const { motivo } = input as { motivo: string };
    await prisma.conversation.update({
      where: { id: ctx.conversationId },
      data: { mode: "HUMAN", status: "WAITING" },
    });
    await prisma.message.create({
      data: {
        tenantId: ctx.tenantId,
        conversationId: ctx.conversationId,
        direction: "OUT",
        authorType: "SYSTEM",
        type: "TEXT",
        text: `🤖→👤 IA transferiu para atendimento humano. Motivo: ${motivo}`,
        status: "SENT",
      },
    });
    await incrementMetric(ctx.tenantId, { handoffs: 1 });
    emitToTenant(ctx.tenantId, WS_EVENTS.HANDOFF_REQUESTED, {
      conversationId: ctx.conversationId,
      motivo,
    });
    emitToTenant(ctx.tenantId, WS_EVENTS.CONVERSATION_UPDATED, {
      conversationId: ctx.conversationId,
      mode: "HUMAN",
      status: "WAITING",
    });
    return "Conversa transferida para atendente humano com sucesso. Avise o cliente que em breve alguém vai atendê-lo.";
  },
});
