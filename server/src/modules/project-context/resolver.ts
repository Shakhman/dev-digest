/**
 * T-B4 — Pure, DB-free effective-set resolver.
 *
 * Two responsibilities:
 *   1. `resolveOrder` — merge + dedup the agent's own doc paths with
 *      skill-inherited paths in AC-11 order.
 *   2. `admitToBudget` — admit docs in order until the token budget is reached,
 *      truncate the boundary doc to fit, record excluded/truncated.
 *
 * No I/O, no DB access — fully unit-testable in isolation.
 */

// ---------- resolveOrder ------------------------------------------------------

export interface PathLink {
  path: string;
  order: number;
}

export interface ResolveOrderInput {
  /** Agent's own attached docs (by stored order). */
  agentPaths: PathLink[];
  /**
   * One entry per enabled skill (in skill order). Each entry holds that skill's
   * attached doc paths (by per-skill stored order).
   */
  skillGroups: { paths: PathLink[] }[];
}

/**
 * Return the ordered, deduplicated list of repo-relative doc paths.
 *
 * AC-11 ordering:
 *   1. Agent's own attached docs, sorted by their stored `order` (ascending).
 *   2. Skill-inherited docs NOT already in the set: process skills in their
 *      skill-level order; within each skill, process docs by their per-skill
 *      `order`.
 *
 * Deterministic: for a fixed input the output is always identical.
 */
export function resolveOrder({ agentPaths, skillGroups }: ResolveOrderInput): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  // 1. Agent's own docs first.
  const sortedAgent = [...agentPaths].sort((a, b) => a.order - b.order);
  for (const { path } of sortedAgent) {
    if (seen.has(path)) continue;
    seen.add(path);
    result.push(path);
  }

  // 2. Skill-inherited docs (skill order is the array index in skillGroups).
  for (const { paths } of skillGroups) {
    const sortedSkill = [...paths].sort((a, b) => a.order - b.order);
    for (const { path } of sortedSkill) {
      if (seen.has(path)) continue;
      seen.add(path);
      result.push(path);
    }
  }

  return result;
}

// ---------- admitToBudget -----------------------------------------------------

export interface DocEntry {
  path: string;
  content: string;
  tokens: number;
}

export interface AdmitToBudgetInput {
  /** Docs in assembly order (output of resolveOrder applied to read content). */
  docs: DocEntry[];
  /** Maximum number of tokens allowed for the whole ## Project context block. */
  budget: number;
}

export interface AdmitToBudgetResult {
  /** Docs admitted whole (may include one truncated at the boundary). */
  included: DocEntry[];
  /**
   * At most one doc, the one that was truncated to fit at the budget boundary.
   * The `content` in this entry is the TRUNCATED version and `tokens` is the
   * truncated token count.
   */
  truncated: DocEntry[];
  /** Docs that did not fit at all (past the boundary). */
  excluded: DocEntry[];
}

/**
 * Admit documents in assembly order until the token budget is exhausted.
 *
 * AC-20 policy:
 *   - Admit whole docs in order while cumulative tokens ≤ budget.
 *   - The first doc that would exceed the budget is truncated to fit
 *     (character-level approximation: trim to `budget_remaining / 1 * 4`
 *     characters, re-count). If budget_remaining is 0 it is simply excluded.
 *   - All subsequent docs are excluded.
 *   - Never throws.
 */
export function admitToBudget({ docs, budget }: AdmitToBudgetInput): AdmitToBudgetResult {
  const included: DocEntry[] = [];
  const truncated: DocEntry[] = [];
  const excluded: DocEntry[] = [];

  let remaining = budget;
  let boundaryHit = false;

  for (const doc of docs) {
    if (boundaryHit) {
      excluded.push(doc);
      continue;
    }

    if (doc.tokens <= remaining) {
      // Fits whole.
      included.push(doc);
      remaining -= doc.tokens;
    } else {
      // This doc crosses the boundary.
      boundaryHit = true;
      if (remaining <= 0) {
        // No room at all.
        excluded.push(doc);
        continue;
      }
      // Truncate: character-level heuristic (4 chars ≈ 1 token).
      const maxChars = remaining * 4;
      const truncatedContent = doc.content.slice(0, maxChars);
      // Approx token count for the truncated content.
      const truncatedTokens = Math.ceil(truncatedContent.length / 4);
      included.push({ ...doc, content: truncatedContent, tokens: truncatedTokens });
      truncated.push({ ...doc, content: truncatedContent, tokens: truncatedTokens });
      remaining = 0;
    }
  }

  return { included, truncated, excluded };
}
