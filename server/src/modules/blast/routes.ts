import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, eq } from 'drizzle-orm';
import { BlastMap } from '@devdigest/shared';
import type { BlastMapCaller, BlastMapNode } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * Blast Radius module — the PR impact map.
 *
 * Reads the pre-built repo-intel index via `container.repoIntel.getBlastRadius`
 * (the ONLY data source — no analysis, no model tokens) and re-shapes the flat
 * `BlastResult` into a per-changed-symbol tree: each symbol carries its
 * rank-sorted callers and the endpoints/crons reachable through them.
 *
 * Best-effort: an unindexed / partial repo degrades (state 'degraded' + reason)
 * rather than throwing, so the UI shows a badge instead of a blank panel.
 *
 * GET /pulls/:id/blast → BlastMap
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastMap } } },
    async (req): Promise<BlastMap> => {
      const { workspaceId } = await getContext(container, req);

      // 1. Resolve PR (workspace-scoped).
      const [pr] = await container.db
        .select()
        .from(t.pullRequests)
        .where(
          and(
            eq(t.pullRequests.workspaceId, workspaceId),
            eq(t.pullRequests.id, req.params.id),
          ),
        );
      if (!pr) throw new NotFoundError('Pull request not found');

      // 2. Changed files of the PR.
      const fileRows = await container.db
        .select({ path: t.prFiles.path })
        .from(t.prFiles)
        .where(eq(t.prFiles.prId, pr.id));
      const changedFiles = fileRows.map((f) => f.path);

      // 3. Read the impact map from the index (facade only).
      const blast = await container.repoIntel.getBlastRadius(pr.repoId, changedFiles);

      // 4. Group callers under the changed symbol they reach (viaSymbol).
      const callersByVia = new Map<string, BlastMapCaller[]>();
      for (const c of blast.callers) {
        const arr = callersByVia.get(c.viaSymbol) ?? [];
        arr.push({ file: c.file, symbol: c.symbol, line: c.line, rank: c.rank });
        callersByVia.set(c.viaSymbol, arr);
      }

      // 5. Build one tree node per changed symbol that actually has callers.
      //    Endpoints/crons are attributed via the persistent `factsByFile`
      //    (present only on the non-degraded path) of this symbol's caller files.
      const facts = blast.factsByFile;
      const symbols: BlastMapNode[] = [];
      for (const s of blast.changedSymbols) {
        const callers = (callersByVia.get(s.name) ?? []).sort((a, b) => b.rank - a.rank);
        if (callers.length === 0) continue;

        const endpoints = new Set<string>();
        const crons = new Set<string>();
        if (facts) {
          for (const c of callers) {
            const f = facts[c.file];
            if (!f) continue;
            for (const e of f.endpoints) endpoints.add(e);
            for (const x of f.crons) crons.add(x);
          }
        }
        symbols.push({
          file: s.file,
          name: s.name,
          kind: s.kind,
          callers,
          endpoints: [...endpoints],
          crons: [...crons],
        });
      }
      // Lead with the highest-impact symbols (most callers first).
      symbols.sort((a, b) => b.callers.length - a.callers.length);

      // 6. Header counts — global & deduped (endpoints from the facade's union).
      const callerCount = new Set(
        blast.callers.map((c) => `${c.file}|${c.symbol}|${c.line}`),
      ).size;
      const cronCount = new Set(symbols.flatMap((s) => s.crons)).size;

      // 7. Derive state. Degraded reason is surfaced even when partial data
      //    exists, so the UI renders a badge over whatever we could resolve.
      const hasData = symbols.length > 0 || blast.impactedEndpoints.length > 0;
      const state: BlastMap['state'] = blast.degraded
        ? 'degraded'
        : hasData
          ? 'ok'
          : 'empty';

      return {
        state,
        symbols,
        symbol_count: symbols.length,
        caller_count: callerCount,
        endpoint_count: blast.impactedEndpoints.length,
        cron_count: cronCount,
        degraded_reason: blast.degraded ? (blast.reason ?? 'no_data') : null,
      };
    },
  );
}
