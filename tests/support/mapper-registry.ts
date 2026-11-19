// Requirement 13.10, 13.15
// Registry of every runtime export of `pipeline/mapping/index.ts` for the
// registry-driven property tests (Property 16, Property 17) and for the
// completeness check that fails when an exported Mapper is not registered.
//
// Classification:
//  - 'mapper': takes a JSON value (a response body, a header record, or a JSON
//    scalar read from a body) and is total over every JSON value. Each mapper
//    has one or more variants (fixed extra arguments) that are called with a
//    generated JSON value and a generated `asOf`, and a validator of the
//    declared output type.
//  - 'helper': takes no JSON value (query builders, planners, orderings, pure
//    numeric functions, selectors over already mapped data). Each carries an
//    explicit reason; the completeness check still sees it.
//
// The mapping helpers `dayCount`, `parseIsoInstant`, `readOwn`,
// `compareCodePoints` and `Result` are deliberately not exported by the
// module, so they are not registered.
import * as mapping from '../../pipeline/mapping';

/** Fixed extra arguments of the variants. */
const WEB_HOST = 'github.com';
const DISCOVERY_LIMITS = {
  maxDepth: 4,
  maxManifests: 10,
  manifestNames: ['package.json', 'requirements.txt', 'Cargo.toml'],
  skipDirs: ['node_modules'],
} as const;
const DEPSDEV_REQUESTS = [
  { system: 'npm', name: 'a', version: '1.0.0' },
  { system: 'pypi', name: 'b', version: '2.0.0' },
  { system: 'cargo', name: 'c', version: '3.0.0' },
] as const;
const ECOSYSTEMS = ['npm', 'pypi', 'cargo'] as const;
const RANGE_VERSIONS = ['0.9.0', '1.0.0', '1.2.3', '2.0.0-rc.1', '2.1.0'] as const;
const GRAPHQL_BATCH = {
  aliases: [
    { alias: 'r0', repo: { owner: 'o0', name: 'n0' } },
    { alias: 'r1', repo: { owner: 'o1', name: 'n1' } },
  ],
} as const;

export interface MapperVariant {
  readonly label: string;
  /** Calls the mapper with a generated JSON value, a generated `asOf` and fixed extra arguments. */
  readonly call: (json: unknown, asOf: string) => unknown;
}

export interface MapperEntry {
  readonly kind: 'mapper';
  /** The export name in `pipeline/mapping/index.ts`. */
  readonly name: string;
  readonly variants: readonly MapperVariant[];
  /** True when `value` is of the declared output type (each field null or of the declared type). */
  readonly validate: (value: unknown) => boolean;
  /** Every Day_Count fact of a result; all must be null when `asOf` is not a valid instant. */
  readonly dayCountFacts?: (value: unknown) => readonly unknown[];
}

export interface HelperEntry {
  readonly kind: 'helper';
  readonly name: string;
  readonly reason: string;
}

export type RegistryEntry = MapperEntry | HelperEntry;

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------
type Check = (value: unknown) => boolean;

const SEVERITY_VALUES: readonly unknown[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const isString: Check = (v) => typeof v === 'string';
const isBoolean: Check = (v) => typeof v === 'boolean';
const isCount: Check = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isSeverity: Check = (v) => SEVERITY_VALUES.includes(v);
const nullOr =
  (check: Check): Check =>
  (v) =>
    v === null || check(v);
const arrayOf =
  (check: Check): Check =>
  (v) =>
    Array.isArray(v) && v.every(check);
const oneOf =
  (...checks: readonly Check[]): Check =>
  (v) =>
    checks.some((c) => c(v));
/** An object with exactly these own keys, each satisfying its check. */
const shape =
  (fields: Readonly<Record<string, Check>>): Check =>
  (v) => {
    if (!isRecord(v)) return false;
    const keys = Object.keys(v).sort();
    const expected = Object.keys(fields).sort();
    if (keys.length !== expected.length || keys.some((k, i) => k !== expected[i])) return false;
    return expected.every((k) => (fields[k] as Check)(v[k]));
  };
const literal =
  (...values: readonly unknown[]): Check =>
  (v) =>
    values.includes(v);
const resultOf =
  (okCheck: Check, errCheck: Check): Check =>
  (v) =>
    isRecord(v) &&
    ((Object.keys(v).length === 2 && v.ok === true && okCheck(v.value)) ||
      (Object.keys(v).length === 2 && v.ok === false && errCheck(v.error)));

const isSourceRepo = shape({ owner: isString, name: isString });
const isBatchEntry = oneOf(
  shape({ found: literal(false) }),
  shape({ found: literal(true), sourceRepo: nullOr(isSourceRepo) }),
);
const isOsvQueryResult = oneOf(
  shape({ kind: literal('invalid') }),
  shape({ kind: literal('ids'), ids: arrayOf(isString), truncated: isBoolean }),
);
const isRateLimitReading = shape({ remaining: nullOr(isCount), resetAt: nullOr(isString) });
const isAdvisoryRecord = shape({
  id: isString,
  aliases: arrayOf(isString),
  withdrawn: isBoolean,
  informational: isBoolean,
  unmaintained: isBoolean,
  severity: nullOr(isSeverity),
});
const isGraphqlRepoResult = oneOf(
  shape({
    alias: isString,
    kind: literal('ok'),
    archived: nullOr(isBoolean),
    daysSinceLastCommit: nullOr(isCount),
  }),
  shape({ alias: isString, kind: literal('not-found') }),
  shape({ alias: isString, kind: literal('failed') }),
);
const isManifestCandidate = shape({
  path: isString,
  format: literal('package.json', 'requirements.txt', 'Cargo.toml'),
  depth: isCount,
  sizeBytes: nullOr(isCount),
});
const isDiscoveryResult = shape({
  candidates: arrayOf(isManifestCandidate),
  truncatedTree: isBoolean,
  depthLimited: isBoolean,
  countLimited: isBoolean,
});
const isDepsDevPackageFacts = shape({
  daysSinceLastRelease: nullOr(isCount),
  deprecated: nullOr(isBoolean),
  defaultVersion: nullOr(isString),
  versions: arrayOf(isString),
});
const isVersionSelection = shape({
  selected: nullOr(isString),
  basis: nullOr(literal('pinned', 'resolved', 'default')),
  notes: arrayOf(
    oneOf(
      shape({ code: literal('pin-not-found'), pinned: isString }),
      shape({ code: literal('no-default-version') }),
      shape({ code: literal('conflicting-pins'), pins: arrayOf(isString) }),
      shape({ code: literal('range-unresolved'), ranges: arrayOf(isString) }),
    ),
  ),
});
const isHealthFacts = shape({
  daysSinceLastRelease: nullOr(isCount),
  daysSinceLastCommit: nullOr(isCount),
  archived: nullOr(isBoolean),
  deprecated: nullOr(isBoolean),
  openVulnerabilityCount: nullOr(isCount),
  maxSeverity: nullOr(isSeverity),
  maintainerCount: nullOr(isCount),
});
const isTargetNote: Check = (v) =>
  isRecord(v) &&
  Object.keys(v).length === 2 &&
  literal(
    'package-not-found',
    'informational-advisory-excluded',
    'unmaintained-advisory',
    'advisory-details-incomplete',
    'osv-pagination-ignored',
    'maintainers-lower-bound',
    'pin-not-found',
    'no-default-version',
    'conflicting-pins',
    'range-unresolved',
  )(v.code) &&
  isRecord(v.details);
const isAdvisoryEntry = shape({
  id: isString,
  aliases: arrayOf(isString),
  severity: nullOr(isSeverity),
  url: isString,
});
const isAssembledFacts = shape({
  facts: isHealthFacts,
  advisories: arrayOf(isAdvisoryEntry),
  selection: isVersionSelection,
  notes: arrayOf(isTargetNote),
});
const isRangeOutcome = oneOf(
  shape({ kind: literal('resolved'), version: isString }),
  shape({ kind: literal('unresolved') }),
);
const isRepositoryInfo = shape({
  owner: isString,
  repo: isString,
  defaultBranch: isString,
  private: isBoolean,
});

// ---------------------------------------------------------------------------
// Call helpers
// ---------------------------------------------------------------------------
/** The `results` length of an OSV batch body, or 1, so that some generated bodies match the query count. */
function resultsLength(json: unknown): number {
  if (isRecord(json) && Object.hasOwn(json, 'results')) {
    const results = json.results;
    if (Array.isArray(results)) return results.length;
  }
  return 1;
}

const ok = <T>(body: T): { readonly state: 'ok'; readonly body: T } => ({ state: 'ok', body });

/** `assembleFacts` input with every raw body replaced by the generated JSON value. */
function rawInputs(
  json: unknown,
  asOf: string,
  ecosystem: 'npm' | 'pypi' | 'cargo',
): Parameters<typeof mapping.assembleFacts>[0] {
  const repo = mapping.mapGraphqlRepos(json, GRAPHQL_BATCH, asOf)[0];
  const advisories = new Map([['GHSA-0', { osv: ok(json), depsdev: ok(json) }]]);
  return {
    ecosystem,
    name: 'pkg',
    versionSpecs: ['1.0.0'],
    depsdevPackage: ok(json),
    npmLatest: ok(json),
    maintainers: ok(json),
    osv: {
      queryResult: { kind: 'ids', ids: ['GHSA-0'], truncated: false },
      advisories,
      unfetchedIds: ['GHSA-1'],
    },
    repository: repo === undefined ? 'no-source-repo' : ok(repo),
    webHost: WEB_HOST,
  };
}

const single = (call: (json: unknown, asOf: string) => unknown): readonly MapperVariant[] => [
  { label: 'default', call },
];

const mapper = (
  name: string,
  call: (json: unknown, asOf: string) => unknown,
  validate: Check,
  dayCountFacts?: (value: unknown) => readonly unknown[],
): MapperEntry => ({
  kind: 'mapper',
  name,
  variants: single(call),
  validate,
  ...(dayCountFacts === undefined ? {} : { dayCountFacts }),
});

const helper = (name: string, reason: string): HelperEntry => ({ kind: 'helper', name, reason });

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const MAPPER_REGISTRY: readonly RegistryEntry[] = [
  // Mappers of a JSON response body.
  mapper(
    'mapDepsDevPackage',
    (json, asOf) =>
      mapping.mapDepsDevPackage(json, mapping.readDepsDevVersions(json).versions[0] ?? null, asOf),
    isDepsDevPackageFacts,
    (v) => [(v as { daysSinceLastRelease: unknown }).daysSinceLastRelease],
  ),
  mapper('mapDepsDevVersion', (json) => mapping.mapDepsDevVersion(json, WEB_HOST), nullOr(isSourceRepo)),
  mapper(
    'mapDepsDevVersionBatch',
    (json) => mapping.mapDepsDevVersionBatch(json, DEPSDEV_REQUESTS, WEB_HOST),
    nullOr(arrayOf(isBatchEntry)),
  ),
  mapper(
    'discoverManifests',
    (json) => mapping.discoverManifests(json, DISCOVERY_LIMITS),
    resultOf(isDiscoveryResult, literal('invalid-tree')),
  ),
  mapper(
    'mapGraphqlRepos',
    (json, asOf) => mapping.mapGraphqlRepos(json, GRAPHQL_BATCH, asOf),
    arrayOf(isGraphqlRepoResult),
    (v) =>
      (v as readonly { kind: string; daysSinceLastCommit?: unknown }[])
        .filter((r) => r.kind === 'ok')
        .map((r) => r.daysSinceLastCommit),
  ),
  mapper(
    'readRepository',
    (json) => mapping.readRepository(json),
    resultOf(isRepositoryInfo, literal('invalid')),
  ),
  mapper('readCommitSha', (json) => mapping.readCommitSha(json), nullOr(isString)),
  mapper(
    'mapNpmLatest',
    (json) => mapping.mapNpmLatest(json),
    shape({ maintainerCount: nullOr(isCount), deprecated: nullOr(isBoolean) }),
  ),
  mapper(
    'mapCratesOwners',
    (json) => mapping.mapCratesOwners(json),
    shape({ maintainerCount: nullOr(isCount), lowerBound: isBoolean }),
  ),
  mapper(
    'mapPypiOwnership',
    (json) => mapping.mapPypiOwnership(json),
    shape({ maintainerCount: nullOr(isCount) }),
  ),
  mapper('mapOsvAdvisory', (json) => mapping.mapOsvAdvisory(json, null), nullOr(isAdvisoryRecord)),
  mapper(
    'mapOsvQueryBatch',
    (json) => mapping.mapOsvQueryBatch(json, resultsLength(json)),
    oneOf(
      shape({ kind: literal('length-mismatch') }),
      shape({ kind: literal('ok'), results: arrayOf(isOsvQueryResult) }),
    ),
  ),
  mapper('readGraphqlRateLimit', (json) => mapping.readGraphqlRateLimit(json), isRateLimitReading),
  mapper(
    'readRestRateLimit',
    // A generated JSON value stands in for the header record; the mapper reads own keys only.
    (json) => mapping.readRestRateLimit(json as Readonly<Record<string, string>>),
    isRateLimitReading,
  ),
  mapper('mapDepsDevAdvisory', (json) => mapping.mapDepsDevAdvisory(json), nullOr(isCount)),
  mapper('severityOf', (json) => mapping.severityOf(null, json), nullOr(isSeverity)),
  mapper(
    'readDepsDevVersions',
    (json) => mapping.readDepsDevVersions(json),
    shape({ defaultVersion: nullOr(isString), versions: arrayOf(isString) }),
  ),
  // Mappers of a JSON scalar read from a body (vector string, version spec).
  mapper('cvssV3BaseScore', (json) => mapping.cvssV3BaseScore(json), nullOr(isNumber10)),
  mapper('cvssSeverity', (json) => mapping.cvssSeverity(json), nullOr(isSeverity)),
  {
    kind: 'mapper',
    name: 'exactPin',
    variants: ['npm', 'pypi', 'cargo'].map((ecosystem) => ({
      label: ecosystem,
      call: (json: unknown) => mapping.exactPin(json, ecosystem),
    })),
    validate: nullOr(isString),
  },
  helper('advisoryUrl', 'Builds a URL from an advisory id string; not a body mapper (scan-accuracy Property 10).'),
  helper(
    'buildAdvisoryEntries',
    'Builds Advisory_Entry values from OSV ids and mapped records, not from a body (scan-accuracy Property 10).',
  ),
  // Mappers of a JSON scalar or list read from a manifest (version spec, range).
  {
    kind: 'mapper',
    name: 'chooseVersion',
    variants: [
      // The JSON value as a version spec, per ecosystem.
      ...ECOSYSTEMS.map((ecosystem) => ({
        label: ecosystem,
        call: (json: unknown) => mapping.chooseVersion(ecosystem, [json], RANGE_VERSIONS, '1.2.3'),
      })),
      // The JSON value as the list of specs (an array is passed as is).
      ...ECOSYSTEMS.map((ecosystem) => ({
        label: `${ecosystem}-specs`,
        call: (json: unknown) =>
          mapping.chooseVersion(ecosystem, Array.isArray(json) ? json : [json, json], [], null),
      })),
      // The JSON value as the ecosystem, with a pin and a range.
      {
        label: 'ecosystem',
        call: (json: unknown) => mapping.chooseVersion(json, ['1.2.3', '^1.0.0'], RANGE_VERSIONS, null),
      },
    ],
    validate: isVersionSelection,
  },
  {
    kind: 'mapper',
    name: 'resolveRange',
    variants: [
      ...ECOSYSTEMS.map((ecosystem) => ({
        label: ecosystem,
        call: (json: unknown) =>
          mapping.resolveRange(ecosystem, [json as string], RANGE_VERSIONS),
      })),
      ...ECOSYSTEMS.map((ecosystem) => ({
        label: `${ecosystem}-ranges`,
        call: (json: unknown) =>
          mapping.resolveRange(
            ecosystem,
            (Array.isArray(json) ? json : [json]) as readonly string[],
            RANGE_VERSIONS,
          ),
      })),
      {
        label: 'ecosystem',
        call: (json: unknown) =>
          mapping.resolveRange(json as 'npm', ['^1.0.0'], RANGE_VERSIONS),
      },
      {
        label: 'versions',
        call: (json: unknown) =>
          mapping.resolveRange('npm', ['*'], (Array.isArray(json) ? json : [json]) as readonly string[]),
      },
    ],
    validate: isRangeOutcome,
  },
  mapper(
    'cargoToSemverRange',
    (json) => mapping.cargoToSemverRange(json as string),
    nullOr(isString),
  ),
  // Assembler of all mapped sources.
  {
    kind: 'mapper',
    name: 'assembleFacts',
    variants: (['npm', 'pypi', 'cargo'] as const).map((ecosystem) => ({
      label: ecosystem,
      call: (json: unknown, asOf: string) =>
        mapping.assembleFacts(rawInputs(json, asOf, ecosystem), asOf),
    })),
    validate: isAssembledFacts,
    dayCountFacts: (v) => {
      const facts = (v as { facts: { daysSinceLastRelease: unknown; daysSinceLastCommit: unknown } })
        .facts;
      return [facts.daysSinceLastRelease, facts.daysSinceLastCommit];
    },
  },
  // Helpers: no JSON value input.
  helper(
    'severityFromScore',
    'Takes a number, not a JSON value; covered by the CVSS range tests (Property 16 reaches it through cvssSeverity and severityOf).',
  ),
  helper('buildRepositoriesQuery', 'Query builder over typed aliases; no response body input.'),
  helper('planGraphqlBatches', 'Planner over typed SourceRepo values and a batch size.'),
  helper('orderCratesLookups', 'Ordering of typed lookup targets; no response body input.'),
  helper('aggregateAdvisories', 'Aggregates typed AdvisoryRecord values; no response body input.'),
  helper('planAdvisoryRequests', 'Planner over advisory id strings and a cap.'),
  helper('selectManifests', 'Selector over typed ManifestCandidate values and limits.'),
  helper('selectVersion', 'Selector over typed pin and version string lists.'),
];

function isNumber10(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10;
}

export const MAPPERS: readonly MapperEntry[] = MAPPER_REGISTRY.filter(
  (e): e is MapperEntry => e.kind === 'mapper',
);
export const HELPERS: readonly HelperEntry[] = MAPPER_REGISTRY.filter(
  (e): e is HelperEntry => e.kind === 'helper',
);

/** Names of every runtime export of `pipeline/mapping/index.ts`. */
export const MAPPING_EXPORT_NAMES: readonly string[] = Object.keys(mapping).sort();
/** Names of every registry entry, in registry order. */
export const REGISTERED_NAMES: readonly string[] = MAPPER_REGISTRY.map((e) => e.name);
