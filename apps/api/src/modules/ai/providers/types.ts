import type { z } from "zod";

// Formato interno neutro (próximo do formato Anthropic).
// Cada provider converte de/para o seu formato nativo.

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; dataBase64: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface AiMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

export interface AiToolDef {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
}

export interface AiChatRequest {
  system: string;
  messages: AiMessage[];
  tools: AiToolDef[];
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface AiChatResponse {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  usage: { inputTokens: number; outputTokens: number };
}

export interface AiProvider {
  chat(req: AiChatRequest): Promise<AiChatResponse>;
}
