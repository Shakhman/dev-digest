import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiff } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { computeSmartDiff } from './service.js';

/**
 * Smart Diff module — classifies PR files into core / wiring / boilerplate
 * groups and annotates each file with finding lines from the latest review.
 *
 * The computation itself lives in `service.ts` (T-B1) so other modules (the
 * `brief` aggregator) can reuse it without re-entering this route.
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

      const pr = await container.reviewRepo.getPull(workspaceId, req.params.id);
      if (!pr) throw new NotFoundError('Pull request not found');

      return computeSmartDiff(container, pr.id);
    },
  );
}
