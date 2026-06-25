import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq } from 'drizzle-orm';
import { SmartDiff } from '@devdigest/shared';
import type { SmartDiffRole } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { classifyFile } from './classifier.js';
import { SPLIT_TOO_BIG_LINES } from './constants.js';

/**
 * Smart Diff module — classifies PR files into core / wiring / boilerplate
 * groups and annotates each file with finding lines from the latest review.
 *
 * GET /pulls/:id/smart-diff → SmartDiff
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams } },
    async (req): Promise<SmartDiff> => {
      const { workspaceId } = await getContext(container, req);

      // 1. Resolve PR (workspace-scoped)
      const [pr] = await container.db
        .select()
        .from(t.pullRequests)
        .where(
          and(
            eq(t.pullRequests.workspaceId, workspaceId),
            eq(t.pullRequests.id, req.params.id),
          ),
        );
      if (!pr) throw new NotFoundError('Pull request not found');

      // 2. Load PR files
      const files = await container.db
        .select()
        .from(t.prFiles)
        .where(eq(t.prFiles.prId, pr.id));

      // 3. Optionally load latest review findings
      const findingLinesByPath = new Map<string, number[]>();

      const [latestReview] = await container.db
        .select()
        .from(t.reviews)
        .where(and(eq(t.reviews.prId, pr.id), eq(t.reviews.kind, 'review')))
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

      // 4. Classify files and accumulate groups + totalLines
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

      // 5. Build SmartDiff response
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
    },
  );
}
