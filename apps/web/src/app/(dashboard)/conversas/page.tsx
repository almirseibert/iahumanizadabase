"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ConversationDto, MessageDto } from "@iah/shared";
import { API_URL, api, getActiveTenantId, getToken } from "@/lib/api";

export default function ConversasPage() {
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [selected, setSelected] = useState<ConversationDto | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<ConversationDto | null>(null);
  selectedRef.current = selected;

  const loadConversations = useCallback(async () => {
    const data = await api<{ conversations: ConversationDto[] }>("/conversations");
    setConversations(data.conversations);
  }, []);

  useEffect(() => {
    loadConversations().catch(() => {});
  }, [loadConversations]);

  // Socket.io — inbox ao vivo
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const socket: Socket = io(API_URL, { auth: { token } });

    socket.on("connect", () => {
      const tenantId = getActiveTenantId();
      if (tenantId) socket.emit("tenant:join", tenantId);
    });

    socket.on("message:new", (payload: { conversationId: string; message: MessageDto }) => {
      if (selectedRef.current?.id === payload.conversationId) {
        setMessages((prev) =>
          prev.some((m) => m.id === payload.message.id) ? prev : [...prev, payload.message],
        );
      }
      loadConversations().catch(() => {});
    });

    socket.on("message:status", () => {
      // Recarrega mensagens da conversa aberta para refletir status
      const current = selectedRef.current;
      if (current) {
        api<{ messages: MessageDto[] }>(`/conversations/${current.id}/messages`)
          .then((d) => setMessages(d.messages))
          .catch(() => {});
      }
    });

    socket.on("conversation:updated", () => {
      loadConversations().catch(() => {});
      const current = selectedRef.current;
      if (current) {
        api<{ conversations: ConversationDto[] }>("/conversations")
          .then((d) => {
            const fresh = d.conversations.find((c) => c.id === current.id);
            if (fresh) setSelected(fresh);
          })
          .catch(() => {});
      }
    });

    socket.on("handoff:requested", () => loadConversations().catch(() => {}));

    return () => {
      socket.disconnect();
    };
  }, [loadConversations]);

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight });
  }, [messages]);

  async function openConversation(conv: ConversationDto) {
    setSelected(conv);
    const data = await api<{ messages: MessageDto[] }>(`/conversations/${conv.id}/messages`);
    setMessages(data.messages);
    api(`/conversations/${conv.id}/read`, { method: "POST" }).catch(() => {});
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)),
    );
  }

  async function toggleMode() {
    if (!selected) return;
    const newMode = selected.mode === "BOT" ? "HUMAN" : "BOT";
    await api(`/conversations/${selected.id}/mode`, { method: "PATCH", body: { mode: newMode } });
    setSelected({ ...selected, mode: newMode });
    loadConversations().catch(() => {});
  }

  async function resolve() {
    if (!selected) return;
    await api(`/conversations/${selected.id}/resolve`, { method: "POST" });
    setSelected(null);
    setMessages([]);
    loadConversations().catch(() => {});
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !draft.trim() || sending) return;
    setSending(true);
    try {
      await api(`/conversations/${selected.id}/messages`, {
        method: "POST",
        body: { text: draft.trim() },
      });
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  const displayName = (c: ConversationDto) =>
    c.contact.name ?? c.contact.profileName ?? `+${c.contact.waId}`;

  return (
    <div className="inbox">
      <div className="conv-list">
        <div className="head">Conversas</div>
        <div className="items">
          {conversations.length === 0 && (
            <div style={{ padding: 20, color: "var(--text-dim)", fontSize: 13 }}>
              Nenhuma conversa ainda. Quando um cliente mandar mensagem no WhatsApp, ela aparece aqui.
            </div>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`conv-item${selected?.id === c.id ? " selected" : ""}`}
              onClick={() => openConversation(c)}
            >
              <div className="top">
                <span className="name">{displayName(c)}</span>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {c.mode === "HUMAN" && <span className="badge orange">humano</span>}
                  {c.status === "WAITING" && <span className="badge red">aguardando</span>}
                  {c.unreadCount > 0 && <span className="unread">{c.unreadCount}</span>}
                </span>
              </div>
              <div className="preview">{c.lastMessagePreview ?? "…"}</div>
            </div>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="chat">
          <div className="chat-head">
            <div>
              <strong>{displayName(selected)}</strong>{" "}
              <span style={{ color: "var(--text-dim)", fontSize: 12 }}>+{selected.contact.waId}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className={`btn sm${selected.mode === "BOT" ? " secondary" : ""}`} onClick={toggleMode}>
                {selected.mode === "BOT" ? "✋ Assumir atendimento" : "🤖 Devolver para IA"}
              </button>
              <button className="btn sm secondary" onClick={resolve}>
                ✓ Resolver
              </button>
            </div>
          </div>
          <div className="msgs" ref={msgsRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`bubble ${m.authorType === "SYSTEM" ? "sys" : m.direction === "IN" ? "in" : "out"}`}
              >
                {m.text ?? `[${m.type.toLowerCase()}]`}
                {m.authorType !== "SYSTEM" && (
                  <div className="meta">
                    {m.authorType === "BOT" ? "🤖 " : m.authorType === "AGENT" ? "👤 " : ""}
                    {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {m.direction === "OUT" &&
                      (m.status === "READ"
                        ? " ✓✓"
                        : m.status === "DELIVERED"
                          ? " ✓✓"
                          : m.status === "SENT"
                            ? " ✓"
                            : m.status === "FAILED"
                              ? " ⚠"
                              : " 🕓")}
                  </div>
                )}
              </div>
            ))}
          </div>
          <form className="composer" onSubmit={send}>
            <input
              placeholder={
                selected.mode === "BOT"
                  ? "Enviar como atendente (a IA continua ativa)…"
                  : "Digite sua resposta…"
              }
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="btn" disabled={sending || !draft.trim()}>
              Enviar
            </button>
          </form>
        </div>
      ) : (
        <div className="chat">
          <div className="empty">Selecione uma conversa à esquerda</div>
        </div>
      )}
    </div>
  );
}
