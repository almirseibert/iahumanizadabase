import type { FastifyInstance } from "fastify";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import {
  aiProcessQueue,
  campaignQueue,
  followupQueue,
  waInboundQueue,
  waOutboundQueue,
} from "../queues/index.js";

// Painel de filas em /admin/queues, protegido por Basic Auth
// (usuário: admin, senha: BULL_BOARD_PASSWORD). Sem senha configurada, fica desligado.

function checkBasicAuth(header: string | undefined): boolean {
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const expected = `admin:${env.BULL_BOARD_PASSWORD}`;
  const a = Buffer.from(decoded);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function registerBullBoard(app: FastifyInstance<any, any, any, any>): Promise<void> {
  if (!env.BULL_BOARD_PASSWORD) return;

  const serverAdapter = new FastifyAdapter();
  createBullBoard({
    queues: [
      new BullMQAdapter(waInboundQueue),
      new BullMQAdapter(aiProcessQueue),
      new BullMQAdapter(waOutboundQueue),
      new BullMQAdapter(followupQueue),
      new BullMQAdapter(campaignQueue),
    ],
    serverAdapter,
  });
  serverAdapter.setBasePath("/admin/queues");

  await app.register(
    async (scope) => {
      scope.addHook("onRequest", async (req, reply) => {
        if (!checkBasicAuth(req.headers.authorization)) {
          reply
            .code(401)
            .header("www-authenticate", 'Basic realm="Bull Board"')
            .send("Autenticação necessária");
        }
      });
      await scope.register(serverAdapter.registerPlugin(), { prefix: "/" });
    },
    { prefix: "/admin/queues" },
  );
}
