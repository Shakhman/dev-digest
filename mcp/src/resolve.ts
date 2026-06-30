import type { ApiClient } from './api-client.js';
import { notFoundRepo, notFoundPr, notFoundAgent, ToolError } from './errors.js';

/**
 * Resolve a repo identifier (URL or owner/name slug) to its UUID.
 * Performs a case-insensitive match on full_name.
 */
export async function resolveRepo(api: ApiClient, repo: string): Promise<string> {
  const repos = await api.listRepos();

  if (repos.length === 0) {
    throw notFoundRepo(repo, []);
  }

  // Normalize: strip trailing .git and extract owner/name from full URL
  let slug = repo.trim();
  if (slug.startsWith('http://') || slug.startsWith('https://')) {
    try {
      const u = new URL(slug);
      slug = u.pathname.replace(/^\//, '').replace(/\.git$/, '');
    } catch {
      // fall through with original
    }
  } else {
    slug = slug.replace(/\.git$/, '');
  }

  const lowerSlug = slug.toLowerCase();
  const found = repos.find((r) => r.full_name.toLowerCase() === lowerSlug);

  if (!found) {
    const knownRepos = repos.map((r) => r.full_name);
    throw notFoundRepo(repo, knownRepos);
  }

  return found.id;
}

/**
 * Resolve a PR number to its UUID within a repo.
 * Guards against null/undefined id before returning.
 */
export async function resolvePr(
  api: ApiClient,
  repoId: string,
  repoLabel: string,
  pr: number,
): Promise<string> {
  const pulls = await api.listPulls(repoId);

  const found = pulls.find((p) => p.number === pr);
  if (!found || found.id == null) {
    const openNumbers = pulls.map((p) => p.number).filter((n) => typeof n === 'number');
    throw notFoundPr(pr, repoLabel, openNumbers);
  }

  return found.id;
}

/**
 * Resolve an agent name (case-insensitive) to its UUID.
 */
export async function resolveAgent(api: ApiClient, agent: string): Promise<string> {
  const agents = await api.listAgents();
  const lowerAgent = agent.toLowerCase();
  const found = agents.find((a) => a.name.toLowerCase() === lowerAgent);
  if (!found) {
    throw notFoundAgent(agent);
  }
  return found.id;
}
