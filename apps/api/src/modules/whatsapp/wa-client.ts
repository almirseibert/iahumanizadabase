import { request } from "undici";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import type { WaSendResult } from "./wa-types.js";

// Cliente da Graph API da Meta — sem SDK oficial, chamadas diretas.
// Credenciais são por tenant (phoneNumberId + accessToken descriptografado).

const GRAPH_BASE = "https://graph.facebook.com";

export interface WaCredentials {
  phoneNumberId: string;
  accessToken: string;
}

interface GraphSendResponse {
  messages?: Array<{ id: string }>;
  error?: { message: string; code: number; error_subcode?: number };
}

async function post(creds: WaCredentials, body: Record<string, unknown>): Promise<WaSendResult> {
  const url = `${GRAPH_BASE}/${env.META_GRAPH_VERSION}/${creds.phoneNumberId}/messages`;
  const res = await request(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${creds.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.body.json()) as GraphSendResponse;
  if (res.statusCode >= 400 || data.error) {
    const err = data.error;
    logger.error({ statusCode: res.statusCode, err }, "erro ao enviar mensagem WhatsApp");
    throw new Error(
      `Graph API ${res.statusCode}: ${err?.message ?? "erro desconhecido"} (code ${err?.code})`,
    );
  }
  const waMessageId = data.messages?.[0]?.id;
  if (!waMessageId) throw new Error("Graph API não retornou id da mensagem");
  return { waMessageId };
}

export async function sendText(
  creds: WaCredentials,
  to: string,
  text: string,
): Promise<WaSendResult> {
  return post(creds, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text, preview_url: false },
  });
}

/** Botões de resposta rápida (máx. 3) */
export async function sendButtons(
  creds: WaCredentials,
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
): Promise<WaSendResult> {
  return post(creds, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

/** Lista de opções (máx. 10 itens) */
export async function sendList(
  creds: WaCredentials,
  to: string,
  bodyText: string,
  buttonLabel: string,
  rows: Array<{ id: string; title: string; description?: string }>,
): Promise<WaSendResult> {
  return post(creds, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [
          {
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              description: r.description?.slice(0, 72),
            })),
          },
        ],
      },
    },
  });
}

/** Imagem por URL pública (ex.: QR code Pix) */
export async function sendImage(
  creds: WaCredentials,
  to: string,
  imageUrl: string,
  caption?: string,
): Promise<WaSendResult> {
  return post(creds, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image: { link: imageUrl, caption },
  });
}

/**
 * Template aprovado — único formato permitido fora da janela de 24h.
 * bodyParams preenchem as variáveis {{1}}, {{2}}... do corpo.
 */
export async function sendTemplate(
  creds: WaCredentials,
  to: string,
  templateName: string,
  languageCode = "pt_BR",
  bodyParams: string[] = [],
): Promise<WaSendResult> {
  return post(creds, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: bodyParams.length
        ? [
            {
              type: "body",
              parameters: bodyParams.map((text) => ({ type: "text", text })),
            },
          ]
        : undefined,
    },
  });
}

/** Marca mensagem recebida como lida (mostra os dois tiques azuis) */
export async function markAsRead(creds: WaCredentials, waMessageId: string): Promise<void> {
  const url = `${GRAPH_BASE}/${env.META_GRAPH_VERSION}/${creds.phoneNumberId}/messages`;
  await request(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${creds.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: waMessageId,
    }),
  });
}
