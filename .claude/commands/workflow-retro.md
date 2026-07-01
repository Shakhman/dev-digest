---
description: Post-mortem of a multi-agent run — tokens per session, agents & launch order, parallelism, per-agent tool/health signals. Appends a row to docs/retros/ledger.md. Deterministic, zero model calls.
argument-hint: [--session <id>] [--no-ledger]
---

# /workflow-retro — Multi-agent run post-mortem

Manual entrypoint for the `workflow-retro` skill. Run this **after** a multi-agent
workflow (e.g. `/run-plan`) when you want the retrospective. It is deterministic —
a pure parse of the session transcript, no model calls.

## Inputs — parse from the arguments

Raw arguments: `$ARGUMENTS`

- **`--session <id>` (optional)** — analyze a specific session. With no flag, the
  newest session in this project is used (the run that just finished).
- **`--no-ledger` (optional)** — print the report but do **not** append to the
  ledger. Default is to append.

## What to do

1. Read the skill's guidance: `.claude/skills/workflow-retro/SKILL.md` (signal
   interpretation, limits).
2. Run the bundled analyzer. Default invocation:

   ```bash
   python3 .claude/skills/workflow-retro/scripts/analyze_workflow.py \
     --append-ledger docs/retros/ledger.md
   ```

   - Add `--session <id>` if one was passed.
   - If `--no-ledger` was passed, drop `--append-ledger` and run the script bare.

3. **Show the full report in chat** and state whether a ledger row was appended.
4. Turn each flagged signal into a **specific, concrete action** — not just "worth
   a look." Map signal → action:

   | Signal | Action |
   |--------|--------|
   | Errors / stuck / longest-duration agent (it struggled) | **Refine that agent's brief** — narrow scope, add missing context, clarify the ask. |
   | File overlap between writers, or repeated identical reads across agents (duplicated context) | **Pre-fetch a shared file** into the orchestrator or plan, so agents get it once instead of re-discovering it. |
   | Rework (role launched >1×), or a plan-verifier catching gaps repeatedly | **Merge or split agents** — either the role is too thin to justify a separate launch, or it's overloaded and needs to be broken up. |
   | Parallelism factor ≈ 1.0 on independent roles (e.g. backend + UI implementers with no real dependency) | **Change concurrency** — launch them together instead of sequentially. |

   State the mapping explicitly in chat (signal → action), then offer to record
   it via `engineering-insights` in the relevant package's `INSIGHTS.md` — keep
   the ledger for numbers only, this synthesis for the per-run story.

Do not commit or push anything (project commit policy).
