import type {
  AuthProvider,
  SecretsProvider,
  GitHubClient,
  GitClient,
  CodeIndex,
  Embedder,
  LLMProvider,
  FsDocs,
} from '@devdigest/shared';
import type { AppConfig } from './config.js';
import type { Db } from '../db/client.js';
import { JobRunner } from './jobs.js';
import { runBus, type RunBus } from './sse.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { LocalNoAuthProvider } from '../adapters/auth/local.js';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { SimpleGitClient } from '../adapters/git/simple-git.js';
import { RipgrepCodeIndex } from '../adapters/codeindex/ripgrep.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenAIEmbedder } from '../adapters/embedder/openai.js';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { estimateCost } from '../adapters/llm/pricing.js';
import { PriceBook } from './price-book.js';
import { ConfigError } from './errors.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { SkillsRepository } from '../modules/skills/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import type { RepoIntel } from '../modules/repo-intel/types.js';
import { RepoIntelService } from '../modules/repo-intel/service.js';
import { type DepGraph, DepCruiseGraph } from '../adapters/depgraph/index.js';
import { type Tokenizer, TiktokenTokenizer } from '../adapters/tokenizer/index.js';
import { NodeFsDocs } from '../adapters/fs-docs/index.js';
import { resolveOrder, admitToBudget } from '../modules/project-context/resolver.js';
import { ProjectContextRepository } from '../modules/project-context/repository.js';

/**
 * Resolved result from the project-context facade (T-B6).
 * Returned by `resolveAndRead(...)` for use in run-executor.
 */
export interface ProjectContextResult {
  /** Ordered Markdown contents to pass as `specs` to reviewPullRequest. */
  contents: string[];
  /** Paths + token counts for embedded docs (for trace.specs_read). */
  read: { path: string; tokens: number }[];
  /** Paths that were attached but could not be read (missing/unreadable). */
  omitted: string[];
  /** Paths that were truncated to fit the budget. */
  truncated: string[];
}

/**
 * Container facade for project-context resolution + reading (T-B6).
 * Wired in the composition root; tests inject a stub via ContainerOverrides.
 */
export interface ProjectContextFacade {
  /**
   * Resolve the effective doc set (agentPaths + skillGroups), read each from
   * the clone root, trim to budget, return ordered contents + trace metadata.
   */
  resolveAndRead(params: {
    agentPaths: { path: string; order: number }[];
    skillGroups: { paths: { path: string; order: number }[] }[];
    clonePath: string;
    budget: number;
  }): Promise<ProjectContextResult>;

  /**
   * Fetch an agent's own context-doc paths + the doc paths for each enabled
   * skill (via `ProjectContextRepository` — never raw schema queries from
   * callers like run-executor), then resolve + read + budget exactly like
   * `resolveAndRead`. The single entry point run-executor should use.
   */
  resolveForRun(params: {
    agentId: string;
    enabledSkillIds: string[];
    clonePath: string;
    budget: number;
  }): Promise<ProjectContextResult>;
}

/** Build the default (non-injected) ProjectContextFacade implementation. */
function buildProjectContextFacade(container: Container): ProjectContextFacade {
  const repo = new ProjectContextRepository(container.db);

  async function resolveAndRead({
    agentPaths,
    skillGroups,
    clonePath,
    budget,
  }: {
    agentPaths: { path: string; order: number }[];
    skillGroups: { paths: { path: string; order: number }[] }[];
    clonePath: string;
    budget: number;
  }): Promise<ProjectContextResult> {
    const orderedPaths = resolveOrder({ agentPaths, skillGroups });
    const docs: { path: string; content: string; tokens: number }[] = [];
    const omitted: string[] = [];

    for (const p of orderedPaths) {
      const content = await container.fsDocs.readWithinRoot(clonePath, p);
      if (content === null) {
        omitted.push(p);
        continue;
      }
      const tokens = container.tokenizer.count(content);
      docs.push({ path: p, content, tokens });
    }

    const { included, truncated, excluded } = admitToBudget({ docs, budget });

    return {
      contents: included.map((d) => d.content),
      read: included.map((d) => ({ path: d.path, tokens: d.tokens })),
      omitted,
      truncated: [...truncated.map((d) => d.path), ...excluded.map((d) => d.path)],
    };
  }

  return {
    resolveAndRead,

    async resolveForRun({ agentId, enabledSkillIds, clonePath, budget }) {
      const agentPaths = await repo.listAgentDocs(agentId);
      const skillGroups: { paths: { path: string; order: number }[] }[] = [];
      for (const skillId of enabledSkillIds) {
        const paths = await repo.listSkillDocs(skillId);
        skillGroups.push({ paths });
      }
      return resolveAndRead({ agentPaths, skillGroups, clonePath, budget });
    },
  };
}

/**
 * DI container. One per app instance. Holds config, db, the JobRunner,
 * the SSE bus, and lazily-constructed adapters resolved through SecretsProvider.
 *
 * Tests construct a container with `overrides` to inject mock adapters; the
 * Services depend on these interfaces, not the concrete classes.
 */
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  github?: GitHubClient;
  git?: GitClient;
  codeIndex?: CodeIndex;
  embedder?: Embedder;
  /** Pre-built providers by id (skip key lookup). */
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
  /** repo-intel facade (T1.1+) — tests inject mock RepoIntel implementations. */
  repoIntel?: RepoIntel;
  /** repo-intel T3 adapters — only the indexer pipeline reads these. */
  depgraph?: DepGraph;
  tokenizer?: Tokenizer;
  /** Clone-root-confined Markdown filesystem (project context, T-B1). */
  fsDocs?: FsDocs;
  /** Project context facade (T-B6) — tests inject a stub. */
  projectContext?: ProjectContextFacade;
}

export class Container {
  readonly config: AppConfig;
  readonly db: Db;
  readonly secrets: SecretsProvider;
  readonly auth: AuthProvider;
  readonly jobs: JobRunner;
  readonly runBus: RunBus;

  private _git?: GitClient;
  private _github?: GitHubClient;
  private _codeIndex?: CodeIndex;
  private _embedder?: Embedder;
  private llmCache = new Map<string, LLMProvider>();

  // Shared repositories for cross-cutting entities (agents, reviews/pulls,
  // runs). Constructed here, in the composition root, so consuming modules use
  // `container.agentsRepo` instead of reaching into another module's folder.
  private _agentsRepo?: AgentsRepository;
  private _reviewRepo?: ReviewRepository;
  private _skillsRepo?: SkillsRepository;
  private _repoIntel?: RepoIntel;
  private _depgraph?: DepGraph;
  private _tokenizer?: Tokenizer;
  private _priceBook?: PriceBook;
  private _fsDocs?: FsDocs;
  private _projectContext?: ProjectContextFacade;

  constructor(config: AppConfig, db: Db, private overrides: ContainerOverrides = {}) {
    this.config = config;
    this.db = db;
    this.secrets = overrides.secrets ?? new LocalSecretsProvider(config.secretsPath);
    this.auth = overrides.auth ?? new LocalNoAuthProvider(db);
    this.runBus = runBus;
    this.jobs = new JobRunner(db);
  }

  get git(): GitClient {
    if (this.overrides.git) return this.overrides.git;
    this._git ??= new SimpleGitClient(this.config.cloneDir);
    return this._git;
  }

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  get skillsRepo(): SkillsRepository {
    return (this._skillsRepo ??= new SkillsRepository(this.db));
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  get codeIndex(): CodeIndex {
    if (this.overrides.codeIndex) return this.overrides.codeIndex;
    this._codeIndex ??= new RipgrepCodeIndex(this.git);
    return this._codeIndex;
  }

  /**
   * The repo-intel facade (T1.1). All higher-level features (reviews,
   * blast/onboarding migrations, phantom-gate) code against this interface.
   * Tests inject a mock via `ContainerOverrides.repoIntel`.
   */
  get repoIntel(): RepoIntel {
    if (this.overrides.repoIntel) return this.overrides.repoIntel;
    this._repoIntel ??= new RepoIntelService(this);
    return this._repoIntel;
  }

  /** Import-graph builder (dependency-cruiser). T3 indexer pipeline only. */
  get depgraph(): DepGraph {
    if (this.overrides.depgraph) return this.overrides.depgraph;
    this._depgraph ??= new DepCruiseGraph();
    return this._depgraph;
  }

  /** Token counter (js-tiktoken) for the repo-map budget search. */
  get tokenizer(): Tokenizer {
    if (this.overrides.tokenizer) return this.overrides.tokenizer;
    this._tokenizer ??= new TiktokenTokenizer();
    return this._tokenizer;
  }

  /** Clone-root-confined Markdown filesystem adapter (T-B1). */
  get fsDocs(): FsDocs {
    if (this.overrides.fsDocs) return this.overrides.fsDocs;
    this._fsDocs ??= new NodeFsDocs();
    return this._fsDocs;
  }

  /** Project context facade — resolves + reads doc sets for run-executor (T-B6). */
  get projectContext(): ProjectContextFacade {
    if (this.overrides.projectContext) return this.overrides.projectContext;
    this._projectContext ??= buildProjectContextFacade(this);
    return this._projectContext;
  }

  /**
   * Live OpenRouter pricing for cost attribution. The lister builds a bare
   * OpenRouter provider just for `/models` (no estimator needed) and degrades to
   * `[]` when no key is configured; the static `estimateCost` table is the
   * fallback for OpenAI/Anthropic and a cold/cold-failed cache.
   */
  get priceBook(): PriceBook {
    this._priceBook ??= new PriceBook(async () => {
      try {
        const key = await this.secrets.get('OPENROUTER_API_KEY');
        if (!key) return [];
        return await new OpenRouterProvider(key).listModels();
      } catch {
        return [];
      }
    }, estimateCost);
    return this._priceBook;
  }

  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github;
    if (this._github) return this._github;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._github = new OctokitGitHubClient(token);
    return this._github;
  }

  /** Resolve an LLM provider by id; constructs from the secret key, cached. */
  async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    const cached = this.llmCache.get(id);
    if (cached) return cached;
    const provider = await this.buildLlm(id);
    this.llmCache.set(id, provider);
    return provider;
  }

  private async buildLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    if (id === 'openai') {
      const key = await this.secrets.get('OPENAI_API_KEY');
      if (!key) throw new ConfigError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key);
    }
    if (id === 'openrouter') {
      // Single OpenRouter provider lives in reviewer-core (shared with the CI
      // runner); inject the PriceBook so cost attribution uses LIVE OpenRouter
      // prices (with the static table as a fallback) rather than a hardcoded one.
      const key = await this.secrets.get('OPENROUTER_API_KEY');
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, {
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    }
    const key = await this.secrets.get('ANTHROPIC_API_KEY');
    if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key);
  }

  async embedder(): Promise<Embedder> {
    // Injected embedders (tests) always win. Otherwise embeddings are gated by
    // config: when disabled we throw BEFORE constructing the OpenAI client, so
    // the app makes ZERO OpenAI requests. All callers wrap this in try/catch and
    // degrade gracefully (memory/RAG simply returns no hits).
    if (this.overrides.embedder) return this.overrides.embedder;
    if (!this.config.embeddingsEnabled) {
      throw new ConfigError('Embeddings are disabled (set EMBEDDINGS_ENABLED=true to enable memory/RAG)');
    }
    if (this._embedder) return this._embedder;
    const openai = await this.llm('openai');
    this._embedder = new OpenAIEmbedder(openai);
    return this._embedder;
  }

  /**
   * Drop cached provider clients so the next resolve picks up changed secrets.
   * Call after persisting a new API key/PAT via SecretsProvider.set.
   */
  invalidateSecretCaches(): void {
    this.llmCache.clear();
    this._github = undefined;
    this._embedder = undefined;
  }
}
