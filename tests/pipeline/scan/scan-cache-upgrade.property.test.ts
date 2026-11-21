// Feature: resurrect-upgrade, Property RU-P7: Scan results with upgrades survive JSON and the validator
// Validates: Requirements 5.2, 5.3, 5.8
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isScanResult } from '../../../pipeline/scan/scan-cache';
import { cfg } from '../../support/fc-config';

const SOURCES = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];
const VERSION_MAX = 64;
type Json = Record<string, unknown>;

// Code points without lone surrogates, so that JSON keeps them as they are.
const arbCodePoint = fc.oneof(
  fc.integer({ min: 0x20, max: 0x7e }),
  fc.integer({ min: 0xa0, max: 0xd7ff }),
  fc.integer({ min: 0x10000, max: 0x10ffff }),
);
const arbVersion = fc
  .array(arbCodePoint, { minLength: 1, maxLength: 20 })
  .map((cps) => cps.map((cp) => String.fromCodePoint(cp)).join(''));
const arbBoundaryVersion = fc
  .integer({ min: VERSION_MAX - 1, max: VERSION_MAX })
  .map((n) => '\u{1F480}'.repeat(n));

const arbUpgrade: fc.Arbitrary<Json> = fc.record({
  version: fc.oneof({ weight: 8, arbitrary: arbVersion }, { weight: 1, arbitrary: arbBoundaryVersion }),
  basis: fc.constant('registry-default'),
});

function dependency(name: string, upgrade: Json | undefined): Json {
  return {
    dependency: {
      name,
      rawName: name,
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
    ...(upgrade === undefined ? {} : { upgrade }),
  };
}

function build(dependencies: readonly Json[]): Json {
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
    manifests: [{ path: 'package.json', format: 'package.json', warnings: [] }],
    dependencies,
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

const arbMaybeUpgrade = fc.option(arbUpgrade, { nil: undefined });
const arbUpgrades = fc.array(arbMaybeUpgrade, { minLength: 1, maxLength: 4 });
const arbDependencies = arbUpgrades.map((all) => all.map((u, i) => dependency(`pkg${i}`, u)));

const arbResult = arbDependencies.map((d) => build(d));

const arbBadVersion = fc.oneof(
  fc.constant(''),
  fc.constant('1'.repeat(VERSION_MAX + 1)),
  fc.constant('\u{1F480}'.repeat(VERSION_MAX + 1)),
  fc.integer(),
  fc.constant(null),
  fc.constant(['1.0.0']),
  fc.constant({ v: '1.0.0' }),
);
const arbBadBasis = fc.oneof(
  fc.constantFrom('latest', 'Registry-Default', '', 'registry-default '),
  fc.integer(),
  fc.constant(null),
  fc.boolean(),
  fc.constant(['registry-default']),
);

type Mutation = (upgrade: Json) => unknown;
const arbMutation: fc.Arbitrary<Mutation> = fc.oneof(
  fc.constantFrom(null, 'x', 5, true, [], ['a'], [{ version: '1.0.0', basis: 'registry-default' }]).map(
    (v): Mutation => () => v,
  ),
  fc.constantFrom('extra', '', 'Version').map((key): Mutation => (u) => ({ ...u, [key]: 1 })),
  fc.constantFrom('version', 'basis').map((key): Mutation => (u) => {
    const rest = { ...u };
    delete rest[key];
    return rest;
  }),
  arbBadVersion.map((version): Mutation => (u) => ({ ...u, version })),
  arbBadBasis.map((basis): Mutation => (u) => ({ ...u, basis })),
);

describe('RU-P7 scan results with upgrades survive JSON and the validator', () => {
  it('RU-P7 accepts a generated result, before and after a JSON round trip', () => {
    fc.assert(
      fc.property(arbResult, (result) => {
        expect(isScanResult(result)).toBe(true);
        const parsed: unknown = JSON.parse(JSON.stringify(result));
        expect(parsed).toEqual(result);
        expect(isScanResult(parsed)).toBe(true);
      }),
      cfg(),
    );
  });

  it('RU-P7 rejects a result with one upgrade replaced by a malformed value', () => {
    fc.assert(
      fc.property(
        fc.array(arbUpgrade, { minLength: 1, maxLength: 4 }),
        arbMutation,
        fc.nat(),
        (upgrades, mutate, pick) => {
          const index = pick % upgrades.length;
          const deps = upgrades.map((u, i) =>
            dependency(`pkg${i}`, i === index ? (mutate(u) as Json) : u),
          );
          expect(isScanResult(build(deps))).toBe(false);
        },
      ),
      cfg(),
    );
  });
});
