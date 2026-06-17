## What Works

- **2026-06-17** — One `desc(createdAt)` reviews query reused for two purposes in the PR-list route: first row per PR → score/cost ring; 2-minute window slice of those same rows → per-severity finding counts. No second round-trip needed. Evidence: `server/src/modules/pulls/routes.ts:124-183`.

## What Doesn't Work

- **2026-06-17** — Taking only the single latest review per PR for `findings_by_severity` silently produces zero counts when a high-scoring agent (0 findings) happens to finish last. Multi-agent sessions need the 2-minute session window, not `MAX(created_at)`. Evidence: `server/src/modules/pulls/routes.ts:147-160`.

## Codebase Patterns

- **"Last run" findings = 2-minute session window, not a single review.**
  Multi-agent reviews fire in parallel; each agent writes its own `reviews` row.
  All rows from one session typically land within seconds of each other. Taking only
  `MAX(created_at)` per PR misses the sibling agents. Fix: collect all reviews for
  a PR sorted newest-first, then include every review whose `created_at` is within
  `newestAt - 2 * 60 * 1000` ms. This is implemented in `GET /repos/:id/pulls`
  (`server/src/modules/pulls/routes.ts`) and must be replicated in client-side
  `latestFindings` logic in `PRRow.tsx`.

- **One `desc(createdAt)` reviews query serves two purposes.**
  In the PR-list route the reviews are fetched once, sorted newest-first. The first
  row per PR supplies the score/cost ring; the 2-minute window slice of those same
  rows supplies the per-severity finding counts. Avoid splitting into two queries.

- **`completeAgentRun` has two type surfaces.** The method signature lives in both
  `src/modules/reviews/repository/run.repo.ts` (the implementation) and
  `src/modules/reviews/repository.ts` (the class facade that wraps it). Adding
  an optional field to only one side compiles fine in isolation but fails at the
  call site (TS2353 "may only specify known properties"). Always update both.

## Tool & Library Notes

## Recurring Errors & Fixes

- **Drizzle migrator silently skips a new entry if its `when` value is earlier
  than existing entries.**
  - Symptom: `db:migrate` prints `✓ migrations applied` and the migration count
    stays the same; the column/table is never created.
  - Root cause: drizzle-orm's migrator orders journal entries by `when`
    (milliseconds epoch), not by `idx`. A manually added entry with a `when`
    smaller than the last applied entry is treated as already-past and skipped.
  - Fix: always set `when` to a value strictly greater than the last existing
    entry in `meta/_journal.json`. Safe formula: `last_when + 100000`.

## Session Notes

### 2026-06-17
- Re-added `agent_runs.cost_usd` (dropped in d45ab0d) via migration 0010 and
  wired it through run-executor → run.repo → contracts → PR-list route.
- Hit the silent-skip drizzle bug (see Recurring Errors) because the manually
  written journal entry used the current calendar date in ms (≈ 2025-06-17)
  which was a year earlier than all existing entries.

### 2026-06-17 (continued)
- Added per-severity finding counts to `GET /repos/:id/pulls` response
  (`findings_by_severity` on `PrMeta`). Used a 2-minute session window (see
  Codebase Patterns) after discovering that a single latest-review approach
  produced zero counts when the highest-scoring agent ran last and had no findings.

## Open Questions
