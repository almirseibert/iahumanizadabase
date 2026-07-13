import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { loginSchema } from "@iah/shared";
import { prisma } from "../../lib/prisma.js";
import { UnauthorizedError } from "../../lib/errors.js";
import type { JwtUser } from "../../plugins/auth.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const { email, password } = loginSchema.parse(req.body);

      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user || !user.active || !(await argon2.verify(user.passwordHash, password))) {
        throw new UnauthorizedError("E-mail ou senha incorretos");
      }

      const payload: JwtUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      };
      const token = app.jwt.sign(payload, { expiresIn: "7d" });
      return { token, user: payload };
    },
  );

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (req) => {
    return { user: req.user };
  });
}
