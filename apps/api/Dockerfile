# API — build multi-stage a partir da raiz do monorepo
# EasyPanel: Build context = raiz do repo, Dockerfile path = apps/api/Dockerfile

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# --- Dependências ---
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/
RUN pnpm install --frozen-lockfile || pnpm install

# --- Build ---
FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
# Compila primeiro o pacote compartilhado (@iah/shared) para gerar dist + tipos
RUN pnpm --filter @iah/shared build
RUN cd apps/api && pnpm db:generate && pnpm build

# --- Runtime ---
FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
ENV NODE_ENV=production

# node_modules vem do estagio build para incluir o Prisma Client ja gerado
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/package.json ./apps/api/
COPY package.json pnpm-workspace.yaml ./

WORKDIR /app/apps/api
EXPOSE 3001
# Aplica migrations e sobe a API (workers no mesmo processo por padrão)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
