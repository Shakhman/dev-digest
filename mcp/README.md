# @devdigest/mcp

Standalone local MCP server that gives any MCP client (Claude Desktop, Cursor, Claude Code)
five DevDigest tools over **stdio** transport.

> **Not part of the main app launch.**
> `./scripts/dev.sh` starts Postgres + API + web — it does **not** touch this package.
> You build and register the MCP server separately, only when you need it.

---

## Tools

| Tool | Description |
|---|---|
| `list_agents` | List configured reviewer agents (name, model, enabled) |
| `run_agent_on_pr` | Run one reviewer agent on a PR and wait for the verdict + findings |
| `get_findings` | Read the latest review verdict + findings for a PR (read-only, no new run) |
| `get_conventions` | _(stub — lands in a later lesson)_ |
| `get_blast_radius` | _(stub — lands in a later lesson)_ |

---

## From-scratch setup

### 1. Prerequisites

| Requirement | Notes |
|---|---|
| Node ≥ 22 | Check: `node --version` |
| npm ≥ 10 | Ships with Node 22 |
| DevDigest API running on `:3001` | See root `README.md` → _Quick start_ |

The API must be running for the MCP tools to return data.
Start it with `./scripts/dev.sh --no-client` (API + Postgres, no Next.js) or the full
`./scripts/dev.sh`.

### 2. Install dependencies

```bash
cd mcp
npm install
```

### 3. Build

```bash
npm run build
```

This runs `tsc` and emits `dist/index.js` (with `#!/usr/bin/env node` shebang).
You need to rebuild after any source change.

Verify the binary exists:

```bash
ls dist/index.js
```

### 4. (Optional) Environment variables

Copy the example and adjust if your API runs on a different port:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Base URL of the DevDigest API |
| `DEVDIGEST_MCP_TIMEOUT_MS` | `120000` | Poll timeout for `run_agent_on_pr` (ms) |

The defaults work for a standard local setup — you usually don't need the `.env` file at all.

---

## Registering with an MCP client

### Claude Code (this terminal)

```bash
claude mcp add devdigest -- node /Users/shakhman/Documents/pet-projects/dev-digest/mcp/dist/index.js
```

Restart Claude Code. The five tools appear automatically in the session.

To pass a custom API URL:

```bash
claude mcp add devdigest -e DEVDIGEST_API_URL=http://localhost:3001 \
  -- node /Users/shakhman/Documents/pet-projects/dev-digest/mcp/dist/index.js
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(create the file if it doesn't exist):

```json
{
  "mcpServers": {
    "devdigest": {
      "command": "node",
      "args": ["/Users/shakhman/Documents/pet-projects/dev-digest/mcp/dist/index.js"],
      "env": {
        "DEVDIGEST_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

Quit and relaunch Claude Desktop. The tools appear in the tool picker.

### Cursor

Open **Cursor Settings → MCP → Add server** and paste:

```json
{
  "devdigest": {
    "command": "node",
    "args": ["/Users/shakhman/Documents/pet-projects/dev-digest/mcp/dist/index.js"],
    "env": {
      "DEVDIGEST_API_URL": "http://localhost:3001"
    }
  }
}
```

---

## Testing

### MCP Inspector (recommended — browser UI)

Runs the server and opens an interactive UI for calling tools and inspecting responses.
No client registration needed.

```bash
npx @modelcontextprotocol/inspector \
  node /Users/shakhman/Documents/pet-projects/dev-digest/mcp/dist/index.js
```

With a custom API URL:

```bash
DEVDIGEST_API_URL=http://localhost:3001 \
  npx @modelcontextprotocol/inspector \
  node /Users/shakhman/Documents/pet-projects/dev-digest/mcp/dist/index.js
```

Open the URL printed in the terminal. Expected results:

| Check | Expected |
|---|---|
| Tool list | Exactly 5 tools with terse one-line descriptions |
| `list_agents` | Returns seeded agents by name, no UUIDs |
| `run_agent_on_pr("owner/repo", 1, "<agent name>")` | Polls until done; returns `{ verdict, score, findings[] }` |
| `get_findings("owner/repo", 1)` | Returns the same latest session without triggering a new run |
| `get_conventions` / `get_blast_radius` | Returns `{ status: "not_implemented", message: "…" }` |

### Raw stdio ping (stdout hygiene check)

Confirms the server writes only valid JSON-RPC to stdout (no stray `console.log`):

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}\n' \
  | node dist/index.js
```

Expected: a single JSON object like:
```json
{"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"devdigest","version":"0.1.0"}},"jsonrpc":"2.0","id":1}
```

No other bytes on stdout. Diagnostics go to stderr only.

### typecheck

```bash
npm run typecheck
```

---

## Development workflow

```bash
npm run dev   # tsx watch — restarts on source changes (no need to rebuild manually)
```

Use `dev` mode with MCP Inspector during active development.
Switch to `build` + `start` when registering with a client (clients launch the node binary directly).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `API not reachable at http://localhost:3001` | Start the server: `./scripts/dev.sh --no-client` |
| `no repos imported yet` | Add a repo in the DevDigest UI at http://localhost:3000 |
| `agent '…' not found` | Call `list_agents` first to see valid names |
| `10 reviews/min limit hit` | Wait ~60 s and retry |
| Tool changes not reflected | Rebuild: `npm run build`; restart the MCP client |
| Stray output corrupts JSON-RPC | Never use `console.log` in source — use `console.error` |
