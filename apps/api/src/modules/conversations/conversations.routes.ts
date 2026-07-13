import type { FastifyInstance } from "fastify";
import { sendAgentMessageSchema, setConversationModeSchema, WS_EVENTS } from "@iah/shared";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import { emitToTenant } from "../../realtime/io.js";
import { waOutboundQueue } from "../../queues/index.js";
import { cancelPendingAi } from "../ai/debounce.js";
import { sendNpsSurvey } from "../nps/nps.service.js";

export async function conversationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  // Lista conversas do tenant (mais recentes primeiro)
  app.get("/conversations", async (req) => {
    const tenantId = req.resolveTenantId();
    const { status } = req.query as { status?: string };

    const conversations = await prisma.conversation.findMany({
      where: {
        tenantId,
        ...(status ? { status: status as never } : {}),
      },
      include: {
        contact: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return {
      conversations: conversations.map((c) => ({
        id: c.id,
        tenantId: c.tenantId,
        contact: {
          id: c.contact.id,
          waId: c.contact.waId,
          name: c.contact.name,
          profileName: c.contact.profileName,
          tags: c.contact.tags,
        },
        status: c.status,
        mode: c.mode,
        unreadCount: c.unreadCount,
        lastCustomerMessageAt: c.lastCustomerMessageAt?.toISOString() ?? null,
        lastMessagePreview: c.messages[0]?.text ?? null,
        updatedAt: c.updatedAt.toISOString(),
      })),
    };
  });

  // Mensagens de uma conversa
  app.get("/conversations/:id/messages", async (req) => {
    const tenantId = req.resolveTenantId();
    const { id } = req.params as { id: string };

    const conversation = await prisma.conversation.findFirst({ where: { id, tenantId } });
    if (!conversation) throw new NotFoundError("Conversa não encontrada");

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    return {
      messages: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        direction: m.direction,
        authorType: m.authorType,
        type: m.type,
        text: m.text,
        mediaUrl: m.mediaUrl,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  });

  // Takeover: alterna entre BOT e HUMAN
  app.patch("/conversations/:id/mode", async (req) => {
    const tenantId = req.resolveTenantId();
    const { id } = req.params as { id: string };
    const { mode } = setConversationModeSchema.parse(req.body);

    const conversation = await prisma.conversation.findFirst({ where: { id, tenantId } });
    if (!conversation) throw new NotFoundError("Conversa não encontrada");

    if (mode === "HUMAN") {
      // Cancela IA agendada — o atendente assume agora
      await cancelPendingAi(id);
    }

    await prisma.conversation.update({
      where: { id },
      data: { mode, status: mode === "HUMAN" ? "WAITING" : "OPEN" },
    });

    await prisma.message.create({
      data: {
        tenantId,
        conversationId: id,
        direction: "OUT",
        authorType: "SYSTEM",
        type: "TEXT",
        text:
          mode === "HUMAN"
            ? `👤 ${req.user.name} assumiu o atendimento`
            : "🤖 Atendimento devolvido para a IA",
        status: "SENT",
      },
    });

    emitToTenant(tenantId, WS_EVENTS.CONVERSATION_UPDATED, {
      conversationId: id,
      mode,
      status: mode === "HUMAN" ? "WAITING" : "OPEN",
    });

    return { ok: true, mode };
  });

  // Resposta manual do atendente
  app.post("/conversations/:id/messages", async (req) => {
    const tenantId = req.resolveTenantId();
    const { id } = req.params as { id: string };
    const { text } = sendAgentMessageSchema.parse(req.body);

    const conversation = await prisma.conversation.findFirst({ where: { id, tenantId } });
    if (!conversation) throw new NotFoundError("Conversa não encontrada");

    const message = await prisma.message.create({
      data: {
        tenantId,
        conversationId: id,
        direction: "OUT",
        authorType: "AGENT",
        type: "TEXT",
        text,
        status: "QUEUED",
      },
    });

    emitToTenant(tenantId, WS_EVENTS.MESSAGE_NEW, {
      conversationId: id,
      message: {
        id: message.id,
        conversationId: id,
        direction: "OUT",
        authorType: "AGENT",
        type: "TEXT",
        text,
        mediaUrl: null,
        status: "QUEUED",
        createdAt: message.createdAt.toISOString(),
      },
    });

    await waOutboundQueue.add("send", { messageId: message.id });
    return { message: { id: message.id } };
  });

  // Zera contador de não lidas
  app.post("/conversations/:id/read", async (req) => {
    const tenantId = req.resolveTenantId();
    const { id } = req.params as { id: string };
    await prisma.conversation.updateMany({
      where: { id, tenantId },
      data: { unreadCount: 0 },
    });
    return { ok: true };
  });

  // Marca conversa como resolvida (dispara pesquisa NPS se habilitada)
  app.post("/conversations/:id/resolve", async (req) => {
    const tenantId = req.resolveTenantId();
    const { id } = req.params as { id: string };
    await prisma.conversation.updateMany({
      where: { id, tenantId },
      data: { status: "RESOLVED", mode: "BOT" },
    });
    sendNpsSurvey(tenantId, id).catch(() => {});
    emitToTenant(tenantId, WS_EVENTS.CONVERSATION_UPDATED, {
      conversationId: id,
      status: "RESOLVED",
      mode: "BOT",
    });
    return { ok: true };
  });
}
