import { eq } from 'drizzle-orm';
import type { PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * `pr_brief` data access (T-B5). Kept as its own tiny repository (rather than
 * folded into `ReviewRepository`) so the `brief` module owns its cache
 * read/write end to end, per the plan's module-boundaries constraint.
 *
 * `missing_sections` (AC-14) is nested inside the `json` jsonb blob alongside
 * the `PrBrief` fields — the T-B3 migration only adds dedicated columns for
 * `generated_head_sha` / `tokens_in` / `tokens_out` / `cost_usd` (mirroring
 * the `agent_runs.cost_usd` precedent), so this avoids a second schema change
 * for a field that is not part of the model-facing `PrBrief` contract itself.
 */
export type StoredBriefJson = PrBrief & { missing_sections: string[] };

export interface BriefRow {
  json: StoredBriefJson;
  generatedHeadSha: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

/** A subset of the Drizzle query-builder API shared by `Db` and a `db.transaction` callback's `tx`. */
type DbLike = Pick<Db, 'select' | 'insert'>;

export async function getBrief(db: DbLike, prId: string): Promise<BriefRow | undefined> {
  const [row] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
  if (!row) return undefined;
  return {
    json: row.json as StoredBriefJson,
    generatedHeadSha: row.generatedHeadSha,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costUsd: row.costUsd,
  };
}

export async function upsertBrief(
  db: DbLike,
  prId: string,
  values: {
    json: StoredBriefJson;
    generatedHeadSha: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number | null;
  },
): Promise<void> {
  await db
    .insert(t.prBrief)
    .values({
      prId,
      json: values.json,
      generatedHeadSha: values.generatedHeadSha,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      costUsd: values.costUsd,
    })
    .onConflictDoUpdate({
      target: t.prBrief.prId,
      set: {
        json: values.json,
        generatedHeadSha: values.generatedHeadSha,
        tokensIn: values.tokensIn,
        tokensOut: values.tokensOut,
        costUsd: values.costUsd,
      },
    });
}
