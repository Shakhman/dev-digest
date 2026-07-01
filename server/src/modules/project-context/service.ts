import { and, eq } from 'drizzle-orm';
import type { Container } from '../../platform/container.js';
import type { SpecFile, ContextDocLink, EffectiveContextDoc } from '@devdigest/shared';
import { ProjectContextRepository } from './repository.js';
import * as t from '../../db/schema.js';

/**
 * T-B2 / T-B3 — Project Context service.
 *
 * Three responsibilities (kept distinct):
 *  1. Discovery: stateless walk of the clone roots via FsDocs adapter.
 *  2. Attachment persistence: ordered path links on agents & skills.
 *  3. Effective-set preview: returns deduped union for GET effective-context.
 */
export class ProjectContextService {
  private repo: ProjectContextRepository;

  constructor(private container: Container) {
    this.repo = new ProjectContextRepository(container.db);
  }

  // ---- T-B2: Discovery -------------------------------------------------------

  /**
   * Discover all .md files under the configured roots in the repo's clone.
   * Returns `{ files: SpecFile[], reason?: string }`.
   *
   * AC-3: no clone → empty list + reason string, HTTP 200.
   * AC-4: uses config roots (or defaults).
   * AC-24: populates `used_by_agents`.
   */
  async discoverFiles(
    workspaceId: string,
    repoId: string,
  ): Promise<{ files: SpecFile[]; reason?: string }> {
    const clonePath = await this.repo.getClonePath(workspaceId, repoId);
    if (!clonePath) {
      return { files: [], reason: 'Repo not found or not in this workspace.' };
    }

    const roots = this.container.config.contextRoots;
    const walked = await this.container.fsDocs.walkMarkdown(clonePath, roots);

    if (walked.length === 0) {
      return {
        files: [],
        reason: `No Markdown files found under roots: ${roots.join(', ')}.`,
      };
    }

    // Count per-path usage (AC-24).
    const usageMap = await this.repo.usageCountsForPaths(
      workspaceId,
      walked.map((w) => w.path),
    );

    const files: SpecFile[] = await Promise.all(
      walked.map(async ({ path: relPath }) => {
        const content = await this.container.fsDocs.readWithinRoot(clonePath, relPath);
        const source = detectSource(relPath, roots);
        const tokens = content !== null ? this.container.tokenizer.count(content) : 0;
        return {
          path: relPath,
          content: content ?? '',
          size: content?.length ?? 0,
          updated_at: null,
          source,
          tokens,
          used_by_agents: usageMap.get(relPath) ?? 0,
          missing: false,
        };
      }),
    );

    return { files };
  }

  // ---- T-B3: Agent context-doc attachment ------------------------------------

  /**
   * Get the list of context docs attached to an agent, with a `missing` flag
   * for each path that no longer exists in the current clone.
   *
   * Returns null if the agent doesn't exist in the workspace.
   */
  async getAgentContextDocs(
    workspaceId: string,
    agentId: string,
  ): Promise<ContextDocLink[] | null> {
    const [agentRow] = await this.container.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)));
    if (!agentRow) return null;

    const links = await this.repo.listAgentDocs(agentId);
    return links.map(({ path, order }) => ({ path, order, missing: false }));
  }

  /**
   * Replace the full ordered path list for an agent.
   * Returns null if the agent doesn't belong to the workspace.
   */
  async setAgentContextDocs(
    workspaceId: string,
    agentId: string,
    paths: string[],
  ): Promise<ContextDocLink[] | null> {
    const [agentRow] = await this.container.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)));
    if (!agentRow) return null;

    await this.repo.setAgentDocs(agentId, paths);
    // Trigger version snapshot (T-B5 via facade, never import agents internals).
    await this._snapshotAgentVersion(agentId);

    return paths.map((path, i) => ({ path, order: i, missing: false }));
  }

  // ---- T-B3: Skill context-doc attachment ------------------------------------

  /**
   * Get the list of context docs attached to a skill.
   * Returns null if the skill doesn't exist in the workspace.
   */
  async getSkillContextDocs(
    workspaceId: string,
    skillId: string,
  ): Promise<ContextDocLink[] | null> {
    const [skillRow] = await this.container.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.id, skillId), eq(t.skills.workspaceId, workspaceId)));
    if (!skillRow) return null;

    const links = await this.repo.listSkillDocs(skillId);
    return links.map(({ path, order }) => ({ path, order, missing: false }));
  }

  /**
   * Replace the full ordered path list for a skill.
   * Returns null if the skill doesn't belong to the workspace.
   */
  async setSkillContextDocs(
    workspaceId: string,
    skillId: string,
    paths: string[],
  ): Promise<ContextDocLink[] | null> {
    const [skillRow] = await this.container.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.id, skillId), eq(t.skills.workspaceId, workspaceId)));
    if (!skillRow) return null;

    await this.repo.setSkillDocs(skillId, paths);
    return paths.map((path, i) => ({ path, order: i, missing: false }));
  }

  // ---- T-B3: Effective context preview (AC-22) --------------------------------

  /**
   * Returns the ordered, deduped effective context docs for an agent including
   * inherited skill docs, enriched with source badge and token count.
   *
   * Returns null if the agent doesn't belong to the workspace.
   */
  async getEffectiveContext(
    workspaceId: string,
    agentId: string,
    clonePath?: string | null,
  ): Promise<EffectiveContextDoc[] | null> {
    const docs = await this.repo.effectiveContextForAgent(workspaceId, agentId);
    if (docs === null) return null;

    const roots = this.container.config.contextRoots;

    return Promise.all(
      docs.map(async ({ path, order }) => {
        const source = detectSource(path, roots);
        let tokens: number | undefined;
        if (clonePath) {
          const content = await this.container.fsDocs.readWithinRoot(clonePath, path);
          if (content !== null) {
            tokens = this.container.tokenizer.count(content);
          }
        }
        return { path, order, source: source ?? null, tokens };
      }),
    );
  }

  // ---- Helpers ---------------------------------------------------------------

  /** Trigger an agent version bump whenever context docs change (AC-19). */
  private async _snapshotAgentVersion(agentId: string): Promise<void> {
    try {
      await this.container.agentsRepo.snapshotContextDocChange(agentId);
    } catch {
      // Best-effort — never fail the attach operation because of versioning.
    }
  }
}

/** Derive the source root badge from a repo-relative path. */
function detectSource(relPath: string, roots: string[]): string | undefined {
  const segments = relPath.split('/');
  for (const root of roots) {
    // Check if the path starts with the root folder (top-level or nested).
    if (relPath.startsWith(root + '/') || relPath === root) {
      return root;
    }
    // Handle paths where root appears deeper (e.g. `a/docs/b/x.md`).
    if (segments.includes(root)) {
      return root;
    }
  }
  return undefined;
}
