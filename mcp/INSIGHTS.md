# Insights — @devdigest/mcp

Durable findings for the MCP server package. Append-only; never overwrite existing entries.

## What Works

- **2026-06-27** — TypeScript's shebang (`#!/usr/bin/env node`) on the very first line of a `.ts` source file is preserved verbatim in the emitted `.js` output by `tsc` — no banner plugin or post-process step needed. Verified in `mcp/dist/index.js:1`.

## What Doesn't Work

- **2026-06-27** — `console.log` anywhere in the MCP server process corrupts the stdio JSON-RPC transport (stdout is the wire). All diagnostics, startup messages, and error reporting must go to `console.error` (stderr). `StdioServerTransport` owns stdout exclusively.

## Codebase Patterns

- **2026-06-27** — `POST /pulls/:id/review` is fire-and-forget: the `reviews` array in the response is always `[]`. To get results, poll `GET /pulls/:id/runs` until the target `run_id` reaches a terminal status (`done`/`failed`/`cancelled`), then fetch reviews from `GET /pulls/:id/reviews`. Do not assume review data appears in the trigger response.

- **2026-06-27** — `PrMeta.id` is `.nullish()` in the API contract. When resolving a PR number to its UUID, always null-guard (`found.id == null`) before returning; throw `ToolError` if null. Evidence: `mcp/src/resolve.ts`.

## Tool & Library Notes

- **2026-06-27** — `McpServer.tool()` from `@modelcontextprotocol/sdk/server/mcp.js` takes a **raw Zod shape** (`Record<string, ZodTypeAny>`) as the third argument — NOT a full `z.object({...})` schema. The callback receives the already-parsed, fully-typed args as `ShapeOutput<Shape>`. Passing `z.object({...})` instead of the shape causes a type mismatch. Evidence: `mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/server/zod-compat.d.ts`.

## Recurring Errors & Fixes

## Session Notes

### 2026-06-27
- Created `mcp/` package from scratch: 15 files, 5 MCP tools over stdio transport.
- Grounded API shapes from `server/src/modules/reviews/helpers.ts`, `server/src/vendor/shared/contracts/trace.ts`, `server/src/modules/reviews/routes.ts`, and `server/src/modules/agents/routes.ts`.
- Build and typecheck both pass clean (`npm run build`, `npm run typecheck`).
- Verified the server responds correctly to `initialize` over stdio.

## Open Questions
