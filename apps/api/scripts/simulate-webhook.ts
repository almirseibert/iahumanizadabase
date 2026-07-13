// Simula um webhook da Meta em dev, com assinatura HMAC válida.
// Uso:
//   pnpm simulate:webhook -- --phone-id <waPhoneNumberId> --from 5511999998888 --text "oi, qual o preço do bolo?"
import { createHmac } from "node:crypto";

const args = process.argv.slice(2);
function getArg(name: string, fallback?: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1]!;
  if (fallback !== undefined) return fallback;
  console.error(`Argumento obrigatório: --${name}`);
  process.exit(1);
}

const apiUrl = getArg("api", process.env.PUBLIC_API_URL ?? "http://localhost:3001");
const phoneNumberId = getArg("phone-id", "123456789012345");
const from = getArg("from", "5511999998888");
const text = getArg("text", "Olá! Vocês estão abertos?");
const appSecret = process.env.META_APP_SECRET ?? "";

const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "5511888887777", phone_number_id: phoneNumberId },
            contacts: [{ profile: { name: "Cliente Teste" }, wa_id: from }],
            messages: [
              {
                from,
                id: `wamid.TEST${Date.now()}`,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: text },
              },
            ],
          },
        },
      ],
    },
  ],
};

const body = JSON.stringify(payload);
const headers: Record<string, string> = { "content-type": "application/json" };
if (appSecret) {
  headers["x-hub-signature-256"] = `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
}

const res = await fetch(`${apiUrl}/webhooks/whatsapp`, { method: "POST", headers, body });
console.log(`→ POST /webhooks/whatsapp: ${res.status}`);
console.log(`  tenant (phone_number_id): ${phoneNumberId}`);
console.log(`  de: +${from} | texto: "${text}"`);
console.log("\nAcompanhe a resposta da IA no inbox do dashboard (ou nos logs da API).");
