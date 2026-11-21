import * as fc from 'fast-check';
import type { Classification, Ecosystem, ManifestFormat, Scope } from '../../../core';
import type { CuratedEntry } from '../../../view-model/resurrections';
import type { ManifestOrigin, PackageRow, ParsedHint, PlotKind } from '../../../view-model/types';
import { classificationFor, type PlotCase } from '../ui/scan-result-builder';

// resurrect (Resurrect spec): generators of rows, hints, origins, scopes and curated lists.
export const ECOSYSTEMS: readonly Ecosystem[] = ['npm', 'pypi', 'cargo'];
export const arbEcosystem: fc.Arbitrary<Ecosystem> = fc.constantFrom(...ECOSYSTEMS);
export const arbScope: fc.Arbitrary<Scope> = fc.constantFrom<Scope>('runtime', 'dev', 'optional', 'peer', 'build');

const FORMATS: Readonly<Record<Ecosystem, readonly ManifestFormat[]>> = {
  npm: ['package.json'],
  pypi: ['requirements.txt', 'pyproject.toml'],
  cargo: ['Cargo.toml'],
};

/** Hint texts and source URLs of hostile kinds: URLs, Markdown, HTML, javascript: strings. */
export const HOSTILE_TEXTS: readonly string[] = [
  'Use https://evil.example/x instead',
  '[click](https://evil.example)',
  '<a href="https://evil.example">x</a>',
  'javascript:alert(1)',
  'Please use `rm -rf /` now',
  'moved to got',
];
export const HOSTILE_URLS: readonly (string | null)[] = [
  null,
  'javascript:alert(1)',
  'http://osv.dev/vulnerability/GHSA-x',
  'https://osv.dev/vulnerability/GHSA-aaaa-bbbb-cccc',
  'https://evil.example/',
];

export const arbHint: fc.Arbitrary<ParsedHint> = fc
  .record({
    kind: fc.constantFrom<ParsedHint['kind']>('deprecation-notice', 'advisory-notice'),
    text: fc.oneof(fc.constantFrom(...HOSTILE_TEXTS), fc.string({ minLength: 1, maxLength: 40 })),
    sourceUrl: fc.constantFrom(...HOSTILE_URLS),
  })
  .map((h) => ({ ...h, link: null }));

export const arbOrigin = (ecosystem: Ecosystem): fc.Arbitrary<ManifestOrigin> =>
  fc.record({
    format: fc.constantFrom(...FORMATS[ecosystem]),
    dir: fc.constantFrom('', 'a/', 'b/c/'),
    pyprojectTool: fc.constantFrom<ManifestOrigin['pyprojectTool']>(null, 'poetry', 'pep621', 'mixed'),
  }).map(({ format, dir, pyprojectTool }) => ({
    path: `${dir}${format}`,
    format,
    pyprojectTool: format === 'pyproject.toml' ? pyprojectTool : null,
  }));

/** Plot cases that can come out of the builders, with the plot kind each gives. */
export const SLOT_CASES: readonly PlotCase[] = [
  'buried',
  'buried-deprecated',
  'forgotten',
  'unmaintained-advisory',
  'restless-archived',
  'restless-deprecated',
  'restless-both',
];
export const NO_SLOT_CASES: readonly PlotCase[] = [
  'alive',
  'dormant',
  'haunted',
  'haunted-no-severity',
  'ghost',
  'unknown-facts',
  'unassessed-git',
  'unassessed-path',
  'unassessed-no-data',
];
const KIND_OF: Readonly<Record<string, PlotKind>> = {
  alive: 'lantern',
  dormant: 'lantern',
  haunted: 'ghost',
  'haunted-no-severity': 'ghost',
  ghost: 'ghost',
  'restless-archived': 'restless',
  'restless-deprecated': 'restless',
  'restless-both': 'restless',
  buried: 'tombstone',
  'buried-deprecated': 'tombstone',
  forgotten: 'overgrown',
  'unmaintained-advisory': 'tombstone',
  'unknown-facts': 'lantern',
  'unassessed-git': 'unmarked',
  'unassessed-path': 'unmarked',
  'unassessed-no-data': 'unmarked',
};

export interface RowOptions {
  readonly name?: string;
  readonly ecosystem?: Ecosystem;
  readonly plotCase?: PlotCase;
  readonly hints?: readonly ParsedHint[];
  readonly origins?: readonly ManifestOrigin[];
  readonly scopes?: readonly Scope[];
  readonly openVulnerabilityCount?: number | null;
}

/** A package row built directly; the classification is real `classify` output (see the scan-result builder). */
export function makeRow(opts: RowOptions = {}): PackageRow {
  const ecosystem = opts.ecosystem ?? 'npm';
  const name = opts.name ?? 'request';
  const plotCase = opts.plotCase ?? 'buried';
  const classification: Classification | null = classificationFor(plotCase);
  const origins = opts.origins ?? [
    {
      path: FORMATS[ecosystem][0]!,
      format: FORMATS[ecosystem][0]!,
      pyprojectTool: null,
    },
  ];
  return {
    key: `${ecosystem}:${name}` as PackageRow['key'],
    name,
    displayName: name,
    ecosystem,
    sourceKind: classification === null ? 'git' : 'registry',
    scopes: opts.scopes ?? ['runtime'],
    manifestPaths: origins.map((o) => o.path),
    versionSpecs: ['^1.0.0'],
    kind: KIND_OF[plotCase] ?? 'lantern',
    graveType: null,
    statusWord: 'DEAD' as PackageRow['statusWord'],
    score: null,
    classification,
    strongestReason: null,
    epitaphShort: '',
    epitaph: name,
    unassessedCause: null,
    glow: null,
    facts: {
      daysSinceLastRelease: null,
      daysSinceLastCommit: null,
      archived: null,
      deprecated: null,
      openVulnerabilityCount: opts.openVulnerabilityCount === undefined ? 2 : opts.openVulnerabilityCount,
      maxSeverity: null,
      maintainerCount: null,
    },
    lookupVersion: null,
    versionBasis: null,
    advisories: [],
    hints: opts.hints ?? [],
    manifestOrigins: origins,
    accessibleLabel: name,
  } as PackageRow;
}

export const arbSlotRow: fc.Arbitrary<PackageRow> = arbEcosystem.chain((ecosystem) =>
  fc.record({
    plotCase: fc.constantFrom(...SLOT_CASES),
    name: fc.constantFrom('request', 'got', 'bincode', 'a-b', 'x'),
    hints: fc.array(arbHint, { maxLength: 3 }),
    origins: fc.array(arbOrigin(ecosystem), { minLength: 1, maxLength: 3 }),
    scopes: fc.array(arbScope, { minLength: 1, maxLength: 2 }),
    openVulnerabilityCount: fc.option(fc.integer({ min: -2, max: 50 }), { nil: null }),
  }).map((o) => makeRow({ ...o, ecosystem })),
);

export const arbAnyRow: fc.Arbitrary<PackageRow> = arbEcosystem.chain((ecosystem) =>
  fc.record({
    plotCase: fc.constantFrom(...SLOT_CASES, ...NO_SLOT_CASES),
    name: fc.constantFrom('request', 'got', 'bincode', 'a-b', 'x'),
    hints: fc.array(arbHint, { maxLength: 3 }),
  }).map((o) => makeRow({ ...o, ecosystem })),
);

/** Curated entries with valid names, self references and spelling variants of the row name. */
export function arbCuratedEntry(ecosystem: Ecosystem, from: string): fc.Arbitrary<CuratedEntry> {
  return fc
    .record({
      to: fc.uniqueArray(fc.constantFrom(from, from.toUpperCase(), 'got', 'axios', 'node-fetch', 'wincode'), {
        minLength: 1,
        maxLength: 4,
      }),
    })
    .map(({ to }) => ({
      ecosystem,
      from,
      to,
      why: 'The maintainers point to alternatives.',
      source: 'https://example.com/source',
    }));
}
