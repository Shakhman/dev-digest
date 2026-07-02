import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Project Context repository — owns `agent_context_docs` and
 * `skill_context_docs` link tables. Workspace-scoped throughout.
 *
 * Also provides discovery helpers (clone path lookup, usage counts).
 */
export class ProjectContextRepository {
  constructor(private db: Db) {}

  // ---- agent_context_docs link table ----------------------------------------

  /** Ordered paths attached to an agent. */
  async listAgentDocs(agentId: string): Promise<{ path: string; order: number }[]> {
    return this.db
      .select({ path: t.agentContextDocs.path, order: t.agentContextDocs.order })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId))
      .orderBy(asc(t.agentContextDocs.order));
  }

  /**
   * Replace the full ordered path list for an agent (last-writer-wins; cannot
   * leave a partial/duplicate order). Safe for concurrent reorder (AC-7).
   */
  async setAgentDocs(agentId: string, paths: string[]): Promise<void> {
    await this.db.delete(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
    if (paths.length === 0) return;
    await this.db
      .insert(t.agentContextDocs)
      .values(paths.map((path, i) => ({ agentId, path, order: i })));
  }

  // ---- skill_context_docs link table ----------------------------------------

  /** Ordered paths attached to a skill. */
  async listSkillDocs(skillId: string): Promise<{ path: string; order: number }[]> {
    return this.db
      .select({ path: t.skillContextDocs.path, order: t.skillContextDocs.order })
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(asc(t.skillContextDocs.order));
  }

  /**
   * Replace the full ordered path list for a skill (last-writer-wins).
   */
  async setSkillDocs(skillId: string, paths: string[]): Promise<void> {
    await this.db.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
    if (paths.length === 0) return;
    await this.db
      .insert(t.skillContextDocs)
      .values(paths.map((path, i) => ({ skillId, path, order: i })));
  }

  // ---- Clone path (for discovery) ------------------------------------------

  /**
   * Fetch the clone path for a repo, scoped to a workspace. Returns null when
   * the repo doesn't exist, is in a different workspace, or has no clone.
   */
  async getClonePath(workspaceId: string, repoId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)));
    return row?.clonePath ?? null;
  }

  // ---- Usage counts (AC-24) ------------------------------------------------

  /**
   * For each path in `paths`, count how many distinct agents in the workspace
   * have it in their effective context (own attachment OR through an enabled
   * skill they use).
   *
   * Returns a map path → count.
   */
  async usageCountsForPaths(
    workspaceId: string,
    paths: string[],
  ): Promise<Map<string, number>> {
    if (paths.length === 0) return new Map();

    // 1. Direct agent attachments in the workspace.
    const directRows = await this.db
      .select({
        path: t.agentContextDocs.path,
        agentId: t.agentContextDocs.agentId,
      })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agentContextDocs.agentId, t.agents.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          inArray(t.agentContextDocs.path, paths),
        ),
      );

    // 2. Skill-inherited paths: skill_context_docs → skill → agent_skills →
    //    agents (enabled skills only).
    const inheritedRows = await this.db
      .select({
        path: t.skillContextDocs.path,
        agentId: t.agentSkills.agentId,
      })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skillContextDocs.skillId, t.skills.id))
      .innerJoin(t.agentSkills, eq(t.skills.id, t.agentSkills.skillId))
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.skills.enabled, true),
          inArray(t.skillContextDocs.path, paths),
        ),
      );

    // Combine: per path count DISTINCT agents.
    const agentsPerPath = new Map<string, Set<string>>();
    for (const row of [...directRows, ...inheritedRows]) {
      const set = agentsPerPath.get(row.path) ?? new Set();
      set.add(row.agentId);
      agentsPerPath.set(row.path, set);
    }

    const result = new Map<string, number>();
    for (const p of paths) {
      result.set(p, agentsPerPath.get(p)?.size ?? 0);
    }
    return result;
  }

  // ---- Effective-context resolution (for GET /agents/:id/effective-context) --

  /**
   * Return the ordered, deduped effective context docs for an agent:
   * own docs first (in stored order), then docs from enabled skills the agent
   * uses (in skill-link order, then per-skill attachment order).
   *
   * Returns `null` if the agent doesn't belong to the workspace.
   */
  async effectiveContextForAgent(
    workspaceId: string,
    agentId: string,
  ): Promise<{ path: string; order: number; source?: string }[] | null> {
    // Verify ownership.
    const [agentRow] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)));
    if (!agentRow) return null;

    // Own docs.
    const ownDocs = await this.listAgentDocs(agentId);

    // Enabled skills (in skill link order).
    const linkedSkills = await this.db
      .select({ skillId: t.agentSkills.skillId, skillOrder: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
      .orderBy(asc(t.agentSkills.order));

    const skillGroups: { paths: { path: string; order: number }[] }[] = [];
    for (const { skillId } of linkedSkills) {
      const docs = await this.listSkillDocs(skillId);
      skillGroups.push({ paths: docs });
    }

    // Resolve using the same AC-11 logic (inline here — no DB dep on resolver).
    const seen = new Set<string>();
    const result: { path: string; order: number; source?: string }[] = [];
    let idx = 0;

    for (const { path } of [...ownDocs].sort((a, b) => a.order - b.order)) {
      if (seen.has(path)) continue;
      seen.add(path);
      result.push({ path, order: idx++ });
    }
    for (const { paths } of skillGroups) {
      for (const { path } of [...paths].sort((a, b) => a.order - b.order)) {
        if (seen.has(path)) continue;
        seen.add(path);
        result.push({ path, order: idx++ });
      }
    }

    return result;
  }
}
