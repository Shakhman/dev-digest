import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import type { Config } from '../config.js';
import { ToolError, ApiUnreachableError } from '../errors.js';
import { resolveRepo } from '../resolve.js';
import { toToolText } from '../format.js';

export interface Ctx {
  api: ApiClient;
  config: Config;
}

export function register(server: McpServer, ctx: Ctx): void {
  server.tool(
    'get_conventions',
    "Get accepted review conventions for a repo.",
    {
      repo: z.string().min(1),
    },
    async (args) => {
      try {
        const repoId = await resolveRepo(ctx.api, args.repo);
        const conventions = await ctx.api.listConventions(repoId);

        if (conventions.length === 0) {
          return toToolText({
            repo: args.repo,
            message:
              'No conventions extracted yet — run the extractor in the DevDigest UI first.',
          });
        }

        const accepted = conventions
          .filter((c) => c.accepted)
          .map((c) => ({ category: c.category, rule: c.rule, confidence: c.confidence }));

        const pendingCount = conventions.filter((c) => !c.accepted).length;

        return toToolText({
          repo: args.repo,
          accepted,
          pending_count: pendingCount,
        });
      } catch (err) {
        if (err instanceof ToolError) {
          return toToolText({ error: err.message, isError: true });
        }
        if (err instanceof ApiUnreachableError) {
          return toToolText({
            error: `API not reachable at ${ctx.config.apiBaseUrl} — is it running? cd server && npm run dev`,
            isError: true,
          });
        }
        const message = err instanceof Error ? err.message : String(err);
        return toToolText({ error: message, isError: true });
      }
    },
  );
}
