import type { Tenant } from "@prisma/client";
import type { AiToolDef } from "../providers/types.js";

export interface ToolContext {
  tenantId: string;
  conversationId: string;
  contactId: string;
  tenant: Tenant;
}

export interface AiTool {
  def: AiToolDef;
  /** Retorna o texto que volta para a IA como tool_result */
  execute: (ctx: ToolContext, input: unknown) => Promise<string>;
  /** Se definida, a tool só entra na lista quando retorna true (integração ativa) */
  isAvailable?: (ctx: ToolContext) => Promise<boolean>;
}

const registry = new Map<string, AiTool>();

export function registerTool(tool: AiTool): void {
  registry.set(tool.def.name, tool);
}

export function getTool(name: string): AiTool | undefined {
  return registry.get(name);
}

/** Monta a lista de tools do tenant: habilitadas na AiConfig E disponíveis (integração ativa) */
export async function buildToolsForTenant(
  ctx: ToolContext,
  enabledTools: string[],
): Promise<AiTool[]> {
  const tools: AiTool[] = [];
  for (const name of enabledTools) {
    const tool = registry.get(name);
    if (!tool) continue;
    if (tool.isAvailable && !(await tool.isAvailable(ctx))) continue;
    tools.push(tool);
  }
  return tools;
}
