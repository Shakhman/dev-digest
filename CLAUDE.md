# DevDigest

**Use when:** any task in this repo — start here for the map, then open the
package CLAUDE.md that matches what you're touching.

Local-first AI PR review. 4 standalone packages — no monorepo workspace,
cross-package code shared via **tsconfig path aliases** (not published modules).

| Package                  | What                                | Port |
|--------------------------|-------------------------------------|------|
| server/                  | Fastify 5 API + Drizzle + Postgres  | 3001 |
| client/                  | Next.js 15 studio                   | 3000 |
| reviewer-core/           | diff → prompt → LLM → findings      | —    |
| e2e/                     | agent-browser deterministic flows   | —    |
| server/src/vendor/shared | @devdigest/shared Zod contracts     | —    |

## Quick start
```sh
./scripts/dev.sh   # Docker Postgres + API :3001 + web :3000
```

## Non-default conventions
- Migrations NOT auto-run on boot — `cd server && pnpm db:migrate`
- `*.it.test.ts` = DB-backed (testcontainers Postgres); everything else hermetic
- Secrets in `~/.devdigest/secrets.json` (mode 0600) — never in .env, DB, or git
- Each package has its own lockfile and `node_modules`

## Do NOT touch
- `server/src/vendor/shared` — shared contracts; edits break client + reviewer-core
- `server/src/db/schema` — all lesson tables pre-created; empty ones are intentional
- `**/pnpm-lock.yaml`, `**/package-lock.json` — each package owns its own lockfile; never edit manually

## Package maps
server/CLAUDE.md · client/CLAUDE.md · reviewer-core/CLAUDE.md · e2e/CLAUDE.md

## Full docs
README.md · TESTING.md · server/README.md · client/README.md ·
reviewer-core/README.md · e2e/README.md
