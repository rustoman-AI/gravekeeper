// Requirement 18.1, 17.9, 21.5, 21.6
import type {
  AssessedDependency,
  Dependency,
  Ecosystem,
  ManifestFormat,
  RawHealthFacts,
  RepoSummary,
} from '@/core';
import type { AdvisoryEntry, DiscoveryResult, IsoInstant } from '../mapping';
import type { UpstreamHint } from '../mapping/types';
import type {
  Clock,
  GithubConfig,
  Logger,
  RandomSource,
  ReasonCategory,
  SourceName,
  Timer,
} from '../ports';
import type { JsonValue } from '../ports/cache';
import type { CratesIoSource } from '../ports/cratesio-source';
import type { DepsDevSource } from '../ports/depsdev-source';
import type { GithubSource } from '../ports/github-source';
import type { NpmSource } from '../ports/npm-source';
import type { OsvSource } from '../ports/osv-source';
import type { PypiSource } from '../ports/pypi-source';

/** Scan_Note codes. There is no `manifest-selection-capped` code. */
export type NoteCode =
  | 'tree-truncated'
  | 'no-manifests'
  | 'no-root-manifest'
  | 'manifest-too-large'
  | 'manifest-fetch-failed'
  | 'pin-not-found'
  | 'no-default-version'
  | 'conflicting-pins'
  | 'package-not-found'
  | 'batch-fallback'
  | 'source-repo-unverified'
  | 'informational-advisory-excluded'
  | 'advisory-details-incomplete'
  | 'osv-pagination-ignored'
  | 'github-token-missing'
  | 'github-budget-low'
  | 'maintainers-lower-bound'
  | 'dependency-cap-exceeded'
  | 'scan-deadline-reached'
  | 'source-partial'
  | 'source-failed'
  | 'unmaintained-advisory'
  | 'range-unresolved';

export interface ScanNote {
  readonly code: NoteCode;
  /** Fixed template, no raw upstream text (R20.5). */
  readonly message: string;
  /** Keys exactly as in the Scan_Note codes table. */
  readonly details?: { readonly [key: string]: JsonValue };
}

export type SourceStatus = 'ok' | 'partial' | 'failed';

export interface ScanDependency {
  readonly dependency: Dependency;
  readonly manifestPath: string;
  readonly lookupVersion: string | null;
  readonly versionBasis: 'pinned' | 'resolved' | 'default' | null;
  /** Exactly seven keys, null when unknown. */
  readonly facts: RawHealthFacts;
  /** Open advisories of the Lookup_Target; equal for every Dependency of it, `[]` when not looked up. */
  readonly advisories: readonly AdvisoryEntry[];
  /**
   * Upstream hints of the Lookup_Target (resurrect spec R4.2, R4.3); equal for every Dependency of it,
   * `[]` when not looked up. Optional so that results and fixtures built before this spec stay valid;
   * the pipeline always sets it.
   */
  readonly hints?: readonly UpstreamHint[];
  /**
   * resurrect-upgrade R4.7, R5.1: registry-default upgrade of the Lookup_Target; equal for every
   * Dependency of it, absent when there is none. Optional so that results built before this spec stay valid.
   */
  readonly upgrade?: { readonly version: string; readonly basis: 'registry-default' };
}

export interface ScanManifestEntry {
  readonly path: string;
  readonly format: ManifestFormat;
  readonly warnings: readonly string[];
  /** resurrect R5.4: Poetry or PEP 621 layout of a pyproject.toml; absent for other manifests. */
  readonly pyprojectTool?: 'poetry' | 'pep621' | 'mixed';
}

export interface ScanRepo {
  readonly host: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly defaultBranch: string;
  readonly commitSha: string;
}

export interface ScanCapped {
  readonly limit: number;
  readonly total: number;
  readonly skipped: readonly { readonly ecosystem: Ecosystem; readonly name: string }[];
}

export interface ScanResult {
  readonly ok: true;
  readonly asOf: IsoInstant;
  readonly repo: ScanRepo;
  readonly discovery: DiscoveryResult;
  readonly manifests: readonly ScanManifestEntry[];
  readonly dependencies: readonly ScanDependency[];
  readonly assessed: readonly AssessedDependency[];
  readonly summary: RepoSummary;
  readonly sources: { readonly [S in SourceName]: SourceStatus };
  readonly capped: ScanCapped;
  readonly notes: readonly ScanNote[];
}

export interface RepoRef {
  readonly host: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string | null;
}

export interface ScanLimits {
  readonly maxManifests: number;
  readonly maxDependencies: number;
  readonly maxAdvisoryDetails: number;
}

export interface ScanInput {
  readonly repo: RepoRef;
  /** `[]` when omitted. */
  readonly manifests: readonly string[];
  readonly asOf: IsoInstant;
  /** Scan_Start, the single clock reading. */
  readonly startedAtMs: number;
}

/**
 * Cache of complete Scan_Results. `get` validates on read and returns null on a
 * miss or an invalid entry. `set` writes to L1 at once and defers the L2 write.
 * Neither throws.
 */
export interface TypedCache<T> {
  get(key: string, signal?: AbortSignal): Promise<T | null>;
  set(key: string, value: T, ttlSeconds: number): Promise<void>;
}

export type UnitOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ReasonCategory };

export interface LedgerEntry {
  readonly source: SourceName;
  readonly unitKey: string;
  readonly outcome: UnitOutcome;
}

export interface ScanProgress {
  readonly ledger: readonly LedgerEntry[];
  readonly discovery: {
    readonly commitSha: string;
    readonly selection: readonly string[];
  } | null;
  readonly closed: boolean;
}

export interface ScanDeps {
  readonly sources: {
    readonly github: GithubSource;
    readonly depsdev: DepsDevSource;
    readonly osv: OsvSource;
    readonly npm: NpmSource;
    readonly cratesio: CratesIoSource;
    readonly pypi: PypiSource;
  };
  readonly clock: Clock;
  readonly timer: Timer;
  /** Not read by the orchestrator itself; sources receive it through the HttpClient. */
  readonly random: RandomSource;
  readonly logger: Logger;
  readonly scanCache: TypedCache<ScanResult>;
  readonly config: GithubConfig;
  readonly limits: ScanLimits;
  readonly progress?: ScanProgress;
  /** Default SCAN_DEADLINE_MS. Set only by the recorder and by tests. */
  readonly deadlineMs?: number;
}

export interface LookupTarget {
  readonly ecosystem: Ecosystem;
  readonly name: string;
  /** Every versionSpec of this target across manifests and scopes. */
  readonly versionSpecs: readonly string[];
}

/** Scan_Error: the error half of `runScan` (R21.5, R21.6). `details` is omitted when the code defines none. */
export type ScanErrorBody =
  | {
      readonly code: 'invalid-request';
      readonly message: string;
      readonly details: {
        readonly reason:
          | 'invalid-json'
          | 'invalid-type'
          | 'unknown-field'
          | 'missing-field'
          | 'too-many-items'
          | 'branch-conflict'
          | 'body-too-large'
          | 'unsupported-media-type'
          | 'method-not-allowed';
        readonly field?: 'body' | 'repoUrl' | 'branch' | 'manifests';
      };
    }
  | {
      readonly code: 'invalid-url';
      readonly message: string;
      readonly details: {
        readonly part: 'url' | 'host' | 'path' | 'owner' | 'repository' | 'branch';
      };
    }
  | {
      readonly code: 'too-many-manifests';
      readonly message: string;
      readonly details: { readonly limit: number; readonly candidates: readonly string[] };
    }
  | {
      readonly code: 'manifest-not-found';
      readonly message: string;
      readonly details: { readonly path: string; readonly candidates: readonly string[] };
    }
  | { readonly code: 'repo-not-found'; readonly message: string }
  | {
      readonly code: 'branch-not-found';
      readonly message: string;
      readonly details: { readonly branch: string };
    }
  | {
      readonly code: 'upstream-unavailable';
      readonly message: string;
      readonly details: { readonly source: SourceName; readonly resetAt?: IsoInstant };
    }
  | { readonly code: 'deadline-exceeded'; readonly message: string }
  | { readonly code: 'internal-error'; readonly message: string };

export type ScanError = ScanErrorBody;

/** Scan_Outcome: the success value of `runScan`. `fromCache` is true only for a Scan_Cache hit (scan-accuracy R7.1). */
export interface ScanOutcome {
  readonly result: ScanResult;
  readonly fromCache: boolean;
}
