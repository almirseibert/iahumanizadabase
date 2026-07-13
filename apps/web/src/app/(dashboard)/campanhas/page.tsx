"use client";

import { useEffect, useState } from "react";
import { api, getActiveTenantId } from "@/lib/api";

interface TemplateDto {
  id: string;
  name: string;
  language: string;
  body: string;
  paramCount: number;
  metaStatus: string | null;
}

interface CampaignDto {
  id: string;
  name: string;
  status: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  template: { name: string; body: string };
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "rascunho", cls: "gray" },
  SENDING: { label: "enviando", cls: "orange" },
  DONE: { label: "concluída", cls: "green" },
  CANCELLED: { label: "cancelada", cls: "red" },
};

export default function CampanhasPage() {
  const [campaigns, setCampaigns] = useState<CampaignDto[]>([]);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [form, setForm] = useState({ name: "", templateId: "", tags: "", params: [] as string[] });
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const tenantId = getActiveTenantId();

  const selectedTemplate = templates.find((t) => t.id === form.templateId);

  async function load() {
    const [c, t] = await Promise.all([
      api<{ campaigns: CampaignDto[] }>("/campaigns"),
      api<{ templates: TemplateDto[] }>("/templates"),
    ]);
    setCampaigns(c.campaigns);
    setTemplates(t.templates);
  }

  useEffect(() => {
    if (tenantId) load().catch(() => {});
    const interval = setInterval(() => {
      if (tenantId) load().catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  if (!tenantId) return <div className="alert err">Selecione um negócio no menu lateral.</div>;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api("/campaigns", {
        method: "POST",
        body: {
          name: form.name,
          templateId: form.templateId,
          bodyParams: form.params.slice(0, selectedTemplate?.paramCount ?? 0),
          filterTags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      setMsg({ type: "ok", text: "Campanha criada e disparada! O envio respeita o rate limit." });
      setForm({ name: "", templateId: "", tags: "", params: [] });
      await load();
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Erro ao criar campanha" });
    }
  }

  async function cancel(id: string) {
    await api(`/campaigns/${id}/cancel`, { method: "POST" });
    await load();
  }

  return (
    <div>
      <h1 className="page-title">Campanhas de broadcast</h1>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <form className="card" onSubmit={create}>
        <h3>Nova campanha</h3>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 12 }}>
          Broadcast usa templates aprovados na Meta (cadastre/sincronize em Configurações). Só
          contatos que não pediram para sair recebem.
        </p>
        <div className="row">
          <div className="field">
            <label>Nome da campanha</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="field">
            <label>Template</label>
            <select
              value={form.templateId}
              onChange={(e) => setForm({ ...form, templateId: e.target.value, params: [] })}
              required
            >
              <option value="">Selecione…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.language}){t.metaStatus ? ` — ${t.metaStatus}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Filtrar por tags (separadas por vírgula; vazio = todos)</label>
            <input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="vip, clientes-bolo"
            />
          </div>
        </div>
        {selectedTemplate && selectedTemplate.body && (
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 10 }}>
            Corpo: <em>{selectedTemplate.body}</em>
          </p>
        )}
        {selectedTemplate && selectedTemplate.paramCount > 0 && (
          <div className="row">
            {Array.from({ length: selectedTemplate.paramCount }, (_, i) => (
              <div className="field" key={i}>
                <label>{`Parâmetro {{${i + 1}}}`}</label>
                <input
                  value={form.params[i] ?? ""}
                  onChange={(e) => {
                    const params = [...form.params];
                    params[i] = e.target.value;
                    setForm({ ...form, params });
                  }}
                  required
                />
              </div>
            ))}
          </div>
        )}
        <button className="btn">Disparar campanha</button>
      </form>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Campanha</th>
              <th>Template</th>
              <th>Progresso</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--text-dim)" }}>
                  Nenhuma campanha ainda.
                </td>
              </tr>
            )}
            {campaigns.map((c) => {
              const st = STATUS_LABEL[c.status] ?? { label: c.status, cls: "gray" };
              return (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                      {new Date(c.createdAt).toLocaleString("pt-BR")}
                    </div>
                  </td>
                  <td>{c.template.name}</td>
                  <td>
                    {c.sentCount}/{c.totalCount} enviados
                    {c.failedCount > 0 && (
                      <span style={{ color: "var(--danger)" }}> · {c.failedCount} falhas</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {c.status === "SENDING" && (
                      <button className="btn sm danger" onClick={() => cancel(c.id)}>
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
