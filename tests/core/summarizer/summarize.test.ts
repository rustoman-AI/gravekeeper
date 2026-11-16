import { describe, expect, it } from 'vitest';
import { summarize } from '../../../core/index';
import type {
  AssessedDependency,
  Classification,
  Ecosystem,
  Scope,
  SourceKind,
  Status,
} from '../../../core/index';

function cls(score: number, status: Status = 'HAUNTED', message = 'm'): Classification {
  return {
    status,
    score,
    reasons: [{ ruleId: '7.2', message, facts: [] }],
    vulnerable: false,
    abandoned: false,
    dormant: false,
  };
}

function dep(
  name: string,
  classification: Classification | null,
  opts: { scope?: Scope; sourceKind?: SourceKind; ecosystem?: Ecosystem } = {},
): AssessedDependency {
  return {
    dependency: {
      name,
      rawName: name,
      ecosystem: opts.ecosystem ?? 'npm',
      versionSpec: '1.0.0',
      scope: opts.scope ?? 'runtime',
      sourceKind: opts.sourceKind ?? 'registry',
    },
    classification,
  };
}

const alive0 = (): Classification => ({ ...cls(0, 'ALIVE'), reasons: [] });

describe('summarize', () => {
  it('returns the empty summary for an empty list', () => {
    expect(summarize([])).toEqual({
      total: 0,
      assessed: 0,
      unassessed: 0,
      counts: { ALIVE: 0, HAUNTED: 0, DEAD: 0 },
      averageScore: null,
      maxScore: null,
      maxScorePackage: null,
      grade: null,
      worst: [],
      unassessedItems: [],
    });
  });

  it('returns the empty summary for non-array input', () => {
    const empty = summarize([]);
    expect(summarize(null as never)).toEqual(empty);
    expect(summarize(undefined as never)).toEqual(empty);
    expect(summarize({ length: 1 } as never)).toEqual(empty);
    expect(summarize('abc' as never)).toEqual(empty);
  });

  it('handles an all-unassessed list', () => {
    const s = summarize([
      dep('a', null),
      dep('b', cls(50), { sourceKind: 'git' }),
      dep('c', null, { sourceKind: 'path' }),
    ]);
    expect(s.total).toBe(3);
    expect(s.assessed).toBe(0);
    expect(s.unassessed).toBe(3);
    expect(s.counts).toEqual({ ALIVE: 0, HAUNTED: 0, DEAD: 0 });
    expect(s.averageScore).toBeNull();
    expect(s.maxScore).toBeNull();
    expect(s.maxScorePackage).toBeNull();
    expect(s.grade).toBeNull();
    expect(s.worst).toEqual([]);
  });

  it('counts statuses and keeps ALIVE+HAUNTED+DEAD+unassessed = total', () => {
    const s = summarize([
      dep('a', cls(0, 'ALIVE')),
      dep('b', cls(10, 'ALIVE')),
      dep('c', cls(30, 'HAUNTED')),
      dep('d', cls(90, 'DEAD')),
      dep('e', null),
      dep('f', cls(20), { sourceKind: 'git' }),
    ]);
    expect(s.counts).toEqual({ ALIVE: 2, HAUNTED: 1, DEAD: 1 });
    expect(s.assessed).toBe(4);
    expect(s.unassessed).toBe(2);
    expect(s.total).toBe(6);
    expect(s.counts.ALIVE + s.counts.HAUNTED + s.counts.DEAD + s.unassessed).toBe(s.total);
  });

  it('rounds a mean of 2.5 up to 3', () => {
    const s = summarize([dep('a', cls(2)), dep('b', cls(3))]);
    expect(s.averageScore).toBe(3);
  });

  it('grades by maxScore: one score of 60 among many zeros gives D', () => {
    const entries = Array.from({ length: 30 }, (_, i) => dep(`z${i}`, alive0()));
    entries.push(dep('bad', cls(60)));
    const s = summarize(entries);
    expect(s.averageScore).toBe(2);
    expect(s.maxScore).toBe(60);
    expect(s.grade).toBe('D');
  });

  it('grades at the boundaries of grade(maxScore)', () => {
    expect(summarize([dep('a', cls(19, 'ALIVE'))]).grade).toBe('A');
    expect(summarize([dep('a', cls(20, 'ALIVE'))]).grade).toBe('B');
    expect(summarize([dep('a', cls(59))]).grade).toBe('C');
    expect(summarize([dep('a', cls(79))]).grade).toBe('D');
    expect(summarize([dep('a', cls(80))]).grade).toBe('F');
  });

  it('has null grade when nothing is assessed', () => {
    expect(summarize([dep('a', null)]).grade).toBeNull();
  });

  describe('worst truncation', () => {
    const make = (n: number) =>
      Array.from({ length: n }, (_, i) => dep(`p${String(i).padStart(2, '0')}`, cls(i + 1)));

    it.each([
      [0, 0],
      [1, 1],
      [10, 10],
      [11, 10],
    ])('with %i assessed lists %i', (n, expected) => {
      const s = summarize(make(n));
      expect(s.assessed).toBe(n);
      expect(s.worst).toHaveLength(expected);
    });

    it('drops the lowest-risk package at 11 and orders by score descending', () => {
      const s = summarize(make(11));
      expect(s.worst.map((p) => p.classification.score)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    });
  });

  it('excludes ALIVE with score 0 from worst but counts it', () => {
    const s = summarize([dep('a', alive0()), dep('b', cls(5, 'ALIVE'))]);
    expect(s.worst.map((p) => p.name)).toEqual(['b']);
    expect(s.counts.ALIVE).toBe(2);
    expect(s.assessed).toBe(2);
  });

  it('orders entries that are all tied by name', () => {
    const s = summarize([dep('c', cls(40)), dep('a', cls(40)), dep('b', cls(40))]);
    expect(s.worst.map((p) => p.name)).toEqual(['a', 'b', 'c']);
    expect(s.maxScorePackage).toEqual({ name: 'a', ecosystem: 'npm' });
  });

  it('orders ties by status, then name, ecosystem, sourceKind', () => {
    const s = summarize([
      dep('x', cls(50, 'DEAD')),
      dep('x', cls(50, 'HAUNTED'), { ecosystem: 'pypi' }),
      dep('a', cls(50, 'DEAD')),
    ]);
    expect(s.worst.map((p) => [p.name, p.ecosystem])).toEqual([
      ['x', 'pypi'],
      ['a', 'npm'],
      ['x', 'npm'],
    ]);
  });

  it('picks maxScorePackage before truncation and before the ALIVE-0 exclusion', () => {
    // 12 packages tied at the top score, the first by name is beyond nothing; use ordering to check.
    const many = Array.from({ length: 12 }, (_, i) => dep(`p${String(i).padStart(2, '0')}`, cls(70)));
    const s = summarize(many);
    expect(s.worst).toHaveLength(10);
    expect(s.maxScorePackage).toEqual({ name: 'p00', ecosystem: 'npm' });
    expect(s.maxScorePackage).toEqual({ name: s.worst[0].name, ecosystem: s.worst[0].ecosystem });

    // Only ALIVE score 0 packages: worst is empty but maxScorePackage is still set.
    const zeros = summarize([dep('b', alive0()), dep('a', alive0())]);
    expect(zeros.worst).toEqual([]);
    expect(zeros.maxScore).toBe(0);
    expect(zeros.maxScorePackage).toEqual({ name: 'a', ecosystem: 'npm' });
    expect(zeros.grade).toBe('A');
  });

  it('treats a package with one null and one non-null classification as assessed', () => {
    const s = summarize([dep('a', null, { scope: 'dev' }), dep('a', cls(40), { scope: 'runtime' })]);
    expect(s.total).toBe(1);
    expect(s.assessed).toBe(1);
    expect(s.unassessed).toBe(0);
    expect(s.worst[0].classification.score).toBe(40);
    expect(s.unassessedItems).toEqual([]);
  });

  it('counts the same package in two scopes once, with both scopes sorted', () => {
    const s = summarize([
      dep('a', cls(40), { scope: 'dev' }),
      dep('a', cls(40), { scope: 'runtime' }),
    ]);
    expect(s.total).toBe(1);
    expect(s.counts.HAUNTED).toBe(1);
    expect(s.worst).toHaveLength(1);
    expect(s.worst[0].scopes).toEqual(['runtime', 'dev']);
  });

  it('chooses the same worst entry for Classifications differing only in Reason text, in either order (12.22)', () => {
    const e1 = dep('a', cls(40, 'HAUNTED', 'first message'), { scope: 'runtime' });
    const e2 = dep('a', cls(40, 'HAUNTED', 'second message'), { scope: 'dev' });
    const forward = summarize([e1, e2]);
    const backward = summarize([e2, e1]);
    expect(forward.worst).toHaveLength(1);
    expect(forward.worst[0]).toEqual(backward.worst[0]);
    expect(forward).toEqual(backward);
  });

  it('merges to the highest-risk classification of a package', () => {
    const s = summarize([dep('a', cls(30, 'HAUNTED')), dep('a', cls(90, 'DEAD'), { scope: 'dev' })]);
    expect(s.maxScore).toBe(90);
    expect(s.counts).toEqual({ ALIVE: 0, HAUNTED: 0, DEAD: 1 });
  });

  it('lists unassessedItems with reasons, ordered by ecosystem, name, sourceKind', () => {
    const s = summarize([
      dep('z', null),
      dep('b', cls(10), { sourceKind: 'git' }),
      dep('a', null, { ecosystem: 'pypi' }),
      dep('b', null, { sourceKind: 'path' }),
      dep('a', null, { ecosystem: 'cargo', sourceKind: 'path' }),
    ]);
    expect(
      s.unassessedItems.map((i) => [i.ecosystem, i.name, i.sourceKind, i.unassessedReason]),
    ).toEqual([
      ['cargo', 'a', 'path', 'non-registry-source'],
      ['npm', 'b', 'git', 'non-registry-source'],
      ['npm', 'b', 'path', 'non-registry-source'],
      ['npm', 'z', 'registry', 'no-health-data'],
      ['pypi', 'a', 'registry', 'no-health-data'],
    ]);
    expect(s.unassessedItems.every((i) => i.scopes.length > 0)).toBe(true);
    expect(s.unassessed).toBe(5);
  });

  it('does not mutate the input array', () => {
    const entries = [dep('b', cls(10)), dep('a', cls(90)), dep('c', null), dep('a', cls(5), { scope: 'dev' })];
    const before = structuredClone(entries);
    const refs = [...entries];
    summarize(entries);
    expect(entries).toEqual(before);
    expect(entries.every((e, i) => e === refs[i])).toBe(true);
  });
});
