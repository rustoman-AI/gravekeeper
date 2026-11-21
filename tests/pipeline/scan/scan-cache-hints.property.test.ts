// Feature: resurrect, Property RS-P12: Scan results with hints survive JSON and the validator
// Validates: Requirements 4.5, 4.6, 5.5
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HINT_TEXT_MAX_LENGTH, HINTS_MAX_PER_PACKAGE } from '../../../pipeline/constants';
import { isScanResult } from '../../../pipeline/scan/scan-cache';
import { cfg } from '../../support/fc-config';

const SOURCES = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];
type Json = Record<string, unknown>;

// Code points without lone surrogates, so that JSON keeps them as they are.
const arbCodePoint = fc.oneof(
  fc.integer({ min: 0x20, max: 0x7e }),
  fc.integer({ min: 0xa0, max: 0xd7ff }),
  fc.integer({ min: 0x10000, max: 0x10ffff }),
);
const arbText = fc
  .array(arbCodePoint, { maxLength: 40 })
  .map((cps) => cps.map((cp) => String.fromCodePoint(cp)).join(''));
const arbBoundaryText = fc
  .integer({ min: HINT_TEXT_MAX_LENGTH - 1, max: HINT_TEXT_MAX_LENGTH })
  .map((n) => '\u{1F480}'.repeat(n));

const arbHint: fc.Arbitrary<Json> = fc.record({
  kind: fc.constantFrom('deprecation-notice', 'advisory-notice'),
  text: fc.oneof({ weight: 8, arbitrary: arbText }, { weight: 1, arbitrary: arbBoundaryText }),
  sourceUrl: fc.option(fc.webUrl(), { nil: null }),
});

const arbHints = fc.array(arbHint, { maxLength: HINTS_MAX_PER_PACKAGE });
const arbHintsNonEmpty = fc.array(arbHint, { minLength: 1, maxLength: HINTS_MAX_PER_PACKAGE });

function dependency(name: string, hints: readonly Json[] | undefined): Json {
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
    ...(hints === undefined ? {} : { hints }),
  };
}

function manifest(index: number, tool: string | undefined): Json {
  return {
    path: `m${index}/pyproject.toml`,
    format: 'pyproject.toml',
    warnings: [],
    ...(tool === undefined ? {} : { pyprojectTool: tool }),
  };
}

function build(dependencies: readonly Json[], manifests: readonly Json[]): Json {
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
    manifests,
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

const arbTool = fc.option(fc.constantFrom('poetry', 'pep621', 'mixed'), { nil: undefined });
const arbManifests = fc
  .array(arbTool, { maxLength: 4 })
  .map((tools) => tools.map((tool, i) => manifest(i, tool)));
const arbDependencies = fc
  .array(fc.option(arbHints, { nil: undefined }), { maxLength: 4 })
  .map((all) => all.map((hints, i) => dependency(`pkg${i}`, hints)));

const arbResult = fc.tuple(arbDependencies, arbManifests).map(([d, m]) => build(d, m));

const arbBadText = fc.oneof(
  fc.constant('\u{1F480}'.repeat(HINT_TEXT_MAX_LENGTH + 1)),
  fc.constant('a'.repeat(HINT_TEXT_MAX_LENGTH + 1)),
  fc.integer(),
  fc.constant(null),
  fc.constant(['x']),
  fc.constant({ a: 'x' }),
);
const arbBadUrl = fc.oneof(fc.integer(), fc.boolean(), fc.constant(['u']), fc.constant({}));

type HintMutation = (hint: Json) => Json;
const arbHintMutation: fc.Arbitrary<HintMutation> = fc.oneof(
  fc.constantFrom('other', 'Deprecation-Notice', '', 5, null).map((kind): HintMutation => (h) => ({ ...h, kind })),
  fc.constantFrom('extra', '').map((key): HintMutation => (h) => ({ ...h, [key]: 1 })),
  fc.constantFrom('kind', 'text', 'sourceUrl').map((key): HintMutation => (h) => {
    const rest = { ...h };
    delete rest[key];
    return rest;
  }),
  arbBadText.map((text): HintMutation => (h) => ({ ...h, text })),
  arbBadUrl.map((sourceUrl): HintMutation => (h) => ({ ...h, sourceUrl })),
  fc.constantFrom(null, 'x', 5, []).map((v): HintMutation => () => v as unknown as Json),
);

const arbBadTool = fc.oneof(
  fc.constantFrom('uv', 'Poetry', 'PEP621', '', 'pdm', 'hatch'),
  fc.integer(),
  fc.constant(null),
  fc.constant(['poetry']),
  fc.boolean(),
);

describe('RS-P12 scan results with hints survive JSON and the validator', () => {
  it('RS-P12 accepts a generated result, before and after a JSON round trip', () => {
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

  it('RS-P12 rejects a result with one hint replaced by a malformed one', () => {
    fc.assert(
      fc.property(
        fc.array(arbHintsNonEmpty, { minLength: 1, maxLength: 3 }),
        arbManifests,
        arbHintMutation,
        fc.nat(),
        fc.nat(),
        (lists, manifests, mutate, depPick, hintPick) => {
          const depIndex = depPick % lists.length;
          const hintIndex = hintPick % lists[depIndex].length;
          const deps = lists.map((hints, i) =>
            dependency(`pkg${i}`, i === depIndex ? hints.map((h, j) => (j === hintIndex ? mutate(h) : h)) : hints),
          );
          expect(isScanResult(build(deps, manifests))).toBe(false);
        },
      ),
      cfg(),
    );
  });

  it('RS-P12 rejects a result with one pyprojectTool replaced by an unknown value', () => {
    fc.assert(
      fc.property(
        fc.array(arbTool, { minLength: 1, maxLength: 4 }),
        arbDependencies,
        arbBadTool,
        fc.nat(),
        (tools, deps, bad, pick) => {
          const index = pick % tools.length;
          const manifests = tools.map((tool, i) => {
            const m = manifest(i, tool);
            return i === index ? { ...m, pyprojectTool: bad } : m;
          });
          expect(isScanResult(build(deps, manifests))).toBe(false);
        },
      ),
      cfg(),
    );
  });
});
