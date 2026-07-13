import { z } from "zod";
import { prisma } from "../../../lib/prisma.js";
import { hasKnowledge, searchKnowledge } from "../../knowledge/knowledge.service.js";
import { scheduleAbandonedOrderCheck } from "../../followups/followups.service.js";
import { registerTool } from "./registry.js";

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------- consultar_base_conhecimento ----------

registerTool({
  def: {
    name: "consultar_base_conhecimento",
    description:
      "Busca na base de conhecimento do estabelecimento (FAQ, políticas, procedimentos, detalhes de produtos). Use quando o cliente fizer perguntas específicas que o catálogo não responde.",
    schema: z.object({
      pergunta: z.string().describe("O que você quer saber, em palavras-chave ou pergunta"),
    }),
  },
  isAvailable: (ctx) => hasKnowledge(ctx.tenantId),
  execute: async (ctx, input) => {
    const { pergunta } = input as { pergunta: string };
    const results = await searchKnowledge(ctx.tenantId, pergunta);
    if (results.length === 0) {
      return "Nada encontrado na base de conhecimento sobre isso. Não invente uma resposta — ofereça transferir para um atendente.";
    }
    return results.map((r) => `### ${r.title}\n${r.content}`).join("\n\n");
  },
});

// ---------- criar_pedido ----------

registerTool({
  def: {
    name: "criar_pedido",
    description:
      "Registra um pedido com itens do catálogo. SEMPRE confirme os itens e quantidades com o cliente antes. Retorna o total e o código do pedido — use criar_cobranca_pix com o codigo_pedido para cobrar.",
    schema: z.object({
      itens: z
        .array(
          z.object({
            nome: z.string().describe("Nome do item como está no catálogo"),
            quantidade: z.number().int().positive(),
          }),
        )
        .min(1),
    }),
  },
  execute: async (ctx, input) => {
    const { itens } = input as { itens: Array<{ nome: string; quantidade: number }> };

    const orderItems: Array<{ name: string; qty: number; priceCents: number; catalogItemId: string }> = [];
    const notFound: string[] = [];
    for (const item of itens) {
      const catalogItem = await prisma.catalogItem.findFirst({
        where: {
          tenantId: ctx.tenantId,
          active: true,
          name: { contains: item.nome, mode: "insensitive" },
        },
      });
      if (!catalogItem) {
        notFound.push(item.nome);
        continue;
      }
      orderItems.push({
        name: catalogItem.name,
        qty: item.quantidade,
        priceCents: catalogItem.priceCents,
        catalogItemId: catalogItem.id,
      });
    }
    if (notFound.length > 0) {
      return `Itens não encontrados no catálogo: ${notFound.join(", ")}. Consulte o catálogo e confirme os nomes com o cliente.`;
    }

    const totalCents = orderItems.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
    const order = await prisma.order.create({
      data: {
        tenantId: ctx.tenantId,
        contactId: ctx.contactId,
        items: orderItems,
        totalCents,
        status: "DRAFT",
      },
    });

    // Follow-up automático se o pedido ficar abandonado
    await scheduleAbandonedOrderCheck(order.id);

    const lines = orderItems.map((i) => `- ${i.qty}x ${i.name}: ${formatBRL(i.priceCents * i.qty)}`);
    return [
      `Pedido registrado! Código: ${order.id}`,
      ...lines,
      `Total: ${formatBRL(totalCents)}`,
      `Para cobrar, use criar_cobranca_pix informando codigo_pedido=${order.id}.`,
    ].join("\n");
  },
});

// ---------- consultar_pontos ----------

registerTool({
  def: {
    name: "consultar_pontos",
    description:
      "Consulta o saldo de pontos de fidelidade do cliente. Use quando o cliente perguntar sobre pontos, fidelidade ou cashback.",
    schema: z.object({}),
  },
  isAvailable: async (ctx) => ctx.tenant.loyaltyPointsPerReal > 0,
  execute: async (ctx) => {
    const account = await prisma.loyaltyAccount.findUnique({
      where: { tenantId_contactId: { tenantId: ctx.tenantId, contactId: ctx.contactId } },
    });
    const points = account?.points ?? 0;
    return `O cliente tem ${points} ponto(s) de fidelidade. Regra atual: ${ctx.tenant.loyaltyPointsPerReal} ponto(s) por real pago.`;
  },
});
