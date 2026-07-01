# specs — cross-cutting (top-level)

Specifications that touch **more than one** package live here.

DevDigest is not a monorepo workspace; each package owns its own `specs/`
folder. A spec scoped to a single package belongs in that package's folder:

- `server/specs/` — `server` only
- `client/specs/` — `client` only
- `reviewer-core/specs/` — `reviewer-core` only
- `e2e/specs/` — `e2e` only

A feature that spans two or more of those packages (e.g. a backend route **and**
its client UI) gets **one** spec here, in this top-level folder, as the single
source of truth.

## Conventions

- **Filename:** `SPEC-NN-<feature>.md` (kebab-case feature), e.g.
  `SPEC-07-onboarding.md`.
- **Spec ID:** `SPEC-NN` is **globally sequential** across all five `specs/`
  folders — pick the next free number, not a per-folder counter.
- **Status:** new specs start as `draft`; promotion to `approved` / `implemented`
  is a human/review action, not something the author sets.
- **Authoring:** specs are written by the `spec-creator` agent and stay at spec
  altitude — WHAT/WHY (problem, EARS acceptance criteria, edge cases, contracts,
  diagrams), not HOW/what-code. The "how" lives in the implementation plan that
  the `implementation-planner` produces from the spec.
