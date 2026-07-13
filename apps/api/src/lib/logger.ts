import { pino } from "pino";
import { env, isProd } from "../config/env.js";

export const logger = pino({
  level: isProd ? "info" : "debug",
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
      }),
  // Nunca logar conteúdo de mensagem de cliente em nível info (LGPD)
  redact: ["req.headers.authorization", "*.accessToken", "*.apiKey"],
  base: { env: env.NODE_ENV },
});
