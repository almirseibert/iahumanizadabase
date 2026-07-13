import OpenAI, { toFile } from "openai";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

// Transcrição de áudio via Whisper (OpenAI). Cliente brasileiro manda muito
// áudio — com OPENAI_API_KEY configurada, a IA responde áudios como texto.

const EXT_BY_MIME: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "audio/wav": "wav",
};

export function isTranscriptionAvailable(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  if (!env.OPENAI_API_KEY) return null;
  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const baseMime = mimeType.split(";")[0]?.trim() ?? "audio/ogg";
    const ext = EXT_BY_MIME[baseMime] ?? "ogg";
    const result = await client.audio.transcriptions.create({
      model: "whisper-1",
      language: "pt",
      file: await toFile(buffer, `audio.${ext}`, { type: baseMime }),
    });
    return result.text?.trim() || null;
  } catch (err) {
    logger.error({ err }, "falha na transcrição de áudio");
    return null;
  }
}
