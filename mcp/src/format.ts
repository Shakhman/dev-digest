import type { FindingLocal, ReviewDtoLocal } from './api-client.js';

/** Filter reviews within 120s window of newest for "latest session" */
export const BATCH_WINDOW_MS = 120_000;

export interface TrimmedFinding {
  severity: string;
  title: string;
  file: string;
  line: string;
  rationale: string;
  suggestion?: string;
}

export interface TrimmedReview {
  agent: string | null;
  verdict: string | null;
  score: number | null;
  findings: TrimmedFinding[];
}

/** Trim one finding: collapse line range, drop noise fields */
export function trimFinding(f: FindingLocal): TrimmedFinding {
  let line: string;
  if (f.start_line == null) {
    line = '';
  } else if (f.end_line != null && f.end_line !== f.start_line) {
    line = `${f.start_line}-${f.end_line}`;
  } else {
    line = String(f.start_line);
  }

  const result: TrimmedFinding = {
    severity: f.severity,
    title: f.title,
    file: f.file,
    line,
    rationale: f.rationale,
  };

  if (f.suggestion != null) {
    result.suggestion = f.suggestion;
  }

  return result;
}

/** Trim one review to the essential verdict block */
export function trimReview(r: ReviewDtoLocal): TrimmedReview {
  return {
    agent: r.agent_name,
    verdict: r.verdict,
    score: r.score,
    findings: r.findings.map(trimFinding),
  };
}

/**
 * Filter kind==='review', sort created_at descending,
 * include all within BATCH_WINDOW_MS of newest.
 */
export function pickLatestSession(reviews: ReviewDtoLocal[]): ReviewDtoLocal[] {
  const filtered = reviews.filter((r) => r.kind === 'review');
  if (filtered.length === 0) return [];

  // Sort newest-first
  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const newestAt = new Date(filtered[0]!.created_at).getTime();
  return filtered.filter(
    (r) => newestAt - new Date(r.created_at).getTime() <= BATCH_WINDOW_MS,
  );
}

/** Wrap any value as a single MCP text content block */
export function toToolText(value: unknown): { content: [{ type: 'text'; text: string }] } {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
  };
}
