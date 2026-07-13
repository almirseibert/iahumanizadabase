import { request } from "undici";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

// Download de mídia da Cloud API: primeiro busca a URL temporária pelo id,
// depois baixa o binário (a URL exige o mesmo Bearer token).

const GRAPH_BASE = "https://graph.facebook.com";
const MAX_MEDIA_BYTES = 16 * 1024 * 1024; // 16MB (limite de áudio da Meta)

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
}

export async function downloadMedia(
  mediaId: string,
  accessToken: string,
): Promise<DownloadedMedia | null> {
  try {
    const metaRes = await request(`${GRAPH_BASE}/${env.META_GRAPH_VERSION}/${mediaId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (metaRes.statusCode >= 400) {
      logger.warn({ mediaId, status: metaRes.statusCode }, "falha ao obter URL da mídia");
      return null;
    }
    const meta = (await metaRes.body.json()) as { url?: string; mime_type?: string };
    if (!meta.url) return null;

    // Segue até 3 redirects manualmente (CDN da Meta costuma redirecionar)
    let url = meta.url;
    let fileRes = await request(url, { headers: { authorization: `Bearer ${accessToken}` } });
    for (let i = 0; i < 3 && [301, 302, 307, 308].includes(fileRes.statusCode); i++) {
      const location = fileRes.headers.location;
      if (typeof location !== "string") break;
      await fileRes.body.dump();
      url = new URL(location, url).toString();
      fileRes = await request(url, { headers: { authorization: `Bearer ${accessToken}` } });
    }
    if (fileRes.statusCode >= 400) return null;

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of fileRes.body) {
      total += (chunk as Buffer).length;
      if (total > MAX_MEDIA_BYTES) {
        logger.warn({ mediaId }, "mídia excede o tamanho máximo — ignorada");
        return null;
      }
      chunks.push(chunk as Buffer);
    }
    return { buffer: Buffer.concat(chunks), mimeType: meta.mime_type ?? "application/octet-stream" };
  } catch (err) {
    logger.error({ err, mediaId }, "erro ao baixar mídia");
    return null;
  }
}
