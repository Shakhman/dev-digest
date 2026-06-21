import { z } from 'zod';
import type { Provider } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { RepoRow } from '../repos/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import type { InsertConvention } from './repository.js';

/** Config files read verbatim as convention evidence (best-effort; missing → skipped). */
const CONFIG_FILES = [
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
];

/** How many ranked source files to sample for convention extraction. */
const SAMPLE_FILE_COUNT = 12;
/** Per-file char cap so a big file can't dominate the prompt. */
const MAX_FILE_CHARS = 6_000;
/** Max candidates we ask the model for (keeps cost + review load sane). */
const MAX_CANDIDATES = 12;

/** One model-proposed candidate, BEFORE code-side evidence verification. */
const RawCandidate = z.object({
  category: z.string(),
  rule: z.string(),
  evidence: z.object({
    file: z.string(),
    snippet: z.string(),
  }),
  confidence: z.number().min(0).max(1),
});
const RawCandidateList = z.object({ candidates: z.array(RawCandidate) });

export interface ExtractResult {
  candidates: InsertConvention[];
  /** Files actually sampled (for the UI's "Detected from N sample files"). */
  sampleCount: number;
  /** How many raw candidates the model returned before verification. */
  proposed: number;
}

/**
 * L02 — convention extractor. Pure-code sample selection (no model), one
 * low-cost structured model call, then a code-side evidence gate: a candidate
 * survives only if its cited file exists AND its snippet is actually present in
 * that file. Survivors get an `evidence_path` of `path:line`.
 */
export async function extractConventions(
  container: Container,
  workspaceId: string,
  repo: RepoRow,
): Promise<ExtractResult> {
  const ref = { owner: repo.owner, name: repo.name };

  // ---- 1. Sample selection (entirely code-driven) -------------------------
  const samplePaths = await container.repoIntel.getConventionSamples(repo.id, SAMPLE_FILE_COUNT);
  const paths = [...CONFIG_FILES, ...samplePaths];

  const files = new Map<string, string>();
  for (const path of paths) {
    try {
      const contents = await container.git.readFile(ref, path);
      if (contents.trim().length > 0) files.set(path, contents);
    } catch {
      // Missing/unreadable file — skip (configs are best-effort).
    }
  }

  if (files.size === 0) {
    return { candidates: [], sampleCount: 0, proposed: 0 };
  }

  // ---- 2. Model call (low-cost feature model) -----------------------------
  const { provider, model } = await resolveFeatureModel(container, workspaceId, 'conventions');
  const llm = await container.llm(provider as Provider);

  const corpus = [...files.entries()]
    .map(([path, contents]) => `### FILE: ${path}\n\`\`\`\n${truncate(contents, MAX_FILE_CHARS)}\n\`\`\``)
    .join('\n\n');

  const result = await llm.completeStructured({
    model,
    schema: RawCandidateList,
    schemaName: 'convention_candidates',
    temperature: 0,
    maxTokens: 2_000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `Repository: ${repo.fullName}\n\n` +
          `Extract up to ${MAX_CANDIDATES} house coding conventions from the sample files below. ` +
          `Each candidate MUST cite a real file from the samples and an EXACT snippet copied ` +
          `verbatim from that file as evidence.\n\n${corpus}`,
      },
    ],
  });

  const raw = result.data.candidates.slice(0, MAX_CANDIDATES);

  // ---- 3. Evidence gate (code check) --------------------------------------
  const candidates: InsertConvention[] = [];
  for (const c of raw) {
    const path = normalizePath(c.evidence.file);
    const contents = files.get(path) ?? (await readSafe(container, ref, path));
    if (contents === undefined) continue; // file doesn't exist → reject

    const line = locateSnippet(contents, c.evidence.snippet);
    if (line === null) continue; // snippet not present → reject

    candidates.push({
      workspaceId,
      repoId: repo.id,
      category: c.category.trim() || null,
      rule: c.rule.trim(),
      evidencePath: `${path}:${line}`,
      evidenceSnippet: c.evidence.snippet.trim(),
      confidence: c.confidence,
    });
  }

  return { candidates, sampleCount: files.size, proposed: raw.length };
}

const SYSTEM_PROMPT =
  'You are a senior engineer extracting a repository’s house coding conventions ' +
  'from representative source + config files. Return durable, repo-specific RULES ' +
  '(naming, error handling, async style, module boundaries, config policy) — NOT ' +
  'generic advice. Every rule must be backed by an EXACT snippet copied character-' +
  'for-character from one of the provided files (no paraphrasing, no added comments). ' +
  'Prefer high-signal rules a reviewer could enforce. Set confidence to your ' +
  'certainty the rule is an intentional, repeated convention (0–1).';

// ---- helpers ---------------------------------------------------------------

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}\n… (truncated)`;
}

function normalizePath(p: string): string {
  return p.replace(/^\.\//, '').replace(/^\/+/, '').trim();
}

async function readSafe(
  container: Container,
  ref: { owner: string; name: string },
  path: string,
): Promise<string | undefined> {
  try {
    return await container.git.readFile(ref, path);
  } catch {
    return undefined;
  }
}

/** Collapse runs of whitespace so reformatted snippets still match. */
function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Locate a snippet inside a file. Returns the 1-based line of the snippet's
 * most distinctive (longest) line when present, else null. Whitespace-tolerant:
 * the model may reflow indentation, so we compare squashed forms.
 */
function locateSnippet(contents: string, snippet: string): number | null {
  const snipLines = snippet
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (snipLines.length === 0) return null;

  // The longest snippet line is the most reliable anchor.
  const anchor = squash([...snipLines].sort((a, b) => b.length - a.length)[0]!);
  if (anchor.length < 3) return null;

  const fileLines = contents.split('\n');
  for (let i = 0; i < fileLines.length; i += 1) {
    if (squash(fileLines[i]!).includes(anchor)) return i + 1;
  }
  return null;
}
