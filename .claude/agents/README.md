# Agents

Custom Claude Code subagents for DevDigest. Each agent is a markdown file with
YAML frontmatter (`name`, `description`, `tools`, `model`) plus a system-prompt
body. Claude Code loads them from this folder at startup and uses the
`description` field to decide when to delegate.

## Catalog

| Agent | Model | Tools | Role |
|---|---|---|---|
| [researcher](#researcher) | sonnet | Read-only + Web | Find information; never writes |
| [implementation-planner](#implementation-planner) | opus | Read-only (no Write/Edit) | Review requirements, then produce an Implementation Plan |
| [implementer](#implementer) | sonnet | Full + Skill | Write code, pass existing tests |
| [test-writer](#test-writer) | sonnet | Full + Skill | Write UI + backend tests; typological philosophy |
| [architecture-reviewer](#architecture-reviewer) | sonnet | Read-only + Web + Skill | Macro architectural review; never writes |
| [plan-verifier](#plan-verifier) | sonnet | Read-only + Skill | Requirements-coverage gate against an Implementation Plan |
| [doc-writer](#doc-writer) | sonnet | Full + Skill | Document features/plans as Diátaxis-typed docs with diagrams |

---

## Pipeline — Spec-Driven Development flow

These agents chain into one SDD pipeline. Canonical order:

1. **spec-creator** → writes the spec (WHAT/WHY, EARS acceptance criteria).
   *Human approves the spec* — resolve every `[NEEDS CLARIFICATION]` and promote
   it past `draft` before planning.
2. **implementation-planner** → turns the approved spec into an Implementation
   Plan (the HOW): names files, interfaces, and the skills each task needs. Does
   **not** run tests/build — it only names the verification commands.
3. **implementer** (multi-agent: one backend slice + one UI slice) → writes the
   code and makes existing tests pass. Edits land directly on the active branch
   (no worktree isolation).
4. **architecture-reviewer** → macro structural review. Run it *before* tests so
   any restructuring happens before tests are written against the shape. Fix
   findings, then continue.
5. **test-writer** → writes the new feature tests (one happy path + the edge that
   matters).
6. **plan-verifier** → coverage gate. Runs *after* test-writer because it needs
   the tests as evidence. FAILs on any Missing required item.
7. **pr-self-review** (skill, not an agent) → final correctness/quality gate
   before pushing: runs typecheck/tests/lint/dependency-cruiser and BLOCKS on any
   verified CRITICAL. This is the bug net — architecture-reviewer and
   plan-verifier do **not** catch logic bugs.

`architecture-reviewer` is structural only; `plan-verifier` is coverage only.
Neither finds correctness bugs — that is `pr-self-review`'s job (step 7).

---

## researcher

**File:** `researcher.md`

A read-only research agent. Given a question, it searches one of three scopes —
project knowledge (docs/specs/INSIGHTS), in-project code/files, or the public
internet — and returns a single structured report. Honest about gaps: marks
results `Found / Partial / Not found` and never invents file paths or URLs.

**Interview mode on** — asks clarifying questions before searching if the request
is ambiguous, or confirms scope (project vs. web) if it isn't specified.

**Tools:** `Read, Grep, Glob, Bash` (read-only commands only), `WebSearch,
WebFetch`. No Write/Edit — structurally cannot change anything.

**Skills:** none — this agent only searches and reports; it does not write or
review code.

**Based on:** original design for this project. No external sources.

---

## implementation-planner

**File:** `implementation-planner.md`

Turns **already-defined requirements** into a self-contained **Implementation
Plan** (10-section markdown) that a separate implementer can execute in a fresh
session. Plans the *how*, not the *what/why* — it does **not** author or own the
specification. Read-only by tool scoping (no Write/Edit) — it is structurally
incapable of writing code.

Before planning it (1) **reviews the requirements** it is given — flags gaps and
ambiguity, asks up to 3 clarifying questions, and recommends improvements (it
recommends, never rewrites the spec); and (2) **confirms the execution mode** with
the user — multi-agent (parallel backend/UI slices) or single-agent (one ordered
task list) — and shapes the plan's structure accordingly.

Knows all 10 DevDigest server modules, reads the relevant package `INSIGHTS.md`
and `AGENTS.md` before planning, references the full skill catalog, and tags each
backend/UI task with the exact skills the implementer must apply. Outputs the
plan as markdown; the caller persists it to `docs/plans/<feature>.md`.

**Skills (full catalog — the planner must apply all best practices when planning):**

| Skill | Purpose in planning |
|---|---|
| `onion-architecture` | Enforce dependency rule when designing backend module boundaries |
| `fastify-best-practices` | Validate route/plugin/hook design before specifying them |
| `drizzle-orm-patterns` | Ensure schema, query, and migration tasks are correctly scoped |
| `postgresql-table-design` | Review table/index design in the plan before implementation |
| `api-contract-review` | Flag breaking-change risks in any planned route or schema change |
| `zod` | Specify correct validation shapes for new routes and forms |
| `security` | Spot auth, input-validation, and header risks at plan time |
| `typescript-expert` | Guide type-level design decisions in the plan |
| `frontend-architecture` | Decide where new components/routes/hooks should live in `client/` |
| `next-best-practices` | Validate RSC boundaries, data-fetching strategy, and file conventions |
| `react-best-practices` | Catch state/hook anti-patterns before they reach the implementer |
| `react-testing-library` | Ensure testable component design is specced from the start |
| `mermaid-diagram` | Produce architecture/flow diagrams inside the plan |
| `engineering-insights` | Capture any new non-obvious insight discovered during planning |

**Based on:**
- Anthropic's canonical Explore → Plan → Implement → Commit workflow and the
  principle that "the planner should be read-only by tool scoping, not prose
  instruction" ([Best practices for Claude Code](https://code.claude.com/docs/en/best-practices))
- The built-in Plan subagent design (read-only, returns a plan, no code)
  ([Create custom subagents](https://code.claude.com/docs/en/sub-agents))
- Implementation-plan completeness criteria: "name the files and interfaces, state
  what is out of scope, end with an end-to-end verification step"
  ([Best practices for Claude Code](https://code.claude.com/docs/en/best-practices))
- "Each subagent needs an objective, an output format, tool guidance, and clear
  task boundaries"
  ([How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system))

---

## implementer

**File:** `implementer.md`

Executes one non-overlapping slice of an Implementation Plan. Designed to run in
parallel (one backend instance, one UI instance) on disjoint file sets — edits
land directly on the active branch, no worktree isolation. Applies the correct
skill bucket for its domain — backend
skills for `server/` + `reviewer-core/`, UI skills for `client/` — loaded
contextually via the Skill tool so the two skill sets don't cross-pollute.

**Protocol:** read local `INSIGHTS.md` first → apply domain skills → write code →
run existing tests to green (with evidence) → self-review only its own diff.
Does not do architecture design or full repo review.

**Skills — loaded conditionally based on assigned slice (never both at once):**

**Backend slice** (`server/` + `reviewer-core/`):

| Skill | Purpose |
|---|---|
| `onion-architecture` | Keep imports pointing inward; place routes/services/repos correctly |
| `fastify-best-practices` | Routes, plugins, hooks, JSON Schema validation, error handling |
| `drizzle-orm-patterns` | Schema definition, queries, relations, transactions, migrations |
| `postgresql-table-design` | Table/index/constraint design when touching the DB layer |
| `api-contract-review` | Avoid accidental breaking changes to existing HTTP contracts |
| `zod` | Validation shapes for request/response schemas |
| `security` | Input validation, auth checks, header hardening on API endpoints |
| `typescript-expert` | Type-level correctness, strict types, no suppression |
| `engineering-insights` | Read `server/INSIGHTS.md` + `reviewer-core/INSIGHTS.md` before editing; append new findings after |

**UI slice** (`client/`):

| Skill | Purpose |
|---|---|
| `frontend-architecture` | File placement, component splitting, folder structure in Next.js |
| `next-best-practices` | RSC boundaries, data fetching, file conventions, image/font optimization |
| `react-best-practices` | Component design, state patterns, hooks rules, anti-patterns |
| `react-testing-library` | Write testable components; make existing RTL tests pass |
| `zod` | Client-side form validation schemas |
| `security` | XSS prevention, safe rendering, client-side input handling |
| `typescript-expert` | Type-level correctness, strict types, no suppression |
| `engineering-insights` | Read `client/INSIGHTS.md` before editing; append new findings after |

**Based on:**
- Orchestrator–worker pattern and "give it a verifiable check it can run; iterate
  until green"
  ([Building effective agents](https://www.anthropic.com/engineering/building-effective-agents))
- Non-overlapping backend/UI slices let two implementers run in parallel without
  worktree isolation — they edit disjoint file sets, so changes land directly on
  the active branch
  ([Create custom subagents](https://code.claude.com/docs/en/sub-agents))
- Non-overlapping task boundaries: "without detailed task boundaries, agents
  duplicate work or leave gaps"
  ([How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system))
- "Show evidence rather than asserting success" and "address the root cause,
  don't suppress the error"
  ([Best practices for Claude Code](https://code.claude.com/docs/en/best-practices))
- Conditional skill loading per domain to avoid cross-polluting context
  ([Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))

---

---

## test-writer

**File:** `test-writer.md`

Writes automated tests for both the **UI** (`client/`, Vitest + React Testing
Library + jsdom) and the **backend** (`server/` + `reviewer-core/`, Vitest;
hermetic unit tests + real-Postgres `*.it.test.ts` integration tests). Designed
to run after the implementer lands a feature.

Loads skill buckets **conditionally** — the UI bucket for `client/` work, the
backend bucket for `server/` + `reviewer-core/` work, never both at once. Reads
`TESTING.md`, the relevant package `INSIGHTS.md`, and `AGENTS.md` before writing
a single test.

**Test-design rules encoded:**
- One happy path + the edge that actually matters per workflow. No coverage filler.
- Query priority in RTL: `getByRole > … > getByTestId` (last resort only).
- `userEvent.setup()` not `fireEvent`; `findBy*` not `waitFor` for async.
- Never assert internal state (no `useState` values, refs, or instance methods).
- Mock only I/O boundaries (LLMs, GitHub, git via `src/adapters/mocks.ts`); never
  mock same-module collaborators.
- Expected values derived from the spec, not read off the implementation.
- Every test has ≥ 1 falsifiable assertion.
- Integration tests: `*.it.test.ts` suffix, real Postgres via testcontainers,
  self-skip when Docker absent.

**Tools:** `Read, Edit, Write, Grep, Glob, Bash, Skill, AskUserQuestion`. Has
write access — needed to create test files.

**Skills (conditional buckets):**
- UI: `react-testing-library`, `zod`, `typescript-expert`
- Backend: `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `security`, `typescript-expert`
- Always: `engineering-insights`

**Based on:**
- Kent C. Dodds — [Testing Implementation Details](https://kentcdodds.com/blog/testing-implementation-details)
- Kent C. Dodds — [Common Testing Mistakes](https://kentcdodds.com/blog/common-testing-mistakes)
- [Testing Library — Query priority](https://testing-library.com/docs/queries/about/)
- Martin Fowler — [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- arXiv — [Are Coding Agents Generating Over-Mocked Tests?](https://arxiv.org/html/2602.00409v1)

---

## architecture-reviewer

**File:** `architecture-reviewer.md`

A **read-only** architectural review agent. Structurally incapable of writing
(no Write/Edit tools). Reviews at the **macro** level — dependency direction,
layer integrity, boundary leaks, ports/adapters, coupling/cohesion, RSC
server/client boundaries, API contract risks. Ignores anything a linter, tsc,
or passing test already catches.

**What it checks:**

| Concern | Specific signals |
|---|---|
| Onion/clean violations | domain importing infra, missing port, adapter bypass, framework coupling in core |
| Next.js RSC | Client component importing server-only module, server component using client hooks |
| API contracts | Breaking route/schema changes via `api-contract-review` skill |
| Coupling/cohesion | Cross-module internal imports, grab-bag files |

**Evaluator/skeptic pass** — re-verifies each finding against `file:line` before
reporting. Findings that cannot be confirmed are downgraded, not dropped silently.
Optional mermaid dependency/boundary diagram for non-trivial violations.

**Tools:** `Read, Grep, Glob, Bash, Skill, WebSearch, WebFetch, AskUserQuestion`.
No `Write` or `Edit` — structurally read-only.

**Skills:** `onion-architecture`, `frontend-architecture`, `next-best-practices`,
`api-contract-review`, `typescript-expert`, `mermaid-diagram`, `engineering-insights`.

**Based on:**
- Anthropic — [Building Agents with the Claude Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk)
- ThoughtWorks — [Dependency Drift Fitness Function](https://www.thoughtworks.com/radar/techniques/dependency-drift-fitness-function)
- [tech-stack.com — The Architecture Review Process](https://tech-stack.com/blog/the-architecture-review-process/)
- [cubic.dev — Maintain Clean Architecture with Dependency Rules](https://www.cubic.dev/blog/how-to-maintain-clean-architecture-with-dependency-rules-in-your-codebase)

---

## plan-verifier

**File:** `plan-verifier.md`

Given an **Implementation Plan**, verifies the code already written against every
task and "Done when" criterion. Counterpart to `pr-self-review`: that gate
checks quality; this one checks *did we build what the plan said*.

Builds a **traceability matrix** — one row per plan item — and demands a concrete
evidence artifact for each (passing test name at `file:line`, or an inspected
code path at `file:line`). Never marks an item Met without citing the artifact.

**Status taxonomy:** `Met` / `Partial` / `Missing` / `Unverifiable`. Gate:
any Missing on a required item → **FAIL**; all Met or Partial → **PASS**.

Read-only by tool scoping (no Write/Edit). Does not fix code; reports gaps for
the implementer to close.

**Tools:** `Read, Grep, Glob, Bash, Skill, AskUserQuestion`.

**Skills:** `typescript-expert`, `onion-architecture`, `frontend-architecture`
(loaded on demand when judging whether a cited artifact genuinely satisfies a
criterion).

**Based on:**
- Spec-Driven Development — [arXiv 2602.00180](https://arxiv.org/html/2602.00180v1)
- Guideline-Grounded Evidence Accumulation — [arXiv 2603.02798](https://arxiv.org/pdf/2603.02798)
- Requirements Verification Traceability Matrix — [Softacus RVTM](https://softacus.com/blog/requirements-verification-traceability-matrix-rvtm)

---

## doc-writer

**File:** `doc-writer.md`

Documents functionality that already exists. Three modes:
1. **Feature mode** — reads the code and produces documentation for a feature.
2. **Plan-to-doc mode** — converts an Implementation Plan into architecture/design docs.
3. **Material-to-doc mode** — converts arbitrary material (notes, specs, conversation)
   into structured documentation.

Grounds every claim in real source — reads files first, cites `file:line`, never
invents APIs or behavior. If something isn't in the code, writes "not documented
in source."

Applies the **Diátaxis** taxonomy (tutorial / how-to / reference / explanation),
produces **Mermaid diagrams** (flowchart, sequence, ERD, C4 Context/Container by
default), and enforces **save-location rules**:

| Doc type | Location |
|---|---|
| Feature docs | `docs/features/<name>.md` |
| ADRs (Nygard template) | `docs/adr/<nnn>-<topic>.md` |
| Plans | `docs/plans/<name>.md` |
| Agent prompts | `docs/agent-prompts/<name>.md` |
| Per-package notes | Stay in package `AGENTS.md` / `INSIGHTS.md` |

**Tools:** `Read, Edit, Write, Grep, Glob, Bash, Skill, AskUserQuestion` (needs
Write to save doc files).

**Skills:** `mermaid-diagram`, `typescript-expert`, `onion-architecture`,
`frontend-architecture`, `engineering-insights`.

**Based on:**
- Diátaxis — [diataxis.fr](https://diataxis.fr)
- C4 model — [c4model.com](https://c4model.com)
- Mermaid — [mermaid.js.org](https://mermaid.js.org/intro/)
- Write the Docs — [Docs as Code](https://www.writethedocs.org/guide/docs-as-code/)

---

## Adding a new agent

1. Create `<name>.md` in this folder with the frontmatter:
   ```yaml
   ---
   name: <name>
   description: <when to use this agent — drives automatic delegation>
   tools: <comma-separated allowlist, or omit to inherit all>
   model: sonnet | opus | haiku
   ---
   ```
2. Write the system prompt in the body.
3. Restart Claude Code — agents are loaded at startup.
4. Add an entry to this README.
