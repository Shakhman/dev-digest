import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import type { Config } from '../config.js';
import { ToolError, ApiUnreachableError } from '../errors.js';
import { resolveRepo, resolvePr } from '../resolve.js';
import { toToolText, pickLatestSession, trimReview } from '../format.js';

export interface Ctx {
  api: ApiClient;
  config: Config;
}

export function register(server: McpServer, ctx: Ctx): void {
  server.tool(
    'get_findings',
    'Get the latest review verdict + findings for a PR (read-only; runs nothing).',
    {
      repo: z.string().min(1),
      pr: z.coerce.number().int().positive(),
    },
    async (args) => {
      try {
        const { repo, pr } = args;

        const repoId = await resolveRepo(ctx.api, repo);
        const prId = await resolvePr(ctx.api, repoId, repo, pr);

        const reviews = await ctx.api.listReviews(prId);
        const session = pickLatestSession(reviews);

        if (session.length === 0) {
          return toToolText(
            `no completed review for PR #${pr} yet — call run_agent_on_pr first (see list_agents).`,
          );
        }

        if (session.length === 1) {
          const review = session[0]!;
          const trimmed = trimReview(review);
          return toToolText({
            verdict: trimmed.verdict,
            score: trimmed.score,
            findings: trimmed.findings,
          });
        }

        // Multi-agent
        return toToolText({
          reviews: session.map(trimReview),
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
