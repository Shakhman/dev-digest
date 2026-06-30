import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import type { Config } from '../config.js';
import { toToolText } from '../format.js';

export interface Ctx {
  api: ApiClient;
  config: Config;
}

export function register(server: McpServer, ctx: Ctx): void {
  server.tool(
    'list_agents',
    'List configured reviewer agents (name, model, enabled). Use a returned name with run_agent_on_pr.',
    async () => {
      try {
        const agents = await ctx.api.listAgents();
        const trimmed = agents.slice(0, 50).map((a) => ({
          name: a.name,
          model: a.model,
          provider: a.provider,
          enabled: a.enabled,
        }));
        return toToolText({ agents: trimmed });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return toToolText({ error: message, isError: true });
      }
    },
  );
}
