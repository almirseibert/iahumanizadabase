import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  AiChatRequest,
  AiChatResponse,
  AiProvider,
  ContentBlock,
} from "./types.js";

// Gemini não usa ids em function calls; codificamos o nome no id interno.
const GEMINI_ID_PREFIX = "gemini:";
const toolNameFromId = (id: string) => id.replace(GEMINI_ID_PREFIX, "");

/** Remove keywords de JSON Schema que o Gemini rejeita */
function sanitizeSchema(schema: unknown): Record<string, unknown> {
  if (typeof schema !== "object" || schema === null) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (["$schema", "additionalProperties", "$ref", "definitions"].includes(key)) continue;
    if (key === "properties" && typeof value === "object" && value !== null) {
      const props: Record<string, unknown> = {};
      for (const [prop, propSchema] of Object.entries(value as Record<string, unknown>)) {
        props[prop] = sanitizeSchema(propSchema);
      }
      clean[key] = props;
    } else if (key === "items") {
      clean[key] = sanitizeSchema(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export class GeminiProvider implements AiProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async chat(req: AiChatRequest): Promise<AiChatResponse> {
    const contents: Content[] = req.messages.map((msg) => {
      const parts: Part[] = msg.content.map((block): Part => {
        switch (block.type) {
          case "text":
            return { text: block.text };
          case "image":
            return { inlineData: { mimeType: block.mimeType, data: block.dataBase64 } };
          case "tool_use":
            return {
              functionCall: {
                name: block.name,
                args: (block.input ?? {}) as Record<string, unknown>,
              },
            };
          case "tool_result":
            return {
              functionResponse: {
                name: toolNameFromId(block.toolUseId),
                response: { result: block.content },
              },
            };
        }
      });
      return { role: msg.role === "assistant" ? "model" : "user", parts };
    });

    const response = await this.client.models.generateContent({
      model: req.model,
      contents,
      config: {
        systemInstruction: req.system,
        temperature: req.temperature,
        maxOutputTokens: req.maxTokens,
        tools: req.tools.length
          ? [
              {
                functionDeclarations: req.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parametersJsonSchema: sanitizeSchema(
                    zodToJsonSchema(t.schema, { target: "jsonSchema7", $refStrategy: "none" }),
                  ),
                })),
              },
            ]
          : undefined,
      },
    });

    const content: ContentBlock[] = [];
    const candidate = response.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      if (part.text) {
        content.push({ type: "text", text: part.text });
      } else if (part.functionCall?.name) {
        content.push({
          type: "tool_use",
          id: `${GEMINI_ID_PREFIX}${part.functionCall.name}`,
          name: part.functionCall.name,
          input: part.functionCall.args ?? {},
        });
      }
    }

    const hasToolUse = content.some((b) => b.type === "tool_use");
    return {
      content,
      stopReason: hasToolUse
        ? "tool_use"
        : candidate?.finishReason === "MAX_TOKENS"
          ? "max_tokens"
          : "end_turn",
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}
