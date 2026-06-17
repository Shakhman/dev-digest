## What Works

## What Doesn't Work

## Codebase Patterns

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

## Open Questions
