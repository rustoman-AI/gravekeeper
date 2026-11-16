import { describe, expect, it } from 'vitest';
import { groupAssessed } from '../../../core/summarizer/group';
import type {
  AssessedDependency,
  Classification,
  Ecosystem,
  Scope,
  SourceKind,
} from '../../../core/model';

function cls(score: number): Classification {
  return {
    status: 'ALIVE',
    score,
    reasons: [],
    vulnerable: false,
    abandoned: false,
    dormant: false,
  };
}

function entry(
  name: string,
  scope: Scope,
  opts: { ecosystem?: Ecosystem; sourceKind?: SourceKind; classification?: Classification | null } = {},
): AssessedDependency {
  return {
    dependency: {
      name,
      rawName: name,
      ecosystem: opts.ecosystem ?? 'npm',
      versionSpec: '1.0.0',
      scope,
      sourceKind: opts.sourceKind ?? 'registry',
    },
    classification: opts.classification === undefined ? cls(1) : opts.classification,
  };
}

describe('groupAssessed (Requirement 12.1)', () => {
  it('returns no groups for empty input', () => {
    expect(groupAssessed([])).toEqual([]);
  });

  it('merges runtime and dev entries of one package into one group', () => {
    const groups = groupAssessed([entry('a', 'runtime'), entry('a', 'dev')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].scopes).toEqual(['runtime', 'dev']);
    expect(groups[0].classifications).toHaveLength(2);
  });

  it('separates the same name with registry and git source kinds', () => {
    const groups = groupAssessed([
      entry('a', 'runtime', { sourceKind: 'registry' }),
      entry('a', 'runtime', { sourceKind: 'git' }),
    ]);
    expect(groups.map((g) => g.sourceKind)).toEqual(['registry', 'git']);
  });

  it('separates the same name in npm and cargo', () => {
    const groups = groupAssessed([
      entry('a', 'runtime', { ecosystem: 'npm' }),
      entry('a', 'runtime', { ecosystem: 'cargo' }),
    ]);
    expect(groups.map((g) => g.ecosystem)).toEqual(['npm', 'cargo']);
  });

  it('handles __proto__ names safely', () => {
    const groups = groupAssessed([entry('__proto__', 'runtime'), entry('__proto__', 'dev'), entry('a', 'runtime')]);
    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe('__proto__');
    expect(groups[0].scopes).toEqual(['runtime', 'dev']);
    expect(({} as Record<string, unknown>).scopes).toBeUndefined();
  });

  it('sorts scopes in SCOPE_ORDER without repeats', () => {
    const groups = groupAssessed([
      entry('a', 'peer'),
      entry('a', 'dev'),
      entry('a', 'optional'),
      entry('a', 'runtime'),
      entry('a', 'dev'),
      entry('a', 'build'),
    ]);
    expect(groups[0].scopes).toEqual(['runtime', 'dev', 'build', 'optional', 'peer']);
  });

  it('drops null classifications and keeps the rest in input order', () => {
    const groups = groupAssessed([
      entry('a', 'runtime', { classification: cls(5) }),
      entry('a', 'dev', { classification: null }),
      entry('a', 'build', { classification: cls(9) }),
    ]);
    expect(groups[0].classifications.map((c) => c.score)).toEqual([5, 9]);
    expect(groups[0].scopes).toEqual(['runtime', 'dev', 'build']);
  });

  it('yields an empty classification list when all are null', () => {
    const groups = groupAssessed([entry('a', 'runtime', { classification: null })]);
    expect(groups[0].classifications).toEqual([]);
  });

  it('does not mutate the input', () => {
    const input = [entry('a', 'dev'), entry('a', 'runtime'), entry('b', 'runtime', { classification: null })];
    const snapshot = structuredClone(input);
    groupAssessed(input);
    expect(input).toEqual(snapshot);
  });
});
