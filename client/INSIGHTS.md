## What Works

## What Doesn't Work

## Codebase Patterns

- **Vendored shared contracts live in two hand-synced copies.** The Zod schemas
  under `src/vendor/shared/contracts/` mirror `server/src/vendor/shared/contracts/`
  exactly (by convention, not automation). There is no sync script. When editing
  any contract, apply the same change to both copies; the only tolerated diff is
  comment wording. Omitting one copy produces type errors in whichever package
  you didn't update.

- **`FindingsTab` owns the `prRuns` (RunSummary[]) lookup bridge.** The
  `ReviewRunAccordion` → `VerdictBanner` stack doesn't load run data itself.
  `FindingsTab` receives both `runs` (ReviewRecord[]) and `prRuns` (RunSummary[])
  and is the right place to join them by `run_id` before passing cost/token props
  down. Don't try to load RunSummary inside `VerdictBanner` or `ReviewRunAccordion`.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

### 2026-06-17
- Added `cost_usd` to `RunSummary`, `RunStats`, and `PrMeta` contracts (both
  vendored copies).
- New `RunCostBadge` component (compact / detailed) in
  `[number]/_components/RunCostBadge/`; imported by PRRow via a cross-level
  relative path (`../../[number]/_components/...`).
- Wired cost display across 3 screens: PR list column, RunHistory timeline row +
  VerdictBanner plaque, TraceBody Stats grid.

## Open Questions
