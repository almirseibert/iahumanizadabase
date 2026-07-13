"use client";

import { useEffect, useState } from "react";
import { api, getActiveTenantId } from "@/lib/api";

interface ChunkDto {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export default function ConhecimentoPage() {
  const [chunks, setChunks] = useState<ChunkDto[]>([]);
  const [form, setForm] = useState({ title: "", content: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const tenantId = getActiveTenantId();

  async function load() {
    const data = await api<{ chunks: ChunkDto[] }>("/knowledge");
    setChunks(data.chunks);
  }
  useEffect(() => {
    if (tenantId) load().catch(() => {});
  }, [tenantId]);

  if (!tenantId) return <div className="alert err">Selecione um negócio no menu lateral.</div>;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api("/knowledge", { method: "POST", body: form });
      setForm({ title: "", content: "" });
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  async function remove(chunk: ChunkDto) {
    if (!confirm(`Excluir "${chunk.title}" da base de conhecimento?`)) return;
    await api(`/knowledge/${chunk.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <h1 className="page-title">Base de conhecimento</h1>
      <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 16 }}>
        Cadastre aqui FAQ, políticas, procedimentos e detalhes que não cabem no catálogo. A IA busca
        nestes textos (ferramenta “consultar_base_conhecimento” — habilite na Persona IA).
      </p>
      {msg && <div className="alert err">{msg}</div>}

      <form className="card" onSubmit={add}>
        <h3>Novo conteúdo</h3>
        <div className="field">
          <label>Título</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Ex.: Política de trocas / Como funciona a entrega"
            required
          />
        </div>
        <div className="field">
          <label>Conteúdo (até 8.000 caracteres)</label>
          <textarea
            style={{ minHeight: 140 }}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            required
          />
        </div>
        <button className="btn">Adicionar</button>
      </form>

      {chunks.map((c) => (
        <div className="card" key={c.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ marginBottom: 6 }}>{c.title}</h3>
            <button className="btn sm danger" onClick={() => remove(c)}>
              Excluir
            </button>
          </div>
          <p style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "var(--text-dim)" }}>
            {c.content.length > 400 ? `${c.content.slice(0, 400)}…` : c.content}
          </p>
        </div>
      ))}
    </div>
  );
}
