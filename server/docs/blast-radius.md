# Blast Radius — PR impact map (architecture)

The **Blast Radius** panel answers "if I merge this PR, what does it touch?" by
reading the pre-built repo-intel index — **no analysis at request time, no model
tokens**. It shows, per changed symbol: who calls it (file:line), and which HTTP
endpoints + crons are reachable through those callers.

It renders as a card on the PR **Overview** tab, beside the Intent card.

## Data flow

```mermaid
sequenceDiagram
    participant UI as BlastCard (Overview tab)
    participant Hook as useBlast (React Query)
    participant API as GET /pulls/:id/blast
    participant Facade as container.repoIntel
    UI->>Hook: render with prId
    Hook->>API: fetch (key ["pr-blast", prId], staleTime 5m)
    API->>API: resolve PR (workspace-scoped) + load t.prFiles paths
    API->>Facade: getBlastRadius(pr.repoId, changedFiles)
    Facade-->>API: BlastResult { changedSymbols, callers, impactedEndpoints, factsByFile?, degraded, reason }
    API->>API: group callers by viaSymbol → tree; attribute endpoints/crons via factsByFile
    API-->>Hook: BlastMap { state, symbols[], counts, degraded_reason }
    Hook-->>UI: render tree; caller file:line → githubBlobUrl(repoFullName, head_sha, file, line)
```

## Why it's cheap

All the heavy lifting already exists in the facade
(`server/src/modules/repo-intel/service.ts` → `getBlastRadius`): it collects the
changed symbols, finds cross-file callers (rank-sorted, capped, declaration file
excluded), and surfaces endpoints/crons via `factsByFile`. The `blast/` route is
a thin re-shape of that result into a tree the UI renders directly — it imports
**only** `container.repoIntel`, never the indexer pipeline.

## The map shape (`BlastMap`)

```
BlastMap {
  state: 'ok' | 'empty' | 'degraded'
  symbols: [{ file, name, kind, callers: [{file, symbol, line, rank}], endpoints[], crons[] }]
  symbol_count, caller_count, endpoint_count, cron_count   // header stats (global, deduped)
  degraded_reason: string | null
}
```

Callers are grouped under the changed symbol they reach (`viaSymbol`); a symbol's
endpoints/crons are the union of `factsByFile` for its caller files. Only symbols
with ≥1 caller appear (impact, not noise).

## State matrix

| Facade result | `state` | UI |
|---|---|---|
| not degraded, ≥1 symbol-with-callers (or endpoints) | `ok` | full tree + counts |
| not degraded, nothing to show | `empty` | empty-state card |
| `degraded: true` (`no_data` / `flag_off` / `index_partial`) | `degraded` | warning badge + **whatever partial data resolved** (never blank) |

The route never throws on an unindexed/partial repo — it degrades, matching the
project's best-effort enrichment rule.

## Decisions

- **No LLM summary.** The screenshot shows no summary paragraph and the
  acceptance criteria allow "zero model calls", so the optional one-paragraph
  call was dropped. The whole feature spends **zero tokens** and is fully
  deterministic. (If a summary is wanted later, gate it on `state === 'ok'`,
  wrap in try/catch → null, and register a `blast_summary` feature-model.)
- **No Postgres cache.** Re-opening the tab in a session is served from React
  Query's `staleTime` (5 min). Cross-session caching, if ever needed, belongs in
  a repo-intel-style cache keyed by `(pr_id, head_sha)` — not built.
- **Deep-links pin to `head_sha`.** Caller links use
  `githubBlobUrl(repoFullName, head_sha, file, line)` so line numbers stay
  accurate; when `repoFullName`/`head_sha` are unknown the row degrades to plain
  text instead of a broken link.

## Tests

- `server/test/blast.it.test.ts` — grouping/attribution, `empty`, `degraded`
  (partial data + reason, no throw), and PR-not-found 404. The facade is injected
  via `ContainerOverrides.repoIntel`, so no real index is needed.
- `client/.../_components/BlastCard/BlastCard.test.tsx` — caller link href +
  `target="_blank"`, plain-text fallback without repo/sha, degraded badge over
  partial data, and the empty state.
