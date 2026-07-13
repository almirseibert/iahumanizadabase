"use client";

import { useEffect, useState } from "react";
import { api, getActiveTenantId } from "@/lib/api";

interface Summary {
  openConversations: number;
  waitingConversations: number;
  contacts: number;
  appointments: number;
}

interface DailyMetric {
  date: string;
  conversationsCount: number;
  messagesIn: number;
  messagesOut: number;
  aiCalls: number;
  tokensIn: number;
  tokensOut: number;
  handoffs: number;
  paymentsApprovedCents: number;
}

interface NpsSummary {
  total: number;
  average: number | null;
  nps: number | null;
}

interface WeeklyReport {
  id: string;
  weekStart: string;
  content: string;
  sentAt: string | null;
}

export default function MetricasPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DailyMetric[]>([]);
  const [nps, setNps] = useState<NpsSummary | null>(null);
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [generating, setGenerating] = useState(false);
  const tenantId = getActiveTenantId();

  useEffect(() => {
    if (!tenantId) return;
    api<{ summary: Summary }>("/metrics/summary").then((d) => setSummary(d.summary)).catch(() => {});
    api<{ metrics: DailyMetric[] }>("/metrics/daily?days=30")
      .then((d) => setDaily(d.metrics.slice().reverse()))
      .catch(() => {});
    api<{ nps: NpsSummary }>("/metrics/nps").then((d) => setNps(d.nps)).catch(() => {});
    api<{ reports: WeeklyReport[] }>("/reports/weekly").then((d) => setReports(d.reports)).catch(() => {});
  }, [tenantId]);

  async function generateReport() {
    setGenerating(true);
    try {
      await api("/reports/weekly/generate", { method: "POST" });
      const d = await api<{ reports: WeeklyReport[] }>("/reports/weekly");
      setReports(d.reports);
    } finally {
      setGenerating(false);
    }
  }

  if (!tenantId) return <div className="alert err">Selecione um negócio no menu lateral.</div>;

  const fmt = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div>
      <h1 className="page-title">Métricas</h1>

      <div className="grid cols-4">
        <div className="card stat">
          <div className="num">{summary?.openConversations ?? "—"}</div>
          <div className="lbl">Conversas abertas</div>
        </div>
        <div className="card stat">
          <div className="num">{summary?.waitingConversations ?? "—"}</div>
          <div className="lbl">Aguardando humano</div>
        </div>
        <div className="card stat">
          <div className="num">{summary?.contacts ?? "—"}</div>
          <div className="lbl">Contatos</div>
        </div>
        <div className="card stat">
          <div className="num">{summary?.appointments ?? "—"}</div>
          <div className="lbl">Agendamentos futuros</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>⭐ NPS (últimos 90 dias)</h3>
          {nps && nps.total > 0 ? (
            <div style={{ display: "flex", gap: 30, marginTop: 8 }}>
              <div className="stat" style={{ padding: 0 }}>
                <div className="num">{nps.nps}</div>
                <div className="lbl">Score NPS</div>
              </div>
              <div className="stat" style={{ padding: 0 }}>
                <div className="num">{nps.average}</div>
                <div className="lbl">Nota média</div>
              </div>
              <div className="stat" style={{ padding: 0 }}>
                <div className="num">{nps.total}</div>
                <div className="lbl">Respostas</div>
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
              Sem respostas ainda. Ative a pesquisa NPS em Configurações → Recursos.
            </p>
          )}
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>📈 Relatório semanal (IA)</h3>
            <button className="btn sm secondary" onClick={generateReport} disabled={generating}>
              {generating ? "Gerando…" : "Gerar agora"}
            </button>
          </div>
          {reports[0] ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6 }}>
                Semana de {new Date(reports[0].weekStart).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                {reports[0].sentAt && " · enviado ao dono via WhatsApp"}
              </div>
              <p style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{reports[0].content}</p>
            </div>
          ) : (
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
              Gerado automaticamente toda segunda-feira (ou clique em “Gerar agora”).
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Últimos 30 dias</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th>Data</th>
              <th>Msgs recebidas</th>
              <th>Msgs enviadas</th>
              <th>Chamadas IA</th>
              <th>Tokens (in/out)</th>
              <th>Transferências</th>
              <th>Pagamentos</th>
            </tr>
          </thead>
          <tbody>
            {daily.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: "var(--text-dim)" }}>
                  Sem dados ainda — as métricas aparecem conforme o uso.
                </td>
              </tr>
            )}
            {daily.map((m) => (
              <tr key={m.date}>
                <td>{new Date(m.date).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                <td>{m.messagesIn}</td>
                <td>{m.messagesOut}</td>
                <td>{m.aiCalls}</td>
                <td>
                  {m.tokensIn.toLocaleString("pt-BR")} / {m.tokensOut.toLocaleString("pt-BR")}
                </td>
                <td>{m.handoffs}</td>
                <td>{m.paymentsApprovedCents ? fmt(m.paymentsApprovedCents) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
