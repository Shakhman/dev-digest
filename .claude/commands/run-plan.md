---
description: Run the DevDigest spec-driven IMPLEMENTATION pipeline from an existing plan — implement (multi-agent) → architecture-review → iterate → verify → final gate. Stops before any git push.
argument-hint: --plan <path> [--spec <path>] [--designs <path…>] [extra requirements]
---

# /run-plan — Spec-Driven implementation run

You are the **orchestrator** for DevDigest's spec-driven *implementation*
pipeline. The spec and the Implementation Plan have **already been produced
manually** — `spec-creator` and `implementation-planner` are **NOT** part of this
command and you must not run them. This command (`/run-plan`) takes an existing
plan and drives **implement → review → iterate → verify → final gate**, then
stops before pushing.

## Inputs — parse from the arguments

Raw arguments: `$ARGUMENTS`

- **`--plan <path>` (REQUIRED)** — the Implementation Plan (e.g.
  `docs/plans/<feature>.md`). It drives the implementers and `plan-verifier`.
  If it is missing, **stop and ask** — do not guess or invent a plan.
- **`--spec <path>` (optional, recommended)** — the source spec. Hand it to
  `plan-verifier` so it can gate on AC-NN coverage. If absent, say so and verify
  against the plan alone.
- **`--designs <path…>` (optional)** — one or more design image/file paths. Pass
  them to the **UI implementer** (and reference them in the UI slice). Backend
  implementer ignores them.
- **Extra requirements** — any free-text left in the arguments. Fold it into the
  context you give each agent as additional constraints; it does not replace the
  plan.

Read the plan yourself first so you can split it correctly. Honor the project
commit policy: **never `git add/commit/push`** at any point in this command.

## Pipeline (run in order)

### 1. Implement — multi-agent, parallel
- If the plan has **shared/sequenced pre-work** (shared schema, port, type), do
  that **first** with a single implementer before splitting.
- Then spawn **two `implementer` subagents IN PARALLEL** (same message):
  - **Backend** instance owns the `T-B*` tasks (`server/` + `reviewer-core/`).
  - **UI** instance owns the `T-U*` tasks (`client/`); also give it the design files.
- **Do NOT use worktree isolation.** Both run on the active branch, each editing
  only its own disjoint file set (the plan's split guarantees no overlap).
- Give each instance: the plan path, its exact slice, relevant spec context, and
  any extra requirements.
- **Tell each implementer explicitly to skip any test-writing tasks in the
  plan.** Their job in this command is implementation only — run and confirm
  the *existing* test suite still passes, but do not author new unit/integration
  tests, even if the plan asks for them. This keeps test authorship fully
  deferred to a (currently disabled) `test-writer` step — see §4.

### 2. Architecture review (Sonnet)
- Spawn `architecture-reviewer` on the implemented change. It runs on Sonnet by
  definition — do not override.

### 3. Iterate on findings — up to **3 rounds**
- If the review reports any **BLOCKER** or **HIGH** finding:
  1. Spawn an `implementer` to fix **exactly those findings** — no scope creep,
     no refactors beyond what the finding requires.
  2. Re-run `architecture-reviewer`.
  3. Repeat. **Cap at 3 rounds.** If BLOCKER/HIGH still remain after the 3rd
     round, **stop iterating** and report them for a human to resolve.
- **MEDIUM / INFO** findings: list them in the final report, do not block or
  iterate on them.

### 4. Plan verification (Sonnet)
- Spawn `plan-verifier` with **both the plan and the spec** so it gates on plan
  tasks *and* spec AC-NN coverage. It runs on Sonnet by definition.
- ⚠️ **`test-writer` is intentionally disabled in this command** (token saving).
  Consequence: any acceptance criterion that lacks an *existing* test will come
  back **Partial** ("code present, not test-verified"). That is expected — surface
  those Partials in the report; do **not** spin up a test-writer to close them.

### 5. Final gate
- Run the **`pr-self-review`** skill (Skill tool) on the working tree.
- **Stop here.** Do not push, commit, or open a PR. Present the result for the
  human to act on.

## Final report

End with:
- **Implemented:** tasks done per slice (backend / UI), files touched.
- **Architecture review:** number of iteration rounds, final status, any
  remaining MEDIUM/INFO, and any BLOCKER/HIGH that survived the cap.
- **Plan verification:** PASS/FAIL, task coverage %, spec-AC coverage, and the
  Partials caused by the disabled test-writer.
- **Final gate:** `pr-self-review` result (and any verified CRITICAL it blocks on).
- **Git:** explicit confirmation that nothing was committed or pushed.

## Notes for re-enabling later
- To restore test coverage, insert a `test-writer` step **between 3 and 4** (so
  `plan-verifier` sees the new tests as evidence and can mark ACs **Met**).
- `architecture-reviewer` and `plan-verifier` were moved to Sonnet for cost; if
  review quality drops on a hard structural change, re-run that one agent on Opus
  manually.
