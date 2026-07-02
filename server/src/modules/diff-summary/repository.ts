import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * `pr_diff_summary` data access (T-B5). Kept as its own tiny repository
 * (mirrors `brief/repository.ts`) so the `diff-summary` module owns its cache
 * read/write end to end.
 */
export interface StoredDiffSummaryJson {
  summaries: { path: string; summary: string }[];
}

export interface DiffSummaryRow {
  json: StoredDiffSummaryJson;
  generatedHeadSha: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

/** A subset of the Drizzle query-builder API shared by `Db` and a `db.transaction` callback's `tx`. */
type DbLike = Pick<Db, 'select' | 'insert'>;

export async function getDiffSummary(db: DbLike, prId: string): Promise<DiffSummaryRow | undefined> {
  const [row] = await db.select().from(t.prDiffSummary).where(eq(t.prDiffSummary.prId, prId));
  if (!row) return undefined;
  return {
    json: row.json as StoredDiffSummaryJson,
    generatedHeadSha: row.generatedHeadSha,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costUsd: row.costUsd,
  };
}

export async function upsertDiffSummary(
  db: DbLike,
  prId: string,
  values: {
    json: StoredDiffSummaryJson;
    generatedHeadSha: string;
    tokensIn: number | null;
    tokensOut: number | null;
    costUsd: number | null;
  },
): Promise<void> {
  await db
    .insert(t.prDiffSummary)
    .values({
      prId,
      json: values.json,
      generatedHeadSha: values.generatedHeadSha,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      costUsd: values.costUsd,
    })
    .onConflictDoUpdate({
      target: t.prDiffSummary.prId,
      set: {
        json: values.json,
        generatedHeadSha: values.generatedHeadSha,
        tokensIn: values.tokensIn,
        tokensOut: values.tokensOut,
        costUsd: values.costUsd,
      },
    });
}
