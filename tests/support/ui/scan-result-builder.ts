// Typed builders for Synthetic_Fixtures (graveyard-ui R19.2, R19.5, DG-17). Every result is built through the real core
// `classify` and `summarize`, so summaries cannot drift from core. Restless ghosts cannot come out of `classify`
// (archived or deprecated makes a package DEAD), so they are derived from a real HAUNTED classification.
import type {
  AssessedDependency,
  Classification,
  Dependency,
  Ecosystem,
  RawHealthFacts,
  Reason,
  RuleId,
  Scope,
  Severity,
  SourceKind,
} from '../../../core';
import { classify, summarize } from '../../../core';
import type { AdvisoryEntry, ManifestCandidate } from '../../../pipeline/mapping';
import type { NoteCode, ScanDependency, ScanNote, ScanResult, SourceStatus } from '../../../pipeline/scan/types';
import type { SourceName } from '../../../pipeline/ports';

export type PlotCase =
  | 'alive'
  | 'dormant'
  | 'haunted'
  | 'haunted-no-severity'
  | 'ghost'
  | 'restless-archived'
  | 'restless-deprecated'
  | 'restless-both'
  | 'buried'
  | 'buried-deprecated'
  | 'forgotten'
  | 'unmaintained-advisory'
  | 'unknown-facts'
  | 'unassessed-git'
  | 'unassessed-path'
  | 'unassessed-no-data';

export const PLOT_CASES: readonly PlotCase[] = [
  'alive',
  'dormant',
  'haunted',
  'haunted-no-severity',
  'ghost',
  'restless-archived',
  'restless-deprecated',
  'restless-both',
  'buried',
  'buried-deprecated',
  'forgotten',
  'unmaintained-advisory',
  'unknown-facts',
  'unassessed-git',
  'unassessed-path',
  'unassessed-no-data',
];

export const ALL_NOTE_CODES: readonly NoteCode[] = [
  'tree-truncated',
  'no-manifests',
  'no-root-manifest',
  'manifest-too-large',
  'manifest-fetch-failed',
  'pin-not-found',
  'no-default-version',
  'conflicting-pins',
  'package-not-found',
  'batch-fallback',
  'source-repo-unverified',
  'informational-advisory-excluded',
  'advisory-details-incomplete',
  'osv-pagination-ignored',
  'github-token-missing',
  'github-budget-low',
  'maintainers-lower-bound',
  'dependency-cap-exceeded',
  'scan-deadline-reached',
  'source-partial',
  'source-failed',
  'unmaintained-advisory',
  'range-unresolved',
];

export const ALL_SOURCES: readonly SourceName[] = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];

export type VersionBasis = ScanDependency['versionBasis'];

export interface RowSpec {
  readonly name: string;
  readonly rawName?: string;
  readonly ecosystem?: Ecosystem;
  readonly scope?: Scope;
  readonly manifestPath?: string;
  readonly kind: PlotCase;
  readonly versionBasis?: VersionBasis;
  readonly advisories?: readonly AdvisoryEntry[];
  readonly severity?: Severity;
}

const HEALTHY: RawHealthFacts = {
  daysSinceLastRelease: 10,
  daysSinceLastCommit: 5,
  archived: false,
  deprecated: false,
  openVulnerabilityCount: 0,
  maxSeverity: null,
  maintainerCount: 3,
};

const NULL_FACTS: RawHealthFacts = {
  daysSinceLastRelease: null,
  daysSinceLastCommit: null,
  archived: null,
  deprecated: null,
  openVulnerabilityCount: null,
  maxSeverity: null,
  maintainerCount: null,
};

const hauntedFacts = (severity: Severity | null): RawHealthFacts => ({
  ...HEALTHY,
  openVulnerabilityCount: 2,
  maxSeverity: severity,
});

/** Inserts reasons into a Classification, keeping ascending ruleId order. */
function withReasons(c: Classification, ids: readonly RuleId[]): Classification {
  const extra: Reason[] = ids.map((ruleId) => ({ ruleId, message: `Synthetic reason ${ruleId}.`, facts: [] }));
  const reasons = [...c.reasons, ...extra].sort((a, b) => {
    const [ar = 0, ac = 0] = a.ruleId.split('.').map(Number);
    const [br = 0, bc = 0] = b.ruleId.split('.').map(Number);
    return ar - br || ac - bc;
  });
  return { ...c, reasons };
}

/** Facts for a case; null for the unassessed cases. */
export function factsFor(kind: PlotCase, severity: Severity = 'HIGH'): RawHealthFacts {
  switch (kind) {
    case 'alive':
      return HEALTHY;
    case 'dormant':
      return { ...HEALTHY, daysSinceLastRelease: 500 };
    case 'haunted':
      return hauntedFacts(severity);
    case 'haunted-no-severity':
    case 'ghost':
    case 'restless-archived':
    case 'restless-deprecated':
    case 'restless-both':
      return hauntedFacts(null);
    case 'buried':
      return { ...HEALTHY, archived: true };
    case 'buried-deprecated':
    case 'unmaintained-advisory':
      return { ...HEALTHY, deprecated: true };
    case 'forgotten':
      return { ...HEALTHY, daysSinceLastRelease: 2000, daysSinceLastCommit: 2000 };
    case 'unknown-facts':
      return NULL_FACTS;
    default:
      return NULL_FACTS;
  }
}

/** The Classification of a case: real `classify` output, with injected 8.x reasons for the ghost cases. */
export function classificationFor(kind: PlotCase, severity: Severity = 'HIGH'): Classification | null {
  if (kind === 'unassessed-git' || kind === 'unassessed-path' || kind === 'unassessed-no-data') return null;
  const base = classify(factsFor(kind, severity));
  switch (kind) {
    case 'ghost':
      return withReasons(base, ['8.3']);
    case 'restless-archived':
      return withReasons(base, ['8.1']);
    case 'restless-deprecated':
      return withReasons(base, ['8.2']);
    case 'restless-both':
      return withReasons(base, ['8.1', '8.2']);
    default:
      return base;
  }
}

const sourceKindOf = (kind: PlotCase): SourceKind =>
  kind === 'unassessed-git' ? 'git' : kind === 'unassessed-path' ? 'path' : 'registry';

export const makeAdvisory = (
  id: string,
  excluded: AdvisoryEntry['excluded'],
  over: Partial<AdvisoryEntry> = {},
): AdvisoryEntry => ({
  id,
  aliases: [],
  severity: 'HIGH',
  url: `https://osv.dev/vulnerability/${id}`,
  excluded,
  ...over,
});

/** An advisory as an older pipeline emitted it: no `excluded` key (R19.2). Not a current `AdvisoryEntry`. */
export const legacyAdvisory = (id: string): AdvisoryEntry => {
  const { excluded: _omit, ...rest } = makeAdvisory(id, null);
  void _omit;
  return rest as unknown as AdvisoryEntry;
};

/** One advisory for each `excluded` value. */
export const advisoriesOfEveryExclusion = (): AdvisoryEntry[] => [
  makeAdvisory('GHSA-aaaa-aaaa-aaaa', null, { aliases: ['CVE-2024-0001'] }),
  makeAdvisory('GHSA-bbbb-bbbb-bbbb', 'informational', { severity: null }),
  makeAdvisory('GHSA-cccc-cccc-cccc', 'withdrawn', { severity: 'LOW' }),
];

export function dependencyFor(spec: RowSpec): AssessedDependency {
  const ecosystem = spec.ecosystem ?? 'npm';
  const dependency: Dependency = {
    name: spec.name.toLowerCase(),
    rawName: spec.rawName ?? spec.name.toLowerCase(),
    ecosystem,
    versionSpec: '^1.0.0',
    scope: spec.scope ?? 'runtime',
    sourceKind: sourceKindOf(spec.kind),
  };
  return { dependency, classification: classificationFor(spec.kind, spec.severity) };
}

export function scanDependencyFor(spec: RowSpec, assessed: AssessedDependency, manifestPath: string): ScanDependency {
  const registry = assessed.dependency.sourceKind === 'registry';
  const basis: VersionBasis = registry ? (spec.versionBasis === undefined ? 'resolved' : spec.versionBasis) : null;
  const advisories =
    spec.advisories ?? (spec.kind === 'haunted' || spec.kind === 'haunted-no-severity' ? [makeAdvisory(`GHSA-${spec.name}`, null, { severity: spec.severity ?? null })] : []);
  return {
    dependency: assessed.dependency,
    manifestPath: spec.manifestPath ?? manifestPath,
    lookupVersion: basis === null ? null : '1.0.0',
    versionBasis: basis,
    facts: factsFor(spec.kind, spec.severity),
    advisories: registry ? advisories : [],
  };
}

const candidate = (path: string): ManifestCandidate => ({
  path,
  format: path.endsWith('Cargo.toml') ? 'Cargo.toml' : path.endsWith('.txt') ? 'requirements.txt' : 'package.json',
  depth: path.split('/').length - 1,
  sizeBytes: 100,
});

export interface ResultOptions {
  readonly manifestPaths?: readonly string[];
  readonly sources?: Partial<Record<SourceName, SourceStatus>>;
  readonly notes?: readonly ScanNote[];
  readonly skipped?: ScanResult['capped']['skipped'];
  readonly cappedTotal?: number;
  readonly discovery?: Partial<ScanResult['discovery']>;
  readonly asOf?: string;
}

export const noteOf = (code: NoteCode, details?: { readonly [key: string]: string | number }): ScanNote => ({
  code,
  message: `Synthetic note ${code}.`,
  ...(details === undefined ? {} : { details }),
});

/** Builds a valid Scan_Result from row specs. */
export function buildScanResult(rows: readonly RowSpec[], options: ResultOptions = {}): ScanResult {
  const manifestPaths = options.manifestPaths ?? ['package.json'];
  const assessed = rows.map(dependencyFor);
  const dependencies = rows.map((spec, i) =>
    scanDependencyFor(spec, assessed[i], manifestPaths[i % Math.max(manifestPaths.length, 1)] ?? 'package.json'),
  );
  const sources = Object.fromEntries(
    ALL_SOURCES.map((s) => [s, options.sources?.[s] ?? 'ok']),
  ) as Record<SourceName, SourceStatus>;
  return {
    ok: true,
    asOf: options.asOf ?? '2026-01-01T00:00:00Z',
    repo: {
      host: 'github.com',
      owner: 'synthetic',
      repo: 'graveyard',
      branch: 'main',
      defaultBranch: 'main',
      commitSha: 'a'.repeat(40),
    },
    discovery: {
      candidates: manifestPaths.map(candidate),
      truncatedTree: false,
      depthLimited: false,
      countLimited: false,
      ...options.discovery,
    },
    manifests: manifestPaths.map((path) => ({ path, format: candidate(path).format, warnings: [] })),
    dependencies,
    assessed,
    summary: summarize(assessed),
    sources,
    capped: {
      limit: 300,
      total: options.cappedTotal ?? rows.length,
      skipped: options.skipped ?? [],
    },
    notes: options.notes ?? [],
  };
}

/** `count` registry packages `pkg-0000`..; kinds cycle through `kinds`. */
export function manyRows(count: number, kinds: readonly PlotCase[] = ['alive', 'haunted', 'buried']): RowSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `pkg-${String(i).padStart(4, '0')}`,
    kind: kinds[i % kinds.length],
  }));
}

// ---------------------------------------------------------------------------
// Named states of DG-17
// ---------------------------------------------------------------------------

/** One row of every plot case, each with its own name. */
export const everyPlotKindResult = (): ScanResult =>
  buildScanResult(PLOT_CASES.map((kind, i) => ({ name: `p-${kind}-${i}`, kind })));

export const unassessedOfEachCauseResult = (): ScanResult =>
  buildScanResult([
    { name: 'git-pkg', kind: 'unassessed-git' },
    { name: 'path-pkg', kind: 'unassessed-path' },
    { name: 'nodata-pkg', kind: 'unassessed-no-data' },
    { name: 'alive-pkg', kind: 'alive' },
  ]);

export const cappedSkippedResult = (): ScanResult =>
  buildScanResult(manyRows(3), {
    skipped: [
      { ecosystem: 'npm', name: 'skipped-a' },
      { ecosystem: 'pypi', name: 'skipped-b' },
    ],
    cappedTotal: 5,
    notes: [noteOf('dependency-cap-exceeded', { limit: 3, total: 5 })],
  });

export const partialSourceResult = (): ScanResult =>
  buildScanResult(manyRows(3), {
    sources: { osv: 'partial' },
    notes: [noteOf('source-partial', { source: 'osv' })],
  });

export const failedSourceResult = (): ScanResult =>
  buildScanResult(manyRows(3), {
    sources: { github: 'failed', depsdev: 'partial' },
    notes: [noteOf('source-failed', { source: 'github' })],
  });

export const noManifestsResult = (): ScanResult =>
  buildScanResult([], {
    manifestPaths: [],
    notes: [noteOf('no-manifests')],
    discovery: { candidates: [] },
  });

export const noRootManifestResult = (): ScanResult =>
  buildScanResult(manyRows(2), {
    manifestPaths: ['packages/a/package.json'],
    notes: [noteOf('no-root-manifest')],
  });

export const rangeUnresolvedResult = (): ScanResult =>
  buildScanResult([{ name: 'ranged', kind: 'alive', versionBasis: null }], {
    notes: [noteOf('range-unresolved', { name: 'ranged' })],
  });

export const hauntedWithoutSeverityResult = (): ScanResult =>
  buildScanResult([{ name: 'quiet-haunt', kind: 'haunted-no-severity', advisories: [makeAdvisory('GHSA-none', null, { severity: null })] }]);

export const restlessGhostResult = (): ScanResult =>
  buildScanResult([
    { name: 'restless-a', kind: 'restless-archived' },
    { name: 'restless-d', kind: 'restless-deprecated' },
    { name: 'restless-b', kind: 'restless-both' },
  ]);

export const buriedResult = (): ScanResult => buildScanResult([{ name: 'buried-one', kind: 'buried' }]);

export const forgottenResult = (): ScanResult => buildScanResult([{ name: 'forgotten-one', kind: 'forgotten' }]);

export const advisoryExclusionsResult = (): ScanResult =>
  buildScanResult([
    { name: 'with-advisories', kind: 'haunted', advisories: [...advisoriesOfEveryExclusion(), legacyAdvisory('GHSA-legacy')] },
  ]);

export const versionBasisResult = (): ScanResult =>
  buildScanResult([
    { name: 'basis-pinned', kind: 'alive', versionBasis: 'pinned' },
    { name: 'basis-resolved', kind: 'alive', versionBasis: 'resolved' },
    { name: 'basis-default', kind: 'alive', versionBasis: 'default' },
    { name: 'basis-null', kind: 'alive', versionBasis: null },
  ]);

export const allNotesResult = (): ScanResult =>
  buildScanResult(manyRows(2), { notes: ALL_NOTE_CODES.map((code) => noteOf(code)) });

/** 300 unique packages (the `SCENE_MAX_PLOTS` boundary). */
export const result300 = (): ScanResult => buildScanResult(manyRows(300));

/** 301 unique packages, one above the boundary. */
export const result301 = (): ScanResult => buildScanResult(manyRows(301));
