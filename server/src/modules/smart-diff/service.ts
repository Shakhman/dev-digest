import { and, desc, eq } from 'drizzle-orm';
import { SmartDiff } from '@devdigest/shared';
import type { SmartDiffRole } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';
import { classifyFile } from './classifier.js';
import { SPLIT_TOO_BIG_LINES } from './constants.js';

/**
 * T-B1 — Smart Diff computation, extracted from the route so other modules
 * (the `brief` aggregator) can reuse it via a service function instead of
 * re-entering the HTTP layer. Assumes `prId` has already been workspace-scoped
 * by the caller (mirrors the route's pre-extraction behaviour exactly).
 *
 * Classifies PR files into core / wiring / boilerplate groups and annotates
 * each file with finding lines from the latest review.
 */
export async function computeSmartDiff(container: Container, prId: string): Promise<SmartDiff> {
  // 1. Load PR files
  const files = await container.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));

  // 2. Optionally load latest review findings
  const findingLinesByPath = new Map<string, number[]>();

  const [latestReview] = await container.db
    .select()
    .from(t.reviews)
    .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
    .orderBy(desc(t.reviews.createdAt))
    .limit(1);

  if (latestReview) {
    const findingRows = await container.db
      .select({ file: t.findings.file, startLine: t.findings.startLine })
      .from(t.findings)
      .where(eq(t.findings.reviewId, latestReview.id));

    for (const row of findingRows) {
      const existing = findingLinesByPath.get(row.file) ?? [];
      existing.push(row.startLine);
      findingLinesByPath.set(row.file, existing);
    }
  }

  // 3. Classify files and accumulate groups + totalLines
  const roleOrder: SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];
  const groupFiles = new Map<SmartDiffRole, typeof files>([
    ['core', []],
    ['wiring', []],
    ['boilerplate', []],
  ]);
  let totalLines = 0;

  for (const file of files) {
    const role = classifyFile(file.path);
    groupFiles.get(role)!.push(file);
    totalLines += (file.additions ?? 0) + (file.deletions ?? 0);
  }

  // 4. Build SmartDiff response
  const groups = roleOrder
    .filter((role) => groupFiles.get(role)!.length > 0)
    .map((role) => ({
      role,
      files: groupFiles.get(role)!.map((file) => ({
        path: file.path,
        pseudocode_summary: null,
        additions: file.additions ?? 0,
        deletions: file.deletions ?? 0,
        finding_lines: findingLinesByPath.get(file.path) ?? [],
      })),
    }));

  return {
    groups,
    split_suggestion: {
      too_big: totalLines > SPLIT_TOO_BIG_LINES,
      total_lines: totalLines,
      proposed_splits: [],
    },
  };
}
