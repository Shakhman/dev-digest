# @devdigest/reviewer-core — review engine

**Use when:** changing prompt assembly, LLM calls, structured-output parsing,
the grounding gate, or the review pipeline — anything under `reviewer-core/`.

Pure logic: **diff → prompt → LLM → grounded findings**.
No DB, no filesystem, no GitHub. Only side-effect: injected LLMProvider.

## Commands
```sh
npm test          # vitest, hermetic (MockLLMProvider) — no keys, no network
npm run typecheck # also serves as the build — package never emits JS
```

## Non-default
- Consumed via tsconfig alias (`@devdigest/reviewer-core → ../reviewer-core/src`);
  server uses TypeScript source directly — never run tsc --build here
- LLMProvider is INJECTED — always mock it in tests; no real API calls
- Grounding is MANDATORY: findings without a real diff line reference are dropped;
  score recomputed from survivors, model score ignored
- `assemblePrompt()` wraps ALL untrusted input (diff, PR body, callers, repo-map)
  in `<untrusted>…</untrusted>` + appends INJECTION_GUARD to system prompt

## Pipeline
```
assemblePrompt() → llm.completeStructured() → parseWithRepair()
  → groundFindings() → Review { verdict, score, findings }
```
parseWithRepair: JSON.parse → fallback extractJson → Zod safeParse → reprompt (maxRetries)

## Public API  (src/index.ts)
assemblePrompt · wrapUntrusted · groundFindings · groundingSummary ·
toJsonSchema · extractJson · parseWithRepair · reviewPullRequest · reduce

## Prompt slots (for course lessons — ignored in starter)
skills · memory · specs · callers — assemblePrompt skips omitted slots

## Further
README.md — pipeline diagram + public API list
docs/     — engine design decisions (create when needed)
specs/    — finding schema and grounding rules (create when needed)
INSIGHTS.md — LLM output patterns, grounding edge cases (create when needed)
