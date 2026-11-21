import { describe, expect, it } from 'vitest';
import { isScanResult } from '../../../pipeline/scan/scan-cache';

// Requirements 4.4, 4.5: the stored-result validator and the `hints` field.

const SOURCES = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];

function entry(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dependency: {
      name: 'a',
      rawName: 'a',
      ecosystem: 'npm',
      versionSpec: '1.0.0',
      scope: 'runtime',
      sourceKind: 'registry',
    },
    manifestPath: 'package.json',
    lookupVersion: '1.0.0',
    versionBasis: 'pinned',
    facts: {
      daysSinceLastRelease: null,
      daysSinceLastCommit: null,
      archived: null,
      deprecated: null,
      openVulnerabilityCount: null,
      maxSeverity: null,
      maintainerCount: null,
    },
    advisories: [],
    ...extra,
  };
}

function result(dependency: Record<string, unknown>): unknown {
  return {
    ok: true,
    asOf: '2024-01-01T00:00:00.000Z',
    repo: {
      host: 'github.com',
      owner: 'o',
      repo: 'r',
      branch: 'main',
      defaultBranch: 'main',
      commitSha: 'abc',
    },
    discovery: { candidates: [], truncatedTree: false, depthLimited: false, countLimited: false },
    manifests: [],
    dependencies: [dependency],
    assessed: [],
    summary: {
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
    },
    sources: Object.fromEntries(SOURCES.map((s) => [s, 'ok'])),
    capped: { limit: 100, total: 0, skipped: [] },
    notes: [],
  };
}

const good = { kind: 'deprecation-notice', text: 'no longer supported', sourceUrl: null };
const goodAdvisory = {
  kind: 'advisory-notice',
  text: 'unmaintained',
  sourceUrl: 'https://osv.dev/vulnerability/RUSTSEC-2025-0141',
};

describe('isScanResult hints', () => {
  it('accepts a result without hints (Requirement 4.4)', () => {
    expect(isScanResult(result(entry()))).toBe(true);
  });

  it('accepts an empty list and valid hints', () => {
    expect(isScanResult(result(entry({ hints: [] })))).toBe(true);
    expect(isScanResult(result(entry({ hints: [good] })))).toBe(true);
    expect(isScanResult(result(entry({ hints: [good, goodAdvisory, good] })))).toBe(true);
  });

  it('counts code points: 600 astral characters are accepted, 601 are rejected', () => {
    const ok = { ...good, text: '\u{1F480}'.repeat(600) };
    const tooLong = { ...good, text: '\u{1F480}'.repeat(601) };
    expect(isScanResult(result(entry({ hints: [ok] })))).toBe(true);
    expect(isScanResult(result(entry({ hints: [tooLong] })))).toBe(false);
  });

  const malformed: ReadonlyArray<readonly [string, unknown]> = [
    ['wrong kind', [{ ...good, kind: 'other' }]],
    ['extra key', [{ ...good, extra: 1 }]],
    ['missing key', [{ kind: 'deprecation-notice', text: 'x' }]],
    ['empty-key object', [{ '': 'x' }]],
    ['non-string text', [{ ...good, text: 5 }]],
    ['text of 601 code points', [{ ...good, text: 'a'.repeat(601) }]],
    ['numeric sourceUrl', [{ ...good, sourceUrl: 5 }]],
    ['hints not an array', { 0: good }],
    ['hints a string', 'hint'],
    ['hints null', null],
    ['hint null', [null]],
    ['four hints', [good, good, good, good]],
  ];

  it.each(malformed)('rejects %s (Requirement 4.5)', (_label, hints) => {
    expect(isScanResult(result(entry({ hints })))).toBe(false);
  });
});
