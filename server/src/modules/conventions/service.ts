import type { ConventionCandidate, ConventionSkillDraft } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import { ConventionsRepository } from './repository.js';
import { extractConventions } from './extractor.js';
import { toConventionDto, buildSkillDraft } from './helpers.js';

export interface ExtractSummary {
  candidates: ConventionCandidate[];
  sample_count: number;
  proposed: number;
}

export interface UpdateConventionInput {
  rule?: string;
  evidence_snippet?: string;
  category?: string | null;
  accepted?: boolean;
}

/**
 * L02 — conventions service. Orchestrates: code-driven sample selection + one
 * model call + code-side evidence gate (in the extractor), persistence, the
 * accept/reject/edit lifecycle, and merging accepted candidates into a skill
 * draft for the "Create skill" modal.
 */
export class ConventionsService {
  private repo: ConventionsRepository;
  private repos: RepoRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.repos = new RepoRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    await this.requireRepo(workspaceId, repoId);
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  /** Run a fresh extraction; replaces any prior candidate set for the repo. */
  async extract(workspaceId: string, repoId: string): Promise<ExtractSummary> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const { candidates, sampleCount, proposed } = await extractConventions(
      this.container,
      workspaceId,
      repo,
    );
    const rows = await this.repo.replaceForRepo(workspaceId, repoId, candidates);
    return {
      candidates: rows.map(toConventionDto),
      sample_count: sampleCount,
      proposed,
    };
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionInput,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      ...(patch.evidence_snippet !== undefined ? { evidenceSnippet: patch.evidence_snippet } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
    });
    return row ? toConventionDto(row) : undefined;
  }

  /** Reject = remove the candidate so it can never reach the final skill. */
  async reject(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /** Build the editable merged-skill draft from this repo's accepted candidates. */
  async skillDraft(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const accepted = await this.repo.listAccepted(workspaceId, repoId);
    if (accepted.length === 0) {
      throw new ValidationError('No accepted conventions to build a skill from');
    }
    return buildSkillDraft(repo, accepted);
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }
}
