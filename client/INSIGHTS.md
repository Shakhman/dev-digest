# Insights — client

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

- **2026-06-14** — `formatCost` (`src/lib/cost.ts`) distinguishes MISSING data (`null`/`undefined` → "—") from a genuine zero (`0` → "$0.00"), widens precision for sub-cent values (~2 sig figs), and trims trailing zeros to a 2dp floor ("$0.06" not "$0.060", "$0.0013" not "$0.00"). Reuse it for any per-run money display.

## What Doesn't Work

- **2026-06-23** — `setParam(key, val)` is **not batch-safe**: it reads the current `search` snapshot, so two sequential calls both see the same stale params and the second call's write wins, silently dropping the first. Any multi-param URL mutation must build a single `URLSearchParams` from `search.toString()`, set/delete all keys on it, and call `router.replace` once. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (atomic `onFindingClick` and `setTab`).

- **2026-06-23** — Stale `?finding` / `?trace` query params cause **tab redirect loops**: if `?tab=diff&finding=<id>` is in the URL, the tab derivation `search.get("tab") ?? (focusFindingId ? "findings" : "overview")` resolves to `"diff"`, but an unguarded `setTab("diff")` that doesn't clear `?finding` leaves the redirect trigger alive, bouncing back to `findings` on the next render cycle. Fix: `setTab` must atomically delete both `finding` and `trace` before calling `router.replace`. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:74-79`.

- **2026-06-21** — `useSetAgentSkills` with `onSuccess`-only invalidation leaves stale optimistic state after a **failed** mutation: `orderedIds` stays empty in the SkillsTab while the DB keeps the old links. UI shows "0 of N enabled"; run logs show skills still attached. Fix: use `onSettled` (fires on both success and error) to force `["agent-skill-links", agentId]` re-fetch. Evidence: `client/src/lib/hooks/skills.ts:119`.

- **2026-06-17** — The PR-list `tableCard` has `overflow: "hidden"` (`pulls/styles.ts`) which CLIPS absolutely-positioned hover popovers (`FindingsHoverCard`) opening downward from the bottom rows; upper rows render fine (matching the design). `FindingsHoverCard` is dependency-free (anchor wrapper + `position:absolute` panel) — to fully escape the card it would need a portal + `position:fixed` from the anchor's `getBoundingClientRect`. Deferred; not needed for the common case. Evidence: `client/src/components/FindingsHoverCard/`, `pulls/styles.ts:97`.

## Codebase Patterns

- **2026-06-17** — `FindingsHoverCard` renders its panel in a `createPortal(document.body)` with `position:fixed` (coords measured from the anchor's `getBoundingClientRect` on open, recomputed on resize, closed on scroll). This is the fix for the earlier `overflow:hidden` clipping limitation — the panel escapes any clipping ancestor. Because the panel is outside the anchor's subtree, BOTH the anchor and the portal panel carry the open/close mouse handlers (shared 120ms timer) so the pointer can cross the gap. Evidence: `client/src/components/FindingsHoverCard/FindingsHoverCard.tsx`.
- **2026-06-17** — Finding deep-linking: a findings popover navigates to `…/pulls/:number?tab=findings&finding=:id`. The PR-detail page reads `?finding`, forces the findings tab, and threads `focusFindingId` → `FindingsTab` (resolves finding→run, reuses the `targetRunId` open+scroll) → `ReviewRunAccordion` (opens if it owns the finding) → `FindingsPanel` (scrolls to `[data-finding-id]` + `defaultExpanded`). A finding's file:line link opens the PR's Files tab (`githubPrFilesUrl`), not the standalone blob. Evidence: `pulls/[number]/page.tsx`, `FindingsTab`, `ReviewRunAccordion`, `FindingsPanel`.

- **2026-06-21** — `@devdigest/ui` icons are exported under **aliases**, not their Lucide source names. Example: Lucide `Pencil` is registered as `Edit` (`Edit: Pencil`). Using the source name (e.g. `icon="Pencil"`) throws a TS type error (`Type '"Pencil"' is not assignable to type 'IconName'`) — not a silent runtime miss. Always check the alias map before using an icon. Evidence: `client/src/vendor/ui/icons.tsx`.
- **2026-06-21** — `FormField` from `@devdigest/ui` has no `style` or `className` prop — passing either is a TS error. For side-by-side layout of two fields, wrap each `<FormField>` in a `<div style={{ flex: 1 }}>` and put the two divs in a flex container. Evidence: `client/src/app/repos/[repoId]/conventions/_components/CreateSkillModal/CreateSkillModal.tsx`.
- **2026-06-18** — `BarChart2` and `GripVertical` do NOT exist in the `@devdigest/ui` icon registry. Use `BarChart` for charts and a unicode character (e.g. `⠿`) for drag handles. Always verify icon names against `client/src/vendor/ui/icons.tsx` before using them — a wrong name silently renders nothing because Icon is a proxy object.
- **2026-06-18** — The `AgentEditor` tab system has TWO places to update: `TABS` constant in `AgentEditor/constants.ts` (controls the tab bar) and `VALID_TABS` array in `agents/[id]/page.tsx` (validates the `?tab=` URL param). Both must be kept in sync when adding a tab — missing VALID_TABS causes the new tab to silently redirect to `config`. Evidence: `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `client/src/app/agents/[id]/page.tsx:15`.

- **2026-06-14** — Cross-route shared components live in `src/components/<Name>/` with an `index.ts` barrel, imported via `@/components/<Name>` (e.g. `RunCostBadge`, `diff-viewer`). Vendored UI primitives (`Badge`, `CircularScore`) live in `src/vendor/ui` under `@devdigest/ui` — different home. Evidence: `client/src/components/RunCostBadge/`.
- **2026-06-14** — The PR-list table is driven by two parallel constants that MUST stay length-aligned: `COLUMN_KEYS` (header keys + order) and `GRID` (CSS grid-template tracks). Adding a column = add to both AND render a matching cell in `PRRow.tsx`, else header/cells misalign silently. Evidence: `client/src/app/repos/[repoId]/pulls/constants.ts`.
- **2026-06-14** — i18n has only the `en` locale (`client/messages/en/`); new UI strings need a key under the right namespace file (e.g. `prReview.json`, `runs.json`) read via `useTranslations("<ns>")`. A missing key renders the raw key, not an error.

## Tool & Library Notes

- **2026-06-23** — GitHub's REST API omits the `patch` field (`null`) for any file whose diff exceeds roughly 1,000 changed lines (e.g. a lock file with +4,000 lines). The `patch` column in `pr_files` is stored as `null` for these — don't treat it as a bug or a fetch failure. `parsePatch(null)` returns `[]`, which shows the "no diff" fallback. Correct UX: detect `patch == null` explicitly and offer a `githubBlobUrl(repoFullName, headSha, path)` deep-link instead. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/SmartDiffViewer/SmartDiffFileRow.tsx`, `server/src/modules/pulls/routes.ts:284`.

## Recurring Errors & Fixes

- **2026-06-23** — React warning "Updating a style property during rerender (`borderColor`) when a conflicting property is set (`borderLeftColor`) will act like the singular property is temporarily set to `null`" fires when a component toggles between **shorthand** (`borderColor`, `borderWidth`) and **longhand** (`borderLeftColor`, `borderLeftWidth`) properties on the same rerender. Fix: replace all shorthands with per-side longhands (`borderTopColor`, `borderRightColor`, `borderBottomColor`, `borderLeftColor` / `…Width`) — never mix the two in the same style object across conditional branches. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts`.

## Session Notes

### 2026-06-23
- Built Smart Diff feature (zero LLM cost): `SmartDiffViewer` component tree (`SmartDiffGroupSection`, `SmartDiffFileRow`, co-located `styles.ts` / `constants.ts`), `useSmartDiff` hook in `lib/hooks/reviews.ts`, `DiffTab` extended with smart/original toggle.
- Fixed `onFindingClick` to atomically set `?tab=findings&finding=:id` (single `URLSearchParams` mutation); fixed `setTab` to clear `?finding` and `?trace` transient params.
- Fixed React CSS shorthand/longhand conflict in `FindingCard/styles.ts` (all per-side longhands).
- Fixed core file rows not auto-expanding (`SmartDiffGroupSection` was hardcoding `defaultExpanded={false}`).
- Set wiring group default expansion to `true` (`SmartDiffViewer/constants.ts`).
- Added `githubBlobUrl` fallback link when `patch == null` (large files GitHub won't inline); threaded `repoFullName` + `headSha` through page → DiffTab → SmartDiffViewer → SmartDiffGroupSection → SmartDiffFileRow.

### 2026-06-21
- Built Conventions client UI: `lib/hooks/conventions.ts`, ConventionsView, ConventionCard (accept/reject/edit, "Accepted" badge, Create Skill CTA), CreateSkillModal (skill-draft pre-fill, Enabled toggle, Type side-by-side layout).
- Fixed `icon="Pencil"` → `icon="Edit"` in ConventionCard (Lucide alias mismatch).
- Fixed `useSetAgentSkills` `onSuccess` → `onSettled` (stale optimistic state on failed mutation).
- Added Conventions nav item + `g c` shortcut to `vendor/ui/nav.ts`.

### 2026-06-18
- Built Skills UI (L02): `lib/hooks/skills.ts`, `/skills` page + SkillsListView + SkillCard + ImportDrawer, `/skills/[id]` + SkillEditor with Config/Preview/Versions/Stats tabs, AgentEditor SkillsTab (HTML5 DnD reorder, checkbox link/unlink), nav SKILLS LAB section, i18n keys.
- Skills tab added to AgentEditor — both `constants.ts` (TABS) and `page.tsx` (VALID_TABS) updated.

## Open Questions
