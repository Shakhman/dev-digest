# Development Plan — Smart Diff

## 1. Goal & context

Replace the flat "Files changed" list with a **reviewer-ordered diff** that classifies each PR file as `core` / `wiring` / `boilerplate` and renders them in priority order. Core files expand by default so the reviewer's eye lands on business logic first; boilerplate is collapsed and skipped by default. When the latest review has run, findings are overlaid inline: a red dot on files that have issues, colored line badges (`blocker` / `warning` / `suggestion`) on specific lines, and a clickable "N findings" badge that deep-links into the Findings tab.

**Key principle:** no new LLM call during this step. Classification is deterministic (path patterns). Findings come from the already-persisted latest review. The `SmartDiff` Zod contract in `vendor/shared/contracts/brief.ts` and the `SmartDiffResponse` alias in `review-api.ts` are already defined in both vendor copies — no contract changes needed.

## 2. Affected packages & modules

- **Backend (`server/`)**: new module `modules/smart-diff/` (classifier + route), registration in `modules/index.ts`.
- **Frontend (`client/`)**: new `useSmartDiff` hook, new `SmartDiffViewer` component tree, toggle wired into `DiffTab`.
- **No DB migration** — reads from `pr_files` and `findings`, both already populated.
- **No vendor contract changes** — `SmartDiff` / `SmartDiffFile` / `SmartDiffGroup` / `SmartDiffRole` / `ProposedSplit` / `SmartDiffResponse` already exist in both copies.

## 3. Insights & constraints honored

- **Vendor copies are hand-maintained and must move in lock-step** — no new fields here, but if any ever change, edit both `server/src/vendor/shared/` and `client/src/vendor/shared/` (server `INSIGHTS.md:18`).
- **Module registration is static** — new `smart-diff` module needs one import + one entry in `server/src/modules/index.ts` (`CLAUDE.md`).
- **ESM** — every relative server import carries `.js`.
- **Icon names are aliases** — verify against `client/src/vendor/ui/icons.tsx` before using any icon; Lucide source names are not the same as the registry keys (client `INSIGHTS.md:22`).
- **No new tab → no VALID_TABS update needed** — the Smart Diff view lives inside the existing "Files changed" tab as a toggle (not a new tab). If a dedicated tab is ever added later, both `TABS` in `AgentEditor/constants.ts` and `VALID_TABS` in `page.tsx` must be updated (client `INSIGHTS.md:25`).
- **Finding deep-link pattern** — `?tab=findings&finding=:id` is already wired in `page.tsx` / `FindingsTab` / `ReviewRunAccordion` / `FindingsPanel` (client `INSIGHTS.md:20`). The SmartDiffViewer reuses it.
- **All client API access goes through `src/lib/api.ts`** (client `CLAUDE.md`).
- **Contracts come from `@devdigest/shared`** — never hand-duplicate types on the client (client `CLAUDE.md`).
- **`pseudocode_summary` is `nullish()`** in the Zod schema — the route always returns `null` (no LLM call); UI null-gates the "What this does" row and the `% summary` badge.

## 4. Architecture / flow

```
GET /pulls/:id/smart-diff
  │
  ├─ workspace guard (same pattern as /pulls/:id)
  ├─ load pr_files from DB
  ├─ load latest review findings from DB (optional — skipped if no review yet)
  ├─ classifyFile(path) for each file → { core[], wiring[], boilerplate[] }
  └─ return SmartDiff {
       groups: [core, wiring, boilerplate]  (empty groups omitted, canonical order)
       split_suggestion: { too_big, total_lines, proposed_splits: [] }
     }

Client (DiffTab)
  ├─ useSmartDiff(prId)        → SmartDiff | undefined
  ├─ viewMode: 'smart'|'original'   (default 'smart' when data available)
  ├─ toggle in SectionLabel right slot
  ├─ 'smart'    → <SmartDiffViewer smartDiff reviews onFindingClick />
  └─ 'original' → existing <DiffViewer />
```

## 5. Backend tasks

### 5.1 `server/src/modules/smart-diff/constants.ts`

Two regex arrays and one threshold:

```ts
// First-match wins; order matters — boilerplate checked before wiring.
export const BOILERPLATE_PATTERNS: RegExp[] = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /bun\.lockb$/,
  /\.snap$/,
  /^dist\//,
  /^build\//,
  /^\.next\//,
  /^coverage\//,
  /generated\//,
  /\.min\.(js|css)$/,
];

export const WIRING_PATTERNS: RegExp[] = [
  /(^|\/)index\.(ts|tsx|js|jsx)$/,
  /\.(config|cfg)\.(ts|js|mjs|cjs)$/,
  /tsconfig.*\.json$/,
  /^\.env/,
  /Dockerfile/,
  /docker-compose/,
  /(^|\/)server\.(ts|js)$/,
  /(^|\/)app\.(ts|js)$/,
  /(^|\/)routes?\.(ts|js)$/,
  /\.json$/,
];

export const SPLIT_TOO_BIG_LINES = 400;
```

### 5.2 `server/src/modules/smart-diff/classifier.ts`

```ts
import type { SmartDiffRole } from '@devdigest/shared';
import { BOILERPLATE_PATTERNS, WIRING_PATTERNS } from './constants.js';

export function classifyFile(path: string): SmartDiffRole {
  if (BOILERPLATE_PATTERNS.some((p) => p.test(path))) return 'boilerplate';
  if (WIRING_PATTERNS.some((p) => p.test(path))) return 'wiring';
  return 'core';
}
```

### 5.3 `server/src/modules/smart-diff/routes.ts`

Route: `GET /pulls/:id/smart-diff` → `SmartDiff`

Steps:
1. `getContext` + workspace guard — same `pullRequests` query as `GET /pulls/:id`.
2. `SELECT * FROM pr_files WHERE pr_id = pr.id`.
3. Latest review findings (optional):
   - `SELECT * FROM reviews WHERE pr_id = pr.id AND kind = 'review' ORDER BY created_at DESC LIMIT 1`
   - If found: `SELECT * FROM findings WHERE review_id = latestReview.id`
   - Build `Map<filePath, number[]>` of start-line numbers per file.
4. Classify each file → accumulate into `groups: Record<SmartDiffRole, SmartDiffFile[]>` and `totalLines`.
5. Return:
   ```ts
   {
     groups: (['core', 'wiring', 'boilerplate'] as SmartDiffRole[])
       .filter((role) => groups[role].length > 0)
       .map((role) => ({ role, files: groups[role] })),
     split_suggestion: {
       too_big: totalLines > SPLIT_TOO_BIG_LINES,
       total_lines: totalLines,
       proposed_splits: [],
     },
   }
   ```
   Each `SmartDiffFile`: `{ path, pseudocode_summary: null, additions, deletions, finding_lines }`.

### 5.4 Register in `server/src/modules/index.ts`

```ts
import smartDiff from './smart-diff/routes.js';
// …
export const modules = { …, smartDiff };
```

## 6. Frontend tasks

### 6.1 `useSmartDiff` hook — `client/src/lib/hooks/reviews.ts`

```ts
export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ['smart-diff', prId],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
```

### 6.2 `SmartDiffViewer` component tree

Location: `client/src/app/repos/[repoId]/pulls/[number]/_components/SmartDiffViewer/`

| File | Responsibility |
|---|---|
| `SmartDiffViewer.tsx` | Root — "REVIEWER-ORDERED DIFF" header, total stats, iterates groups |
| `SmartDiffGroupSection.tsx` | One role section — colored dot + role label + subtitle + file count chip + file list |
| `SmartDiffFileRow.tsx` | One file — collapse/expand chevron, file-type icon, path, findings dot, `% summary` badge (null-gated), +/- stats; expanded: "What this does" (null-gated) + inline diff with finding line highlights + per-line severity badges |
| `constants.ts` | Role metadata: `{ core: { label: 'Core logic', subtitle: 'The substance of the change — review closely', color: 'var(--ok)' }, wiring: { label: 'Wiring', subtitle: 'Hooks the core into the app', color: 'var(--warn)' }, boilerplate: { label: 'Boilerplate', subtitle: 'Generated / mechanical — skim', color: 'var(--text-muted)' } }` |
| `styles.ts` | Style objects |
| `index.ts` | Barrel re-export |

**Props:**
```ts
interface SmartDiffViewerProps {
  smartDiff: SmartDiff;
  // Reviews already fetched in page.tsx; used to cross-reference severity by file+line.
  reviews: ReviewRecord[];
  onFindingClick: (findingId: string) => void; // → ?tab=findings&finding=:id
}
```

**Expand/collapse defaults:** `core` → expanded, `wiring` → collapsed, `boilerplate` → collapsed.

**Finding line highlights:** build `Map<filePath, FindingRecord[]>` from the latest `ReviewRecord`'s findings. `SmartDiffFileRow` receives the findings for its file, colors diff lines by severity: blocker → `var(--bad)`, warning → `var(--warn)`, suggestion → `var(--ok)`. Clicking an inline badge calls `onFindingClick(finding.id)`.

**"N findings" badge on collapsed file row:** render when `file.finding_lines.length > 0`; clicking expands the file.

**`pseudocode_summary`:** null in phase 1 — `% summary` badge and "What this does" row are null-gated and not rendered.

### 6.3 DiffTab integration — `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`

New props:
```ts
reviews: ReviewRecord[];
onFindingClick: (findingId: string) => void;
```

Changes:
- Call `useSmartDiff(prId)` inside the component.
- Add `viewMode: 'smart' | 'original'` local state, default `'smart'` when `smartDiff` data is present.
- In `SectionLabel right` slot: render a two-button toggle "Smart order" / "Original order" only when `smartDiff` is available.
- Render `<SmartDiffViewer>` when `viewMode === 'smart' && smartDiff`, else existing `<DiffViewer>`.

### 6.4 Wiring in `page.tsx`

Pass new props to `DiffTab`:
```tsx
<DiffTab
  prId={prId}
  filesCount={pr.files_count}
  files={pr.files}
  canComment={pr.status === 'open'}
  reviews={runs}
  onFindingClick={(id) => setParam('finding', id)}
/>
```

## 7. Done-when criteria

- `GET /pulls/:id/smart-diff` returns valid `SmartDiff` JSON: files classified, groups in canonical order, empty groups omitted, `finding_lines` populated from the latest review when one exists, `null` when no review yet.
- "Files changed" tab shows "Smart order" / "Original order" toggle when smart-diff data loads.
- Smart order: three sections with correct expand/collapse defaults; core files expanded by default, wiring and boilerplate collapsed.
- Files with findings: red dot on the file row + inline line highlights colored by severity.
- Clicking an inline finding badge navigates to `?tab=findings&finding=:id` and focuses that finding.
- "N findings" badge on a collapsed file row expands it on click.
- Original order toggle restores the existing `DiffViewer` unchanged.
- No LLM calls, no DB migrations, no new vendor contract fields.
