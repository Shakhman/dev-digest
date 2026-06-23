import type { Intent, LLMProvider, UnifiedDiff } from '@devdigest/shared';
import { Intent as IntentSchema } from '@devdigest/shared';

/** Max number of files to include in the diff digest sent to the LLM. */
const MAX_FILES = 12;
/** Max chars of patch to include per file. */
const MAX_FILE_PATCH_CHARS = 6_000;
/** Max lines of patch to take per file (approx: 120 lines). */
const MAX_FILE_PATCH_LINES = 120;

const SYSTEM_PROMPT =
  'You analyse a pull request and return a structured JSON intent summary.\n\n' +
  'Source priority — read in this order:\n' +
  '1. Referenced plans/specs (when present): treat as the authoritative statement of intent. The diff is then checked for conformance to it.\n' +
  '2. Linked issue body (when present): may contain acceptance criteria or background.\n' +
  '3. PR description (when present): the author\'s summary; treat as a hint.\n' +
  '4. Diff (always present): the sole required input. A PR with no description, no ticket, and no plan is the normal case — infer everything from the diff alone.\n\n' +
  'Return JSON with:\n' +
  '- intent: ONE sentence (engineering language, no marketing tone) stating what this PR accomplishes.\n' +
  '- in_scope: 3-6 short bullet phrases of what the PR DOES, derived strictly from the diff.\n' +
  '- out_of_scope: 0-5 short phrases of nearby concerns this PR does NOT touch.\n' +
  '- risk_areas: 0-6 short labels for risk surfaces (e.g. "Auth surface touched", "New dependency: ioredis", "Adds Redis round-trip per request").';

/**
 * Build a compact diff digest from a UnifiedDiff.
 * Uses the raw diff string to extract patch lines per file.
 * Caps at MAX_FILES files, MAX_FILE_PATCH_LINES lines per file, MAX_FILE_PATCH_CHARS chars per file.
 */
function buildDiffDigest(diff: UnifiedDiff): { text: string; fileCount: number } {
  const sections: string[] = [];
  // Parse per-file patch sections out of the raw unified diff string.
  // Split on "diff --git" boundaries.
  const rawSections = diff.raw.split(/(?=^diff --git )/m);

  let fileCount = 0;
  for (const section of rawSections) {
    if (!section.trim() || !section.startsWith('diff --git')) continue;
    if (fileCount >= MAX_FILES) break;

    // Extract path from the +++ line.
    const pathMatch = section.match(/^\+\+\+ b\/(.+)$/m);
    const filePath = pathMatch ? pathMatch[1]! : diff.files[fileCount]?.path ?? 'unknown';

    // Collect patch lines (those starting with +, -, @, or context lines).
    // Skip the diff --git, ---, +++ header lines.
    const lines = section.split('\n');
    const patchLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('diff --git') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file') || line.startsWith('old mode') || line.startsWith('new mode')) continue;
      patchLines.push(line);
      if (patchLines.length >= MAX_FILE_PATCH_LINES) break;
    }

    const patchText = patchLines.join('\n').slice(0, MAX_FILE_PATCH_CHARS);

    sections.push(`### ${filePath}\n${patchText}`);
    fileCount++;
  }

  return { text: sections.join('\n\n'), fileCount };
}

/**
 * Build the user message for the LLM from all available inputs.
 * Calls `log` (when provided) once per section so callers can trace exactly
 * what context was assembled and its size before the LLM call is made.
 */
function buildUserMessage(
  input: {
    diff: UnifiedDiff;
    prDescription?: string;
    linkedIssueBody?: string;
    referencedDocs?: Array<{ url: string; content: string }>;
  },
  log?: (msg: string) => void,
): string {
  const parts: string[] = [];

  // Referenced plans/specs first (highest priority).
  if (input.referencedDocs && input.referencedDocs.length > 0) {
    for (const doc of input.referencedDocs) {
      const content = doc.content.slice(0, 6_000);
      parts.push(`## Referenced Plan / Spec — ${doc.url}\n${content}`);
      log?.(`  [referenced-doc] ${doc.url} — ${content.length} chars`);
    }
  } else {
    log?.('  [referenced-doc] none');
  }

  // PR description.
  if (input.prDescription) {
    const body = input.prDescription.slice(0, 8_000);
    parts.push(`## PR Description (author-supplied)\n${body}`);
    log?.(`  [pr-description] ${body.length} chars`);
  } else {
    log?.('  [pr-description] none');
  }

  // Linked issue body.
  if (input.linkedIssueBody) {
    const body = input.linkedIssueBody.slice(0, 3_000);
    parts.push(`## Linked Issue\n${body}`);
    log?.(`  [linked-issue] ${body.length} chars`);
  } else {
    log?.('  [linked-issue] none');
  }

  // Diff (always present, authoritative).
  const { text: diffDigest, fileCount } = buildDiffDigest(input.diff);
  parts.push(`## Diff (authoritative)\n${diffDigest}`);
  log?.(`  [diff] ${fileCount} file(s) — ${diffDigest.length} chars`);

  const result = parts.join('\n\n');
  log?.(`Intent prompt ready — ${parts.length} section(s), ${result.length} total chars`);
  return result;
}

/**
 * Extract PR intent from a diff (and optional supplementary context) using a
 * low-cost LLM call. Pure function: the only I/O is through the injected `llm`.
 *
 * @param input  - The diff and any supplementary context (PR body, issue, plans).
 * @param llm    - An injected LLMProvider (the only allowed I/O).
 * @param model  - The model name to pass to `llm.completeStructured`.
 * @param log    - Optional callback invoked once per prompt section so callers
 *                 can trace what context was assembled before the LLM call.
 */
export async function extractIntent(
  input: {
    diff: UnifiedDiff;
    prDescription?: string;
    linkedIssueBody?: string;
    referencedDocs?: Array<{ url: string; content: string }>;
  },
  llm: LLMProvider,
  model: string,
  log?: (msg: string) => void,
): Promise<Intent> {
  log?.('Building intent prompt:');
  const userMessage = buildUserMessage(input, log);

  const result = await llm.completeStructured({
    model,
    schema: IntentSchema,
    schemaName: 'pr_intent',
    temperature: 0,
    maxTokens: 1500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  });

  // Re-parse through the schema so that Zod's .default([]) is applied and the
  // returned type satisfies Promise<Intent> (risk_areas: string[], not optional).
  return IntentSchema.parse(result.data);
}
