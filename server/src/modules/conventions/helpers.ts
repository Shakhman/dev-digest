import type { ConventionCandidate, ConventionSkillDraft } from '@devdigest/shared';
import type { RepoRow } from '../repos/repository.js';
import type { ConventionRow } from './repository.js';

/** Map a DB row to the wire DTO. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    accepted: row.accepted,
  };
}

/** kebab-case slug for a markdown section heading / skill name. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** The repo short name without the owner (e.g. "payments-api"). */
function repoShortName(repo: RepoRow): string {
  return repo.name;
}

/**
 * Merge accepted candidates into a single editable skill draft. The body cites
 * each rule's `file:line` so a reviewer can ground a finding; rejected/pending
 * candidates are excluded by the caller (only accepted rows are passed in).
 */
export function buildSkillDraft(repo: RepoRow, accepted: ConventionRow[]): ConventionSkillDraft {
  const short = repoShortName(repo);
  const name = `${short}-conventions`;

  const sections = accepted.map((c) => {
    const heading = slug(c.category ?? c.rule) || 'convention';
    const where = c.evidencePath ? `\n\nDetected in \`${c.evidencePath}\`:` : '';
    const snippet = c.evidenceSnippet ? `\n\n\`\`\`\n${c.evidenceSnippet}\n\`\`\`` : '';
    return `## ${heading}\n${c.rule}${where}${snippet}`;
  });

  const body =
    `# ${name}\n\n` +
    `House conventions for \`${short}\`. Flag changes that violate any rule below ` +
    `and cite the offending \`file:line\`.\n\n` +
    sections.join('\n\n');

  const evidenceFiles = [
    ...new Set(accepted.map((c) => (c.evidencePath ?? '').split(':')[0]).filter(Boolean)),
  ] as string[];

  return {
    name,
    description: `${accepted.length} house convention${accepted.length === 1 ? '' : 's'} extracted from ${short}`,
    body,
    evidence_files: evidenceFiles,
  };
}
