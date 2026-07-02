import { eq } from 'drizzle-orm';
import { BlastMap } from '@devdigest/shared';
import type { BlastMapCaller, BlastMapNode } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';

/**
 * T-B1 — Blast Radius computation, extracted from the route so other modules
 * (the `brief` aggregator) can reuse it via a service function instead of
 * re-entering the HTTP layer. Assumes `pr` has already been workspace-scoped
 * by the caller.
 *
 * Reads the pre-built repo-intel index via `container.repoIntel.getBlastRadius`
 * (the ONLY data source — no analysis, no model tokens) and re-shapes the flat
 * `BlastResult` into a per-changed-symbol tree: each symbol carries its
 * rank-sorted callers and the endpoints/crons reachable through them.
 *
 * Best-effort: an unindexed / partial repo degrades (state 'degraded' + reason)
 * rather than throwing, so callers can show a badge instead of a blank panel.
 */
export async function computeBlastMap(
  container: Container,
  pr: { id: string; repoId: string },
): Promise<BlastMap> {
  // 1. Changed files of the PR.
  const fileRows = await container.db
    .select({ path: t.prFiles.path })
    .from(t.prFiles)
    .where(eq(t.prFiles.prId, pr.id));
  const changedFiles = fileRows.map((f) => f.path);

  // 2. Read the impact map from the index (facade only).
  const blast = await container.repoIntel.getBlastRadius(pr.repoId, changedFiles);

  // 3. Group callers under the changed symbol they reach (viaSymbol).
  const callersByVia = new Map<string, BlastMapCaller[]>();
  for (const c of blast.callers) {
    const arr = callersByVia.get(c.viaSymbol) ?? [];
    arr.push({ file: c.file, symbol: c.symbol, line: c.line, rank: c.rank });
    callersByVia.set(c.viaSymbol, arr);
  }

  // 4. Build one tree node per changed symbol that actually has callers.
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

  // 5. Header counts — global & deduped (endpoints from the facade's union).
  const callerCount = new Set(blast.callers.map((c) => `${c.file}|${c.symbol}|${c.line}`)).size;
  const cronCount = new Set(symbols.flatMap((s) => s.crons)).size;

  // 6. Derive state. Degraded reason is surfaced even when partial data
  //    exists, so consumers render a badge over whatever we could resolve.
  const hasData = symbols.length > 0 || blast.impactedEndpoints.length > 0;
  const state: BlastMap['state'] = blast.degraded ? 'degraded' : hasData ? 'ok' : 'empty';

  return {
    state,
    symbols,
    symbol_count: symbols.length,
    caller_count: callerCount,
    endpoint_count: blast.impactedEndpoints.length,
    cron_count: cronCount,
    degraded_reason: blast.degraded ? (blast.reason ?? 'no_data') : null,
  };
}
