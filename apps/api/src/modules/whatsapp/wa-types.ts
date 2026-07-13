// Tipos do payload de webhook da Meta Cloud API (subconjunto usado)

export interface WaWebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value: WaWebhookValue;
    }>;
  }>;
}

export interface WaWebhookValue {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{
    profile: { name: string };
    wa_id: string;
  }>;
  messages?: WaInboundMessage[];
  statuses?: WaStatusUpdate[];
}

export interface WaInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "sticker"
    | "location"
    | "interactive"
    | "button"
    | "unknown";
  text?: { body: string };
  image?: WaMedia;
  audio?: WaMedia;
  video?: WaMedia;
  document?: WaMedia & { filename?: string };
  sticker?: WaMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { text: string; payload: string };
}

export interface WaMedia {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
}

export interface WaStatusUpdate {
  id: string; // wamid da mensagem enviada
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
}

// ---------- Envio ----------

export interface WaSendTextRequest {
  to: string;
  text: string;
  previewUrl?: boolean;
}

export interface WaSendResult {
  waMessageId: string;
}
