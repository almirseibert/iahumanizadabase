"use client";

import { useEffect, useState } from "react";
import { SEGMENT_LABELS, SEGMENTS, type TenantDto } from "@iah/shared";
import { api, getStoredUser, setActiveTenantId } from "@/lib/api";

const EMPTY_FORM = {
  name: "",
  slug: "",
  segment: "OUTRO",
  description: "",
  address: "",
  phoneDisplay: "",
  waPhoneNumberId: "",
  waAccessToken: "",
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [editing, setEditing] = useState<TenantDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const isSuperadmin = getStoredUser()?.role === "SUPERADMIN";

  async function load() {
    const data = await api<{ tenants: TenantDto[] }>("/tenants", { tenantHeader: false });
    setTenants(data.tenants);
  }
  useEffect(() => {
    load().catch(() => {});
  }, []);

  function startEdit(t: TenantDto) {
    setCreating(false);
    setEditing(t);
    setForm({
      name: t.name,
      slug: t.slug,
      segment: t.segment,
      description: t.description ?? "",
      address: t.address ?? "",
      phoneDisplay: t.phoneDisplay ?? "",
      waPhoneNumberId: t.waPhoneNumberId ?? "",
      waAccessToken: "",
    });
  }

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setForm({ ...EMPTY_FORM });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        slug: form.slug,
        segment: form.segment,
        description: form.description || undefined,
        address: form.address || undefined,
        phoneDisplay: form.phoneDisplay || undefined,
        waPhoneNumberId: form.waPhoneNumberId || undefined,
      };
      if (form.waAccessToken) body.waAccessToken = form.waAccessToken;

      if (creating) {
        await api("/tenants", { method: "POST", body, tenantHeader: false });
        setMsg({ type: "ok", text: "Negócio criado com sucesso!" });
      } else if (editing) {
        await api(`/tenants/${editing.id}`, { method: "PATCH", body, tenantHeader: false });
        setMsg({ type: "ok", text: "Negócio atualizado!" });
      }
      setCreating(false);
      setEditing(null);
      await load();
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Erro ao salvar" });
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title">Negócios (tenants)</h1>
        {isSuperadmin && (
          <button className="btn" onClick={startCreate}>
            + Novo negócio
          </button>
        )}
      </div>

      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Segmento</th>
              <th>WhatsApp</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.name}</strong>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{t.slug}</div>
                </td>
                <td>{SEGMENT_LABELS[t.segment] ?? t.segment}</td>
                <td>
                  {t.waConfigured ? (
                    <span className="badge green">conectado</span>
                  ) : (
                    <span className="badge gray">não configurado</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${t.status === "ACTIVE" ? "green" : "gray"}`}>
                    {t.status === "ACTIVE" ? "ativo" : t.status.toLowerCase()}
                  </span>
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn sm secondary" onClick={() => startEdit(t)}>
                    Editar
                  </button>{" "}
                  {isSuperadmin && (
                    <button
                      className="btn sm secondary"
                      onClick={() => {
                        setActiveTenantId(t.id);
                        window.location.href = "/conversas";
                      }}
                    >
                      Abrir →
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <form className="card" onSubmit={save}>
          <h3>{creating ? "Novo negócio" : `Editar: ${editing?.name}`}</h3>
          <div className="row">
            <div className="field">
              <label>Nome</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Slug (identificador)</label>
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                pattern="[a-z0-9-]+"
                required
                disabled={!creating}
              />
            </div>
            <div className="field">
              <label>Segmento</label>
              <select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}>
                {SEGMENTS.map((s) => (
                  <option key={s} value={s}>
                    {SEGMENT_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Descrição do negócio (a IA usa este texto para responder clientes)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ex.: Padaria artesanal aberta desde 2010. Aceitamos encomendas com 24h de antecedência…"
            />
          </div>
          <div className="row">
            <div className="field">
              <label>Endereço</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="field">
              <label>Telefone exibido</label>
              <input
                value={form.phoneDisplay}
                onChange={(e) => setForm({ ...form, phoneDisplay: e.target.value })}
              />
            </div>
          </div>
          <h3 style={{ marginTop: 10 }}>WhatsApp Cloud API</h3>
          <div className="row">
            <div className="field">
              <label>Phone Number ID (painel Meta)</label>
              <input
                value={form.waPhoneNumberId}
                onChange={(e) => setForm({ ...form, waPhoneNumberId: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Access Token {editing?.waConfigured && "(deixe vazio para manter o atual)"}</label>
              <input
                type="password"
                value={form.waAccessToken}
                onChange={(e) => setForm({ ...form, waAccessToken: e.target.value })}
                placeholder="EAAG…"
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn">{creating ? "Criar" : "Salvar"}</button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
