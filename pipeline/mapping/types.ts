import type { Ecosystem, ManifestFormat, RawHealthFacts, Severity } from '@/core';

// Requirement 13.1, 13.4, 13.14

/** `YYYY-MM-DDTHH:mm:ss(.fff)?Z` */
export type IsoInstant = string;

/** A repository on the configured Web_Host: `<webHost>/<owner>/<name>`. */
export interface SourceRepo {
  readonly owner: string;
  readonly name: string;
}

export type Fetched<T> =
  | { readonly state: 'ok'; readonly body: T }
  | { readonly state: 'absent' } // HTTP 404 meaning "absent"
  | { readonly state: 'unavailable' }; // failed, cancelled, not sent, unparsable

export type VersionBasis = 'pinned' | 'resolved' | 'default';

export interface VersionSelection {
  readonly selected: string | null;
  readonly basis: VersionBasis | null;
  readonly notes: readonly (
    | { readonly code: 'pin-not-found'; readonly pinned: string }
    | { readonly code: 'no-default-version' }
    | { readonly code: 'conflicting-pins'; readonly pins: readonly string[] }
    | { readonly code: 'range-unresolved'; readonly ranges: readonly string[] }
  )[];
}

export type BatchEntry =
  | { readonly found: false }
  | { readonly found: true; readonly sourceRepo: SourceRepo | null };

export type OsvQueryResult =
  | { readonly kind: 'invalid' }
  | {
      readonly kind: 'ids';
      readonly ids: readonly string[];
      /** `next_page_token` present (EF-11). */
      readonly truncated: boolean;
    };

export type OsvBatchMapping =
  | { readonly kind: 'length-mismatch' }
  | { readonly kind: 'ok'; readonly results: readonly OsvQueryResult[] };

export interface AdvisoryRecord {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly withdrawn: boolean;
  /** Any `affected[]` entry with a string `informational` value. */
  readonly informational: boolean;
  /** Any `affected[]` entry with `informational === 'unmaintained'`. */
  readonly unmaintained: boolean;
  /** `severityOf(advisoryScore, body)`. */
  readonly severity: Severity | null;
  /** Own string `details` of the body, unnormalized; null when absent or not a string (resurrect R3.2). */
  readonly details: string | null;
  /** Own string `summary` of the body, unnormalized; null when absent or not a string (resurrect R3.2). */
  readonly summary: string | null;
}

/** An upstream notice about a package (resurrect spec). */
export interface UpstreamHint {
  readonly kind: 'deprecation-notice' | 'advisory-notice';
  readonly text: string;
  readonly sourceUrl: string | null;
}

export interface VulnerabilityFacts {
  /** Alias_Groups of Counted_Advisories plus unfetched ids. */
  readonly openVulnerabilityCount: number;
  readonly maxSeverity: Severity | null;
  /** Non-withdrawn informational advisory ids, ascending. */
  readonly informationalIds: readonly string[];
  /** Non-withdrawn advisory ids with `informational === 'unmaintained'`, ascending. */
  readonly unmaintainedIds: readonly string[];
}

/** `alias` is `'r' + index`. */
export interface GraphqlAlias {
  readonly alias: string;
  readonly repo: SourceRepo;
}

export interface GraphqlBatch {
  readonly aliases: readonly GraphqlAlias[];
}

export type GraphqlRepoResult =
  | {
      readonly alias: string;
      readonly kind: 'ok';
      readonly archived: boolean | null;
      readonly daysSinceLastCommit: number | null;
    }
  | { readonly alias: string; readonly kind: 'not-found' } // EF-19: ok, facts null
  | { readonly alias: string; readonly kind: 'failed' }; // foreign error type or unusable response

/** What `assembleFacts` receives for one Lookup_Target. Every body is raw. */
export interface RawTargetInputs {
  readonly ecosystem: Ecosystem;
  readonly name: string;
  readonly versionSpecs: readonly string[];
  /** EF-1 */
  readonly depsdevPackage: Fetched<unknown>;
  /** EF-20 (npm only; unavailable otherwise) */
  readonly npmLatest: Fetched<unknown>;
  /** EF-20, EF-21 or EF-22 body by ecosystem */
  readonly maintainers: Fetched<unknown>;
  readonly osv: {
    readonly queryResult: OsvQueryResult | 'unavailable';
    readonly advisories: ReadonlyMap<
      string,
      { readonly osv: Fetched<unknown>; readonly depsdev: Fetched<unknown> }
    >;
    readonly unfetchedIds: readonly string[];
  };
  readonly repository: Fetched<GraphqlRepoResult> | 'no-source-repo';
  readonly webHost: string;
}

/**
 * Note codes `assembleFacts` can produce (package-not-found,
 * informational-advisory-excluded, unmaintained-advisory,
 * advisory-details-incomplete, osv-pagination-ignored,
 * maintainers-lower-bound and the selection notes). `details` values are
 * JSON-compatible.
 */
export interface TargetNote {
  readonly code:
    | 'package-not-found'
    | 'informational-advisory-excluded'
    | 'unmaintained-advisory'
    | 'advisory-details-incomplete'
    | 'osv-pagination-ignored'
    | 'maintainers-lower-bound'
    | 'pin-not-found'
    | 'no-default-version'
    | 'conflicting-pins';
  readonly details: { readonly [key: string]: unknown };
}

export interface AdvisoryEntry {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly severity: Severity | null;
  readonly url: string;
  /** Why the advisory is not counted as a vulnerability (Requirement 22). */
  readonly excluded: 'withdrawn' | 'informational' | null;
}

export interface AssembledFacts {
  /** Exactly the seven keys (R13.4). */
  readonly facts: RawHealthFacts;
  /** One entry per distinct OSV id (scan-accuracy R6). */
  readonly advisories: readonly AdvisoryEntry[];
  readonly selection: VersionSelection;
  readonly notes: readonly TargetNote[];
  /** Upstream hints for the target (resurrect R3.2). */
  readonly hints: readonly UpstreamHint[];
}

export interface ManifestCandidate {
  readonly path: string;
  readonly format: ManifestFormat;
  readonly depth: number;
  readonly sizeBytes: number | null;
}

export interface DiscoveryResult {
  readonly candidates: readonly ManifestCandidate[];
  readonly truncatedTree: boolean;
  readonly depthLimited: boolean;
  readonly countLimited: boolean;
}

export interface DiscoveryLimits {
  readonly maxDepth: number;
  readonly maxManifests: number;
  readonly manifestNames: readonly string[];
  readonly skipDirs: readonly string[];
}

export interface SelectionLimits {
  readonly maxManifests: number;
  readonly manifestNames: readonly string[];
}

export interface SelectionResult {
  /** Selected manifest paths, de-duplicated on exact strings. */
  readonly selected: readonly string[];
  /** Default selection with candidates but no Root_Manifest (R5.2). */
  readonly noRootManifest: boolean;
}

export type SelectionError =
  | {
      readonly code: 'too-many-manifests';
      readonly details: { readonly limit: number; readonly candidates: readonly string[] };
    }
  | {
      readonly code: 'manifest-not-found';
      readonly details: { readonly path: string; readonly candidates: readonly string[] };
    };
