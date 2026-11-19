// Validates: Requirements 9.1, 9.2, 9.3, 9.4
import { describe, expect, it } from 'vitest';
import { uniquePackages } from '../../../core/index';
import type {
  AssessedDependency,
  Classification,
  Ecosystem,
  Scope,
  SourceKind,
  Status,
} from '../../../core/index';

function cls(score: number, status: Status = 'HAUNTED'): Classification {
  return {
    status,
    score,
    reasons: [{ ruleId: '7.2', message: 'm', facts: [] }],
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

describe('uniquePackages', () => {
  it('merges two scopes of one package to one entry with the higher-scored classification', () => {
    const high = cls(70, 'DEAD');
    const result = uniquePackages([
      dep('a', cls(20), { scope: 'dev' }),
      dep('a', high, { scope: 'runtime' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'a', ecosystem: 'npm', sourceKind: 'registry' });
    expect(result[0]?.scopes).toEqual(['runtime', 'dev']);
    expect(result[0]?.classification).toBe(high);
  });

  it('keeps git and path entries separate from the registry entry of the same name', () => {
    const result = uniquePackages([
      dep('a', cls(10)),
      dep('a', null, { sourceKind: 'git' }),
      dep('a', null, { sourceKind: 'path' }),
    ]);
    expect(result.map((p) => p.sourceKind)).toEqual(['registry', 'git', 'path']);
  });

  it('gives a null classification when every entry of the package is unassessed', () => {
    const result = uniquePackages([dep('a', null), dep('a', null, { scope: 'dev' })]);
    expect(result).toHaveLength(1);
    expect(result[0]?.classification).toBeNull();
  });

  it('ignores null classifications when another entry of the package has one', () => {
    const c = cls(5);
    const result = uniquePackages([dep('a', null), dep('a', c, { scope: 'dev' })]);
    expect(result[0]?.classification).toBe(c);
  });

  it('keeps the order of first sight', () => {
    const result = uniquePackages([dep('b', null), dep('a', null), dep('b', null, { scope: 'dev' }), dep('c', null)]);
    expect(result.map((p) => p.name)).toEqual(['b', 'a', 'c']);
  });

  it('returns [] for an empty or non-array input', () => {
    expect(uniquePackages([])).toEqual([]);
    expect(uniquePackages(null as never)).toEqual([]);
  });

  it('does not mutate the input', () => {
    const input = [dep('a', cls(1)), dep('a', cls(2), { scope: 'dev' }), dep('b', null)];
    const snapshot = JSON.stringify(input);
    const copy = [...input];
    uniquePackages(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    input.forEach((item, i) => expect(item).toBe(copy[i]));
  });
});
