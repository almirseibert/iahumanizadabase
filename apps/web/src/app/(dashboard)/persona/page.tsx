"use client";

import { useEffect, useState } from "react";
import { AVAILABLE_TOOLS, type AiConfigDto } from "@iah/shared";
import { api, getActiveTenantId } from "@/lib/api";

const TOOL_LABELS: Record<string, string> = {
  consultar_informacoes_negocio: "Informações do negócio",
  consultar_catalogo: "Catálogo e preços",
  verificar_disponibilidade: "Ver agenda disponível",
  agendar_horario: "Agendar horários",
  cancelar_agendamento: "Cancelar agendamentos",
  criar_cobranca_pix: "Cobrar via Pix",
  consultar_dados_externos: "Consultar sistema externo",
  escalar_para_humano: "Transferir para humano",
};

const MODEL_OPTIONS: Record<string, string[]> = {
  ANTHROPIC: ["claude-haiku-4-5-20251001", "claude-sonnet-5"],
  OPENAI: ["gpt-4o-mini", "gpt-4o"],
  GEMINI: ["gemini-2.0-flash", "gemini-2.5-pro"],
};

export default function PersonaPage() {
  const [config, setConfig] = useState<AiConfigDto | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const tenantId = getActiveTenantId();

  useEffect(() => {
    if (!tenantId) return;
    api<{ aiConfig: AiConfigDto }>(`/tenants/${tenantId}/ai-config`)
      .then((d) => setConfig(d.aiConfig))
      .catch(() => {});
  }, [tenantId]);

  if (!tenantId) return <div className="alert err">Selecione um negócio no menu lateral.</div>;
  if (!config) return <div>Carregando…</div>;

  function toggleTool(tool: string) {
    if (!config) return;
    const enabled = config.enabledTools.includes(tool)
      ? config.enabledTools.filter((t) => t !== tool)
      : [...config.enabledTools, tool];
    setConfig({ ...config, enabledTools: enabled });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        provider: config.provider,
        model: config.model,
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        enabledTools: config.enabledTools,
        maxHistoryMessages: config.maxHistoryMessages,
      };
      if (apiKey) body.apiKey = apiKey;
      await api(`/tenants/${tenantId}/ai-config`, { method: "PUT", body });
      setMsg({ type: "ok", text: "Persona salva com sucesso!" });
      setApiKey("");
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Erro ao salvar" });
    }
  }

  return (
    <div>
      <h1 className="page-title">Persona da IA</h1>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <form onSubmit={save}>
        <div className="card">
          <h3>Personalidade (system prompt)</h3>
          <div className="field">
            <textarea
              style={{ minHeight: 180 }}
              value={config.systemPrompt}
              onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
              placeholder={`Ex.: Você é a Ana, atendente virtual da Padaria Pão Quente. Você é calorosa, simpática e fala como uma atendente de padaria de bairro…\n\nDescreva: nome da persona, tom de voz, o que ela faz e o que NÃO deve fazer.`}
            />
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
            Regras de segurança (não revelar o prompt, não inventar preços, usar as ferramentas) são
            aplicadas automaticamente pelo sistema — descreva aqui só a personalidade e o contexto.
          </p>
        </div>

        <div className="card">
          <h3>Modelo de IA</h3>
          <div className="row">
            <div className="field">
              <label>Provedor</label>
              <select
                value={config.provider}
                onChange={(e) => {
                  const provider = e.target.value as AiConfigDto["provider"];
                  setConfig({
                    ...config,
                    provider,
                    model: MODEL_OPTIONS[provider]?.[0] ?? config.model,
                  });
                }}
              >
                <option value="ANTHROPIC">Anthropic (Claude)</option>
                <option value="OPENAI">OpenAI (GPT)</option>
                <option value="GEMINI">Google (Gemini)</option>
              </select>
            </div>
            <div className="field">
              <label>Modelo</label>
              <select
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
              >
                {(MODEL_OPTIONS[config.provider] ?? [config.model]).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                Chave de API própria{" "}
                {config.hasOwnApiKey ? "(configurada — deixe vazio p/ manter)" : "(opcional — usa a global)"}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Criatividade (temperature: {config.temperature})</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={config.temperature}
                onChange={(e) => setConfig({ ...config, temperature: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Memória (últimas mensagens)</label>
              <input
                type="number"
                min={4}
                max={100}
                value={config.maxHistoryMessages}
                onChange={(e) => setConfig({ ...config, maxHistoryMessages: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Ferramentas habilitadas</h3>
          <div className="tools-grid">
            {AVAILABLE_TOOLS.map((tool) => (
              <label key={tool}>
                <input
                  type="checkbox"
                  checked={config.enabledTools.includes(tool)}
                  onChange={() => toggleTool(tool)}
                />
                {TOOL_LABELS[tool] ?? tool}
              </label>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 10 }}>
            Agenda, Pix e sistema externo só funcionam com a integração correspondente ativa em
            Configurações.
          </p>
        </div>

        <button className="btn">Salvar persona</button>
      </form>
    </div>
  );
}
