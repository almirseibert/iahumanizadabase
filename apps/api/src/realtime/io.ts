import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Emitter } from "@socket.io/redis-emitter";
import type { Server as HttpServer } from "node:http";
import jsonwebtoken from "jsonwebtoken";
import { Redis } from "ioredis";
import { tenantRoom, WS_EVENTS } from "@iah/shared";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import type { JwtUser } from "../plugins/auth.js";

let io: SocketIOServer | null = null;
let emitter: Emitter | null = null;

function createRedisClient(): Redis {
  const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  client.on("error", (err) => logger.error({ err: err.message }, "redis (socket.io) indisponível"));
  return client;
}

/** Inicializa o Socket.io sobre o servidor HTTP do Fastify (chamar no server.ts) */
export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: env.PUBLIC_WEB_URL, credentials: true },
  });

  // Adapter Redis: permite múltiplas instâncias da API e eventos vindos de workers
  const pubClient = createRedisClient();
  const subClient = pubClient.duplicate();
  subClient.on("error", (err) => logger.error({ err: err.message }, "redis (socket.io sub) indisponível"));
  io.adapter(createAdapter(pubClient, subClient));

  // Autenticação por JWT no handshake (auth.token)
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Token ausente"));
    try {
      const user = jsonwebtoken.verify(token, env.JWT_SECRET) as JwtUser;
      socket.data.user = user;
      next();
    } catch {
      next(new Error("Token inválido"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as JwtUser;
    // SUPERADMIN escolhe o tenant via evento; demais entram direto na sala do seu tenant
    if (user.tenantId) {
      void socket.join(tenantRoom(user.tenantId));
    }
    socket.on("tenant:join", (tenantId: string) => {
      if (user.role === "SUPERADMIN" || user.tenantId === tenantId) {
        void socket.join(tenantRoom(tenantId));
      }
    });
    logger.debug({ userId: user.id }, "socket conectado");
  });

  return io;
}

type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

/**
 * Emite um evento para os dashboards do tenant. No processo da API usa o io
 * local; em processos worker (sem io) publica via Redis emitter — o adapter
 * das instâncias da API entrega aos sockets.
 */
export function emitToTenant(tenantId: string, event: WsEvent, payload: unknown): void {
  if (io) {
    io.to(tenantRoom(tenantId)).emit(event, payload);
    return;
  }
  emitter ??= new Emitter(createRedisClient());
  emitter.to(tenantRoom(tenantId)).emit(event, payload);
}
