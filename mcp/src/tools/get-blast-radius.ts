import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import type { Config } from '../config.js';
import { toToolText } from '../format.js';

export interface Ctx {
  api: ApiClient;
  config: Config;
}

export function register(server: McpServer, _ctx: Ctx): void {
  server.tool(
    'get_blast_radius',
    'Get the blast radius for a PR. (Not implemented yet.)',
    {
      repo: z.string().min(1),
      pr: z.coerce.number().int().positive(),
    },
    async (_args) => {
      return toToolText({
        status: 'not_implemented',
        message:
          'get_blast_radius is a stub; Blast Radius (reads repo-intel) is L04 homework.',
      });
    },
  );
}
