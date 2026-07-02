import { z } from 'zod';
import { DiffFileSummary } from '@devdigest/shared';
import type { Provider, RiskSeverity } from '@devdigest/shared';
import { buildDiffSummaryPrompt } from '@devdigest/reviewer-core';
import type { DiffSummaryFileInput } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../../db/rows.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConflictError, ExternalServiceError } from '../../platform/errors.js';
import { getCachedBrief, type CachedBrief } from '../brief/service.js';
import {
  getDiffSummary,
  upsertDiffSummary,
  type StoredDiffSummaryJson,
} from './repository.js';

/**
 * `diff-summary` module service (T-B5) — the SOLE owner of Smart Diff
 * `pseudocode_summary` generation, grounding, and caching.
 *
 * A separate opt-in path from `computeSmartDiff` (`smart-diff/service.ts`),
 * which stays free/deterministic — the `brief` SPEC-09 aggregator relies on
 * that guarantee. Reaches PR files through `container.reviewRepo.getPrFiles`
 * (short read, no transaction); all I/O — including the one batched
 * structured model call — stays here.
 */

/** The model returns everything the service needs; the JSON object wrapper
 * (rather than a bare array) matches strict json_schema structured-output
 * requirements (see `conventions/extractor.ts`'s `RawCandidateList` precedent). */
const DiffSummaryModelOutput = z.object({ summaries: z.array(DiffFileSummary) });

/**
 * AC-style per-PR "at most one concurrent generation" guard — in-process
 * only (module-level `Set`, scoped to this single server instance).
 * Deliberately NOT a Postgres advisory lock held across the LLM call — see
 * the 2026-07-02 INSIGHTS.md entry (`brief/service.ts`) for why: holding a
 * pooled DB connection/transaction open for the full duration of a
 * latency-bound structured call risks exhausting the shared pool app-wide.
 */
const inFlightGenerations = new Set<string>();

export interface GeneratedDiffSummary {
  summaries: { path: string; summary: string }[];
  stale: boolean;
  cost_usd: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
}

export type CachedDiffSummary = GeneratedDiffSummary;

/**
 * Merge freshly-generated summaries into whatever was already cached, keyed
 * by `path`. New entries replace old ones for the same path; entries for
 * paths NOT in `fresh` are preserved unchanged. Used so a single-file (or
 * any narrowed-batch) regeneration never clobbers other files' cached
 * summaries — see `generateDiffSummary`'s `paths` param.
 */
function mergeSummaries(
  existing: { path: string; summary: string }[],
  fresh: { path: string; summary: string }[],
): { path: string; summary: string }[] {
  const byPath = new Map(existing.map((s) => [s.path, s]));
  for (const s of fresh) byPath.set(s.path, s);
  return [...byPath.values()];
}

const RISK_SEVERITY_RANK: Record<RiskSeverity, number> = { low: 1, medium: 2, high: 3 };

/** Brief risk `file_refs` may carry a grounded `:line`/`:start-end` suffix
 * (`brief/service.ts`'s `withLine`) — strip it to match against a bare
 * `pr_files.path` / `SmartDiffFile.path`. */
function stripLineSuffix(fileRef: string): string {
  return fileRef.replace(/:\d+(-\d+)?$/, '');
}

/**
 * Zero-cost reuse: if the Why-Risk Brief has already been generated for this
 * PR, its `risks[].explanation` is ALREADY a real, model-written description
 * of the files it references — reuse that text instead of paying for a
 * second LLM call to describe the same file. Only covers files a Brief risk
 * actually names; every other file still falls through to the normal
 * per-file model call below. When a file is named by more than one risk, the
 * highest-severity risk's explanation wins (most salient description).
 * Best-effort: a missing/unreadable Brief just yields an empty map (falls
 * through to the model), matching this codebase's "enrichment, never a hard
 * dependency" convention (`server/CLAUDE.md`).
 */
function briefExplanationsByPath(brief: CachedBrief | undefined): Map<string, string> {
  const bestByPath = new Map<string, { explanation: string; severity: RiskSeverity }>();
  if (!brief) return new Map();

  for (const risk of brief.risks) {
    for (const ref of risk.file_refs) {
      const path = stripLineSuffix(ref);
      const current = bestByPath.get(path);
      if (!current || RISK_SEVERITY_RANK[risk.severity] > RISK_SEVERITY_RANK[current.severity]) {
        bestByPath.set(path, { explanation: risk.explanation, severity: risk.severity });
      }
    }
  }

  return new Map([...bestByPath].map(([path, v]) => [path, v.explanation]));
}

/**
 * Generate (or regenerate) the per-file summaries for `pr`. A second
 * concurrent request for the SAME `pr.id` is rejected immediately with a 409
 * (`ConflictError`) rather than queued. On any failure (lock contention,
 * model call failure, schema-validation failure), NO cache row is written
 * and the error propagates to the route.
 *
 * `paths`, when provided, narrows the batch to only those files (e.g. a
 * single-file "generate just this one" trigger from the UI) — the result is
 * MERGED into whatever is already cached for this PR rather than replacing
 * the whole cached row, so regenerating one file's summary never erases
 * another file's. When omitted, behaves as a full-batch generation over
 * every summarizable file.
 *
 * Before calling the model, each requested file is checked against the
 * already-generated Why-Risk Brief (`brief/service.ts`'s `getCachedBrief` —
 * a facade read, zero model calls): if a Brief risk already names that file,
 * its `explanation` is reused verbatim as the file's summary instead of
 * paying for a second LLM call to describe the same file. Only the files NOT
 * covered that way go to the model — if the Brief already covers every
 * requested file, the structured call is skipped entirely (genuinely zero
 * cost for that request). This reuse is re-checked on every call, including
 * regenerate, so it never goes stale relative to the Brief's own cache.
 */
export async function generateDiffSummary(
  container: Container,
  workspaceId: string,
  pr: PullRow,
  paths?: string[],
): Promise<GeneratedDiffSummary> {
  if (inFlightGenerations.has(pr.id)) {
    throw new ConflictError('A diff summary generation is already in progress for this pull request');
  }
  inFlightGenerations.add(pr.id);

  try {
    // ---- 1. Load PR files (short read, no shared transaction) -------------
    const prFiles = await container.reviewRepo.getPrFiles(pr.id);

    // GitHub omits `patch` for very large diffs (>~1000 changed lines) — skip
    // those files, nothing to summarize (no fetch failure).
    let summarizable = prFiles.filter(
      (f): f is typeof f & { patch: string } => f.patch != null && f.patch.length > 0,
    );
    if (paths) {
      const pathSet = new Set(paths);
      summarizable = summarizable.filter((f) => pathSet.has(f.path));
    }

    if (summarizable.length === 0) {
      // Narrowed batch with nothing to summarize: never clobber an existing
      // cache row with an empty one — just return it unchanged (no upsert,
      // no model call). Only write an empty row when there's no cache yet AND
      // this is a full-batch call (unaffected, pre-existing behavior).
      if (paths) {
        const existing = await getDiffSummary(container.db, pr.id);
        if (existing) {
          return {
            summaries: existing.json.summaries,
            stale: existing.generatedHeadSha !== pr.headSha,
            cost_usd: existing.costUsd,
            tokens_in: existing.tokensIn,
            tokens_out: existing.tokensOut,
          };
        }
      }
      const stored: StoredDiffSummaryJson = { summaries: [] };
      await upsertDiffSummary(container.db, pr.id, {
        json: stored,
        generatedHeadSha: pr.headSha,
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
      });
      return { summaries: [], stale: false, cost_usd: null, tokens_in: null, tokens_out: null };
    }

    // ---- 2. Reuse the Why-Risk Brief's already-paid-for risk explanations --
    // (facade read only — zero model calls). Split the batch into files a
    // cached Brief already describes vs. files that still need a fresh call.
    const brief = await getCachedBrief(container, pr).catch(() => undefined);
    const briefByPath = briefExplanationsByPath(brief);

    const briefDerived: { path: string; summary: string }[] = [];
    const needsModel: typeof summarizable = [];
    for (const f of summarizable) {
      const reused = briefByPath.get(f.path);
      if (reused != null) briefDerived.push({ path: f.path, summary: reused });
      else needsModel.push(f);
    }

    let modelSummaries: { path: string; summary: string }[] = [];
    let tokensIn: number | null = null;
    let tokensOut: number | null = null;
    let costUsd: number | null = null;

    // ---- 3. Only the files NOT already covered by the Brief go to the model
    // — when every requested file is Brief-covered, this whole block (prompt
    // build, model resolution, the structured call) is skipped entirely, so
    // that request costs nothing.
    if (needsModel.length > 0) {
      const files: DiffSummaryFileInput[] = needsModel.map((f) => ({ path: f.path, patch: f.patch }));
      const { messages, includedPaths } = buildDiffSummaryPrompt(
        { prTitle: pr.title, files },
        container.tokenizer,
      );
      const includedPathSet = new Set(includedPaths);

      const { provider, model } = await resolveFeatureModel(container, workspaceId, 'smart_diff_summary');
      const llm = await container.llm(provider as Provider);

      const result = await (async () => {
        try {
          return await llm.completeStructured({
            model,
            schema: DiffSummaryModelOutput,
            schemaName: 'diff_summary',
            temperature: 0,
            maxTokens: 2000,
            messages,
          });
        } catch (err) {
          throw new ExternalServiceError(`Diff summary generation failed: ${(err as Error).message}`);
        }
      })();

      // Ground: keep only paths that were actually part of the batch (drops
      // any hallucinated/invented path the model might return, and any path
      // outside what was actually sent after budget-trimming).
      modelSummaries = result.data.summaries.filter((s) => includedPathSet.has(s.path));
      tokensIn = result.tokensIn;
      tokensOut = result.tokensOut;
      costUsd = result.costUsd;
    }

    // ---- 4. Cache — merge into whatever's already there, short standalone
    // write. A narrowed (`paths`) batch must not erase other files' cached
    // summaries; merging is a safe no-op superset when `paths` is omitted too.
    const freshSummaries = [...briefDerived, ...modelSummaries];
    const existing = await getDiffSummary(container.db, pr.id);
    const mergedSummaries = mergeSummaries(existing?.json.summaries ?? [], freshSummaries);

    const stored: StoredDiffSummaryJson = { summaries: mergedSummaries };
    await upsertDiffSummary(container.db, pr.id, {
      json: stored,
      generatedHeadSha: pr.headSha,
      tokensIn,
      tokensOut,
      costUsd,
    });

    return {
      summaries: mergedSummaries,
      stale: false,
      cost_usd: costUsd,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
    };
  } finally {
    inFlightGenerations.delete(pr.id);
  }
}

/**
 * Serve the cached diff summary for `pr`, with `stale` derived by comparing
 * the recorded generation HEAD against the PR's current HEAD. Makes ZERO
 * model calls. Returns `undefined` when no summary has been generated yet.
 */
export async function getCachedDiffSummary(
  container: Container,
  pr: PullRow,
): Promise<CachedDiffSummary | undefined> {
  const row = await getDiffSummary(container.db, pr.id);
  if (!row) return undefined;

  return {
    summaries: row.json.summaries,
    stale: row.generatedHeadSha !== pr.headSha,
    cost_usd: row.costUsd,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
  };
}
