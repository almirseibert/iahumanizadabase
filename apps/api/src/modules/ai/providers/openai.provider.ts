import OpenAI from "openai";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  AiChatRequest,
  AiChatResponse,
  AiProvider,
  ContentBlock,
} from "./types.js";

// Converte o formato interno (blocos tool_use/tool_result) para o formato
// de chat da OpenAI (tool_calls no assistant + mensagens role:"tool").

export class OpenAiProvider implements AiProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(req: AiChatRequest): Promise<AiChatResponse> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: req.system },
    ];

    for (const msg of req.messages) {
      if (msg.role === "user") {
        const toolResults = msg.content.filter((b) => b.type === "tool_result");
        const texts = msg.content.filter((b) => b.type === "text");
        const images = msg.content.filter((b) => b.type === "image");
        for (const tr of toolResults) {
          messages.push({ role: "tool", tool_call_id: tr.toolUseId, content: tr.content });
        }
        if (texts.length > 0 || images.length > 0) {
          messages.push({
            role: "user",
            content: images.length
              ? [
                  ...texts.map((t) => ({ type: "text" as const, text: t.text })),
                  ...images.map((img) => ({
                    type: "image_url" as const,
                    image_url: { url: `data:${img.mimeType};base64,${img.dataBase64}` },
                  })),
                ]
              : texts.map((t) => t.text).join("\n"),
          });
        }
      } else {
        const toolUses = msg.content.filter((b) => b.type === "tool_use");
        const texts = msg.content.filter((b) => b.type === "text");
        messages.push({
          role: "assistant",
          content: texts.length ? texts.map((t) => t.text).join("\n") : null,
          tool_calls: toolUses.length
            ? toolUses.map((tu) => ({
                id: tu.id,
                type: "function" as const,
                function: { name: tu.name, arguments: JSON.stringify(tu.input ?? {}) },
              }))
            : undefined,
        });
      }
    }

    const response = await this.client.chat.completions.create({
      model: req.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      messages,
      tools: req.tools.length
        ? req.tools.map((t) => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: zodToJsonSchema(t.schema, {
                target: "jsonSchema7",
                $refStrategy: "none",
              }) as Record<string, unknown>,
            },
          }))
        : undefined,
    });

    const choice = response.choices[0];
    if (!choice) throw new Error("OpenAI não retornou resposta");

    const content: ContentBlock[] = [];
    if (choice.message.content) {
      content.push({ type: "text", text: choice.message.content });
    }
    for (const call of choice.message.tool_calls ?? []) {
      if (call.type !== "function") continue;
      let input: unknown = {};
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {
        // argumentos malformados — o executor devolve erro de validação à IA
      }
      content.push({ type: "tool_use", id: call.id, name: call.function.name, input });
    }

    return {
      content,
      stopReason:
        choice.finish_reason === "tool_calls"
          ? "tool_use"
          : choice.finish_reason === "length"
            ? "max_tokens"
            : "end_turn",
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
