import { z } from "zod";
import { AI_PROVIDERS, AVAILABLE_TOOLS, SEGMENTS, TEMPLATE_PURPOSES } from "./enums.js";

// ---------- Auth ----------
export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------- Horário de funcionamento ----------
/** Ex.: { seg: [{inicio:"08:00",fim:"18:00"}], dom: [] } */
export const businessHoursSchema = z.record(
  z.enum(["seg", "ter", "qua", "qui", "sex", "sab", "dom"]),
  z.array(z.object({ inicio: z.string(), fim: z.string() })),
);
export type BusinessHours = z.infer<typeof businessHoursSchema>;

// ---------- Tenant ----------
export const createTenantSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífens"),
  segment: z.enum(SEGMENTS),
  timezone: z.string().default("America/Sao_Paulo"),
  description: z.string().optional(),
  address: z.string().optional(),
  phoneDisplay: z.string().optional(),
  businessHours: businessHoursSchema.optional(),
  waPhoneNumberId: z.string().optional(),
  waBusinessAccountId: z.string().optional(),
  /** Token de acesso da Cloud API — armazenado criptografado */
  waAccessToken: z.string().optional(),
  /** WhatsApp do dono (relatório semanal e alertas) */
  ownerWaId: z.string().optional(),
  /** Fidelidade: pontos por real pago (0 = desativado) */
  loyaltyPointsPerReal: z.number().min(0).optional(),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = createTenantSchema.partial();
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

// ---------- AiConfig ----------
export const updateAiConfigSchema = z.object({
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().optional(),
  /** Chave própria do tenant (opcional — senão usa a global) */
  apiKey: z.string().optional().nullable(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().min(256).max(8192).optional(),
  enabledTools: z.array(z.enum(AVAILABLE_TOOLS)).optional(),
  greetingMessage: z.string().optional().nullable(),
  escalationMessage: z.string().optional().nullable(),
  maxHistoryMessages: z.number().int().min(4).max(100).optional(),
  dailyTokenBudget: z.number().int().min(1000).optional().nullable(),
  npsEnabled: z.boolean().optional(),
});
export type UpdateAiConfigInput = z.infer<typeof updateAiConfigSchema>;

// ---------- Catálogo ----------
export const catalogItemSchema = z.object({
  category: z.string().min(1, "Categoria obrigatória"),
  name: z.string().min(1, "Nome obrigatório"),
  description: z.string().optional(),
  priceCents: z.number().int().min(0),
  durationMin: z.number().int().min(1).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  active: z.boolean().default(true),
  externalId: z.string().optional().nullable(),
});
export type CatalogItemInput = z.infer<typeof catalogItemSchema>;

// ---------- Conversas ----------
export const sendAgentMessageSchema = z.object({
  text: z.string().min(1, "Mensagem vazia"),
});
export type SendAgentMessageInput = z.infer<typeof sendAgentMessageSchema>;

export const setConversationModeSchema = z.object({
  mode: z.enum(["BOT", "HUMAN"]),
});
export type SetConversationModeInput = z.infer<typeof setConversationModeSchema>;

// ---------- Templates ----------
export const waTemplateSchema = z.object({
  name: z.string().min(1, "Nome do template obrigatório"),
  language: z.string().default("pt_BR"),
  body: z.string().default(""),
  paramCount: z.number().int().min(0).max(10).default(0),
  purpose: z.enum(TEMPLATE_PURPOSES).default("GENERIC"),
});
export type WaTemplateInput = z.infer<typeof waTemplateSchema>;

// ---------- Campanhas ----------
export const createCampaignSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  templateId: z.string().min(1, "Escolha um template"),
  bodyParams: z.array(z.string()).default([]),
  filterTags: z.array(z.string()).default([]),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

// ---------- Base de conhecimento ----------
export const knowledgeChunkSchema = z.object({
  title: z.string().min(1, "Título obrigatório"),
  content: z.string().min(1, "Conteúdo obrigatório").max(8000),
});
export type KnowledgeChunkInput = z.infer<typeof knowledgeChunkSchema>;

// ---------- Conector externo ----------
export const connectorEndpointSchema = z.object({
  method: z.literal("GET").default("GET"),
  path: z.string().min(1),
  description: z.string().min(1),
  params: z.record(z.string()).optional(),
});

export const externalConnectorSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  baseUrl: z.string().url("URL base inválida"),
  /** Headers de autenticação (armazenados criptografados) */
  headers: z.record(z.string()).optional(),
  endpoints: z.record(connectorEndpointSchema),
  active: z.boolean().default(true),
});
export type ExternalConnectorInput = z.infer<typeof externalConnectorSchema>;
