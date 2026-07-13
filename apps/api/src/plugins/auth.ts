import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

export interface JwtUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string | null;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      ...roles: UserRole[]
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    /**
     * Resolve o tenant efetivo da requisição.
     * SUPERADMIN pode atuar em qualquer tenant via header x-tenant-id;
     * demais usuários ficam presos ao próprio tenantId do JWT (nunca do body!).
     */
    resolveTenantId: () => string;
  }
}

export default fp(async (app) => {
  await app.register(jwt, { secret: env.JWT_SECRET });

  app.decorate("authenticate", async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new UnauthorizedError("Token inválido ou ausente");
    }
  });

  app.decorate("requireRole", (...roles: UserRole[]) => {
    return async (req: FastifyRequest) => {
      try {
        await req.jwtVerify();
      } catch {
        throw new UnauthorizedError("Token inválido ou ausente");
      }
      if (!roles.includes(req.user.role)) {
        throw new ForbiddenError();
      }
    };
  });

  app.decorateRequest("resolveTenantId", function (this: FastifyRequest) {
    const user = this.user;
    if (user.role === "SUPERADMIN") {
      const header = this.headers["x-tenant-id"];
      const tenantId = Array.isArray(header) ? header[0] : header;
      if (!tenantId) {
        throw new ForbiddenError("SUPERADMIN deve informar o header x-tenant-id");
      }
      return tenantId;
    }
    if (!user.tenantId) {
      throw new ForbiddenError("Usuário sem tenant associado");
    }
    return user.tenantId;
  });
});
