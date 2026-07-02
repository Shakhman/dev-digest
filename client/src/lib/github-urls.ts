/* github-urls.ts — build github.com deep-links from data we already hold.
   PR detail has repo full_name (owner/repo), PR number, head sha, and finding
   file/line — enough to open the PR or a file blob at a line range in a new tab. */

const HOST = "https://github.com";

/** Encode a repo-relative path for a URL while keeping "/" separators. */
function encPath(file: string): string {
  return file
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

/** https://github.com/{owner}/{repo}/pull/{number} */
export function githubPrUrl(repoFullName: string, number: number): string {
  return `${HOST}/${repoFullName}/pull/${number}`;
}

/**
 * https://github.com/{owner}/{repo}/pull/{number}/files
 * The PR's "Files changed" tab — where a finding's file lives in the context of
 * THIS pull request (vs. `githubBlobUrl`, which opens the standalone file blob).
 * Per-file diff anchors need a sha256(path) hash we don't compute here, so this
 * lands on the Files tab rather than scrolling to the exact file.
 */
export function githubPrFilesUrl(repoFullName: string, number: number): string {
  return `${HOST}/${repoFullName}/pull/${number}/files`;
}

/**
 * https://github.com/{owner}/{repo}/blob/{sha}/{file}#L{start}[-L{end}]
 * `sha` pins the link to the PR's head so line numbers stay accurate.
 */
export function githubBlobUrl(
  repoFullName: string,
  sha: string,
  file: string,
  startLine?: number,
  endLine?: number,
): string {
  let url = `${HOST}/${repoFullName}/blob/${sha}/${encPath(file)}`;
  if (startLine != null) {
    url += `#L${startLine}`;
    if (endLine != null && endLine !== startLine) url += `-L${endLine}`;
  }
  return url;
}

/**
 * Brief `risks[].file_refs` / `review_focus[]` entries are plain strings that
 * may embed a trailing `:line` or `:start-end` (e.g. "src/config.ts:12" or
 * "src/middleware/ratelimit.ts:12-18") — split that off so the line lands in
 * `githubBlobUrl`'s `#L{start}[-L{end}]` anchor instead of being treated as
 * (and URL-encoded into) part of the file path.
 */
export function parseFileRef(ref: string): { path: string; startLine?: number; endLine?: number } {
  const m = /^(.+):(\d+)(?:-(\d+))?$/.exec(ref);
  if (!m || !m[1] || !m[2]) return { path: ref };
  return { path: m[1], startLine: Number(m[2]), endLine: m[3] ? Number(m[3]) : undefined };
}
