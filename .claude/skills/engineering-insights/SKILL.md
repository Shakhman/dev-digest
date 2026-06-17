---
name: engineering-insights
description: "Read the relevant module's INSIGHTS.md at the START of a session, and capture substantial new learnings to it at the END. Read when a user prompt or your clarifying question names a module to develop or discuss. Write at wrap-up only when something substantial and not-already-recorded came up. Trigger terms: wrap-up, session summary, document what we learned, capture insights, /insights, engineering-insights."
metadata:
  tags: insights, knowledge, wrap-up, session-notes, learnings
---

## Read first (start of session)

Once the user has entered their input/prompt, or you've asked a clarifying
question, **read the INSIGHTS.md of the module that's about to be developed or
discussed — before doing the work.** Don't wait for wrap-up.

1. From the prompt (or your question), determine the target module:
   `server/` · `client/` · `reviewer-core/` · `e2e/`
2. Read that module's `INSIGHTS.md` and let its entries inform your approach
3. If multiple modules are in scope, read each one's `INSIGHTS.md`

## Write last (end of session) — only if substantial

1. Identify which module was touched: `server/` · `client/` · `reviewer-core/` · `e2e/`
2. **Reread that module's `INSIGHTS.md` before writing anything** — if the
   insight is already recorded (in any form), do NOT duplicate it
3. **Only record something substantial** — a real problem/solution/discovery
   that wasn't already written. If nothing new and substantial came up during
   the session, write **nothing**
4. Append to that module's `INSIGHTS.md` — **never overwrite existing entries**
5. Add a dated `## Session Notes` entry plus any relevant section entries below
6. Every entry must be **actionable cold**: a future agent reads it and knows exactly what to do — no vague warnings
7. Skip trivial config changes or anything obvious from reading the code

**Quality test:** "Would this be obvious to anyone reading the code?" → if yes, don't write it.
**Dedup test:** "Is this already in INSIGHTS.md?" → if yes, don't write it.
**Substance test:** "Did anything new and substantial actually happen?" → if no, write nothing.

**BAD:** `"be careful with async"` · `"Promises can be tricky"`  
**GOOD:** `"groundFindings() drops a finding silently if end_line < start_line — always sort range before passing"`

## INSIGHTS.md structure (fixed sections, append-only)

```md
## What Works
<!-- Approaches and solutions that worked; include the why -->

## What Doesn't Work
<!-- Dead ends and anti-patterns — the most valuable section; most often skipped -->

## Codebase Patterns
<!-- Conventions and architectural decisions non-obvious from the code -->

## Tool & Library Notes
<!-- Dependency quirks specific to this module -->

## Recurring Errors & Fixes
<!-- Error message → root cause → fix; one entry per error -->

## Session Notes
<!-- Dated summaries: ### YYYY-MM-DD\n bullet points of what happened -->

## Open Questions
<!-- Unresolved; remove when answered -->
```

## When to use

- **Start of session** (read): once the prompt/your question names a module to
  develop or discuss — read that module's `INSIGHTS.md` before doing the work
- **End of session** (write): after any session >30 min with a problem,
  solution, or discovery — but only if it's substantial and not already recorded
- **Capture as you go**: immediately when something non-obvious happens mid-task
- Skip: trivial config edits, straightforward CRUD changes, anything already in `INSIGHTS.md`

## Maintenance rules

- **append-only** — add entries, never rewrite existing ones (merge conflicts lose lessons)
- **Clean monthly** — updated library → old quirk notes become noise or harmful advice
- **Don't let it bloat** — >200 entries: split into `INSIGHTS-<domain>.md`
- **Resolve contradictions** — one section says "always do X", another "X fails here" → fix explicitly
- **INSIGHTS.md is a draft** — LLM wrap-up does 90% of work but may summarize wrong; spot-check
