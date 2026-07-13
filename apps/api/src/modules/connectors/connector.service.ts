import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "undici";
import { prisma } from "../../lib/prisma.js";
import { decrypt } from "../../lib/crypto.js";
import { logger } from "../../lib/logger.js";

// Conector de dados externos (REST, somente GET na fase atual).
// A IA consulta sistemas do cliente (ERP, sistema de pedidos) via endpoints
// pré-cadastrados por tenant — nunca URLs livres.

const MAX_RESPONSE_BYTES = 4096;
const TIMEOUT_MS = 10_000;

interface ConnectorConfig {
  baseUrl: string;
  /** Headers com auth, criptografados como string JSON */
  headersEnc?: string;
}

interface ConnectorEndpoint {
  method: string;
  path: string;
  description: string;
  /** Parâmetros aceitos: { nome: "descrição" } */
  params?: Record<string, string>;
}

/** Bloqueia SSRF: resolve o hostname e recusa IPs privados/loopback/link-local */
async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname;
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  for (const { address } of addresses) {
    if (
      /^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(address) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
      address === "::1" ||
      address.toLowerCase().startsWith("fe80:") ||
      address.toLowerCase().startsWith("fc") ||
      address.toLowerCase().startsWith("fd")
    ) {
      throw new Error(`Host ${host} resolve para IP privado — bloqueado`);
    }
  }
}

/** Lista os conectores/consultas do tenant em texto para a IA */
export async function describeConnectors(tenantId: string): Promise<string> {
  const connectors = await prisma.externalConnector.findMany({
    where: { tenantId, active: true },
  });
  if (connectors.length === 0) return "Nenhum conector de dados externos configurado.";

  return connectors
    .map((c) => {
      const endpoints = c.endpoints as unknown as Record<string, ConnectorEndpoint>;
      const lines = Object.entries(endpoints).map(([name, ep]) => {
        const params = ep.params
          ? ` | parâmetros: ${Object.entries(ep.params)
              .map(([k, v]) => `${k} (${v})`)
              .join(", ")}`
          : "";
        return `  - consulta "${name}": ${ep.description}${params}`;
      });
      return `Conector "${c.name}":\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

/** Executa uma consulta GET pré-cadastrada e retorna o corpo truncado */
export async function callConnectorEndpoint(
  tenantId: string,
  connectorName: string,
  endpointName: string,
  params: Record<string, string>,
): Promise<string> {
  const connector = await prisma.externalConnector.findFirst({
    where: { tenantId, active: true, name: { equals: connectorName, mode: "insensitive" } },
  });
  if (!connector) return `Conector "${connectorName}" não encontrado.`;

  const endpoints = connector.endpoints as unknown as Record<string, ConnectorEndpoint>;
  const endpoint = endpoints[endpointName];
  if (!endpoint) {
    return `Consulta "${endpointName}" não existe. Disponíveis: ${Object.keys(endpoints).join(", ")}`;
  }
  if ((endpoint.method ?? "GET").toUpperCase() !== "GET") {
    return "Apenas consultas GET são permitidas nesta versão.";
  }

  const config = connector.config as unknown as ConnectorConfig;

  // Substitui {param} no path e adiciona o restante como query string
  let path = endpoint.path;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (path.includes(`{${key}}`)) {
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    } else {
      query.set(key, value);
    }
  }
  const url = new URL(path + (query.size ? `?${query.toString()}` : ""), config.baseUrl);
  await assertPublicHost(url);

  const headers: Record<string, string> = { accept: "application/json" };
  if (config.headersEnc) {
    Object.assign(headers, JSON.parse(decrypt(config.headersEnc)) as Record<string, string>);
  }

  try {
    const res = await request(url.toString(), {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.body.text();
    if (res.statusCode >= 400) {
      return `Sistema externo retornou erro ${res.statusCode}.`;
    }
    return text.length > MAX_RESPONSE_BYTES
      ? `${text.slice(0, MAX_RESPONSE_BYTES)}\n[resposta truncada]`
      : text;
  } catch (err) {
    logger.error({ err, connectorName, endpointName }, "erro em conector externo");
    return "Não foi possível consultar o sistema externo agora.";
  }
}
