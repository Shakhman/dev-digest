import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastMap } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { computeBlastMap } from './service.js';

/**
 * Blast Radius module — the PR impact map.
 *
 * Reads the pre-built repo-intel index via `container.repoIntel.getBlastRadius`
 * (the ONLY data source — no analysis, no model tokens) and re-shapes the flat
 * `BlastResult` into a per-changed-symbol tree: each symbol carries its
 * rank-sorted callers and the endpoints/crons reachable through them.
 *
 * Best-effort: an unindexed / partial repo degrades (state 'degraded' + reason)
 * rather than throwing, so the UI shows a badge instead of a blank panel.
 *
 * The computation itself lives in `service.ts` (T-B1) so other modules (the
 * `brief` aggregator) can reuse it without re-entering this route.
 *
 * GET /pulls/:id/blast → BlastMap
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastMap } } },
    async (req): Promise<BlastMap> => {
      const { workspaceId } = await getContext(container, req);

      const pr = await container.reviewRepo.getPull(workspaceId, req.params.id);
      if (!pr) throw new NotFoundError('Pull request not found');

      return computeBlastMap(container, pr);
    },
  );
}
