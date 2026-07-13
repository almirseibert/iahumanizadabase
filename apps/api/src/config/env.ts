import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET deve ter pelo menos 16 caracteres"),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY deve ser 32 bytes em hex (64 chars). Gere com: openssl rand -hex 32"),
  META_APP_SECRET: z.string().default(""),
  META_VERIFY_TOKEN: z.string().default("iah-verify-token"),
  META_GRAPH_VERSION: z.string().default("v21.0"),
  ANTHROPIC_API_KEY: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default(""),
  MP_WEBHOOK_SECRET: z.string().default(""),
  /** Senha do Bull Board (/admin/queues). Vazio = painel desabilitado. */
  BULL_BOARD_PASSWORD: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  PUBLIC_API_URL: z.string().default("http://localhost:3001"),
  PUBLIC_WEB_URL: z.string().default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:");
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
