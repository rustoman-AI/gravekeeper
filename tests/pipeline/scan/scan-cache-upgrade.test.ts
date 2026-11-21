import { describe, expect, it } from 'vitest';
import { isScanResult } from '../../../pipeline/scan/scan-cache';

// resurrect-upgrade Requirements 5.2, 5.3: the stored-result validator and the `upgrade` field.

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

const good = { version: '2.0.0', basis: 'registry-default' };

describe('isScanResult upgrade', () => {
  it('accepts a result without upgrade (Requirement 5.3)', () => {
    expect(isScanResult(result(entry()))).toBe(true);
  });

  it('accepts a valid upgrade (Requirement 5.2)', () => {
    expect(isScanResult(result(entry({ upgrade: good })))).toBe(true);
  });

  it('counts code points: 64 astral characters are accepted, 65 are rejected', () => {
    const ok = { ...good, version: '\u{1F480}'.repeat(64) };
    const tooLong = { ...good, version: '\u{1F480}'.repeat(65) };
    expect(isScanResult(result(entry({ upgrade: ok })))).toBe(true);
    expect(isScanResult(result(entry({ upgrade: tooLong })))).toBe(false);
  });

  const malformed: ReadonlyArray<readonly [string, unknown]> = [
    ['an array', [good]],
    ['an extra key', { ...good, extra: 1 }],
    ['a missing basis', { version: '2.0.0' }],
    ['a missing version', { basis: 'registry-default' }],
    ['an empty version', { ...good, version: '' }],
    ['a 65-code-point version', { ...good, version: 'a'.repeat(65) }],
    ['a numeric version', { ...good, version: 2 }],
    ['basis latest', { ...good, basis: 'latest' }],
    ['null', null],
  ];

  it.each(malformed)('rejects %s', (_label, upgrade) => {
    expect(isScanResult(result(entry({ upgrade })))).toBe(false);
  });
});
