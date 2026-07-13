"use client";

import { useEffect, useState } from "react";
import { TEMPLATE_PURPOSES, TEMPLATE_PURPOSE_LABELS, type TemplatePurpose } from "@iah/shared";
import { api, getActiveTenantId } from "@/lib/api";

interface Integrations {
  calendar: { active: boolean; type: string | null };
  mercadopago: { active: boolean };
  connectors: number;
}

interface TemplateDto {
  id: string;
  name: string;
  language: string;
  body: string;
  paramCount: number;
  purpose: TemplatePurpose;
  metaStatus: string | null;
}

interface ConnectorDto {
  id: string;
  name: string;
  baseUrl: string;
  hasAuthHeaders: boolean;
  endpoints: Record<string, { path: string; description: string }>;
  active: boolean;
}

export default function ConfiguracoesPage() {
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [connectors, setConnectors] = useState<ConnectorDto[]>([]);
  const [mpToken, setMpToken] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Recursos (NPS, fidelidade, orçamento, dono)
  const [features, setFeatures] = useState({
    npsEnabled: false,
    dailyTokenBudget: "",
    loyaltyPointsPerReal: "0",
    ownerWaId: "",
  });

  const [tplForm, setTplForm] = useState({
    name: "",
    language: "pt_BR",
    body: "",
    paramCount: "0",
    purpose: "GENERIC" as TemplatePurpose,
  });

  const [connForm, setConnForm] = useState({
    name: "",
    baseUrl: "",
    headers: "",
    endpoints: `{\n  "buscar_cliente": {\n    "method": "GET",\n    "path": "/clientes/{cpf}",\n    "description": "Busca cadastro do cliente pelo CPF",\n    "params": { "cpf": "CPF do cliente, somente números" }\n  }\n}`,
  });

  const tenantId = getActiveTenantId();

  async function load() {
    if (!tenantId) return;
    const [i, t, c, tenant, ai] = await Promise.all([
      api<{ integrations: Integrations }>(`/tenants/${tenantId}/integrations`),
      api<{ templates: TemplateDto[] }>("/templates"),
      api<{ connectors: ConnectorDto[] }>("/connectors"),
      api<{ tenant: { ownerWaId: string | null; loyaltyPointsPerReal: number } }>(`/tenants/${tenantId}`),
      api<{ aiConfig: { npsEnabled: boolean; dailyTokenBudget: number | null } }>(`/tenants/${tenantId}/ai-config`),
    ]);
    setIntegrations(i.integrations);
    setTemplates(t.templates);
    setConnectors(c.connectors);
    setFeatures({
      npsEnabled: ai.aiConfig.npsEnabled,
      dailyTokenBudget: ai.aiConfig.dailyTokenBudget ? String(ai.aiConfig.dailyTokenBudget) : "",
      loyaltyPointsPerReal: String(tenant.tenant.loyaltyPointsPerReal ?? 0),
      ownerWaId: tenant.tenant.ownerWaId ?? "",
    });
  }

  useEffect(() => {
    load().catch(() => {});
    if (typeof window !== "undefined" && window.location.search.includes("calendar=ok")) {
      setMsg({ type: "ok", text: "Google Calendar conectado com sucesso!" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  if (!tenantId) return <div className="alert err">Selecione um negócio no menu lateral.</div>;

  const ok = (text: string) => setMsg({ type: "ok", text });
  const fail = (err: unknown) =>
    setMsg({ type: "err", text: err instanceof Error ? err.message : "Erro" });

  async function connectCalendar() {
    try {
      const data = await api<{ url: string }>("/calendar/oauth/start");
      window.location.href = data.url;
    } catch (err) {
      fail(err);
    }
  }

  async function saveMercadoPago(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/tenants/${tenantId}/integrations/mercadopago`, {
        method: "PUT",
        body: { accessToken: mpToken || undefined, active: true },
      });
      ok("Mercado Pago configurado!");
      setMpToken("");
      await load();
    } catch (err) {
      fail(err);
    }
  }

  async function saveFeatures(e: React.FormEvent) {
    e.preventDefault();
    try {
      await Promise.all([
        api(`/tenants/${tenantId}/ai-config`, {
          method: "PUT",
          body: {
            npsEnabled: features.npsEnabled,
            dailyTokenBudget: features.dailyTokenBudget ? Number(features.dailyTokenBudget) : null,
          },
        }),
        api(`/tenants/${tenantId}`, {
          method: "PATCH",
          body: {
            ownerWaId: features.ownerWaId || undefined,
            loyaltyPointsPerReal: Number(features.loyaltyPointsPerReal) || 0,
          },
          tenantHeader: false,
        }),
      ]);
      ok("Recursos salvos!");
    } catch (err) {
      fail(err);
    }
  }

  async function syncTemplates() {
    try {
      const data = await api<{ imported: number }>("/templates/sync", { method: "POST" });
      ok(`${data.imported} template(s) importados da Meta!`);
      await load();
    } catch (err) {
      fail(err);
    }
  }

  async function addTemplate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/templates", {
        method: "POST",
        body: { ...tplForm, paramCount: Number(tplForm.paramCount) || 0 },
      });
      setTplForm({ name: "", language: "pt_BR", body: "", paramCount: "0", purpose: "GENERIC" });
      await load();
    } catch (err) {
      fail(err);
    }
  }

  async function removeTemplate(id: string) {
    await api(`/templates/${id}`, { method: "DELETE" });
    await load();
  }

  async function addConnector(e: React.FormEvent) {
    e.preventDefault();
    try {
      let endpoints: unknown;
      let headers: unknown;
      try {
        endpoints = JSON.parse(connForm.endpoints);
        headers = connForm.headers ? JSON.parse(connForm.headers) : undefined;
      } catch {
        throw new Error("Endpoints/headers precisam ser JSON válido");
      }
      await api("/connectors", {
        method: "POST",
        body: { name: connForm.name, baseUrl: connForm.baseUrl, headers, endpoints, active: true },
      });
      ok("Conector criado!");
      setConnForm({ ...connForm, name: "", baseUrl: "", headers: "" });
      await load();
    } catch (err) {
      fail(err);
    }
  }

  async function removeConnector(id: string) {
    if (!confirm("Excluir este conector?")) return;
    await api(`/connectors/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <h1 className="page-title">Configurações e integrações</h1>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      {/* ---------- Recursos ---------- */}
      <form className="card" onSubmit={saveFeatures}>
        <h3>✨ Recursos do atendimento</h3>
        <div className="row">
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={features.npsEnabled}
                onChange={(e) => setFeatures({ ...features, npsEnabled: e.target.checked })}
              />{" "}
              Pesquisa NPS ao resolver conversa
            </label>
          </div>
          <div className="field">
            <label>Fidelidade: pontos por R$ 1 pago (0 = desligado)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={features.loyaltyPointsPerReal}
              onChange={(e) => setFeatures({ ...features, loyaltyPointsPerReal: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Orçamento diário de tokens de IA (vazio = ilimitado)</label>
            <input
              type="number"
              min="1000"
              value={features.dailyTokenBudget}
              onChange={(e) => setFeatures({ ...features, dailyTokenBudget: e.target.value })}
              placeholder="ex.: 500000"
            />
          </div>
          <div className="field">
            <label>WhatsApp do dono (recebe relatório semanal)</label>
            <input
              value={features.ownerWaId}
              onChange={(e) => setFeatures({ ...features, ownerWaId: e.target.value })}
              placeholder="5511999998888"
            />
          </div>
        </div>
        <button className="btn">Salvar recursos</button>
      </form>

      {/* ---------- Templates ---------- */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>📄 Templates da Meta</h3>
          <button className="btn sm secondary" onClick={syncTemplates}>
            ⟳ Sincronizar da Meta
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "8px 0 12px" }}>
          Templates aprovados permitem enviar mensagens fora da janela de 24h (campanhas, lembretes,
          reativação, relatório). Defina o <strong>propósito</strong> para o sistema escolher o
          template certo automaticamente.
        </p>
        <table className="tbl">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Propósito</th>
              <th>Parâmetros</th>
              <th>Status Meta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.name}</strong> <span style={{ color: "var(--text-dim)" }}>({t.language})</span>
                  {t.body && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{t.body}</div>}
                </td>
                <td>
                  <select
                    value={t.purpose}
                    onChange={async (e) => {
                      await api("/templates", {
                        method: "POST",
                        body: {
                          name: t.name,
                          language: t.language,
                          body: t.body,
                          paramCount: t.paramCount,
                          purpose: e.target.value,
                        },
                      });
                      await load();
                    }}
                  >
                    {TEMPLATE_PURPOSES.map((p) => (
                      <option key={p} value={p}>
                        {TEMPLATE_PURPOSE_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{t.paramCount}</td>
                <td>{t.metaStatus ?? "—"}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn sm danger" onClick={() => removeTemplate(t.id)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form onSubmit={addTemplate} style={{ marginTop: 14 }}>
          <div className="row">
            <div className="field">
              <label>Nome (igual ao aprovado na Meta)</label>
              <input value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Idioma</label>
              <input value={tplForm.language} onChange={(e) => setTplForm({ ...tplForm, language: e.target.value })} />
            </div>
            <div className="field">
              <label>Nº de parâmetros</label>
              <input
                type="number"
                min="0"
                max="10"
                value={tplForm.paramCount}
                onChange={(e) => setTplForm({ ...tplForm, paramCount: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Propósito</label>
              <select
                value={tplForm.purpose}
                onChange={(e) => setTplForm({ ...tplForm, purpose: e.target.value as TemplatePurpose })}
              >
                {TEMPLATE_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {TEMPLATE_PURPOSE_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Corpo (referência)</label>
            <input
              value={tplForm.body}
              onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })}
              placeholder="Olá {{1}}! Lembrete do seu horário em {{2}}…"
            />
          </div>
          <button className="btn secondary">Adicionar manualmente</button>
        </form>
      </div>

      {/* ---------- Google Calendar ---------- */}
      <div className="card">
        <h3>
          📅 Google Calendar{" "}
          {integrations?.calendar.active ? (
            <span className="badge green">conectado</span>
          ) : (
            <span className="badge gray">desconectado</span>
          )}
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
          Permite que a IA consulte horários livres e crie agendamentos (com lembretes automáticos
          24h/2h antes).
        </p>
        <button className="btn secondary" onClick={connectCalendar}>
          {integrations?.calendar.active ? "Reconectar agenda" : "Conectar Google Calendar"}
        </button>
      </div>

      {/* ---------- Mercado Pago ---------- */}
      <form className="card" onSubmit={saveMercadoPago}>
        <h3>
          💰 Mercado Pago{" "}
          {integrations?.mercadopago.active ? (
            <span className="badge green">ativo</span>
          ) : (
            <span className="badge gray">inativo</span>
          )}
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
          Permite que a IA gere cobranças Pix (e credite pontos de fidelidade quando o pagamento é
          aprovado). Webhook: <code>{"{API}"}/webhooks/mercadopago/{tenantId}</code>
        </p>
        <div className="row">
          <div className="field">
            <label>Access Token {integrations?.mercadopago.active && "(vazio = manter atual)"}</label>
            <input type="password" value={mpToken} onChange={(e) => setMpToken(e.target.value)} placeholder="APP_USR-…" />
          </div>
        </div>
        <button className="btn secondary">Salvar Mercado Pago</button>
      </form>

      {/* ---------- Conectores ---------- */}
      <div className="card">
        <h3>🔌 Conectores de dados externos</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
          A IA consulta o sistema do cliente (ERP, pedidos, cadastro) por endpoints REST
          pré-cadastrados (somente GET). Habilite a ferramenta “consultar_dados_externos” na Persona.
        </p>
        {connectors.map((c) => (
          <div
            key={c.id}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{c.name}</strong>{" "}
                <span className={`badge ${c.active ? "green" : "gray"}`}>
                  {c.active ? "ativo" : "inativo"}
                </span>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {c.baseUrl} · {Object.keys(c.endpoints).length} consulta(s)
                  {c.hasAuthHeaders && " · autenticado"}
                </div>
              </div>
              <button className="btn sm danger" onClick={() => removeConnector(c.id)}>
                Excluir
              </button>
            </div>
          </div>
        ))}

        <form onSubmit={addConnector} style={{ marginTop: 10 }}>
          <div className="row">
            <div className="field">
              <label>Nome</label>
              <input value={connForm.name} onChange={(e) => setConnForm({ ...connForm, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>URL base</label>
              <input
                value={connForm.baseUrl}
                onChange={(e) => setConnForm({ ...connForm, baseUrl: e.target.value })}
                placeholder="https://erp.cliente.com.br/api"
                required
              />
            </div>
            <div className="field">
              <label>Headers de auth (JSON, opcional)</label>
              <input
                value={connForm.headers}
                onChange={(e) => setConnForm({ ...connForm, headers: e.target.value })}
                placeholder='{"authorization": "Bearer …"}'
              />
            </div>
          </div>
          <div className="field">
            <label>Consultas (JSON: nome → método/path/descrição)</label>
            <textarea
              style={{ minHeight: 140, fontFamily: "monospace", fontSize: 12.5 }}
              value={connForm.endpoints}
              onChange={(e) => setConnForm({ ...connForm, endpoints: e.target.value })}
            />
          </div>
          <button className="btn secondary">Adicionar conector</button>
        </form>
      </div>
    </div>
  );
}
