import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/** Conexão para uso geral (debounce, cache) */
export const redis = new Redis(env.REDIS_URL, { lazyConnect: false });
redis.on("error", (err) => logger.error({ err: err.message }, "redis indisponível"));

/** Fábrica de conexões para BullMQ (exige maxRetriesPerRequest: null) */
export function createBullConnection(): Redis {
  const conn = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  conn.on("error", (err) => logger.error({ err: err.message }, "redis (bullmq) indisponível"));
  return conn;
}
