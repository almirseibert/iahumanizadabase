import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

// AES-256-GCM para credenciais em repouso (tokens WA, chaves de IA, refresh tokens).
// Formato armazenado: base64(iv).base64(authTag).base64(ciphertext)

const KEY = Buffer.from(env.ENCRYPTION_KEY, "hex");

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decrypt(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Valor criptografado em formato inválido");
  }
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Últimos 4 caracteres para exibição segura no dashboard */
export function maskSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    const value = decrypt(stored);
    return `••••${value.slice(-4)}`;
  } catch {
    return "••••";
  }
}
