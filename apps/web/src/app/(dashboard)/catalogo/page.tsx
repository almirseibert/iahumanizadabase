"use client";

import { useEffect, useState } from "react";
import type { CatalogItemDto } from "@iah/shared";
import { api, getActiveTenantId } from "@/lib/api";

const EMPTY = { category: "", name: "", description: "", price: "", durationMin: "" };

export default function CatalogoPage() {
  const [items, setItems] = useState<CatalogItemDto[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const tenantId = getActiveTenantId();

  async function load() {
    const data = await api<{ items: CatalogItemDto[] }>("/catalog");
    setItems(data.items);
  }
  useEffect(() => {
    if (tenantId) load().catch(() => {});
  }, [tenantId]);

  if (!tenantId) return <div className="alert err">Selecione um negócio no menu lateral.</div>;

  function startEdit(item: CatalogItemDto) {
    setEditingId(item.id);
    setForm({
      category: item.category,
      name: item.name,
      description: item.description ?? "",
      price: (item.priceCents / 100).toFixed(2).replace(".", ","),
      durationMin: item.durationMin ? String(item.durationMin) : "",
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const priceCents = Math.round(Number(form.price.replace(/\./g, "").replace(",", ".")) * 100);
    if (Number.isNaN(priceCents)) {
      setMsg("Preço inválido");
      return;
    }
    const body = {
      category: form.category,
      name: form.name,
      description: form.description || undefined,
      priceCents,
      durationMin: form.durationMin ? Number(form.durationMin) : null,
      active: true,
    };
    if (editingId) {
      await api(`/catalog/${editingId}`, { method: "PATCH", body });
    } else {
      await api("/catalog", { method: "POST", body });
    }
    setForm({ ...EMPTY });
    setEditingId(null);
    await load();
  }

  async function toggleActive(item: CatalogItemDto) {
    await api(`/catalog/${item.id}`, { method: "PATCH", body: { active: !item.active } });
    await load();
  }

  async function remove(item: CatalogItemDto) {
    if (!confirm(`Excluir "${item.name}" do catálogo?`)) return;
    await api(`/catalog/${item.id}`, { method: "DELETE" });
    await load();
  }

  const fmt = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div>
      <h1 className="page-title">Catálogo de produtos e serviços</h1>
      {msg && <div className="alert err">{msg}</div>}

      <form className="card" onSubmit={save}>
        <h3>{editingId ? "Editar item" : "Adicionar item"}</h3>
        <div className="row">
          <div className="field">
            <label>Categoria</label>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Pães / Serviços / Consultas…"
              required
            />
          </div>
          <div className="field">
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="field">
            <label>Preço (R$)</label>
            <input
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="35,00"
              required
            />
          </div>
          <div className="field">
            <label>Duração (min — p/ serviços agendáveis)</label>
            <input
              type="number"
              value={form.durationMin}
              onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
              placeholder="ex.: 45"
            />
          </div>
        </div>
        <div className="field">
          <label>Descrição (a IA usa para explicar ao cliente)</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Ex.: Serve 10 fatias. Encomenda com 24h de antecedência."
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn">{editingId ? "Salvar alterações" : "Adicionar"}</button>
          {editingId && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setEditingId(null);
                setForm({ ...EMPTY });
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Item</th>
              <th>Preço</th>
              <th>Duração</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ opacity: item.active ? 1 : 0.5 }}>
                <td>{item.category}</td>
                <td>
                  <strong>{item.name}</strong>
                  {item.description && (
                    <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{item.description}</div>
                  )}
                </td>
                <td>{fmt(item.priceCents)}</td>
                <td>{item.durationMin ? `${item.durationMin} min` : "—"}</td>
                <td>
                  <span className={`badge ${item.active ? "green" : "gray"}`}>
                    {item.active ? "ativo" : "inativo"}
                  </span>
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn sm secondary" onClick={() => startEdit(item)}>
                    Editar
                  </button>{" "}
                  <button className="btn sm secondary" onClick={() => toggleActive(item)}>
                    {item.active ? "Desativar" : "Ativar"}
                  </button>{" "}
                  <button className="btn sm danger" onClick={() => remove(item)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
