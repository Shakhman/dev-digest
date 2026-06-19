## What Works

- **2026-06-17** — `createPortal(…, document.body)` + `position: fixed` + `getBoundingClientRect()` is the correct pattern for any hover card that needs to escape an `overflow: hidden` ancestor (PR list card, accordion panels). Capture rect on `mouseenter`, store `{top, left}` in state, render the portal div with those fixed coords. Evidence: `client/src/components/Findings/FindingsHover.tsx:68-79`.

- **2026-06-17** — Lazy-fetch with `isLoading` bridge: pass server-computed `counts` (from `PrMeta.findings_by_severity`) to the indicator for instant render; gate `usePrReviews` on first hover; pass `isLoading={h && reviewsLoading}` to `FindingsHover` so the card opens immediately with a spinner rather than staying closed until the fetch resolves. Evidence: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:30,77-81`.

## What Doesn't Work

- **`findings.length === 0` as the hover-card open gate breaks lazy-loading.**
  When `FindingsHover` guards `handleEnter` with `if (findings.length === 0) return`,
  the card never opens during the first hover because `usePrReviews` hasn't resolved
  yet — findings is still `[]`. The right gate is:
  `if (findings.length === 0 && !isLoading) return` + `if (!hasCounts && !isLoading) return`.
  Pass `isLoading={h && reviewsLoading}` from the row so the card opens immediately
  and shows a spinner while the fetch is in flight.

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

- **Portal hover cards must use `createPortal(…, document.body)` + `position: fixed`.**
  The PR list card and the ReviewRunAccordion panels have `overflow: hidden`.
  Absolutely-positioned children of those containers get clipped. Pattern:
  capture `getBoundingClientRect()` on `mouseenter`, store `{top, left}` in state,
  render `<div style={{ position:"fixed", top, left, zIndex:9999 }}>` via portal.
  Include a 120 ms `setTimeout` close timer with `clearTimeout` on re-enter so the
  mouse can travel from the trigger to the card without dismissal.

- **`noUncheckedIndexedAccess: true` — TypeScript does NOT narrow `arr[0]` after a `.length` guard.**
  After `if (!arr || arr.length === 0) return`, TypeScript still types `arr[0]` as
  `T | undefined`. The length check proves the array is non-empty at runtime but the
  compiler doesn't track index-level narrowing. Fix: `const first = arr[0]; if (!first) return;`
  before using `first`. Affects any `useMemo` / function that accesses `arr[0]` directly.

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-06-17** — `TS2532: Object is possibly 'undefined'` on `arr[0]` even after a `arr.length === 0` early-return guard. Root cause: `noUncheckedIndexedAccess: true` in `client/tsconfig.json:8` — TypeScript doesn't narrow array element types from length checks. Fix: `const first = arr[0]; if (!first) return;` before any index access. Evidence: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:33`.

## Session Notes

### 2026-06-17
- Added `cost_usd` to `RunSummary`, `RunStats`, and `PrMeta` contracts (both
  vendored copies).
- New `RunCostBadge` component (compact / detailed) in
  `[number]/_components/RunCostBadge/`; imported by PRRow via a cross-level
  relative path (`../../[number]/_components/...`).
- Wired cost display across 3 screens: PR list column, RunHistory timeline row +
  VerdictBanner plaque, TraceBody Stats grid.

### 2026-06-17 (continued)
- Added Findings severity indicators + hover tooltip: `FindingsIndicator`,
  `FindingsHoverCard`, `FindingsHover` under `src/components/Findings/`.
- PR list column: counts from `PrMeta.findings_by_severity` (server-computed, instant);
  full detail from `usePrReviews` lazy-fetched on first hover and TanStack-cached.
- Timeline (RunHistory): `findingsByRunId: Map<string, FindingRecord[]>` passed down
  from `FindingsTab` (which already holds all ReviewRecords); no extra fetch needed.
- "Last run" client logic: 2-minute session window matching server — `reviews.filter`
  by `newestAt - created_at <= SESSION_WINDOW_MS` then `.flatMap(findings)`.
- Added `plain` prop to `SeverityBadge` (strips `background` + `borderRadius`) used
  in `FindingsIndicator` chips; tooltip card keeps the full pill style.

## Open Questions
