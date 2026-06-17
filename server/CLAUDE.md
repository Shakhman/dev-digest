# @devdigest/api — Fastify API

**Use when:** touching API routes, DB schema/migrations, review execution, agents,
repo indexing, polling, secrets, or anything under `server/`.

Stack: Fastify 5 · Drizzle ORM · Postgres + pgvector · Zod via fastify-type-provider-zod

## Commands
```sh
pnpm dev                                              # :3001
pnpm test                                             # unit + integration
pnpm exec vitest run --exclude '**/*.it.test.ts'     # unit only (hermetic)
pnpm exec vitest run .it.test                        # integration only (needs Docker)
```

## Module map (src/modules/)
repos · pulls · reviews · agents · polling · settings · workspace · repo-intel

## Non-default
- Route schemas (params/body) declared via Zod — handlers never call Schema.parse()
- Secrets via `LocalSecretsProvider` (`src/adapters/secrets/local.ts`);
  GITHUB_PAT accepted as fallback for GITHUB_TOKEN
- Rate limit: 120/min global; tighter on `POST /pulls/:id/review`; off in test
- Review runs fire-and-forget; orphaned `running` runs reaped on startup

## Gotchas
- REPO_INTEL_ENABLED defaults true — unindexed repo silently degrades to diff-only
- Model's self-reported score is IGNORED; recomputed from grounded findings only

## Do NOT touch
- `src/vendor/shared` — shared with client + reviewer-core via tsconfig alias
- `src/db/schema` — tables for all course lessons pre-created; empty = intentional

## Further
README.md — full request/DI flow + API map diagram
docs/     — architecture decisions (create when needed)
specs/    — feature specs and API contracts (create when needed)
INSIGHTS.md — session wrap-ups and gotchas (append-only, see insights skill)
