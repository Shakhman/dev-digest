export class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

export class ApiUnreachableError extends Error {
  constructor(public readonly url: string, cause?: unknown) {
    super(`API unreachable at ${url}`);
    this.name = 'ApiUnreachableError';
    if (cause) this.cause = cause;
  }
}

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export function notFoundRepo(repo: string, knownRepos: string[]): ToolError {
  if (knownRepos.length === 0) {
    return new ToolError('no repos imported yet. Add one in the DevDigest UI.');
  }
  return new ToolError(
    `repo '${repo}' not found. Known repos: ${knownRepos.join(', ')} — or add it in the DevDigest UI.`,
  );
}

export function notFoundPr(
  pr: number,
  repoLabel: string,
  openNumbers: number[],
): ToolError {
  return new ToolError(
    `PR #${pr} not found in ${repoLabel}. Open PR numbers: ${openNumbers.join(', ')}`,
  );
}

export function notFoundAgent(agent: string): ToolError {
  return new ToolError(
    `agent '${agent}' not found — call list_agents to see valid names.`,
  );
}

export function apiUnreachable(url: string): ToolError {
  return new ToolError(
    `API not reachable at ${url} — is it running? cd server && npm run dev`,
  );
}

export function rateLimited(): ToolError {
  return new ToolError('10 reviews/min limit hit; wait and retry');
}
