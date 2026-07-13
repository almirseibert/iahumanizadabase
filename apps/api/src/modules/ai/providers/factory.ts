import type { AiConfig } from "@prisma/client";
import { env } from "../../../config/env.js";
import { decrypt } from "../../../lib/crypto.js";
import { AnthropicProvider } from "./anthropic.provider.js";
import { GeminiProvider } from "./gemini.provider.js";
import { OpenAiProvider } from "./openai.provider.js";
import type { AiProvider } from "./types.js";

/** Resolve o provider do tenant: chave própria (criptografada) ou global do .env */
export function buildProvider(config: AiConfig): AiProvider {
  const ownKey = config.apiKeyEnc ? decrypt(config.apiKeyEnc) : null;

  switch (config.provider) {
    case "ANTHROPIC": {
      const key = ownKey ?? env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("Nenhuma chave Anthropic configurada (tenant ou global)");
      return new AnthropicProvider(key);
    }
    case "OPENAI": {
      const key = ownKey ?? env.OPENAI_API_KEY;
      if (!key) throw new Error("Nenhuma chave OpenAI configurada (tenant ou global)");
      return new OpenAiProvider(key);
    }
    case "GEMINI": {
      const key = ownKey ?? env.GEMINI_API_KEY;
      if (!key) throw new Error("Nenhuma chave Gemini configurada (tenant ou global)");
      return new GeminiProvider(key);
    }
  }
}
