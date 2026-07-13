# Graph Report - .  (2026-07-13)

## Corpus Check
- Corpus is ~30,751 words - fits in a single context window. You may not need a graph.

## Summary
- 598 nodes · 1169 edges · 36 communities (27 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.82)
- Token cost: 3,500 input · 4,200 output

## Community Hubs (Navigation)
- AI Conversation Pipeline
- Config, Crypto & Errors
- Redis Queues & Workers
- Dashboard Pages (Next.js)
- AI Tools & Registry
- Deployment & Infrastructure
- Root Monorepo Config
- Zod Validation Schemas
- API Dependencies
- AI Provider Adapters
- Web App Dependencies
- Shared Enums
- Shared Package Config
- Shared Types & DTOs
- TSConfig Base
- TSConfig Next.js
- API NPM Scripts
- Webhook Simulator
- API Dev Dependencies
- TSConfig (shared)
- Prisma Package Config
- TSConfig (api)
- TSConfig Paths (web)
- TSConfig Node
- Package Metadata
- WebSocket Events
- External Integrations
- Database Seed
- Web Root Layout
- Live Inbox Features
- Next.js Build Config
- Next Env Types
- Follow-ups Feature
- Broadcast Campaigns Feature
- Smart Debounce Feature
- Weekly AI Report Feature

## God Nodes (most connected - your core abstractions)
1. `prisma` - 31 edges
2. `logger` - 20 edges
3. `getActiveTenantId()` - 19 edges
4. `api()` - 19 edges
5. `decrypt()` - 18 edges
6. `emitToTenant()` - 16 edges
7. `main()` - 16 edges
8. `runAiPipeline()` - 14 edges
9. `FastifyInstance` - 13 edges
10. `startWorkers()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `apps/api (Fastify API)` --shares_data_with--> `postgres service`  [INFERRED]
  README.md → docker-compose.yml
- `Multi-channel (channel field)` --conceptually_related_to--> `WhatsApp Cloud API (Meta)`  [INFERRED]
  ROADMAP.md → README.md
- `Separate Workers Scaling` --conceptually_related_to--> `Live Inbox (Socket.io)`  [INFERRED]
  DEPLOY.md → README.md
- `ENCRYPTION_KEY` --conceptually_related_to--> `Encrypted Credentials (AES-256-GCM)`  [INFERRED]
  DEPLOY.md → README.md
- `Bull Board (queue admin)` --conceptually_related_to--> `redis service`  [INFERRED]
  README.md → docker-compose.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Monorepo Workspace Packages** — pnpm_workspace_monorepo, readme_apps_api, readme_apps_web, readme_packages_shared [EXTRACTED 1.00]
- **Pluggable AI Provider Set** — readme_pluggable_ai_providers, readme_anthropic_claude, readme_openai_gpt, readme_google_gemini [EXTRACTED 1.00]
- **EasyPanel Runtime Services** — deploy_api_service, deploy_web_service, docker_compose_postgres_service, docker_compose_redis_service [INFERRED 0.85]

## Communities (36 total, 9 thin omitted)

### Community 0 - "AI Conversation Pipeline"
Cohesion: 0.09
Nodes (44): decrypt(), maskSecret(), logger, checkTokenBudget(), ConversationContext, describeInbound(), loadConversationContext(), buildSystemPrompt() (+36 more)

### Community 1 - "Config, Crypto & Errors"
Cohesion: 0.10
Nodes (38): envSchema, parsed, encrypt(), KEY, AppError, ForbiddenError, NotFoundError, UnauthorizedError (+30 more)

### Community 2 - "Redis Queues & Workers"
Cohesion: 0.08
Nodes (43): createBullConnection(), redis, cancelPendingAi(), debounceKey(), isLatestDebounced(), scheduleAiDebounced(), bumpAndMaybeFinish(), processCampaignSend() (+35 more)

### Community 3 - "Dashboard Pages (Next.js)"
Cohesion: 0.08
Nodes (36): CampaignDto, CampanhasPage(), STATUS_LABEL, TemplateDto, CatalogoPage(), EMPTY, ConfiguracoesPage(), ConnectorDto (+28 more)

### Community 4 - "AI Tools & Registry"
Cohesion: 0.11
Nodes (25): formatTimeInZone(), weekdayInZone(), zonedTimeToUtc(), AiToolDef, AiTool, registerTool(), registry, ToolContext (+17 more)

### Community 5 - "Deployment & Infrastructure"
Cohesion: 0.07
Nodes (34): api Service (EasyPanel App), EasyPanel Deployment, ENCRYPTION_KEY, Single Meta App (agency-wide), prisma migrate deploy (entrypoint), web Service (EasyPanel App), BullMQ noeviction requirement, postgres service (+26 more)

### Community 6 - "Root Monorepo Config"
Cohesion: 0.06
Nodes (30): devDependencies, turbo, engines, node, name, ioredis, packageManager, pnpm (+22 more)

### Community 7 - "Zod Validation Schemas"
Cohesion: 0.07
Nodes (26): AVAILABLE_TOOLS, BusinessHours, businessHoursSchema, CatalogItemInput, catalogItemSchema, connectorEndpointSchema, CreateCampaignInput, createCampaignSchema (+18 more)

### Community 8 - "API Dependencies"
Cohesion: 0.08
Nodes (26): dependencies, @anthropic-ai/sdk, argon2, @bull-board/api, @bull-board/fastify, bullmq, fastify, @fastify/cors (+18 more)

### Community 9 - "AI Provider Adapters"
Cohesion: 0.24
Nodes (9): AnthropicProvider, GeminiProvider, sanitizeSchema(), toolNameFromId(), OpenAiProvider, AiChatRequest, AiChatResponse, AiProvider (+1 more)

### Community 10 - "Web App Dependencies"
Cohesion: 0.10
Nodes (20): dependencies, @iah/shared, next, react, react-dom, socket.io-client, devDependencies, @iah/tsconfig (+12 more)

### Community 11 - "Shared Enums"
Cohesion: 0.10
Nodes (20): AI_PROVIDERS, APPOINTMENT_STATUSES, AppointmentStatus, AUTHOR_TYPES, CAMPAIGN_STATUSES, CampaignStatus, CONVERSATION_MODES, CONVERSATION_STATUSES (+12 more)

### Community 12 - "Shared Package Config"
Cohesion: 0.12
Nodes (17): default, dependencies, zod, devDependencies, @iah/tsconfig, typescript, exports, main (+9 more)

### Community 13 - "Shared Types & DTOs"
Cohesion: 0.17
Nodes (17): AiProviderName, AuthorType, ConversationMode, ConversationStatus, MessageDirection, MessageStatus, MessageType, Segment (+9 more)

### Community 14 - "TSConfig Base"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution, noUncheckedIndexedAccess (+5 more)

### Community 15 - "TSConfig Next.js"
Cohesion: 0.15
Nodes (12): compilerOptions, allowJs, incremental, jsx, lib, module, moduleResolution, noEmit (+4 more)

### Community 16 - "API NPM Scripts"
Cohesion: 0.18
Nodes (11): scripts, build, db:deploy, db:generate, db:migrate, db:seed, db:studio, dev (+3 more)

### Community 17 - "Webhook Simulator"
Cohesion: 0.20
Nodes (8): apiUrl, args, body, from, headers, payload, phoneNumberId, text

### Community 18 - "API Dev Dependencies"
Cohesion: 0.25
Nodes (8): devDependencies, @iah/tsconfig, pino-pretty, prisma, tsx, @types/jsonwebtoken, @types/node, typescript

### Community 19 - "TSConfig (shared)"
Cohesion: 0.25
Nodes (7): compilerOptions, declaration, outDir, rootDir, sourceMap, extends, include

### Community 20 - "Prisma Package Config"
Cohesion: 0.29
Nodes (6): name, prisma, seed, private, type, version

### Community 21 - "TSConfig (api)"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, exclude, extends, include

### Community 22 - "TSConfig Paths (web)"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, exclude, extends, include, @/*

### Community 23 - "TSConfig Node"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, sourceMap, extends, $schema

### Community 24 - "Package Metadata"
Cohesion: 0.40
Nodes (4): files, name, private, version

### Community 26 - "External Integrations"
Cohesion: 0.50
Nodes (4): AI Tools (11 ferramentas), Google Calendar Integration, Mercado Pago Pix, NPS and Loyalty Points

### Community 29 - "Live Inbox Features"
Cohesion: 0.67
Nodes (3): Separate Workers Scaling, Human Takeover, Live Inbox (Socket.io)

## Knowledge Gaps
- **257 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+252 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `API Dev Dependencies` to `Prisma Package Config`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `prisma` connect `API Dev Dependencies` to `Config, Crypto & Errors`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `dependencies` connect `API Dependencies` to `Prisma Package Config`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _263 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI Conversation Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.08757062146892655 - nodes in this community are weakly interconnected._
- **Should `Config, Crypto & Errors` be split into smaller, more focused modules?**
  _Cohesion score 0.09701928696668614 - nodes in this community are weakly interconnected._
- **Should `Redis Queues & Workers` be split into smaller, more focused modules?**
  _Cohesion score 0.08350168350168351 - nodes in this community are weakly interconnected._