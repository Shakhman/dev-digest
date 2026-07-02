import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PrBrief } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { generateBrief, getCachedBrief } from './service.js';

/**
 * Why+Risk Brief module (SPEC-09, T-B5) — the sole owner of brief
 * aggregation, generation, grounding, and caching (`service.ts`).
 *
 * POST /pulls/:id/brief → generate/regenerate (one model call, AC-1/AC-10)
 * GET  /pulls/:id/brief → cached read only, zero model calls (AC-8/AC-9)
 */

/** `PrBrief` extended with the generation/serving metadata the card needs. */
const BriefResponse = PrBrief.extend({
  /** True when the recorded generation HEAD differs from the PR's current HEAD (AC-18). */
  stale: z.boolean(),
  /** As reported by the structured call; null when unavailable (AC-13). */
  cost_usd: z.number().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  /** Input sections absent/trimmed from the assembled prompt (AC-14). */
  missing_sections: z.array(z.string()),
});

export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: BriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);

      // Workspace ownership confirmed BEFORE the cache read (AC-11) — mirrors
      // blast/routes.ts's PR-resolution pattern.
      const pr = await container.reviewRepo.getPull(workspaceId, req.params.id);
      if (!pr) throw new NotFoundError('Pull request not found');

      const brief = await getCachedBrief(container, pr);
      if (!brief) throw new NotFoundError('No brief has been generated for this pull request');

      return brief;
    },
  );

  app.post(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: BriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);

      const pr = await container.reviewRepo.getPull(workspaceId, req.params.id);
      if (!pr) throw new NotFoundError('Pull request not found');

      return generateBrief(container, workspaceId, pr);
    },
  );
}
