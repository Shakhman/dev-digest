import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DiffSummaryResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { generateDiffSummary, getCachedDiffSummary } from './service.js';

/** Optional per-request body used by exactly this one route — route-local,
 * no need for `_shared/schemas.ts` or a vendored shared contract. When
 * `paths` is omitted, generation covers the full PR (unchanged, legacy
 * behavior); when present, narrows the batch to just those files (the
 * per-file "Summary" trigger). */
const GenerateDiffSummaryBody = z
  .object({ paths: z.array(z.string()).min(1).optional() })
  .optional();

/**
 * Smart Diff file-summary generation module (T-B5) — a separate, opt-in path
 * from the deterministic `GET /pulls/:id/smart-diff` (`smart-diff/routes.ts`,
 * which stays free of model calls so the `brief` aggregator's
 * zero-extra-model-call guarantee holds).
 *
 * GET  /pulls/:id/diff-summary → cached read only, zero model calls
 * POST /pulls/:id/diff-summary → generate/regenerate one or more files (one
 *                                 batched model call over the requested
 *                                 `paths`, or the whole PR when omitted)
 */
export default async function diffSummaryRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/diff-summary',
    { schema: { params: IdParams, response: { 200: DiffSummaryResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);

      const pr = await container.reviewRepo.getPull(workspaceId, req.params.id);
      if (!pr) throw new NotFoundError('Pull request not found');

      const summary = await getCachedDiffSummary(container, pr);
      if (!summary) throw new NotFoundError('No diff summary has been generated for this pull request');

      return summary;
    },
  );

  app.post(
    '/pulls/:id/diff-summary',
    {
      schema: {
        params: IdParams,
        body: GenerateDiffSummaryBody,
        response: { 200: DiffSummaryResponse },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);

      const pr = await container.reviewRepo.getPull(workspaceId, req.params.id);
      if (!pr) throw new NotFoundError('Pull request not found');

      return generateDiffSummary(container, workspaceId, pr, req.body?.paths);
    },
  );
}
