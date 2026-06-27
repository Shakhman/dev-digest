import { ApiHttpError, ApiUnreachableError } from './errors.js';

export interface RepoDto {
  id: string;
  owner: string;
  name: string;
  full_name: string;
}

export interface PullDto {
  id: string | null | undefined;
  number: number;
  title: string;
}

export interface AgentDto {
  id: string;
  name: string;
  model: string;
  provider: string;
  enabled: boolean;
}

export interface TriggerReviewResponse {
  runs: Array<{ run_id: string; agent_id: string; agent_name: string }>;
}

export interface RunSummaryDto {
  run_id: string;
  status: string | null;
  error: string | null;
  findings_count: number | null;
  score: number | null;
  ran_at: string | null;
}

export interface FindingLocal {
  severity: string;
  title: string;
  file: string;
  start_line: number | null;
  end_line: number | null;
  rationale: string;
  suggestion: string | null;
}

export interface ReviewDtoLocal {
  id: string;
  run_id: string | null;
  agent_name: string | null;
  kind: 'summary' | 'review';
  verdict: string | null;
  score: number | null;
  created_at: string;
  findings: FindingLocal[];
}

export interface ConventionLocal {
  id: string;
  category: string | null;
  rule: string;
  evidence_path: string;
  confidence: number;
  accepted: boolean;
}

export interface ApiClient {
  listRepos(): Promise<RepoDto[]>;
  listPulls(repoId: string): Promise<PullDto[]>;
  listAgents(): Promise<AgentDto[]>;
  triggerReview(prId: string, agentId: string): Promise<TriggerReviewResponse>;
  listRuns(prId: string): Promise<RunSummaryDto[]>;
  listReviews(prId: string): Promise<ReviewDtoLocal[]>;
  listConventions(repoId: string): Promise<ConventionLocal[]>;
}

export function createApiClient(baseUrl: string): ApiClient {
  const base = baseUrl.replace(/\/$/, '');

  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${base}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        ...options,
      });
    } catch (err) {
      throw new ApiUnreachableError(base, err);
    }

    if (!res.ok) {
      let code = 'unknown';
      let message = res.statusText;
      try {
        const body = (await res.json()) as { error?: { code?: string; message?: string } };
        if (body?.error?.code) code = body.error.code;
        if (body?.error?.message) message = body.error.message;
      } catch {
        // ignore parse errors
      }
      throw new ApiHttpError(res.status, code, message);
    }

    return res.json() as Promise<T>;
  }

  async function get<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'GET' });
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  return {
    listRepos(): Promise<RepoDto[]> {
      return get<RepoDto[]>('/repos');
    },

    listPulls(repoId: string): Promise<PullDto[]> {
      return get<PullDto[]>(`/repos/${repoId}/pulls`);
    },

    listAgents(): Promise<AgentDto[]> {
      return get<AgentDto[]>('/agents');
    },

    triggerReview(prId: string, agentId: string): Promise<TriggerReviewResponse> {
      return post<TriggerReviewResponse>(`/pulls/${prId}/review`, { agentId });
    },

    listRuns(prId: string): Promise<RunSummaryDto[]> {
      return get<RunSummaryDto[]>(`/pulls/${prId}/runs`);
    },

    listReviews(prId: string): Promise<ReviewDtoLocal[]> {
      return get<ReviewDtoLocal[]>(`/pulls/${prId}/reviews`);
    },

    listConventions(repoId: string): Promise<ConventionLocal[]> {
      return get<ConventionLocal[]>(`/repos/${repoId}/conventions`);
    },
  };
}
