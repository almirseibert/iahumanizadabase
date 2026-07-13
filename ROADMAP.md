# Roadmap — melhorias e agregações

## ✅ Já implementado no sistema base

| # | Recurso | Como usar |
|---|---|---|
| 1 | **Transcrição de áudio (Whisper)** 🎤 | Automático com `OPENAI_API_KEY` no `.env` — áudios viram texto para a IA e aparecem transcritos no inbox |
| 2 | **Lembretes e follow-ups** ⏰ | Lembrete de agendamento 24h/2h antes (automático ao agendar), pedido abandonado (1h), reativação de inativos 30d (diária, requer template REACTIVATION) |
| 3 | **Campanhas de broadcast** 📣 | Dashboard → Campanhas: template + filtro por tags, fila com rate limit e progresso ao vivo |
| 4 | **Gestão de templates** | Dashboard → Configurações: sincroniza da Meta ou cadastro manual; templates com "propósito" são usados automaticamente fora da janela de 24h |
| 5 | **Base de conhecimento** 📚 | Dashboard → Conhecimento: FAQ/políticas/procedimentos com busca full-text em português; tool `consultar_base_conhecimento` |
| 6 | **Compreensão de imagens** 👁️ | Automático: fotos do cliente são enviadas ao modelo (Claude/GPT/Gemini com visão) |
| 7 | **NPS pós-atendimento** ⭐ | Configurações → Recursos: liga a pesquisa 0-10 ao resolver; score no painel Métricas |
| 8 | **Interface de conectores** 🔌 | Configurações → Conectores: cadastro de endpoints REST do ERP do cliente (headers criptografados, anti-SSRF) |
| 9 | **Relatório semanal por IA** 📈 | Toda segunda a IA escreve o resumo e envia ao WhatsApp do dono (Configurações → Recursos); também em Métricas → "Gerar agora" |
| 10 | **Fidelidade/cashback** | Configurações → Recursos: pontos por real pago (creditados no Pix aprovado); tool `consultar_pontos` |
| 11 | **Pedidos completos** 🛒 | Tool `criar_pedido` (itens do catálogo) + `criar_cobranca_pix` com vínculo ao pedido; follow-up de pedido abandonado |
| 12 | **Robustez** | Socket.io com adapter/emitter Redis (workers separados), Bull Board em `/admin/queues` (`BULL_BOARD_PASSWORD`), orçamento diário de tokens por tenant, sumarização automática de conversas longas |

O schema já está preparado para **multi-canal** (campo `channel` na Conversation — Instagram DM usa a mesma Graph API).

## 🔜 Próximas expansões

### 1. Instagram DM (multi-canal)
O campo `channel` já existe. Falta: segundo webhook (`instagram` field no App Meta), adapter de envio para a Messaging API do Instagram e seletor de canal no inbox.

### 2. RAG com embeddings (pgvector)
A base de conhecimento atual usa full-text search em português (funciona bem para FAQ). Para bases grandes/upload de PDF: extensão `pgvector`, embeddings por chunk e busca semântica na tool existente.

### 3. White-label
Logo/cores por agência no dashboard, subdomínio por cliente — para revender a plataforma a outras agências.

### 4. Resgate de pontos de fidelidade
Hoje os pontos acumulam e a IA consulta o saldo. Falta: regra de resgate (X pontos = R$ Y de desconto) e tool `resgatar_pontos`.

### 5. Testes automatizados
Fluxos críticos: webhook assinado → resposta da IA; pagamento aprovado → notificação + pontos; debounce e takeover. (Vitest + Testcontainers.)

### 6. Row-Level Security no Postgres
Defesa extra de multi-tenancy além do escopo por `tenantId` na aplicação.

### 7. Transferência de mídia rica no atendimento humano
Atendente enviar imagens/documentos pelo inbox (hoje só texto).

### 8. Painel do cliente final
Página pública simples por tenant (cardápio/agenda) linkável na conversa.
