import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  AiChatRequest,
  AiChatResponse,
  AiProvider,
  ContentBlock,
} from "./types.js";

export class AnthropicProvider implements AiProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(req: AiChatRequest): Promise<AiChatResponse> {
    const response = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      system: req.system,
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: zodToJsonSchema(t.schema, {
          target: "jsonSchema7",
          $refStrategy: "none",
        }) as Anthropic.Tool.InputSchema,
      })),
      messages: req.messages.map((m) => ({
        role: m.role,
        content: m.content.map((block): Anthropic.ContentBlockParam => {
          switch (block.type) {
            case "text":
              return { type: "text", text: block.text };
            case "image":
              return {
                type: "image",
                source: {
                  type: "base64",
                  media_type: block.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: block.dataBase64,
                },
              };
            case "tool_use":
              return {
                type: "tool_use",
                id: block.id,
                name: block.name,
                input: block.input ?? {},
              };
            case "tool_result":
              return {
                type: "tool_result",
                tool_use_id: block.toolUseId,
                content: block.content,
                is_error: block.isError,
              };
          }
        }),
      })),
    });

    const content: ContentBlock[] = response.content.flatMap((block): ContentBlock[] => {
      if (block.type === "text") return [{ type: "text", text: block.text }];
      if (block.type === "tool_use") {
        return [{ type: "tool_use", id: block.id, name: block.name, input: block.input }];
      }
      return [];
    });

    return {
      content,
      stopReason:
        response.stop_reason === "tool_use"
          ? "tool_use"
          : response.stop_reason === "max_tokens"
            ? "max_tokens"
            : "end_turn",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
