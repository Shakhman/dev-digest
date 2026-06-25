/**
 * Intent extraction pre-work step.
 *
 * Runs once per unique HEAD commit before the per-agent review loop. Best-
 * effort: any failure is logged and swallowed so the agent loop is never
 * blocked by intent extraction.
 *
 * `gatherReferencedDocs` scans the PR body for plan/spec links and inline
 * sections, fetches their text content, and returns up to 3 resolved docs.
 */

import type { Container } from '../../platform/container.js';
import type { Provider, UnifiedDiff } from '@devdigest/shared';
import { extractIntent } from '@devdigest/reviewer-core';
import { RunLogger } from '../../platform/run-logger.js';
import * as schema from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';
import type { ReviewRepository } from './repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import type { GitHubClient, RepoRef } from '@devdigest/shared';

/** Max referenced documents to include in the LLM context. */
const MAX_REF_DOCS = 3;
/** Per-doc content cap in characters. */
const MAX_DOC_CHARS = 6_000;
/** HTTP fetch timeout in ms. */
const FETCH_TIMEOUT_MS = 6_000;
/** Maximum response bytes to read from a fetched URL. */
const MAX_FETCH_BYTES = 64 * 1024;

// ---- helpers ---------------------------------------------------------------

/** Keywords that, when found near a URL in the PR body, flag it as a plan/spec. */
const CONTEXT_KEYWORDS = /plan|spec|design|proposal|rfc|adr|implementation/i;

/** Extensions / domains that are definitely not plan documents. */
const REJECT_PATTERN =
  /\.(png|jpe?g|gif|svg|ico|webp|bmp|pdf|zip|tar|gz)(\?|$)|npmjs\.com|pkg\.go\.dev|shields\.io|badge|travis-ci|circleci|codecov\.io|snyk\.io/i;

/**
 * Convert a GitHub blob URL to the equivalent raw.githubusercontent.com URL so
 * it can be fetched as plain text.
 */
function toRawGitHubUrl(url: string): string | null {
  // https://github.com/<owner>/<repo>/blob/<ref>/<path>
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (!m) return null;
  const [, owner, repo, ref, path] = m;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
}

/**
 * Strip HTML tags from a string (best-effort, not a full parser).
 * Used when fetching an HTML page that doesn't offer a plain-text alternative.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Fetch text content from a URL with a short timeout and byte cap.
 * Returns null on any error or if the content-type is not text.
 */
async function fetchText(url: string, authHeader?: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'text/plain, text/markdown, text/html' };
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) return null;

    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/')) return null;

    // Stream up to MAX_FETCH_BYTES to avoid huge responses.
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
      if (total >= MAX_FETCH_BYTES) {
        await reader.cancel();
        break;
      }
    }
    const raw = new TextDecoder().decode(
      chunks.reduce((a, b) => {
        const c = new Uint8Array(a.length + b.length);
        c.set(a);
        c.set(b, a.length);
        return c;
      }, new Uint8Array()),
    );

    return ct.includes('html') ? stripHtml(raw) : raw;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract inline plan/spec content from the PR body itself.
 *
 * If the body contains a heading matching plan/spec/implementation/design/rfc/
 * adr/proposal, the text under that heading (until the next same-level heading
 * or end of body) is returned as a referenced doc with url="pr-body".
 */
function extractInlinePlan(body: string): { url: string; content: string } | null {
  const headingPattern = /^(#{1,3})\s+(plan|spec|implementation|design|rfc|adr|proposal)\b.*/im;
  const m = body.match(headingPattern);
  if (!m || m.index == null) return null;

  const level = m[1]!.length;
  const afterHeading = body.slice(m.index + m[0].length);
  // Stop at the next heading of same or higher level.
  const stopPattern = new RegExp(`^#{1,${level}}\\s`, 'm');
  const stopMatch = afterHeading.match(stopPattern);
  const content = (stopMatch?.index != null
    ? afterHeading.slice(0, stopMatch.index)
    : afterHeading
  ).trim();

  if (!content) return null;
  return { url: 'pr-body', content: content.slice(0, MAX_DOC_CHARS) };
}

/**
 * Scan the PR body for plan/spec references (inline sections + linked URLs)
 * and return their text content. Best-effort: errors are silently swallowed.
 */
export async function gatherReferencedDocs(
  body: string,
  _gh: GitHubClient,
  _repo: RepoRef,
  githubToken?: string,
): Promise<Array<{ url: string; content: string }>> {
  const results: Array<{ url: string; content: string }> = [];

  // 1. Inline plan/spec section in the PR body itself (highest priority).
  const inline = extractInlinePlan(body);
  if (inline) results.push(inline);
  if (results.length >= MAX_REF_DOCS) return results;

  // 2. Extract all HTTPS URLs from the body.
  const urlPattern = /https?:\/\/[^\s\)\"\'\]<>]+/g;
  const rawUrls = [...new Set(body.match(urlPattern) ?? [])];

  for (const rawUrl of rawUrls) {
    if (results.length >= MAX_REF_DOCS) break;
    if (REJECT_PATTERN.test(rawUrl)) continue;

    // Determine if this URL looks like a plan doc: either a GitHub blob link
    // or any URL whose surrounding text (~100 chars) contains plan keywords.
    const isGitHubBlob = /github\.com\/[^/]+\/[^/]+\/blob\//i.test(rawUrl);
    if (!isGitHubBlob) {
      const surroundingStart = Math.max(0, (body.indexOf(rawUrl)) - 100);
      const surrounding = body.slice(surroundingStart, body.indexOf(rawUrl) + rawUrl.length + 100);
      if (!CONTEXT_KEYWORDS.test(surrounding)) continue;
    }

    // Fetch the content.
    const fetchUrl = isGitHubBlob ? toRawGitHubUrl(rawUrl) ?? rawUrl : rawUrl;
    // Only attach the GitHub token for raw.githubusercontent.com requests.
    // The token is resolved by the caller via container.secrets (not process.env)
    // so it respects the workspace's configured credential.
    const authHeader =
      fetchUrl.startsWith('https://raw.githubusercontent.com/') && githubToken
        ? `token ${githubToken}`
        : undefined;

    const content = await fetchText(fetchUrl, authHeader).catch(() => null);
    if (content && content.trim().length > 50) {
      results.push({ url: rawUrl, content: content.slice(0, MAX_DOC_CHARS) });
    }
  }

  return results;
}

// ---- main step -------------------------------------------------------------

/**
 * Pre-work intent extraction step called from `ReviewRunExecutor.executeRuns`
 * after the diff is loaded, before the per-agent loop.
 *
 * Idempotent: skips re-extraction when intent is already stored for this HEAD.
 * Failures are swallowed — the agent loop must never be blocked by this step.
 */
export async function runIntentStep(
  container: Container,
  reviewRepo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repo: typeof schema.repos.$inferSelect,
  diff: UnifiedDiff,
  runLog: RunLogger,
  force = false,
): Promise<void> {
  try {
    // Idempotency: if we already have intent for this exact HEAD, skip.
    // Bypassed when force=true (e.g. explicit recompute request).
    if (!force && pull.lastReviewedSha === pull.headSha) {
      const existing = await reviewRepo.getIntent(pull.id);
      if (existing) {
        runLog.info('Intent already extracted for this HEAD — skipping');
        return;
      }
    }

    // Resolve the feature model (workspace override or registry default).
    const { provider, model } = await resolveFeatureModel(container, workspaceId, 'review_intent');
    const llm = await container.llm(provider as Provider);

    // Gather the linked-issue body (best-effort).
    let linkedIssueBody: string | undefined;
    const issueMatch = pull.body?.match(/(?:closes|fixes|resolves)\s*#(\d+)/i);
    if (issueMatch?.[1]) {
      try {
        const issue = await container
          .github()
          .then((gh) => gh.getIssue({ owner: repo.owner, name: repo.name }, Number(issueMatch[1])));
        linkedIssueBody = issue.body ?? undefined;
      } catch {
        // GitHub unavailable or issue not found — proceed without.
      }
    }

    // Gather referenced plans/specs linked from the PR body (best-effort).
    // Resolve the GitHub token via container.secrets (not process.env) so it
    // honours the workspace's configured credential for private-repo fetches.
    let referencedDocs: Array<{ url: string; content: string }> = [];
    try {
      const gh = await container.github();
      const githubToken = await container.secrets.get('GITHUB_TOKEN').catch(() => undefined);
      referencedDocs = await gatherReferencedDocs(
        pull.body ?? '',
        gh,
        { owner: repo.owner, name: repo.name },
        githubToken,
      );
    } catch {
      // GitHub unavailable or fetch failed — proceed without referenced docs.
    }

    // Run the extraction.
    const intent = await runLog.step(
      'Extracting PR intent',
      () =>
        extractIntent(
          {
            diff,
            prDescription: pull.body ?? undefined,
            linkedIssueBody,
            referencedDocs,
          },
          llm,
          model,
          (msg) => runLog.info(msg),
        ),
      { kind: 'tool' },
    );

    await reviewRepo.upsertIntent(pull.id, intent);
    runLog.info(
      `Intent extracted — ${referencedDocs.length} referenced doc(s), ${intent.risk_areas.length} risk area(s)`,
    );
  } catch (err) {
    // Best-effort: log and continue without blocking the review.
    runLog.info(`Intent extraction skipped: ${(err as Error).message}`);
  }
}
