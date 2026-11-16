import { describe, expect, it } from 'vitest';
import { partitionPackages, unassessedReasonOf } from '../../../core/summarizer/partition';
import {
  compareRanked,
  compareUnassessed,
  sortRanked,
  sortUnassessed,
} from '../../../core/summarizer/order';
import type {
  Classification,
  Ecosystem,
  RuleId,
  SourceKind,
  Status,
  UnassessedItem,
  UniquePackage,
} from '../../../core/model';

function cls(
  score: number,
  status: Status = 'ALIVE',
  opts: { ruleIds?: RuleId[]; vulnerable?: boolean } = {},
): Classification {
  return {
    status,
    score,
    reasons: (opts.ruleIds ?? []).map((ruleId) => ({ ruleId, message: 'm', facts: [] })),
    vulnerable: opts.vulnerable ?? false,
    abandoned: false,
    dormant: false,
  };
}

function pkg(
  name: string,
  sourceKind: SourceKind,
  classification: Classification | null,
  ecosystem: Ecosystem = 'npm',
): UniquePackage {
  return { name, ecosystem, sourceKind, scopes: ['runtime'], classification };
}

function ranked(
  name: string,
  classification: Classification,
  ecosystem: Ecosystem = 'npm',
  sourceKind: SourceKind = 'registry',
) {
  return { name, ecosystem, sourceKind, classification };
}

function item(name: string, ecosystem: Ecosystem, sourceKind: SourceKind): UnassessedItem {
  return { name, ecosystem, sourceKind, scopes: ['runtime'], unassessedReason: 'non-registry-source' };
}

describe('unassessedReasonOf / partitionPackages (Requirements 12.2, 12.14)', () => {
  it('classifies a git package with a classification as non-registry-source', () => {
    expect(unassessedReasonOf(pkg('a', 'git', cls(5)))).toBe('non-registry-source');
    expect(unassessedReasonOf(pkg('a', 'path', null))).toBe('non-registry-source');
  });

  it('classifies a registry package with null classification as no-health-data', () => {
    expect(unassessedReasonOf(pkg('a', 'registry', null))).toBe('no-health-data');
  });

  it('returns null for an assessed registry package', () => {
    expect(unassessedReasonOf(pkg('a', 'registry', cls(5)))).toBeNull();
  });

  it('partitions in input order without mutating the input', () => {
    const input = [
      pkg('z', 'registry', cls(1)),
      pkg('y', 'git', cls(2)),
      pkg('x', 'registry', null),
      pkg('w', 'registry', cls(3)),
    ];
    const snapshot = [...input];
    const { assessed, unassessedItems } = partitionPackages(input);
    expect(assessed.map((p) => p.name)).toEqual(['z', 'w']);
    expect(unassessedItems.map((p) => [p.name, p.unassessedReason])).toEqual([
      ['y', 'non-registry-source'],
      ['x', 'no-health-data'],
    ]);
    expect(input).toEqual(snapshot);
  });
});

describe('compareRanked / sortRanked (Requirement 12.6)', () => {
  it('orders by score descending first', () => {
    expect(compareRanked(ranked('b', cls(90)), ranked('a', cls(10)))).toBeLessThan(0);
  });

  it('then by status HAUNTED, DEAD, ALIVE', () => {
    const sorted = sortRanked([
      ranked('a', cls(50, 'ALIVE')),
      ranked('b', cls(50, 'DEAD')),
      ranked('c', cls(50, 'HAUNTED')),
    ]);
    expect(sorted.map((r) => r.classification.status)).toEqual(['HAUNTED', 'DEAD', 'ALIVE']);
  });

  it('then by name, ecosystem, sourceKind', () => {
    expect(compareRanked(ranked('a', cls(1)), ranked('b', cls(1)))).toBeLessThan(0);
    expect(compareRanked(ranked('a', cls(1), 'cargo'), ranked('a', cls(1), 'npm'))).toBeLessThan(0);
    expect(
      compareRanked(ranked('a', cls(1), 'npm', 'git'), ranked('a', cls(1), 'npm', 'registry')),
    ).toBeLessThan(0);
  });

  it('then by classification tie key', () => {
    const a = ranked('a', cls(1, 'ALIVE', { ruleIds: ['6.3'] }));
    const b = ranked('a', cls(1, 'ALIVE', { ruleIds: ['7.2'] }));
    const v = ranked('a', cls(1, 'ALIVE', { vulnerable: true }));
    expect(compareRanked(a, b)).toBeLessThan(0);
    expect(compareRanked(b, a)).toBeGreaterThan(0);
    expect(compareRanked(b, v)).toBeLessThan(0); // flags false before true
    expect(compareRanked(a, a)).toBe(0);
  });

  it('compares by code point: astral U+1F600 after high BMP U+FF5E', () => {
    const bmp = ranked('\uFF5E', cls(1));
    const astral = ranked('\u{1F600}', cls(1));
    expect(compareRanked(bmp, astral)).toBeLessThan(0);
    expect(compareRanked(astral, bmp)).toBeGreaterThan(0);
  });

  it('orders uppercase before lowercase', () => {
    expect(compareRanked(ranked('B', cls(1)), ranked('a', cls(1)))).toBeLessThan(0);
  });

  it('returns a copy and does not mutate the input', () => {
    const input = [ranked('b', cls(1)), ranked('a', cls(1))];
    const snapshot = [...input];
    const out = sortRanked(input);
    expect(out).not.toBe(input);
    expect(out.map((r) => r.name)).toEqual(['a', 'b']);
    expect(input).toEqual(snapshot);
    expect(input[0].name).toBe('b');
  });
});

describe('compareUnassessed / sortUnassessed (Requirement 12.14)', () => {
  it('orders by ecosystem, then name, then sourceKind', () => {
    const input = [
      item('b', 'npm', 'git'),
      item('a', 'pypi', 'git'),
      item('a', 'npm', 'path'),
      item('a', 'npm', 'git'),
      item('a', 'cargo', 'path'),
    ];
    const out = sortUnassessed(input);
    expect(out.map((i) => `${i.ecosystem}/${i.name}/${i.sourceKind}`)).toEqual([
      'cargo/a/path',
      'npm/a/git',
      'npm/a/path',
      'npm/b/git',
      'pypi/a/git',
    ]);
  });

  it('compares names by code point', () => {
    expect(compareUnassessed(item('\uFF5E', 'npm', 'git'), item('\u{1F600}', 'npm', 'git'))).toBeLessThan(0);
    expect(compareUnassessed(item('Z', 'npm', 'git'), item('a', 'npm', 'git'))).toBeLessThan(0);
  });

  it('returns a copy and does not mutate the input', () => {
    const input = [item('b', 'npm', 'git'), item('a', 'npm', 'git')];
    const snapshot = [...input];
    const out = sortUnassessed(input);
    expect(out).not.toBe(input);
    expect(input).toEqual(snapshot);
    expect(out.map((i) => i.name)).toEqual(['a', 'b']);
  });
});
