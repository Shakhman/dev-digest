# Development Plan — Blast Radius (L04): PR Impact Map

> **As-built (2026-06-28) — supersedes the planned UI/LLM details below.**
> Two intentional deviations were made to match the supplied UI screenshot and
> keep the feature deterministic:
> 1. **Rendered as a panel inside the Overview tab** (right column, beside the
>    Intent card) — `BlastCard`, not a separate "Blast" tab. The screenshot
>    shows BLAST RADIUS as an Overview card, so there is no tab/`PrDetailHeader`
>    change.
> 2. **Zero model calls.** The screenshot shows no summary paragraph and the
>    acceptance criteria bless "zero model calls", so the optional LLM summary
>    and the `'blast_summary'` feature-model registration were **dropped**. The
>    route is a pure `repoIntel.getBlastRadius` read.
>
> The contract that shipped is `BlastMap` (a per-symbol **tree**, names prefixed
> `BlastMap*` to avoid clashing with `brief.ts`'s existing `BlastRadius`/
> `BlastCaller`/`ChangedSymbol` exports), not the flat shape sketched in §5.
> Files that shipped:
> - `server/src/vendor/shared/contracts/blast.ts` + `client/.../contracts/blast.ts` (mirrored) + both barrels
> - `server/src/modules/blast/routes.ts` (`GET /pulls/:id/blast`) + one line in `modules/index.ts`
> - `client/src/lib/hooks/reviews.ts` (`useBlast`)
> - `client/.../_components/BlastCard/{BlastCard.tsx,styles.ts,index.ts}` rendered from `OverviewTab` (+ `page.tsx` passes `repoFullName`/`headSha`)
> - Tests: `server/test/blast.it.test.ts` (4) · `client/.../BlastCard/BlastCard.test.tsx` (4)
> - Architecture doc: `server/docs/blast-radius.md`

## 1. Goal & context
Add a PR **impact map** ("Blast Radius") that, for a given PR, shows which symbols in the changed files were touched, who calls them (file:line, ranked), and which HTTP endpoints + crons are reachable — read **entirely** from the pre-built repo-intel index via `container.repoIntel.getBlastRadius(...)`. Steps 1–3 (changed symbols → ranked callers → reachable endpoints/crons) already exist inside the facade; this feature only *reads* that result, exposes it over one route, renders it as a "Blast" tab, and adds the feature's single permitted model token: one optional "explain this map in a paragraph" `complete()` call, gated so it never fires on empty/degraded data.

## 2. Affected packages & modules
- **Backend** — package `server/`: new module `modules/blast/` (route `GET /pulls/:id/blast`); one line in `server/src/modules/index.ts:27`; new contract `server/src/vendor/shared/contracts/blast.ts` + barrel entry in `server/src/vendor/shared/index.ts`. No `reviewer-core/` changes (LLM reached via the `LLMProvider` port). No new DB table/migration (read-only).
- **Frontend** — package `client/`: mirror contract `client/src/vendor/shared/contracts/blast.ts` + barrel entry; new `useBlast` hook in `client/src/lib/hooks/reviews.ts`; new "Blast" tab in `PrDetailHeader.tsx` + `page.tsx`; new `BlastTab` component tree under `client/src/app/repos/[repoId]/pulls/[number]/_components/`.
- **Other** — none. No `e2e/` change required (acceptance covered by backend `.it.test.ts` + client RTL). Two markdown docs (§ deliverables).

## 3. Insights & constraints honored
- **repo-intel is reached ONLY through `container.repoIntel.*`** — never the pipeline/adapters. Source: `server/CLAUDE.md`, `onion-architecture` (known exception list). The route reads `container.repoIntel.getBlastRadius(repoId, changedFiles)` and re-shapes; it must not import `repo-intel` internals or `codeIndex`/`astgrep`.
- **Context enrichment is best-effort: on error/unindexed, omit/degrade, never throw.** Source: `server/CLAUDE.md`. `getBlastRadius` already returns `{ degraded:true, reason:'no_data' }` instead of throwing (`service.ts:228-234`); the route surfaces that, the optional LLM call is wrapped in try/catch.
- **New feature = new module + one line in `modules/index.ts`.** Source: `server/CLAUDE.md`, `modules/index.ts:17-26`. Copy `smart-diff/routes.ts` shape exactly.
- **Shared contracts are TWO hand-maintained vendor copies** (`server/src/vendor/shared/` + `client/src/vendor/shared/`), resolved by tsconfig alias, NOT auto-synced; edit both in lock-step. Source: `server/INSIGHTS.md` 2026-06-14, `client/CLAUDE.md`. Add `blast.ts` to both + barrel both `index.ts`.
- **`setParam` is not batch-safe; stale `?finding`/`?trace` cause tab redirect loops** — `setTab` already clears them (`page.tsx:74-80`). Source: `client/INSIGHTS.md` 2026-06-23. Adding a `"blast"` tab requires no new param logic — it flows through the existing `setTab`.
- **`@devdigest/ui` icons are aliased; a wrong name silently renders nothing (or TS-errors).** Source: `client/INSIGHTS.md` 2026-06-18/21. Verify the Blast tab icon name against `client/src/vendor/ui/icons.tsx` (the `Tabs` config at `PrDetailHeader.tsx:115-118` uses `"FileText"`, `"AlertOctagon"`, `"Code"`).
- **i18n has only `en`; a missing key renders the raw key.** Source: `client/INSIGHTS.md`. Any new visible strings need keys under the right namespace.
- **DeepSeek on OpenRouter ignores strict json_schema** — irrelevant here because the summary uses plain `complete()` (free-text), not `completeStructured`. Source: `server/INSIGHTS.md` 2026-06-21.
- **Adding a required field to a Zod contract breaks inline fixtures** in `server/test/contracts.test.ts`. Source: `server/INSIGHTS.md`. New contract is additive (new file) so no existing fixture breaks; still add a parse fixture for the new schema.

## 4. Architecture / flow

The heavy lifting already exists in the facade. The new code is a thin read + optional summary.

```mermaid
sequenceDiagram
    participant UI as Blast tab (client)
    participant API as GET /pulls/:id/blast
    participant Facade as container.repoIntel
    participant LLM as container.llm('openai').complete
    UI->>API: fetch (React Query, key ["pr-blast", prId])
    API->>API: resolve PR (workspace-scoped) + load t.prFiles
    API->>Facade: getBlastRadius(repoId, changedFiles)
    Facade-->>API: BlastResult { changedSymbols, callers, impactedEndpoints, factsByFile?, degraded, reason }
    API->>API: derive state: empty | degraded | ok
    alt state == 'ok' (real data)
        API->>LLM: complete(one paragraph prompt)  [try/catch]
        LLM-->>API: text  (or null on failure)
    else empty OR degraded
        Note over API,LLM: LLM is NEVER called (zero tokens)
    end
    API-->>UI: BlastMap { state, changed_symbols, downstream[], endpoints, crons, summary, degraded_reason }
    UI->>UI: render levels; caller file:line → githubBlobUrl(repoFullName, head_sha, file, line)
```

**State derivation (single source of truth, computed in the route):**

| Condition (from `BlastResult`) | `state` | Badge / UI | LLM `complete` called? |
|---|---|---|---|
| `degraded === false` AND `changedSymbols.length > 0` | `"ok"` | none (full map) | **yes** (try/catch → `summary: null` on failure) |
| `degraded === false` AND `changedSymbols.length === 0` | `"empty"` | empty state ("No indexed symbols in the changed files") | **no** |
| `degraded === true` (`reason: 'no_data' \| 'flag_off' \| …`) | `"degraded"` | warning badge + explanation, plus any partial data the facade returned | **no** |

Note the facade can return `degraded:true` *with* partial `changedSymbols`/`callers` (ripgrep fallback path, `service.ts:297-303` — `rank:0`, no `factsByFile`). Render that partial data **under the degraded badge** — never blank.

## 5. Backend tasks

- **T-B1: Add the `BlastMap` Zod contract (lock-step, both vendor copies)**
  - Files: create `server/src/vendor/shared/contracts/blast.ts`; add `export * from './contracts/blast.js';` to `server/src/vendor/shared/index.ts`. (Client copy is T-U1 — keep both diffs identical except comments.)
  - Interfaces/contracts — new file mirrors the `BlastResult` facade shape (`repo-intel/types.ts:74`) but client-facing and self-describing. Reuse the *names* but a fresh schema (do NOT reuse `brief.ts`'s `BlastRadius`, which is the LLM-structured brief variant — different shape: `downstream[].crons_affected`, `summary` required):
    ```ts
    import { z } from 'zod';
    export const BlastState = z.enum(['ok', 'empty', 'degraded']);
    export const BlastChangedSymbol = z.object({ file: z.string(), name: z.string(), kind: z.string() });
    export const BlastCallerRef = z.object({
      file: z.string(), symbol: z.string(), via_symbol: z.string(),
      line: z.number().int(), rank: z.number(),
    });
    export const BlastMap = z.object({
      state: BlastState,
      changed_symbols: z.array(BlastChangedSymbol),
      callers: z.array(BlastCallerRef),
      endpoints: z.array(z.string()),          // "METHOD /path"
      crons: z.array(z.string()),
      summary: z.string().nullable(),          // the ONE optional LLM paragraph; null when absent/failed/not-ok
      degraded_reason: z.string().nullable(),  // mirrors BlastResult.reason; null when state !== 'degraded'
    });
    export type BlastMap = z.infer<typeof BlastMap>; // + export each sub-type via z.infer
    ```
  - Skills to apply: `zod` (`type-export-schemas-and-types`, `schema-use-enums`, `object-optional-vs-nullable` — prefer explicit `.nullable()` over `.optional()` so the client always receives the keys), `api-contract-review` (response-schema consistency — additive new route, no break), `typescript-expert`.
  - Done when: both `blast.ts` files exist and are byte-identical (modulo comments); both barrels export them; `npm run typecheck` (server) resolves `BlastMap` from `@devdigest/shared`.

- **T-B2: Create the `blast/` module + route `GET /pulls/:id/blast`**
  - Files: create `server/src/modules/blast/routes.ts` (default Fastify plugin); register in `server/src/modules/index.ts` — add `import blast from './blast/routes.js';` and a `blast,` entry to the `modules` record (`index.ts:27-39`).
  - Interfaces/contracts — copy `smart-diff/routes.ts` structure verbatim:
    1. `withTypeProvider<ZodTypeProvider>()`, `const { container } = app`.
    2. `app.get('/pulls/:id/blast', { schema: { params: IdParams, response: { 200: BlastMap } } }, async (req): Promise<BlastMap> => { … })`. (Adding the `response` schema is the `fastify-best-practices` serialization win — smart-diff omits it; do it here.)
    3. `const { workspaceId } = await getContext(container, req)` (`_shared/context.js`).
    4. Resolve PR workspace-scoped via `t.pullRequests` (`and(eq(workspaceId), eq(id))`); `throw new NotFoundError(...)` if absent.
    5. Load changed files: `await container.db.select({ path: t.prFiles.path }).from(t.prFiles).where(eq(t.prFiles.prId, pr.id))` → `changedFiles: string[]`.
    6. `const blast = await container.repoIntel.getBlastRadius(pr.repoId, changedFiles)` (confirm the FK column name on `pullRequests` — `pr.repoId`).
    7. Derive `state` per the §4 matrix. Flatten endpoints/crons: prefer `blast.factsByFile` for crons (only present on the non-degraded path) — `crons = unique(values(factsByFile).flatMap(f => f.crons))`; `endpoints = blast.impactedEndpoints`.
    8. Map `callers` from `blast.callers` (`file, symbol, viaSymbol→via_symbol, line, rank`).
    9. The single LLM call (T-B3) only when `state === 'ok'`; else `summary = null`.
    10. Return the `BlastMap` object.
  - Skills to apply: `fastify-best-practices` (`routes` — thin handler, no logic/SDK; `schemas`/`serialization` — response schema; `testing`), `onion-architecture` (route → facade only; never import `repo-intel` internals or `codeIndex`), `drizzle-orm-patterns` (read-only scoped selects), `security` (A01 — workspace-scoped resolve via `getContext`; deny cross-tenant), `api-contract-review`, `typescript-expert`.
  - Done when: `GET /pulls/:id/blast` returns a valid `BlastMap` for a seeded PR; cross-workspace id 404s; an unindexed repo returns `state:'degraded'` without throwing; route appears in `routes-smoke.test.ts` coverage.

- **T-B3: Gate the single optional "explain this map" `complete()` call**
  - Files: `server/src/modules/blast/routes.ts` (a small local helper `summarizeBlast(container, workspaceId, map)`; optionally `server/src/modules/blast/constants.ts` for the prompt + token cap).
  - Interfaces/contracts:
    - **Only when `state === 'ok'`.** Build a compact text prompt from `changed_symbols` + top callers + endpoints/crons; cap input (e.g. slice callers to the top ~20 by rank — they're already capped at `MAX_CALLERS_PER_SYMBOL` and rank-sorted in the facade, `service.ts:372,386`).
    - Resolve model via `resolveFeatureModel(container, workspaceId, 'blast_summary')` (registry default) — see model decision below. Then `const llm = await container.llm(provider as Provider); const res = await llm.complete({ model, messages:[…], temperature:0.2, maxTokens: <small>, timeoutMs: <short> })`. Signature: `LLMProvider.complete(req: CompletionRequest): Promise<CompletionResult>` (`adapters.ts:85`, result `.text` at `:43-49`).
    - **Wrap in try/catch → `summary = null` on any failure** (best-effort; never fail the route).
    - **Free-text `complete()`, not `completeStructured`** — avoids the DeepSeek strict-json gotcha (`server/INSIGHTS.md` 2026-06-21).
  - **Model registration decision (recommend):** add a new `'blast_summary'` id to `FeatureModelId` (`platform.ts:15-21`, both vendor copies) **and** a `FEATURE_MODELS` registry entry with an **OpenAI-family default** (e.g. `defaultProvider:'openai'`, a cheap model), mirroring `review_intent`. Rationale: it makes the model selectable per-workspace like every other LLM feature, and routing through `resolveFeatureModel` is the established pattern (`intent-step.ts:224`, `conventions/extractor.ts:84`). This is a contract change to `FeatureModelId` — additive enum value, backward-compatible (`api-contract-review`).
  - **Caching the summary by `(prId, head_sha)` — recommend NO new persistence for L04.** The course constraint is "almost no AI / one optional call." Adding a DB table/migration to cache one paragraph contradicts "read entirely from the index" and adds onion/migration surface for marginal benefit. Instead cache at the **client** layer via React Query (`staleTime`/`gcTime` keyed by `["pr-blast", prId]`) so re-opening the tab in a session doesn't re-call. If a future lesson wants cross-session caching, the clean place is a `repo-intel`-style cache table keyed by `(pr_id, head_sha)`; note it as an Open Question, do not build it now. (Document this decision in the architecture doc.)
  - Skills to apply: `onion-architecture` (LLM via the `LLMProvider` port, never an SDK), `security` (A10 fail-closed for *auth* but fail-**soft** for enrichment — catch → null, never leak provider errors to the client; ASI: the prompt is built from index-derived symbol/endpoint strings, not free user input, so low injection risk — still bound length), `typescript-expert`, `fastify-best-practices`.
  - Done when: with real data the response carries a non-null `summary`; with `state` `empty`/`degraded` the LLM is provably **not** invoked (asserted in T-B6); an LLM throw yields `summary:null` and HTTP 200.

## 6. UI tasks

- **T-U1: Mirror the `blast.ts` contract on the client**
  - Files: create `client/src/vendor/shared/contracts/blast.ts` (identical to T-B1); add the barrel export to `client/src/vendor/shared/index.ts`; if T-B3 adds `'blast_summary'` to `FeatureModelId`, mirror that edit in `client/src/vendor/shared/contracts/platform.ts` too.
  - Component/route/data flow: types only — consumed by the hook and components below.
  - Skills to apply: `zod`, `typescript-expert`. (Constraint: `client/CLAUDE.md` — never hand-duplicate types; they come from `@devdigest/shared`.)
  - Done when: `import type { BlastMap } from "@devdigest/shared"` resolves on the client; both copies identical.

- **T-U2: Add `useBlast` data hook**
  - Files: extend `client/src/lib/hooks/reviews.ts` (next to `useSmartDiff` at `:91-95`).
  - Component/route/data flow: `export function useBlast(prId) { return useQuery({ queryKey: ["pr-blast", prId], queryFn: () => api.get<BlastMap>(\`/pulls/${prId}/blast\`), enabled: !!prId, staleTime: 5*60_000 }); }` — mirrors `useSmartDiff` exactly (same `api.get` path through `client/src/lib/api.ts`). `staleTime` provides the in-session summary cache (T-B3 decision).
  - Skills to apply: `react-best-practices` (data fetching in a hook, not component body), `frontend-architecture` (hook colocated in `lib/hooks`), `next-best-practices`, `typescript-expert`.
  - Done when: `useBlast(prId)` returns `{ data, isLoading, isError }` typed as `BlastMap`.

- **T-U3: Add the "Blast" tab to the header + page**
  - Files: `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx` (add a tab entry to the `Tabs` config at `:115-118`); `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (add `{tab === "blast" && <BlastTab … />}` next to the existing `tab === "diff"` block at `:179-199`).
  - Component/route/data flow: new tab `{ key: "blast", label: "Blast radius", icon: <verify in icons.tsx> }`. Pass `prId`, `repoFullName` (`page.tsx:94`), `headSha={pr.head_sha}` (already passed to `DiffTab`/`FindingsTab`) into `BlastTab`. No new URL-param logic — the existing `setTab` (`page.tsx:74-80`) already clears `?finding`/`?trace`.
  - Skills to apply: `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`. Honor `client/INSIGHTS.md`: verify icon name in `client/src/vendor/ui/icons.tsx`; if the tab needs a `count`, follow the `findingsCount || undefined` pattern.
  - Done when: a "Blast radius" tab renders, switching to it shows `BlastTab`, and switching away clears transient params.

- **T-U4: Build the `BlastTab` component tree (levels + states)**
  - Files: create `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastTab/` — `BlastTab.tsx` (container; calls `useBlast`, handles loading/error/empty/degraded/ok), child presentational pieces (`ChangedSymbolsList`, `CallersList`, `EndpointsList`) + co-located `styles.ts`/`constants.ts` + `index.ts` barrel (mirror the `SmartDiffViewer/` layout).
  - Component/route/data flow — three levels top-to-bottom: **changed symbols → callers → affected endpoints + crons**. State handling (mirror `react-testing-library` matrix + `react-best-practices` early-returns):
    - `isLoading` → `Skeleton`; `isError` → `ErrorState`.
    - `state === 'empty'` → empty-state message, no LLM summary, no badge.
    - `state === 'degraded'` → a **Badge** explaining the degraded `degraded_reason` (e.g. "Index not built — showing best-effort results" / "no_data"), then render whatever partial `changed_symbols`/`callers` exist below it. Never blank.
    - `state === 'ok'` → render `summary` paragraph (if non-null) above the three levels.
    - **Caller file:line is a link** → `githubBlobUrl(repoFullName, headSha, caller.file, caller.line)` (`client/src/lib/github-urls.ts:35`), opened in a new tab (`target="_blank" rel="noopener noreferrer"`). Guard for `repoFullName == null` (disable link). This satisfies the "clicking a caller opens the code at that line" acceptance criterion.
  - Skills to apply: `react-best-practices` (early-return state machine, derive-don't-store, no inline arrays/objects in JSX, PascalCase components), `frontend-architecture` (feature-colocated component tree, SRP split), `next-best-practices`, `security` (A05 — anchor `href` is a `github.com` URL built by a trusted helper from server data, not raw user input; still keep `rel="noopener noreferrer"`), `typescript-expert`. i18n: add any new visible strings as keys.
  - Done when: the tab renders all three levels for `state:'ok'`; degraded shows a badge + partial data; empty shows the empty message; clicking a caller opens the correct `github.com/.../blob/<head_sha>/<file>#L<line>` URL.

## 7. Parallelization split
- **Shared/sequenced (must land first):** **T-B1** (server `blast.ts` contract) and **T-U1** (client `blast.ts` mirror) define the wire shape both sides depend on. Land the `BlastMap` shape (and the `'blast_summary'` `FeatureModelId` addition, if taken) in lock-step **before** splitting. After that, backend and UI proceed independently on disjoint files.
- **Backend implementer owns:** T-B2, T-B3 (package `server/`; files: `modules/blast/*`, `modules/index.ts`, `vendor/shared/index.ts`, `vendor/shared/contracts/{blast,platform}.ts` server copy, `feature-models`/`FEATURE_MODELS` registry). No `reviewer-core/` edits.
- **UI implementer owns:** T-U2, T-U3, T-U4 (package `client/`; files: `lib/hooks/reviews.ts`, `page.tsx`, `PrDetailHeader.tsx`, `_components/BlastTab/*`, `vendor/shared/contracts/{blast,platform}.ts` client copy + barrel).
- The two never edit the same file (the only shared *content* is the two `blast.ts`/`platform.ts` copies, owned one-per-package).

## 8. Out of scope
- Re-implementing changed-symbols / caller-finding / endpoint traversal — **done in the facade** (`getBlastRadius`); the module only reads it.
- Building or refreshing the repo-intel index (covered by `repo-intel`'s `indexRepo`/`refreshIndex` + `POST /repos/:id/resync`).
- Persisting/caching the LLM summary in Postgres (no new table/migration in L04 — see T-B3 decision; client React-Query cache only).
- Any second LLM call or `completeStructured`; any change to `reviewer-core/`.
- An `e2e/` Playwright test (acceptance is met by backend `.it.test.ts` + client RTL).
- Reusing/altering `brief.ts`'s `BlastRadius` contract (a different, LLM-structured shape — left untouched).

## 9. End-to-end verification

**Existing suites that must stay green** *(as-built — corrected)*
- Server: `cd server && npm run typecheck && npm test`. **There is no `depcruise` / arch-gate script in this starter** (the `onion-architecture` skill ships one, but it isn't wired here). The facade rule is upheld by inspection instead: the module imports only `@devdigest/shared`, the db schema, `_shared`, `platform/errors`, and reads `container.repoIntel`.
- Client: `cd client && npm run typecheck && npm test`.

**New behavior proven by** *(as-built — corrected)*
- **Backend `server/test/blast.it.test.ts`** (real Postgres via `startPg`/`seed`, gated by `dockerAvailable()`). **No `MockLLMProvider` — the test injects a stub facade via `buildApp({ overrides: { repoIntel: stubRepoIntel(result) } })`** (`ContainerOverrides.repoIntel`, `container.ts:51`), so no real index is needed and the `BlastResult` is controlled directly. 4 tests:
  1. **ok** — stub returns symbols + 2 callers + `factsByFile` → `state:'ok'`, callers grouped under `rateLimit`, rank-sorted (`index.ts` before `webhooks.ts`), endpoints/crons attributed, counts correct.
  2. **empty** — symbols present but zero callers → `state:'empty'`, no symbols.
  3. **degraded** — `degraded:true, reason:'no_data'` with one caller, no `factsByFile` → HTTP 200, `state:'degraded'`, `degraded_reason:'no_data'`, partial data still rendered, never throws.
  4. **tenancy** — unknown PR id → 404.
- **Client RTL `BlastCard.test.tsx`** (mocks `useBlast` via `vi.mock`; no MSW), 4 tests:
  1. **ok** — tree renders → caller anchor `href === githubBlobUrl(repoFullName, head_sha, file, line)` and `target="_blank"` (proves "opens code at that line").
  2. **no repo/sha** — caller degrades to plain text, not a link.
  3. **degraded** — badge shown + partial data (never blank).
  4. **empty** — empty-state message; no caller rows.

## 10. Markdown deliverables (acceptance: "Both Markdown documents exist")
Create both (per project convention — spec/acceptance live in `server/specs/`, deep-dives in `server/docs/`):
1. **Spec / acceptance** — `server/specs/blast-radius.md` (this document): feature summary, the `GET /pulls/:id/blast` contract, the `BlastMap` shape, the state matrix (ok/empty/degraded), and the acceptance-criteria checklist below.
2. **Feature / architecture doc** — `server/docs/blast-radius.md` (or `client/docs/`): the flow diagram from §4, the "read entirely through the facade" decision, the single-gated-LLM-call design + the **no-Postgres-cache** decision (client React-Query cache instead) and the future `(pr_id, head_sha)` cache as an Open Question.

## 11. Acceptance-criteria → coverage traceability

| # | Acceptance criterion | Implemented by | Verified by |
|---|---|---|---|
| AC1 | Clicking a caller (file:line) opens the code at that line | T-U4 (`githubBlobUrl(repoFullName, head_sha, file, line)`, new tab) | RTL ok-test asserts the `href` + `target` |
| AC2 | Responds quickly enough | T-B2 reads pre-built index via facade (no request-time analysis on the persistent path); T-B3 caps LLM input + short timeout; T-U2 React-Query `staleTime` | manual/backend timing; facade persistent path does no clone parse (`service.ts:315-391`) |
| AC3 | No LLM call beyond ≤1 optional summary; **zero** when no data | summary **dropped** → the route makes **zero** model calls in all states | route has no `container.llm` reference at all |
| AC4 | Empty state shown when there is no data | `state:'empty'`; `BlastCard` empty-state UI | backend empty-path test; RTL empty-test |
| AC5 (impl.) | Degraded/partial shows a badge + explanation, never blank | `state:'degraded'` + `degraded_reason`; `BlastCard` badge + partial render | backend degraded test; RTL degraded-test |
| AC6 | Both Markdown documents exist (spec + feature/arch) | `server/specs/blast-radius.md` + `server/docs/blast-radius.md` | files present in the diff |
| (impl.) | Reads ENTIRELY through `repoIntel.*` (no pipeline/SDK) | facade-only read | by inspection (no arch-gate script in starter) |

---

## Key files referenced
- Facade: `server/src/modules/repo-intel/service.ts` (`getBlastRadius` :220; persistent path :315-391; degraded shape :228-234, :297-303)
- Facade types: `server/src/modules/repo-intel/types.ts:74` (`BlastResult`)
- Module template: `server/src/modules/smart-diff/routes.ts`
- Module registry: `server/src/modules/index.ts:27`
- LLM port: `server/src/vendor/shared/adapters.ts:82` (`complete` :85, `CompletionResult` :43)
- LLM call pattern: `server/src/modules/reviews/intent-step.ts:224-225`; model resolution `server/src/modules/settings/feature-models.ts:50`; `FeatureModelId` `server/src/vendor/shared/contracts/platform.ts:15`
- Contract home: `server/src/vendor/shared/contracts/brief.ts` (existing `BlastRadius` — do NOT reuse) + `server/src/vendor/shared/index.ts`; client mirror dir `client/src/vendor/shared/contracts/`
- Client page/tabs: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (tab dispatch :149-199, `head_sha`/`repoFullName` :94,162) + `.../PrDetailHeader/PrDetailHeader.tsx:115`
- Client hook/api: `client/src/lib/hooks/reviews.ts:91` (`useSmartDiff`) + `client/src/lib/api.ts`
- Deep-link helper: `client/src/lib/github-urls.ts:35` (`githubBlobUrl`)
- Test harness: `server/test/reviews.it.test.ts:113` (buildApp + llm override), `server/test/helpers/pg.ts`, mock `server/src/adapters/mocks.ts:58` (`MockLLMProvider.calls` :60)

> **Assumption to confirm before coding:** the `pull_requests` → repo FK column is `pr.repoId` (used to call `getBlastRadius(pr.repoId, …)`); confirm the exact column name on `t.pullRequests` in `server/src/db/schema.ts`. — *Confirmed correct during implementation.*

---

## 12. Post-implementation amendments — what the plan missed

Recorded after building (2026-06-28). The §§ above are kept for history; these are
the corrections.

### A. Contract-naming collision the plan would have caused
§5 (T-B1) said "reuse the *names* but a fresh schema." That would have **broken
the build**: the shared barrel (`vendor/shared/index.ts`) re-exports every
contract with `export *`, and `brief.ts` already exports `BlastCaller`,
`ChangedSymbol`, `DownstreamImpact`, `BlastRadius`. The new contract had to use
distinct names — shipped as `BlastMap` / `BlastMapNode` / `BlastMapCaller` /
`BlastMapState`. **Rule for future contracts:** `grep "export const" vendor/shared/contracts/*.ts`
before naming. (Also captured in `server/INSIGHTS.md`.)

### B. UI is an Overview panel, not a tab — extra wiring the plan didn't list
The screenshot put BLAST RADIUS in the Overview right column, so the tab-based
tasks (T-U3 PrDetailHeader, the `page.tsx` `tab === "blast"` block) were **not**
needed. Instead the panel required edits the plan never mentioned:
- `OverviewTab` got a **2-column grid** (`twoCol` style) and two **new props**
  (`repoFullName`, `headSha`) — which had to be threaded from `page.tsx`.
- `BlastCard` is rendered by `OverviewTab`, full-width when no Intent exists.

### C. Contract shape is a tree, not flat
§5 sketched flat `callers[]` / `endpoints[]` / `crons[]`. The screenshot groups
callers + endpoints + crons **under each changed symbol**, so the shipped
`BlastMap.symbols[]` is a tree (callers grouped by `viaSymbol`; a symbol's
endpoints/crons = union of `factsByFile` for its caller files). Two derivation
rules the plan didn't specify, decided during build:
- **Only symbols with ≥1 caller are shown** (impact, not noise); `symbol_count`
  reflects the filtered list.
- **Header counts are global & deduped**, not the sum of per-symbol counts (the
  screenshot's "14 callers" vs per-node "4/2" confirms global counts; per-symbol
  rows show their own length).

### D. The LLM summary was dropped (zero tokens)
§5 (T-B3) + the `'blast_summary'` `FeatureModelId` registration were **not built**:
the screenshot shows no summary and AC3 allows "zero model calls." Net effect —
the feature touches `container.llm` **nowhere**, which also voided the planned
`MockLLMProvider`-based test assertions (replaced by a `repoIntel` stub override).

### E. No arch-gate script exists in the starter
§9 / §11 cited `npm run depcruise`. That script isn't defined here (only `dev`,
`build`, `start`, `typecheck`, `test`, `db:*`). The facade-only rule is verified
by inspection, not a gate.

### F. Tests inject the facade, not a real index
The plan assumed seeding a built index (`status full/partial`). Simpler and
hermetic: override `ContainerOverrides.repoIntel` with a stub returning a fixed
`BlastResult` (`container.ts:51`). No indexer run, no Docker-heavy fixture beyond
the existing Postgres harness.

### G. Explicitly out of scope (in the screenshot, not built)
- **"Prior PRs touching these files"** — no facade method for prior-PR lookup;
  would need its own query/feature.

This would be a follow-up task; it does not block the L04 acceptance criteria.

### H. Tree/Graph toggle — ADDED (2026-06-28, was wrongly cut in G)
The screenshot's `Tree | Graph` toggle is **not** a new data source — it is a
second *rendering* of the same `BlastMap`. No backend change. Shipped:
- **T-U5 (UI only):** a segmented `Tree | Graph` control in the `BlastCard`
  header (`SectionLabel`'s `right` slot), with `view` state (default `tree`).
- **`BlastGraph.tsx`** — a dependency-free **SVG node-link graph** of the same
  data, laid out in three semantic columns: **callers → changed symbols →
  endpoints/crons**. Edges: `caller → symbol` (inbound) and `symbol →
  endpoint/cron` (outbound), so the changed symbol reads as the blast hub. Caller
  nodes are clickable (`githubBlobUrl`, same deep-link as the tree). Columns are
  capped (~12 nodes) with a "+N more" overflow node to stay readable.
- Skills applied: `react-best-practices`, `frontend-architecture`. No new deps
  (hand-rolled SVG; the toggle/graph add no network calls).
- Tests: `BlastCard.test.tsx` extended — toggling to Graph renders the SVG and
  the caller deep-link survives in graph mode.

Note the contract already carried everything the graph needs
(`symbols[].callers/endpoints/crons`), so only the client changed.
