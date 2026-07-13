# IA Humanizada — Plataforma de atendimento WhatsApp com IA

Sistema **base multi-tenant** de atendimento automatizado via **API oficial do WhatsApp (Meta Cloud API)** com IA humanizada. Uma única instalação atende vários negócios — padarias, lavanderias, salões de beleza, clínicas, lava-rápidos etc. — cada um com seu número de WhatsApp, persona de IA, catálogo e integrações.

## Funcionalidades

- 🤖 **IA plugável**: Anthropic (Claude), OpenAI (GPT) ou Google (Gemini) por tenant, com persona 100% customizável
- 💬 **WhatsApp oficial** (Cloud API): recepção via webhook assinado, envio de texto/botões/listas/imagens/templates, janela de 24h respeitada
- 🧠 **11 ferramentas da IA**: informações do negócio, catálogo, base de conhecimento, agendar/cancelar (Google Calendar), criar pedidos, cobrar via Pix (Mercado Pago), pontos de fidelidade, sistemas externos (ERP), transferir para humano
- 🎤 **Áudio e imagem**: transcrição automática de áudios (Whisper) e compreensão de fotos (visão nos 3 provedores)
- 👤 **Takeover humano**: o atendente assume a conversa no dashboard a qualquer momento (a IA pausa); a IA também se auto-transfere quando não resolve
- 📥 **Inbox ao vivo**: conversas em tempo real via Socket.io (com adapter Redis), com resposta manual
- ⏱️ **Debounce inteligente**: agrupa as várias mensagens curtas do cliente antes de acionar a IA
- 📣 **Campanhas de broadcast**: templates aprovados, segmentação por tags, fila com rate limit
- ⏰ **Follow-ups automáticos**: lembrete de agendamento (24h/2h), pedido abandonado, reativação de clientes inativos
- ⭐ **NPS pós-atendimento** e **fidelidade** (pontos por real pago)
- 📈 **Relatório semanal escrito pela IA** e enviado ao WhatsApp do dono
- 🔐 **Multi-tenant seguro**: credenciais criptografadas (AES-256-GCM), isolamento por tenant, LGPD (opt-out), orçamento diário de tokens por tenant
- 📊 **Métricas** diárias por tenant + Bull Board para as filas (`/admin/queues`)

## Stack

Node.js 22 + TypeScript · Fastify 5 · Prisma 6 + PostgreSQL 16 · BullMQ + Redis 7 · Next.js 15 · Socket.io · pnpm + Turborepo

```
apps/api     → API Fastify (webhooks, REST, realtime, workers)
apps/web     → Dashboard Next.js (PT-BR)
packages/shared → tipos e schemas compartilhados
```

## Rodando em desenvolvimento

Pré-requisitos: Node 20+, pnpm 9, Docker (para Postgres/Redis).

```bash
# 1. Dependências
pnpm install

# 2. Banco e Redis locais
docker compose up -d

# 3. Variáveis de ambiente
cp .env.example .env
# preencha ao menos: JWT_SECRET, ENCRYPTION_KEY (openssl rand -hex 32), ANTHROPIC_API_KEY

# 4. Migrations + seed (cria superadmin e a padaria de demonstração)
cd apps/api
pnpm db:migrate
pnpm db:seed
cd ../..

# 5. Sobe API (3001) + dashboard (3000)
pnpm dev
```

Login: `admin@iahumanizada.com.br` / `admin123` (configurável via `SEED_ADMIN_*`).

### Testando sem WhatsApp real

```bash
# Simula um cliente mandando mensagem (assinatura HMAC incluída se META_APP_SECRET setado)
cd apps/api
pnpm simulate:webhook -- --phone-id <waPhoneNumberId-do-tenant> --text "quanto custa o bolo de cenoura?"
```

A mensagem aparece no inbox do dashboard e, com `ANTHROPIC_API_KEY` válida, a IA responde
(o envio real ao WhatsApp falha com `WA_NOT_CONFIGURED`, o que é esperado sem credenciais Meta).

### Conectando um número real (por tenant)

1. Crie um App na [Meta for Developers](https://developers.facebook.com) com o produto WhatsApp
2. No painel do app: configure o webhook → URL `https://SUA_API/webhooks/whatsapp`, verify token = `META_VERIFY_TOKEN`, assine o campo `messages`
3. Copie o **App Secret** para `META_APP_SECRET`
4. No dashboard → Negócios → edite o tenant: informe **Phone Number ID** e **Access Token** (token de sistema permanente)
5. Pronto — mensagens para aquele número caem no tenant certo (roteamento por `phone_number_id`)

## Moldando para um cliente real

Para cada novo cliente (padaria, clínica, lava-rápido…):

1. **Negócios → Novo negócio**: nome, segmento, descrição rica (a IA usa esse texto!), endereço, horários
2. **Persona IA**: escreva o prompt da persona (nome, tom de voz, o que faz/não faz), escolha provedor/modelo, habilite as ferramentas
3. **Catálogo**: produtos/serviços com preços (e duração, para serviços agendáveis)
4. **Configurações**: conecte Google Calendar (agendamentos) e Mercado Pago (Pix) se o cliente usar
5. Conecte o número WhatsApp do cliente (passo a passo acima)

## Deploy (EasyPanel / Hostinger)

Ver [DEPLOY.md](DEPLOY.md).

## Roadmap de melhorias

Ver [ROADMAP.md](ROADMAP.md) — transcrição de áudio, campanhas, RAG, follow-ups automáticos e mais.
