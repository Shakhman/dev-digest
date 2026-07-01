/**
 * T-B4 — Pure resolver unit tests (no DB, no FS).
 *
 * Covers:
 *   resolveOrder: AC-11 dedup + agent-first ordering
 *   admitToBudget: AC-20 trim-to-budget, records excluded/truncated, no throw
 */
import { describe, it, expect } from 'vitest';
import { resolveOrder, admitToBudget } from '../src/modules/project-context/resolver.js';

describe('resolveOrder (AC-11)', () => {
  it('returns agent own paths first in stored order', () => {
    const result = resolveOrder({
      agentPaths: [
        { path: 'specs/b.md', order: 1 },
        { path: 'specs/a.md', order: 0 },
      ],
      skillGroups: [],
    });
    expect(result).toEqual(['specs/a.md', 'specs/b.md']);
  });

  it('appends skill-inherited paths after agent paths (in skill then per-skill order)', () => {
    const result = resolveOrder({
      agentPaths: [{ path: 'specs/agent.md', order: 0 }],
      skillGroups: [
        {
          paths: [
            { path: 'docs/skill1-b.md', order: 1 },
            { path: 'docs/skill1-a.md', order: 0 },
          ],
        },
        { paths: [{ path: 'docs/skill2.md', order: 0 }] },
      ],
    });
    expect(result).toEqual([
      'specs/agent.md',
      'docs/skill1-a.md',
      'docs/skill1-b.md',
      'docs/skill2.md',
    ]);
  });

  it('deduplicates: path in both agent and skill appears only once (agent-first)', () => {
    const result = resolveOrder({
      agentPaths: [{ path: 'specs/shared.md', order: 0 }],
      skillGroups: [
        { paths: [{ path: 'specs/shared.md', order: 0 }] },
      ],
    });
    expect(result).toEqual(['specs/shared.md']);
  });

  it('deduplicates across multiple skills', () => {
    const result = resolveOrder({
      agentPaths: [],
      skillGroups: [
        { paths: [{ path: 'docs/x.md', order: 0 }] },
        { paths: [{ path: 'docs/x.md', order: 0 }, { path: 'docs/y.md', order: 1 }] },
      ],
    });
    expect(result).toEqual(['docs/x.md', 'docs/y.md']);
  });

  it('returns empty array when no paths', () => {
    expect(resolveOrder({ agentPaths: [], skillGroups: [] })).toEqual([]);
  });

  it('handles only skill paths (no agent paths)', () => {
    const result = resolveOrder({
      agentPaths: [],
      skillGroups: [
        { paths: [{ path: 'specs/x.md', order: 0 }] },
      ],
    });
    expect(result).toEqual(['specs/x.md']);
  });
});

describe('admitToBudget (AC-20)', () => {
  const doc = (path: string, tokens: number) => ({
    path,
    content: 'x'.repeat(tokens * 4),
    tokens,
  });

  it('admits all docs when within budget', () => {
    const { included, truncated, excluded } = admitToBudget({
      docs: [doc('a.md', 100), doc('b.md', 200)],
      budget: 500,
    });
    expect(included).toHaveLength(2);
    expect(truncated).toHaveLength(0);
    expect(excluded).toHaveLength(0);
  });

  it('excludes docs that do not fit', () => {
    const { included, truncated, excluded } = admitToBudget({
      docs: [doc('a.md', 100), doc('b.md', 200), doc('c.md', 50)],
      budget: 150,
    });
    // a.md (100) fits; b.md (200) crosses boundary (truncated); c.md excluded
    expect(included.map((d) => d.path)).toContain('a.md');
    expect(excluded.map((d) => d.path)).toContain('c.md');
    expect(truncated).toHaveLength(1);
    expect(truncated[0]!.path).toBe('b.md');
  });

  it('truncates the boundary doc to fit remaining budget', () => {
    const { included, truncated } = admitToBudget({
      docs: [doc('a.md', 50), doc('big.md', 1000)],
      budget: 100,
    });
    const bigIncluded = included.find((d) => d.path === 'big.md');
    expect(bigIncluded).toBeDefined();
    expect(bigIncluded!.tokens).toBeLessThanOrEqual(50); // 100 - 50 remaining
    expect(truncated[0]?.path).toBe('big.md');
  });

  it('excludes (not truncates) when zero budget remains at boundary', () => {
    const { included, truncated, excluded } = admitToBudget({
      docs: [doc('a.md', 100), doc('b.md', 200)],
      budget: 100,
    });
    expect(included.map((d) => d.path)).toEqual(['a.md']);
    expect(excluded.map((d) => d.path)).toEqual(['b.md']);
    expect(truncated).toHaveLength(0);
  });

  it('handles empty docs without throwing', () => {
    const { included, truncated, excluded } = admitToBudget({ docs: [], budget: 1000 });
    expect(included).toHaveLength(0);
    expect(truncated).toHaveLength(0);
    expect(excluded).toHaveLength(0);
  });

  it('handles zero budget without throwing', () => {
    const { included, excluded } = admitToBudget({
      docs: [doc('a.md', 100)],
      budget: 0,
    });
    expect(included).toHaveLength(0);
    expect(excluded).toHaveLength(1);
  });

  it('is deterministic for the same input', () => {
    const input = {
      docs: [doc('a.md', 30), doc('b.md', 40), doc('c.md', 60)],
      budget: 80,
    };
    const r1 = admitToBudget(input);
    const r2 = admitToBudget(input);
    expect(r1.included.map((d) => d.path)).toEqual(r2.included.map((d) => d.path));
  });
});
