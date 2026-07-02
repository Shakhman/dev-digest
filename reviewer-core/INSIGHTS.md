# Insights — reviewer-core

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-06-14** — `reviewPullRequest` already returns `tokensIn`/`tokensOut`/`costUsd` in `ReviewOutcome` — consumers wanting cost should READ it from the outcome, not recompute (zero extra model calls). Cost is accumulated per chunk and goes `null` if ANY chunk lacked a cost (conservative). The OpenRouter provider prefers the real `usage.cost` and falls back to `estimateCost`. Evidence: `reviewer-core/src/review/run.ts:110,184`, `src/llm/openrouter.ts`.

- **2026-07-01** — Pure trim-to-budget prompt builders (SPEC-09 `buildBriefPrompt`) don't need to track "was this section dropped for size vs. never had data" as two separate signals: render each optional section to `string | null` (null = no data), assemble in trim-priority order, then have the builder return only `sections_present` (what actually made it into the final assembled text after trimming). The caller computes "missing/degraded sections" (AC-14) as a plain set-difference against the full section list — unifying "absent because no data" and "dropped for budget" into one signal without extra bookkeeping inside the pure function. Evidence: `reviewer-core/src/brief/prompt.ts` (`sections_present`), `server/src/modules/brief/service.ts` (`ALL_SECTIONS.filter(...)`).

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
