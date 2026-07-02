/**
 * Diff Summary — POST/GET /pulls/:id/diff-summary.
 *
 * Covers the per-file trigger UX (T-B changes to `diff-summary/service.ts`):
 * generating file A, then generating file B for the SAME PR, must leave BOTH
 * summaries in the cache — proving the cache write MERGES a narrowed
 * (`paths`) batch instead of overwriting the whole row. Also covers the
 * "narrowed batch, nothing to summarize" edge case not clobbering an
 * existing cache row, and the Why-Risk Brief reuse path (a file already
 * named by a cached Brief risk is summarized from that risk's explanation
 * with ZERO model calls, instead of a fresh LLM call). Gated on Docker
 * (needs Postgres), like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { DiffSummaryResponse } from '@devdigest/shared';
import { MockLLMProvider, type MockLLMOptions } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `diff-summary-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 91,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      headSha: 'deadbeef',
      filesCount: 2,
      status: 'open',
    })
    .returning();
  await db.insert(t.prFiles).values([
    {
      prId: pr!.id,
      path: 'src/a.ts',
      additions: 3,
      deletions: 1,
      patch: '@@ -1,1 +1,3 @@\n-old a\n+new a\n+more a',
    },
    {
      prId: pr!.id,
      path: 'src/b.ts',
      additions: 2,
      deletions: 0,
      patch: '@@ -1,1 +1,2 @@\n old b\n+new b',
    },
  ]);
  return pr!;
}

d('diff summary route — per-file generation merge (Testcontainers pg)', () => {
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

  it('generating file A then file B keeps BOTH summaries cached (merge, not overwrite)', async () => {
    const llmOpts: MockLLMOptions = {
      structured: { summaries: [{ path: 'src/a.ts', summary: 'Adds the A helper.' }] },
    };
    const llm = new MockLLMProvider('openai', llmOpts);
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openrouter: llm } },
    });
    const pr = await setupPr(pg.handle.db, workspaceId);

    // Generate just file A.
    const resA = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/diff-summary`,
      payload: { paths: ['src/a.ts'] },
    });
    expect(resA.statusCode).toBe(200);
    const bodyA = resA.json() as DiffSummaryResponse;
    expect(bodyA.summaries).toEqual([{ path: 'src/a.ts', summary: 'Adds the A helper.' }]);

    // Now generate just file B — mutate the shared mock fixture reference so
    // the SECOND completeStructured call returns B's summary instead of A's.
    llmOpts.structured = { summaries: [{ path: 'src/b.ts', summary: 'Adds the B helper.' }] };

    const resB = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/diff-summary`,
      payload: { paths: ['src/b.ts'] },
    });
    expect(resB.statusCode).toBe(200);
    const bodyB = resB.json() as DiffSummaryResponse;

    // The response (and, by extension, the cache) must contain BOTH files —
    // regenerating B must not have clobbered A's previously cached summary.
    expect(bodyB.summaries).toEqual(
      expect.arrayContaining([
        { path: 'src/a.ts', summary: 'Adds the A helper.' },
        { path: 'src/b.ts', summary: 'Adds the B helper.' },
      ]),
    );
    expect(bodyB.summaries).toHaveLength(2);

    // A subsequent cached GET reflects the same merged state.
    const getRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/diff-summary` });
    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json() as DiffSummaryResponse;
    expect(getBody.summaries).toHaveLength(2);
  });

  it('a narrowed batch with nothing to summarize does not clobber an existing cache row', async () => {
    const llmOpts: MockLLMOptions = {
      structured: { summaries: [{ path: 'src/a.ts', summary: 'Adds the A helper.' }] },
    };
    const llm = new MockLLMProvider('openai', llmOpts);
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openrouter: llm } },
    });
    const pr = await setupPr(pg.handle.db, workspaceId);

    // Seed a cache row via a real generation for file A.
    const resA = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/diff-summary`,
      payload: { paths: ['src/a.ts'] },
    });
    expect(resA.statusCode).toBe(200);

    // Now request a path that doesn't exist among the PR's files — nothing
    // summarizable in this narrowed batch, no model call should even help.
    const resNone = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/diff-summary`,
      payload: { paths: ['src/does-not-exist.ts'] },
    });
    expect(resNone.statusCode).toBe(200);
    const bodyNone = resNone.json() as DiffSummaryResponse;

    // A's summary must still be there, untouched.
    expect(bodyNone.summaries).toEqual([{ path: 'src/a.ts', summary: 'Adds the A helper.' }]);
  });

  it('reuses a cached Brief risk explanation for a file it names, with ZERO model calls', async () => {
    // No `structured` fixture set — if the service DID call the model for
    // the Brief-covered file, MockLLMProvider would throw on the unset
    // fixture (or return whatever's configured); we instead assert directly
    // on `llm.calls` so a regression is caught even if a default happened to
    // validate.
    const llm = new MockLLMProvider('openai', {});
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openrouter: llm } },
    });
    const pr = await setupPr(pg.handle.db, workspaceId);

    await pg.handle.db.insert(t.prBrief).values({
      prId: pr.id,
      json: {
        what: 'Adds rate limiting.',
        why: 'Protects the public API from abuse.',
        risk_level: 'medium',
        risks: [
          {
            kind: 'reliability',
            title: 'New rate-limit middleware',
            explanation: 'New token-bucket limiter: read bucketKey, INCR in Redis, reject over the cap.',
            severity: 'medium',
            file_refs: ['src/a.ts:12'], // grounded `:line` suffix — must be stripped for matching
          },
        ],
        review_focus: ['src/a.ts'],
        missing_sections: [],
      },
      generatedHeadSha: pr.headSha,
      tokensIn: 500,
      tokensOut: 120,
      costUsd: 0.01,
    });

    // Generate ONLY src/a.ts — fully covered by the Brief risk above.
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/diff-summary`,
      payload: { paths: ['src/a.ts'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as DiffSummaryResponse;

    expect(body.summaries).toEqual([
      {
        path: 'src/a.ts',
        summary: 'New token-bucket limiter: read bucketKey, INCR in Redis, reject over the cap.',
      },
    ]);
    // The reused text came from the Brief cache, not the model.
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(0);
    // Zero cost recorded for this generation — no LLM call was made.
    expect(body.cost_usd).toBeNull();
    expect(body.tokens_in).toBeNull();
    expect(body.tokens_out).toBeNull();
  });
});
