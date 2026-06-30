/**
 * Blast Radius (L04) — the PR impact-map contract.
 *
 * Distinct from `brief.ts`'s `BlastRadius` (the LLM-structured brief variant).
 * This is the read-only map served by `GET /pulls/:id/blast`, built ENTIRELY
 * from the repo-intel index (`container.repoIntel.getBlastRadius`) — no model
 * tokens. Shaped as a tree the UI renders directly: each changed symbol carries
 * its callers (file:line, rank-sorted) and the endpoints/crons reachable
 * through them.
 *
 * MIRRORED: keep byte-identical with `server/src/vendor/shared/contracts/blast.ts`.
 */
import { z } from 'zod';

/** A cross-file caller of a changed symbol. */
export const BlastMapCaller = z.object({
  /** Repo-relative path of the caller file. */
  file: z.string(),
  /** Enclosing symbol the call lives in (best-effort; file basename fallback). */
  symbol: z.string(),
  /** 1-based line of the reference (for the file:line deep-link). */
  line: z.number().int(),
  /** file_rank percentile of the caller file (0 on the degraded/ripgrep path). */
  rank: z.number(),
});
export type BlastMapCaller = z.infer<typeof BlastMapCaller>;

/** One changed symbol and everything reachable from it. */
export const BlastMapNode = z.object({
  /** File the symbol is declared in. */
  file: z.string(),
  /** Symbol name. */
  name: z.string(),
  /** function | method | class | … */
  kind: z.string(),
  /** Callers reaching this symbol, rank-sorted (most important first). */
  callers: z.array(BlastMapCaller),
  /** "METHOD /path" HTTP endpoints reachable through this symbol's callers. */
  endpoints: z.array(z.string()),
  /** Cron job names reachable through this symbol's callers. */
  crons: z.array(z.string()),
});
export type BlastMapNode = z.infer<typeof BlastMapNode>;

export const BlastMapState = z.enum(['ok', 'empty', 'degraded']);
export type BlastMapState = z.infer<typeof BlastMapState>;

export const BlastMap = z.object({
  /** ok = full map; empty = no impact to show; degraded = best-effort + badge. */
  state: BlastMapState,
  /** Changed symbols that have at least one caller, rank-sorted. */
  symbols: z.array(BlastMapNode),
  /** Header counts (global, deduped — not the sum of per-symbol counts). */
  symbol_count: z.number().int(),
  caller_count: z.number().int(),
  endpoint_count: z.number().int(),
  cron_count: z.number().int(),
  /** Why the map is degraded (mirrors BlastResult.reason); null otherwise. */
  degraded_reason: z.string().nullable(),
});
export type BlastMap = z.infer<typeof BlastMap>;
