import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ContextDocLink, EffectiveContextDoc, SpecFile } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ProjectContextService } from './service.js';

/**
 * Project Context module routes.
 *
 *   GET  /repos/:id/context                  → SpecFile[] (T-B2)
 *   GET  /agents/:id/context-docs            → ContextDocLink[] (T-B3)
 *   PUT  /agents/:id/context-docs            → ContextDocLink[] (T-B3)
 *   GET  /agents/:id/effective-context       → EffectiveContextDoc[] (T-B3)
 *   GET  /skills/:id/context-docs            → ContextDocLink[] (T-B3)
 *   PUT  /skills/:id/context-docs            → ContextDocLink[] (T-B3)
 *
 * NOTE: all static sub-paths (e.g. /agents/:id/context-docs) must be registered
 * BEFORE any catch-all /:id route to avoid Fastify param shadowing.
 */

const SetContextDocsBody = z.object({
  paths: z.array(z.string()),
});

const DiscoveryResponse = z.object({
  files: z.array(SpecFile),
  reason: z.string().optional(),
});

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ProjectContextService(app.container);

  // ---- T-B2: Discovery --------------------------------------------------------

  /**
   * GET /repos/:id/context
   * Returns discovered Markdown files in the repo's clone with source badge,
   * content, token size, and usage count (AC-1/2/3/4/23/24).
   */
  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: DiscoveryResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.discoverFiles(workspaceId, req.params.id);
    },
  );

  // ---- T-B3: Agent context-docs -----------------------------------------------

  /**
   * GET /agents/:id/context-docs
   * Returns the ordered list of context docs attached to an agent, with
   * missing flag per path.
   */
  app.get(
    '/agents/:id/context-docs',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.getAgentContextDocs(workspaceId, req.params.id);
      if (!links) throw new NotFoundError('Agent not found');
      return links;
    },
  );

  /**
   * PUT /agents/:id/context-docs
   * Replace the full ordered path list for an agent.
   */
  app.put(
    '/agents/:id/context-docs',
    { schema: { params: IdParams, body: SetContextDocsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.setAgentContextDocs(
        workspaceId,
        req.params.id,
        req.body.paths,
      );
      if (!links) throw new NotFoundError('Agent not found');
      return links;
    },
  );

  /**
   * GET /agents/:id/effective-context
   * Returns the ordered, deduped union of the agent's own docs + inherited docs
   * from enabled skills, in AC-11 order (AC-22 preview).
   */
  app.get(
    '/agents/:id/effective-context',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const docs = await service.getEffectiveContext(workspaceId, req.params.id);
      if (!docs) throw new NotFoundError('Agent not found');
      return docs;
    },
  );

  // ---- T-B3: Skill context-docs -----------------------------------------------

  /**
   * GET /skills/:id/context-docs
   * Returns the ordered list of context docs attached to a skill.
   */
  app.get(
    '/skills/:id/context-docs',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.getSkillContextDocs(workspaceId, req.params.id);
      if (!links) throw new NotFoundError('Skill not found');
      return links;
    },
  );

  /**
   * PUT /skills/:id/context-docs
   * Replace the full ordered path list for a skill.
   */
  app.put(
    '/skills/:id/context-docs',
    { schema: { params: IdParams, body: SetContextDocsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.setSkillContextDocs(
        workspaceId,
        req.params.id,
        req.body.paths,
      );
      if (!links) throw new NotFoundError('Skill not found');
      return links;
    },
  );
}
