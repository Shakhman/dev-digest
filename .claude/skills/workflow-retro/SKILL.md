---
name: workflow-retro
description: >-
  Deterministic post-mortem of a multi-agent Claude Code workflow — tokens per
  session, agents launched and in what order, a sequential-vs-parallel timeline,
  per-agent tool usage, and health signals (errors, rework, file overlap, stuck
  loops). Reads every subagent transcript from disk, including nested subagents
  spawned by subagents, so token totals are never undercounted. Manually invoked
  only, via the `/workflow-retro` command — do NOT trigger this automatically.
  Zero model calls; a pure, reproducible parse of the transcript JSONL.
---

> **Invocation:** manual only. This skill runs when the user invokes the
> `/workflow-retro` command. Do not auto-trigger it from conversation.

# Workflow Retro

Turn a finished multi-agent run into a concrete, reproducible retrospective the
agents (and you) can learn from. Everything here is a **pure function of the
session transcript** — no LLM calls, so the same run always yields the same
numbers. That determinism is the point: it matches how the rest of this project
prefers facts over guesses.

## What it answers

- How many **tokens** each session spent (orchestrator + every subagent), broken
  into input / output / cache-read / cache-write.
- How many **agents** were launched, of which **types**, and **in what order**.
- Whether agents ran **sequentially or in parallel** (a parallelism factor + the
  overlapping pairs).
- Each agent's **tool histogram**, wall-clock duration, and **token share**.
- **Health signals** — deterministic proxies for the softer questions ("what was
  hard / easy / duplicated"): error & retry counts, rework (a role launched more
  than once), cross-agent file-write overlap, and "stuck" repeated identical calls.

It does **not** make qualitative judgments. It surfaces the *signals* and points
you at the transcripts to confirm — see [Limits](#limits-read-this).

## Why it reads transcripts from disk, not conversation context

A parent agent's own `<usage>` only reflects *its own* token spend — tokens
burned by subagents it launched (and by subagents *those* subagents launched,
e.g. a researcher spawned by implementation-planner) never show up there. Summing
in-context usage would silently undercount the run. Claude Code stores every
subagent transcript — no matter how deep the logical launch chain — flat in one
`<session>/subagents/agent-*.jsonl` folder per top-level session, so reading that
whole folder from disk (which is what the script always does; there is no
lighter "shallow" mode) already captures every nested subagent automatically.

## How to run it

The work is done by the bundled script, which finds the transcripts itself.

```bash
python3 .claude/skills/workflow-retro/scripts/analyze_workflow.py \
  --append-ledger docs/retros/ledger.md
```

- **Session selection:** with no `--session`, it analyzes the **newest** session
  in this project — i.e. the run that just finished. To target a specific run,
  pass `--session <id>` (the id is the transcript filename under
  `~/.claude/projects/<project-hash>/`).
- **`--append-ledger docs/retros/ledger.md`** appends a one-line summary of this
  run to the ledger (creating it with a header on first use) **and** prints the
  full report. This is the default invocation for this project.

Then **show the full report in chat** so the user sees the breakdown, and mention
that the ledger row was appended.

### Other modes (rarely needed)

- `--ledger-line` — print only the compact ledger row, no report.
- `--json` — structured output, if you want to compute something further.
- `--project-dir <path>` / `--cwd <path>` — override transcript location (the
  script derives it from the current working directory by default).

## How to read the report

| Signal | What it hints at | How to confirm |
|--------|------------------|----------------|
| **Token share** dominated by orchestrator | Context is re-sent on every turn (normal); a huge share can mean too much in the main thread that belonged in a subagent. | Compare orchestrator vs summed subagent tokens. |
| **Low cache-hit %** on an agent | It worked on cold context (first pass, or context churned). | Usually fine; persistently low across a role is worth a look. |
| **Rework** (role launched >1×) | Iteration loop, or a retried pass that failed the first time. | Read the second instance's transcript — was the re-run warranted? |
| **File overlap** between writer agents | Two agents wrote the same files → duplicated effort or merge risk. Plans should give each implementer a non-overlapping slice. | Check the plan's slice boundaries. |
| **Errors / permission-denied** | Where an agent hit friction. | Open that agent's transcript at the failing tool call. |
| **Stuck signal** (≥3 identical calls) | An agent re-read/re-ran the same thing — a loop or a missing hand-off. | The repeated signature is printed; trace why. |
| **Parallelism factor** ≈ 1.0 | Fully sequential. Independent agents (e.g. backend + UI implementers) could overlap. | Check whether the sequential ones had a real dependency. |

## Feeding it back to the agents

The ledger at `docs/retros/ledger.md` accumulates one row per run, so trends show
up over time (token creep, agent-count growth, recurring errors). When a retro
surfaces something an agent should do differently next time — a role that keeps
needing rework, two implementers that keep overlapping, a researcher that re-reads
the same files — that's a genuine engineering insight: record it via the
`engineering-insights` skill in the relevant package's `INSIGHTS.md`, not here.
Keep the ledger for numbers and this report for the per-run story.

## Limits (read this)

- The qualitative questions ("what challenged each agent", "what came easily",
  "what they missed") are answered here only by **deterministic proxies**
  (errors, duration, repeats, overlap). They point you at *where* to look; they
  are not a substitute for reading the flagged transcript. Don't report a proxy
  as a conclusion.
- Token numbers are what the transcript recorded (`message.usage`). "Tokens
  processed" includes cache reads/writes, which are billed at reduced rates — so
  a big total is not the same as a big bill; read the component breakdown.
- Synthetic / usage-less assistant turns are excluded so they don't inflate counts.
- If a run launched no subagents, the report is just the orchestrator's numbers —
  still useful, but the agent-level sections will be empty.
