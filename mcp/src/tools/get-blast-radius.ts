import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import type { Config } from '../config.js';
import { ToolError, ApiUnreachableError } from '../errors.js';
import { resolveRepo, resolvePr } from '../resolve.js';
import { toToolText, trimBlastNode } from '../format.js';

export interface Ctx {
  api: ApiClient;
  config: Config;
}

export function register(server: McpServer, ctx: Ctx): void {
  server.tool(
    'get_blast_radius',
    'Get the blast radius (PR impact map) for a PR: which changed symbols are touched, ' +
      'who calls them (file:line), and which HTTP endpoints + crons are reachable. ' +
      'Read-only; built from the repo-intel index (no review run, no model tokens).',
    {
      repo: z.string().min(1),
      pr: z.coerce.number().int().positive(),
    },
    async (args) => {
      try {
        const { repo, pr } = args;

        const repoId = await resolveRepo(ctx.api, repo);
        const prId = await resolvePr(ctx.api, repoId, repo, pr);

        const map = await ctx.api.getBlastRadius(prId);

        if (map.state === 'empty') {
          return toToolText({
            state: 'empty',
            message:
              `No indexed impact for PR #${pr} — the changed files have no callers in the ` +
              'repo-intel index (or the repo is not indexed yet).',
          });
        }

        const result: Record<string, unknown> = {
          state: map.state,
          symbols: map.symbols.map(trimBlastNode),
          counts: {
            symbols: map.symbol_count,
            callers: map.caller_count,
            endpoints: map.endpoint_count,
            crons: map.cron_count,
          },
        };

        if (map.state === 'degraded') {
          result.degraded_reason = map.degraded_reason;
          result.note =
            'Index is partial/unbuilt — showing best-effort results (crons may be missing).';
        }

        return toToolText(result);
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
