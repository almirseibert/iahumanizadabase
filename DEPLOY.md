# Deploy no EasyPanel (VPS Hostinger)

## Serviços a criar (um projeto no EasyPanel)

| Serviço | Tipo | Configuração |
|---|---|---|
| `postgres` | Serviço Postgres do EasyPanel | versão 16, volume persistente |
| `redis` | Serviço Redis do EasyPanel | versão 7. **Importante**: em "Command", use `redis-server --maxmemory-policy noeviction` (requisito do BullMQ) |
| `api` | App (Git) | Build: Dockerfile `apps/api/Dockerfile`, contexto = raiz do repo. Porta 3001. Domínio: `api.seudominio.com.br` |
| `web` | App (Git) | Build: Dockerfile `apps/web/Dockerfile`, contexto = raiz. Porta 3000. Domínio: `app.seudominio.com.br`. Build arg: `NEXT_PUBLIC_API_URL=https://api.seudominio.com.br` |

O EasyPanel emite HTTPS (Let's Encrypt) automaticamente ao apontar o domínio — **HTTPS é obrigatório** para o webhook da Meta.

## Variáveis de ambiente do serviço `api`

```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://USUARIO:SENHA@postgres:5432/iahumanizada
REDIS_URL=redis://redis:6379
JWT_SECRET=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 32>   # NUNCA perca/troque: descriptografa as credenciais dos tenants
META_APP_SECRET=<app secret do App Meta>
META_VERIFY_TOKEN=<token que você escolher>
ANTHROPIC_API_KEY=<chave global (fallback)>
OPENAI_API_KEY=<opcional: habilita transcrição de áudio (Whisper) e provider OpenAI>
BULL_BOARD_PASSWORD=<opcional: liga o painel de filas em /admin/queues (user: admin)>
MP_WEBHOOK_SECRET=<secret do webhook Mercado Pago>
GOOGLE_CLIENT_ID=<OAuth do Google Cloud>
GOOGLE_CLIENT_SECRET=<OAuth do Google Cloud>
PUBLIC_API_URL=https://api.seudominio.com.br
PUBLIC_WEB_URL=https://app.seudominio.com.br
SEED_ADMIN_EMAIL=<seu e-mail>
SEED_ADMIN_PASSWORD=<senha forte>
```

(Os hosts `postgres` e `redis` são os nomes dos serviços na rede interna do projeto EasyPanel.)

## Primeira subida

1. Suba `postgres` e `redis`
2. Suba `api` — o entrypoint roda `prisma migrate deploy` automaticamente
3. Rode o seed uma única vez (console do serviço `api` no EasyPanel):
   `npx tsx prisma/seed.ts` — ou crie o usuário via SQL
4. Suba `web`
5. Acesse `https://app.seudominio.com.br` e faça login

## Configuração externa

### Meta (WhatsApp Cloud API)
- Um único App Meta da sua agência atende todos os tenants
- Webhook: `https://api.seudominio.com.br/webhooks/whatsapp` + `META_VERIFY_TOKEN` + campo `messages`
- Cada cliente = um número/WABA inscrito no app; o sistema roteia pelo `phone_number_id`

### Mercado Pago (por tenant)
- Cada cliente cria seu access token no painel do MP
- Webhook do MP (por cliente): `https://api.seudominio.com.br/webhooks/mercadopago/{tenantId}` (evento "Pagamentos")

### Google Calendar
- Crie um projeto no Google Cloud → OAuth consent screen → credencial "Web application"
- Redirect URI: `https://api.seudominio.com.br/calendar/oauth/callback`
- O dono do negócio conecta a agenda pelo dashboard (Configurações → Conectar Google Calendar)

## Escalando depois

- Workers em processo separado: duplique o serviço `api` com o comando `node dist/worker.js` e defina `RUN_WORKERS=false` no serviço principal. (Nesse cenário, adicione o adapter Redis do Socket.io — fase 3 do roadmap.)
- Backups: habilite o backup automático do serviço Postgres no EasyPanel.
