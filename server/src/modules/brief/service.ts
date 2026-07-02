import { PrBrief } from '@devdigest/shared';
import type { Provider, Risk, RiskSeverity, BlastMap, SmartDiff } from '@devdigest/shared';
import { buildBriefPrompt } from '@devdigest/reviewer-core';
import type {
  BriefPromptInputs,
  BriefBlastSummaryInput,
  BriefSmartDiffInput,
} from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../../db/rows.js';
import type { ReviewRow, FindingRow } from '../reviews/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { computeBlastMap } from '../blast/service.js';
import { computeSmartDiff } from '../smart-diff/service.js';
import { ConflictError, ExternalServiceError } from '../../platform/errors.js';
import { getBrief, upsertBrief, type StoredBriefJson } from './repository.js';

/**
 * `brief` module service (T-B5) — the SOLE owner of Why+Risk Brief
 * aggregation, generation, grounding, and caching.
 *
 * Reaches every other signal through a service/facade — never another
 * module's route internals: `computeBlastMap` / `computeSmartDiff` (T-B1
 * services), `container.reviewRepo` (intent + PR files + cache), and
 * `container.projectContext.resolveWorkspaceDefault` (T-B2). The prompt
 * itself is assembled by the pure `reviewer-core` builder (T-B4); all I/O —
 * including the one structured model call — stays here.
 */

/** Reserve part of the 8K prompt budget for Project Context specs — the
 * largest and first-to-be-trimmed section (AC-4). */
const CONTEXT_BUDGET_TOKENS = 3_000;
/** Cap how many top-impact Blast symbols we summarize into the prompt. */
const MAX_TOP_BLAST_SYMBOLS = 5;

const ALL_SECTIONS = ['intent', 'blast', 'smart_diff', 'project_context'] as const;

/** The model produces everything except `risk_level` (derived, AC-2a). */
const BriefModelOutput = PrBrief.omit({ risk_level: true });

const SEVERITY_RANK: Record<RiskSeverity, number> = { low: 1, medium: 2, high: 3 };

/**
 * AC-16 per-PR "at most one concurrent generation" guard — in-process only
 * (module-level `Set`, scoped to this single server instance). Deliberately
 * NOT a Postgres advisory lock: this app's normal deployment target is a
 * single local server process (see `README.md`), so an in-process guard is
 * sufficient and — critically — lets us hold the "lock" for the full
 * duration of the LLM call WITHOUT keeping a pooled DB connection/transaction
 * checked out for that whole latency window. See the 2026-07-02 INSIGHTS.md
 * entry for why the original advisory-lock-in-transaction approach changed.
 */
const inFlightGenerations = new Set<string>();

export interface GeneratedBrief {
  what: string;
  why: string;
  risk_level: RiskSeverity;
  risks: Risk[];
  review_focus: string[];
  stale: boolean;
  cost_usd: number | null;
  tokens_in: number;
  tokens_out: number;
  missing_sections: string[];
}

export interface CachedBrief {
  what: string;
  why: string;
  risk_level: RiskSeverity;
  risks: Risk[];
  review_focus: string[];
  stale: boolean;
  cost_usd: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  missing_sections: string[];
}

/**
 * Generate (or regenerate) the brief for `pr`. AC-16 (at-most-one concurrent
 * generation per PR) is enforced by an in-process guard (`inFlightGenerations`)
 * held for the WHOLE call, including the LLM request — but no pooled DB
 * connection or transaction is held open across that network call. Input
 * aggregation and the final cache write are each their own short-lived
 * reads/writes, so a handful of concurrent Brief generations for *different*
 * PRs cannot exhaust the shared Postgres pool (`server/src/db/client.ts`,
 * `max: 10`) for the LLM call's latency window.
 *
 * On any failure (lock contention, model call failure, schema-validation
 * failure), NO cache row is written (AC-15) and the error propagates to the
 * route, which surfaces it as a retryable error envelope via the app's
 * structured error handler.
 */
export async function generateBrief(
  container: Container,
  workspaceId: string,
  pr: PullRow,
): Promise<GeneratedBrief> {
  // ---- AC-16: per-PR in-process guard (non-blocking) ------------------------
  // A second concurrent request for the SAME pr.id is rejected immediately
  // (409) instead of queued behind the first, so two concurrent requests can
  // never both reach the model call. Released in `finally` below regardless
  // of success/failure.
  if (inFlightGenerations.has(pr.id)) {
    throw new ConflictError('A brief generation is already in progress for this pull request');
  }
  inFlightGenerations.add(pr.id);

  try {
    // ---- 1. Aggregate deterministic inputs (best-effort; never throws) -----
    // Each of these is its own short-lived read (no shared transaction) —
    // `computeBlastMap`/`computeSmartDiff` and the `reviewRepo` reads already
    // open and close their own connections.
    const [intent, blastMap, smartDiff, prFiles, repo, reviews] = await Promise.all([
      container.reviewRepo.getIntent(pr.id).catch(() => undefined),
      computeBlastMap(container, pr).catch(() => null),
      computeSmartDiff(container, pr.id).catch(() => null),
      container.reviewRepo.getPrFiles(pr.id),
      container.reviewRepo.getRepo(pr.repoId),
      container.reviewRepo.reviewsForPull(pr.id).catch(() => []),
    ]);

    const projectContext = repo?.clonePath
      ? await container.projectContext
          .resolveWorkspaceDefault({ clonePath: repo.clonePath, budget: CONTEXT_BUDGET_TOKENS })
          .catch(() => null)
      : null;

    // ---- 2. Changed-file set — the grounding basis (AC-5/AC-6) -------------
    const changedFiles = new Set<string>(prFiles.map((f) => f.path));
    if (blastMap) {
      for (const s of blastMap.symbols) {
        changedFiles.add(s.file);
        for (const c of s.callers) changedFiles.add(c.file);
      }
    }

    // ---- 3. Build the prompt (pure, reviewer-core; trims to <=8K tokens) ---
    const promptInputs: BriefPromptInputs = {
      prTitle: pr.title,
      changedFileCount: prFiles.length,
      intent: intent
        ? {
            intent: intent.intent,
            in_scope: intent.in_scope,
            out_of_scope: intent.out_of_scope,
            risk_areas: intent.risk_areas,
          }
        : null,
      blastSummary: blastMap && blastMap.state !== 'empty' ? toBlastSummaryInput(blastMap) : null,
      smartDiff: smartDiff && smartDiff.groups.length > 0 ? toSmartDiffInput(smartDiff) : null,
      projectContext:
        projectContext && projectContext.contents.length > 0 ? projectContext.contents : null,
    };
    const { messages, sections_present } = buildBriefPrompt(promptInputs, container.tokenizer);
    const missingSections = ALL_SECTIONS.filter((s) => !sections_present.includes(s));

    // ---- 4. One structured model call (AC-1, AC-17) — NO DB connection ----
    // held open across this. `resolveFeatureModel` does its own tiny lookup
    // and returns before we ever touch the LLM client.
    const { provider, model } = await resolveFeatureModel(container, workspaceId, 'risk_brief');
    const llm = await container.llm(provider as Provider);

    // AC-15: on failure (retry exhaustion / schema-validation failure), wrap
    // as a retryable ExternalServiceError (502) and rethrow — NO cache row is
    // written since we never reach step 7. The app's structured error handler
    // turns this into an explicit `{ error: { code, message } }` envelope the
    // client can offer to retry.
    const result = await (async () => {
      try {
        return await llm.completeStructured({
          model,
          schema: BriefModelOutput,
          schemaName: 'pr_brief',
          temperature: 0,
          maxTokens: 1500,
          messages,
        });
      } catch (err) {
        throw new ExternalServiceError(`Brief generation failed: ${(err as Error).message}`);
      }
    })();

    // ---- 5. Ground file_refs + review_focus vs the changed set (AC-5/6/7) --
    const groundedRisks: Risk[] = result.data.risks.map((r) => ({
      ...r,
      file_refs: r.file_refs.filter((f) => changedFiles.has(f)),
    }));
    const groundedReviewFocus = result.data.review_focus.filter((f) => changedFiles.has(f));

    // ---- 5.5. Enrich with a REAL line from the latest review's findings ----
    // The model never sees diff line numbers (no full diff bodies, AC-3), so
    // it cannot know one — appending a `:line`/`:start-end` suffix here (from
    // an already-detected finding on that exact file) is the only source of a
    // line number that isn't fabricated. Bare path when no finding matches
    // (e.g. no review has run yet); never invents a line.
    const lineByFile = latestFindingLineByFile(reviews);
    const enrichedRisks: Risk[] = groundedRisks.map((r) => ({
      ...r,
      file_refs: r.file_refs.map((f) => withLine(f, lineByFile)),
    }));
    const enrichedReviewFocus = groundedReviewFocus.map((f) => withLine(f, lineByFile));

    // ---- 6. Derive risk_level (AC-2a) — never read from the model ---------
    const riskLevel = deriveRiskLevel(enrichedRisks);

    // ---- 7. Cache (AC-10/AC-12/AC-18) — short, standalone write ------------
    // `upsertBrief` is a single `insert ... onConflictDoUpdate` statement, so
    // it's already atomic without wrapping it in an explicit transaction; it
    // runs AFTER the LLM call has fully returned, so it never overlaps with
    // that network latency window.
    const stored: StoredBriefJson = {
      what: result.data.what,
      why: result.data.why,
      risk_level: riskLevel,
      risks: enrichedRisks,
      review_focus: enrichedReviewFocus,
      missing_sections: missingSections,
    };
    await upsertBrief(container.db, pr.id, {
      json: stored,
      generatedHeadSha: pr.headSha,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    });

    return {
      what: stored.what,
      why: stored.why,
      risk_level: stored.risk_level,
      risks: stored.risks,
      review_focus: stored.review_focus,
      stale: false,
      cost_usd: result.costUsd,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      missing_sections: missingSections,
    };
  } finally {
    inFlightGenerations.delete(pr.id);
  }
}

/**
 * Serve the cached brief for `pr`, with `stale` derived by comparing the
 * recorded generation HEAD against the PR's current HEAD (AC-18). Makes
 * ZERO model calls. Returns `undefined` when no brief has been generated yet.
 */
export async function getCachedBrief(
  container: Container,
  pr: PullRow,
): Promise<CachedBrief | undefined> {
  const row = await getBrief(container.db, pr.id);
  if (!row) return undefined;

  return {
    what: row.json.what,
    why: row.json.why,
    risk_level: row.json.risk_level,
    risks: row.json.risks,
    review_focus: row.json.review_focus,
    stale: row.generatedHeadSha !== pr.headSha,
    cost_usd: row.costUsd,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    missing_sections: row.json.missing_sections ?? [],
  };
}

// ---- helpers ----------------------------------------------------------------

function toBlastSummaryInput(blast: BlastMap): BriefBlastSummaryInput {
  const topSymbols = [...blast.symbols]
    .sort((a, b) => b.callers.length - a.callers.length)
    .slice(0, MAX_TOP_BLAST_SYMBOLS)
    .map((s) => ({ name: s.name, file: s.file, caller_count: s.callers.length }));

  return {
    state: blast.state,
    symbol_count: blast.symbol_count,
    caller_count: blast.caller_count,
    endpoint_count: blast.endpoint_count,
    cron_count: blast.cron_count,
    degraded_reason: blast.degraded_reason,
    top_symbols: topSymbols,
  };
}

function toSmartDiffInput(smartDiff: SmartDiff): BriefSmartDiffInput {
  return {
    groups: smartDiff.groups.map((g) => ({
      role: g.role,
      files: g.files.map((f) => f.path),
      additions: g.files.reduce((sum, f) => sum + f.additions, 0),
      deletions: g.files.reduce((sum, f) => sum + f.deletions, 0),
    })),
    too_big: smartDiff.split_suggestion.too_big,
    total_lines: smartDiff.split_suggestion.total_lines,
  };
}

/** Max `severity` across `risks[]` — lowest level ('low') when empty (AC-2a). */
function deriveRiskLevel(risks: Risk[]): RiskSeverity {
  let max: RiskSeverity = 'low';
  for (const r of risks) {
    if (SEVERITY_RANK[r.severity] > SEVERITY_RANK[max]) max = r.severity;
  }
  return max;
}

/** file → a real (non-dismissed) finding's line, from the latest `kind:'review'`
 * run (`reviews` is newest-first; a `kind:'summary'` row has no findings to
 * offer). First matching finding per file wins — any one is a legitimately
 * grounded line, not a fabricated one. */
function latestFindingLineByFile(
  reviews: { review: ReviewRow; findings: FindingRow[] }[],
): Map<string, { startLine: number; endLine: number }> {
  const map = new Map<string, { startLine: number; endLine: number }>();
  const latest = reviews.find(({ review }) => review.kind === 'review');
  if (!latest) return map;
  for (const f of latest.findings) {
    if (f.dismissedAt || map.has(f.file)) continue;
    map.set(f.file, { startLine: f.startLine, endLine: f.endLine });
  }
  return map;
}

/** Appends a real `:line`/`:start-end` suffix when `path` matches a known
 * finding location; returns `path` unchanged otherwise (never invents one). */
function withLine(path: string, lineByFile: Map<string, { startLine: number; endLine: number }>): string {
  const loc = lineByFile.get(path);
  if (!loc) return path;
  return loc.endLine !== loc.startLine ? `${path}:${loc.startLine}-${loc.endLine}` : `${path}:${loc.startLine}`;
}
