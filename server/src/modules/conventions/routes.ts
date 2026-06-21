import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

const UpdateBody = z.object({
  rule: z.string().min(1).optional(),
  evidence_snippet: z.string().optional(),
  category: z.string().nullable().optional(),
  accepted: z.boolean().optional(),
});

/**
 * L02 — conventions module.
 *   GET    /repos/:id/conventions             → list candidates
 *   POST   /repos/:id/conventions/extract     → run extraction (replaces set)
 *   GET    /repos/:id/conventions/skill-draft → merged-skill draft (accepted only)
 *   PATCH  /conventions/:id                   → accept / reject-toggle / edit
 *   DELETE /conventions/:id                   → reject (remove)
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.skillDraft(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.update(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );

  app.delete('/conventions/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.reject(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Convention not found');
    return { ok: true };
  });
}
