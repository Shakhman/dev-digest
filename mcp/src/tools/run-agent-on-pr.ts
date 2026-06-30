import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import type { Config } from '../config.js';
import { ApiHttpError, ApiUnreachableError, ToolError } from '../errors.js';
import { resolveRepo, resolvePr, resolveAgent } from '../resolve.js';
import { toToolText, trimReview } from '../format.js';

export interface Ctx {
  api: ApiClient;
  config: Config;
}

const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled']);

export function register(server: McpServer, ctx: Ctx): void {
  server.tool(
    'run_agent_on_pr',
    'Run one reviewer agent on a PR and wait for the verdict + findings.',
    {
      repo: z.string().min(1),
      pr: z.coerce.number().int().positive(),
      agent: z.string().min(1),
    },
    async (args) => {
      try {
        const { repo, pr, agent } = args;

        // Resolve all three — throw ToolError on miss
        const repoId = await resolveRepo(ctx.api, repo);
        const prId = await resolvePr(ctx.api, repoId, repo, pr);
        const agentId = await resolveAgent(ctx.api, agent);

        // Trigger review — fire-and-forget; reviews in response is always []
        let triggerResponse: { runs: { run_id: string; agent_id: string; agent_name: string }[] };
        try {
          triggerResponse = await ctx.api.triggerReview(prId, agentId);
        } catch (err) {
          if (err instanceof ApiHttpError && err.status === 429) {
            return toToolText({ error: '10 reviews/min limit hit; wait and retry', isError: true });
          }
          if (err instanceof ApiUnreachableError) {
            return toToolText({
              error: `API not reachable at ${ctx.config.apiBaseUrl} — is it running? cd server && npm run dev`,
              isError: true,
            });
          }
          throw err;
        }

        // Find our run_id
        const ourRun = triggerResponse.runs.find((r) => r.agent_id === agentId);
        const runId = ourRun?.run_id;

        if (!runId) {
          return toToolText({ error: 'Trigger did not return a run_id for the requested agent', isError: true });
        }

        // Poll listRuns until terminal or timeout
        const deadline = Date.now() + ctx.config.timeoutMs;

        while (Date.now() < deadline) {
          await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

          const runs = await ctx.api.listRuns(prId);
          const run = runs.find((r) => r.run_id === runId);

          if (!run || !run.status) continue;

          if (!TERMINAL_STATUSES.has(run.status)) continue;

          if (run.status === 'done') {
            // Find the review for this run
            const reviews = await ctx.api.listReviews(prId);
            const review = reviews.find((r) => r.run_id === runId && r.kind === 'review');
            if (!review) {
              return toToolText({ error: 'Run completed but no review found', isError: true });
            }
            return toToolText(trimReview(review));
          }

          if (run.status === 'failed') {
            return toToolText({
              error: `Review failed: ${run.error ?? 'unknown error'}`,
              isError: true,
            });
          }

          if (run.status === 'cancelled') {
            return toToolText({ error: 'cancelled — retry', isError: true });
          }
        }

        // Timeout
        return toToolText({
          error: `still running after ${Math.round(ctx.config.timeoutMs / 1000)}s; call get_findings(repo, pr) shortly`,
          isError: true,
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
