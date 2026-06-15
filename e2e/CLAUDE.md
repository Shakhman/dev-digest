# @devdigest/e2e — browser flows

**Use when:** writing or debugging browser flows, or a UI change needs an
end-to-end check against the real stack — anything under `e2e/`.

Tool: **agent-browser** CLI (Rust + CDP) — NOT Playwright, NOT puppeteer.
Flows: `specs/NN-name.flow.json` — JSON lists of agent-browser commands.

## Commands
```sh
./scripts/e2e.sh   # PREFERRED: hermetic isolated stack
                   # Postgres :5433, API :3101, web :3100 — safe alongside dev
npm test           # against your running stack (see gotcha)
```

## Flow format
```jsonc
{ "cmd": ["wait", "--text", "some text"], "label": "description" }
```
`{BASE}` → `E2E_BASE_URL` (default `http://localhost:3000`)

## Do NOT
- Use `chat` command — invokes LLM, makes runs non-deterministic
- Use AI-based locators — only `--url` · `--text` · `find role|text|label`
- Run `docker compose down -v` — destroys `devdigest_pgdata` + dev data

## Gotcha
Flows 02, 04, 05 assume the seeded repo is the **only** repo in DB.
Running `npm test` against a dev DB with imported repos → wrong repo → failures.
Always use hermetic runner unless your local DB has only the seed data.

## Further
README.md — flow coverage table, env knobs, hermetic runner details
INSIGHTS.md — timing issues, locator patterns that work (create when needed)
