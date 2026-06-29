/**
 * Blast Radius — GET /pulls/:id/blast.
 *
 * The route reads the impact map ENTIRELY from `container.repoIntel`, so we
 * inject a stub facade and assert the route groups callers under their changed
 * symbol, attributes endpoints/crons via factsByFile, derives state correctly,
 * and surfaces the degraded reason without throwing. Gated on Docker (needs
 * Postgres to resolve the PR + repo rows), like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { BlastMap } from '@devdigest/shared';
import type { BlastResult, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A RepoIntel facade that returns a fixed blast result (other methods unused). */
function stubRepoIntel(result: BlastResult): RepoIntel {
  return {
    async getBlastRadius() {
      return result;
    },
  } as unknown as RepoIntel;
}

let repoSeq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `blast-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      headSha: 'deadbeef',
      filesCount: 1,
      status: 'open',
    })
    .returning();
  await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/mw/rate-limit.ts' });
  return pr!;
}

d('blast radius route (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('groups callers under the changed symbol and attributes endpoints/crons', async () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/mw/rate-limit.ts', name: 'rateLimit', kind: 'function' }],
      callers: [
        { file: 'src/api/public/webhooks.ts', symbol: 'webhooks', viaSymbol: 'rateLimit', line: 45, rank: 0.4 },
        { file: 'src/api/public/index.ts', symbol: 'register', viaSymbol: 'rateLimit', line: 23, rank: 0.9 },
      ],
      impactedEndpoints: ['GET /api/public/items', 'POST /api/public/webhooks'],
      factsByFile: {
        'src/api/public/index.ts': { endpoints: ['GET /api/public/items'], crons: ['reset-rate-buckets'] },
        'src/api/public/webhooks.ts': { endpoints: ['POST /api/public/webhooks'], crons: [] },
      },
      degraded: false,
    };
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel: stubRepoIntel(result) } });
    const pr = await setupPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastMap;

    expect(body.state).toBe('ok');
    expect(body.symbols).toHaveLength(1);
    expect(body.symbol_count).toBe(1);
    expect(body.caller_count).toBe(2);
    expect(body.endpoint_count).toBe(2);
    expect(body.cron_count).toBe(1);
    expect(body.degraded_reason).toBeNull();

    const node = body.symbols[0]!;
    expect(node.name).toBe('rateLimit');
    // Rank-sorted: the higher-ranked caller (index.ts, 0.9) comes first.
    expect(node.callers.map((c) => c.file)).toEqual([
      'src/api/public/index.ts',
      'src/api/public/webhooks.ts',
    ]);
    expect(node.endpoints).toEqual(
      expect.arrayContaining(['GET /api/public/items', 'POST /api/public/webhooks']),
    );
    expect(node.crons).toEqual(['reset-rate-buckets']);
  });

  it('returns the empty state when no symbol has callers', async () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/mw/rate-limit.ts', name: 'rateLimit', kind: 'function' }],
      callers: [],
      impactedEndpoints: [],
      degraded: false,
    };
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel: stubRepoIntel(result) } });
    const pr = await setupPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastMap;
    expect(body.state).toBe('empty');
    expect(body.symbols).toHaveLength(0);
  });

  it('surfaces a degraded reason without throwing (best-effort, partial data)', async () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/mw/rate-limit.ts', name: 'rateLimit', kind: 'function' }],
      callers: [
        { file: 'src/api/public/index.ts', symbol: 'register', viaSymbol: 'rateLimit', line: 23, rank: 0 },
      ],
      impactedEndpoints: ['GET /api/public/items'],
      degraded: true,
      reason: 'no_data',
    };
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel: stubRepoIntel(result) } });
    const pr = await setupPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastMap;
    expect(body.state).toBe('degraded');
    expect(body.degraded_reason).toBe('no_data');
    // Partial data still rendered (one caller, no factsByFile → no per-symbol endpoints).
    expect(body.symbols).toHaveLength(1);
    expect(body.endpoint_count).toBe(1);
  });

  it('404s for an unknown PR id', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { repoIntel: stubRepoIntel({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' }) },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/pulls/00000000-0000-0000-0000-000000000000/blast`,
    });
    expect(res.statusCode).toBe(404);
  });
});
