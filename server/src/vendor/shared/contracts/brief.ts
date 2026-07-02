import { z } from 'zod';

/**
 * PR Brief (SPEC-09 Why+Risk Brief): a flat, model-written narrative
 * `{ what, why, risk_level, risks[], review_focus[] }`. `risk_level` is
 * derived (max severity across `risks[]`), never model-produced. Also hosts
 * `Intent` and `SmartDiff`, which are separate deterministic signals
 * consumed alongside the brief (not composed into it).
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  risk_areas: z.array(z.string()).default([]),
});
export type Intent = z.infer<typeof Intent>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  what: z.string(),
  why: z.string(),
  risk_level: RiskSeverity,
  risks: z.array(Risk),
  review_focus: z.array(z.string()),
});
export type PrBrief = z.infer<typeof PrBrief>;

// ---- Smart Diff file summaries (pr_diff_summary.json) ----
/**
 * One model-written "what this file does" line, keyed by the file's exact
 * `path` as it appears in `pr_files`/`SmartDiffFile` — the client merges this
 * into `SmartDiffFile.pseudocode_summary` (never a change to the `SmartDiff`
 * contract itself; `GET /pulls/:id/smart-diff` keeps emitting `null`).
 */
export const DiffFileSummary = z.object({ path: z.string(), summary: z.string() });
export type DiffFileSummary = z.infer<typeof DiffFileSummary>;

export const DiffSummaryResponse = z.object({
  summaries: z.array(DiffFileSummary),
  /** True when the recorded generation HEAD differs from the PR's current HEAD. */
  stale: z.boolean(),
  /** As reported by the structured call; null when unavailable. */
  cost_usd: z.number().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
});
export type DiffSummaryResponse = z.infer<typeof DiffSummaryResponse>;
