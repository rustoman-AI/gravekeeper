import type {
  Classification,
  Ecosystem,
  Grade,
  HealthFactField,
  Reason,
  Scope,
  Severity,
  SourceKind,
} from '../core';
import type { ScanErrorBody, ScanResult } from '../pipeline';

// ---- identity and vocabulary ----------------------------------------------------------------
/** JSON.stringify([ecosystem, name, sourceKind]), the same encoding core uses for Package_Key. */
export type PackageKeyString = string;
export type GraveType = 'buried' | 'forgotten';
export type PlotKind = 'tombstone' | 'overgrown' | 'ghost' | 'restless' | 'lantern' | 'unmarked';
/** One word per PlotKind, one to one (Requirement 7.6). */
export type StatusWord =
  | 'dead, buried'
  | 'dead, forgotten'
  | 'haunted'
  | 'haunted, buried'
  | 'alive'
  | 'not assessed';
export type UnassessedCause = 'git' | 'path' | 'cap-skipped' | 'no-health-data';
export type VersionBasis = 'pinned' | 'resolved' | 'default' | null;
export type CacheStatus = 'hit' | 'miss' | 'unknown';
export type GlowLevel = 1 | 2 | 3 | 4;
export type ViewName = 'scene' | 'list';
export type SourceName = keyof ScanResult['sources'];
export type SourceStatusWord = 'ok' | 'partial' | 'failed';
export type ClientFailureKind = 'network-failure' | 'timeout' | 'malformed-response';
/** The API entry. After Requirement 22 it has `excluded`; a result cached earlier may lack it. */
export type AdvisoryEntry = ScanResult['dependencies'][number]['advisories'][number];
/** Parsed classification of one advisory (Requirement 14.5, DG-21). */
export type AdvisoryExclusion = 'counted' | 'informational' | 'withdrawn' | 'unknown';
export interface ParsedAdvisory {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly severity: Severity | null;
  readonly url: string;
  readonly exclusion: AdvisoryExclusion;
}

// ---- response boundary (Requirement 14) --------------------------------------------------------
/** Same shape as the Fetch API Headers.get, so a Headers instance satisfies it. */
export interface HeaderReader {
  get(name: string): string | null;
}

/** The seven facts after narrowing: a valid value or null (the Unknown_Value). */
export interface NarrowedFacts {
  readonly daysSinceLastRelease: number | null;
  readonly daysSinceLastCommit: number | null;
  readonly archived: boolean | null;
  readonly deprecated: boolean | null;
  readonly openVulnerabilityCount: number | null;
  readonly maxSeverity: Severity | null;
  readonly maintainerCount: number | null;
}
export type ParsedDependency = Omit<
  ScanResult['dependencies'][number],
  'facts' | 'versionBasis' | 'advisories'
> & {
  readonly facts: NarrowedFacts;
  readonly versionBasis: VersionBasis;
  readonly advisories: readonly ParsedAdvisory[];
};
export interface ParsedScanResult extends Omit<ScanResult, 'dependencies'> {
  readonly dependencies: readonly ParsedDependency[];
}
export interface ClientFailure {
  readonly kind: ClientFailureKind;
}
export type ParseOutcome =
  | { readonly kind: 'result'; readonly result: ParsedScanResult; readonly cache: CacheStatus }
  | {
      readonly kind: 'error';
      readonly status: number;
      readonly error: ScanErrorBody;
      readonly retryAfterSeconds: number | null;
    }
  | { readonly kind: 'failure'; readonly failure: ClientFailure };

// ---- URL state (Requirements 3, 18.1) ----------------------------------------------------------
export interface UrlState {
  /** The raw `repo` value as typed or as canonicalised. null when absent or empty. */
  readonly repo: string | null;
  readonly manifests: readonly string[];
  readonly view: ViewName;
}
/** Exactly the two fields the Scan_API accepts from the UI (Requirement 3.3). */
export interface ScanRequestBody {
  readonly repoUrl: string;
  readonly manifests?: readonly string[];
}

// ---- package rows (Requirement 7) --------------------------------------------------------------
export interface PackageRow {
  readonly key: PackageKeyString;
  /** Identity (normalised) name. */
  readonly name: string;
  /** pypi: rawName of the first entry in manifest order. Otherwise equal to `name` (Requirement 7.8). */
  readonly displayName: string;
  readonly ecosystem: Ecosystem;
  readonly sourceKind: SourceKind;
  readonly scopes: readonly Scope[];
  readonly manifestPaths: readonly string[];
  readonly versionSpecs: readonly string[];
  readonly kind: PlotKind;
  /** Non-null only when kind is 'tombstone' or 'overgrown' (Requirements 7.15, 7.16). */
  readonly graveType: GraveType | null;
  readonly statusWord: StatusWord;
  /** null for an unmarked grave. Never shown as 0. */
  readonly score: number | null;
  readonly classification: Classification | null;
  readonly strongestReason: Reason | null;
  /** Short form of the strongest reason or the unassessed-cause label, without the package name. */
  readonly epitaphShort: string;
  /** Name, then the epitaph (Requirements 7.5, 7.19). */
  readonly epitaph: string;
  readonly unassessedCause: UnassessedCause | null;
  /** Non-null only for a ghost or a restless ghost (Requirement 7.7). */
  readonly glow: GlowLevel | null;
  readonly facts: NarrowedFacts;
  readonly lookupVersion: string | null;
  readonly versionBasis: VersionBasis;
  readonly advisories: readonly ParsedAdvisory[];
  /** `<name>, <ecosystem>, <status word>, <short reason or cause>` (Requirement 7.6). */
  readonly accessibleLabel: string;
}

// ---- scene (Requirements 8, 9) -----------------------------------------------------------------
export interface PlotModel {
  readonly key: PackageKeyString;
  readonly index: number;
  readonly row: number;
  readonly col: number;
  readonly kind: PlotKind;
  readonly graveType: GraveType | null;
  readonly glow: GlowLevel | null;
  /** Visible text: the display name cut to EPITAPH_MAX_CHARS with an ellipsis. */
  readonly label: string;
  readonly accessibleLabel: string;
  readonly tooltip: { readonly title: string; readonly lines: readonly string[] };
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Deterministic 0..1 value from the key hash, used for animation delay. */
  readonly phase: number;
  /** graveyard-art Requirement 2.6: scale of the plot art by row, in [DEPTH_SCALE_BACK, 1]. */
  readonly depthScale: number;
  /** graveyard-art Requirement 2.6: opacity of the plot art by row, in [DEPTH_BRIGHTNESS_BACK, 1]. */
  readonly depthBrightness: number;
  /** graveyard-art Requirement 3.2: sprite variant, a function of kind and key only. */
  readonly variant: string;
  /** graveyard-art Requirement 4.7: sprite symbol id `plot-<kind>-<variant>` (no `-flat`). */
  readonly symbolId: string;
  /** graveyard-art Requirement 3.6: lean in whole degrees; 0 for non-stone kinds. */
  readonly tilt: number;
}
export interface SceneModel {
  readonly columns: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  /** true when plots.length > SCENE_MAX_PLOTS (Requirement 8.9). */
  readonly simplified: boolean;
  readonly plots: readonly PlotModel[];
}
export type FocusMove = 'up' | 'down' | 'left' | 'right' | 'home' | 'end';

// ---- table (Requirement 18) --------------------------------------------------------------------
export type TableColumnKey =
  | 'name'
  | 'ecosystem'
  | 'status'
  | 'score'
  | 'reason'
  | 'scopes'
  | 'version';
export interface TableSort {
  readonly column: TableColumnKey;
  readonly direction: 'asc' | 'desc';
}
export interface TableRowModel {
  readonly key: PackageKeyString;
  readonly name: string;
  readonly ecosystem: Ecosystem;
  readonly statusWord: StatusWord;
  readonly score: number | null;
  /** "not assessed" for an unmarked grave, otherwise the integer as text (Requirement 18.7). */
  readonly scoreText: string;
  readonly reasonText: string;
  readonly scopesText: string;
  readonly versionText: string;
}
export interface TableModel {
  readonly caption: string;
  readonly columns: readonly {
    readonly key: TableColumnKey;
    readonly label: string;
    readonly ariaSort: 'ascending' | 'descending' | 'none';
  }[];
  readonly rows: readonly TableRowModel[];
}

// ---- header (Requirement 5) --------------------------------------------------------------------
export interface HeadlineModel {
  /** DEAD + HAUNTED of the assessed unique packages. */
  readonly n: number;
  /** summary.assessed */
  readonly m: number;
  /** DEAD packages with grave type 'buried'. A restless ghost is never counted here. */
  readonly buried: number;
  /** DEAD packages with grave type 'forgotten'. */
  readonly forgotten: number;
  /** summary.counts.HAUNTED: ghosts and restless ghosts. */
  readonly haunted: number;
  /** Built by `headlineText(n, m, buried, forgotten, haunted)` (Requirement 5.2). */
  readonly text: string;
}
/** Graveyard-art Requirements 5.4, 5.5, 5.9: one status chip of the results header. */
export interface StatusChipModel {
  readonly status: 'dead' | 'haunted' | 'alive' | 'unassessed';
  readonly iconSymbolId: string;
  readonly text: string;
}

export interface HeaderModel {
  readonly repoName: string;
  /** Canonical_Repo_URL (DG-8). Used to rewrite the query, never as a link target (Requirement 21.2). */
  readonly canonicalUrl: string;
  readonly shortSha: string;
  readonly fullSha: string;
  readonly branch: string;
  readonly notDefaultBranch: boolean;
  readonly asOfIso: string;
  readonly asOfText: string;
  /** null when summary.assessed is 0. */
  readonly headline: HeadlineModel | null;
  /** "No dependencies could be assessed" when headline is null. */
  readonly emptyText: string | null;
  readonly counts: {
    readonly alive: number;
    readonly haunted: number;
    readonly dead: number;
    readonly buried: number;
    readonly forgotten: number;
    readonly unassessed: number;
  };
  readonly grade: {
    readonly letter: Grade | null;
    readonly label: 'worst single risk';
    readonly explanation: string;
    readonly scale: readonly { readonly letter: Grade; readonly range: string }[];
  };
  /** "<entries> dependency entries across <manifests> manifests, <total> unique packages", or null (Requirement 5.7). */
  readonly entriesSentence: string | null;
  /** Four status chips; [] when summary.assessed is 0 (Requirements 5.4, 5.5, 5.9). */
  readonly chips: readonly StatusChipModel[];
}

// ---- detail (Requirement 10) -------------------------------------------------------------------
export interface DetailModel {
  readonly key: PackageKeyString;
  readonly title: string;
  readonly statusWord: StatusWord;
  readonly scoreText: string;
  readonly unassessedLabel: string | null;
  readonly reasons: readonly {
    readonly ruleId: string;
    /** Plain message, verbatim (Requirement 10.3). */
    readonly message: string;
    readonly isMain: boolean;
  }[];
  /** Exactly seven entries in the order of HealthFacts (Requirements 10.4, 10.15). */
  readonly facts: readonly {
    readonly field: HealthFactField;
    readonly label: string;
    readonly text: string;
  }[];
  /** "<version> (pinned)", "(resolved from range)", "(latest)", or "not looked up". */
  readonly versionLine: string;
  /** As written in the manifest. */
  readonly versionSpecText: string;
  /** Plain messages of pin-not-found, conflicting-pins, range-unresolved, no-default-version. */
  readonly versionNotes: readonly string[];
  readonly scopes: readonly Scope[];
  readonly manifestPaths: readonly string[];
  readonly rawName: string | null;
  readonly notes: readonly { readonly group: string; readonly message: string }[];
  /** Labelled Advisory_Groups, empty groups omitted, except "counted" when openVulnerabilityCount > 0 (Requirement 10.16). */
  readonly advisoryGroups: readonly {
    readonly exclusion: AdvisoryExclusion;
    /** "Counted as open", "Informational, not counted", "Withdrawn, not counted", "Not classified". */
    readonly heading: string;
    /** "<k> listed", plus "<openVulnerabilityCount> counted" for the counted group. */
    readonly countText: string;
    readonly explanation: string | null;
    readonly entries: readonly {
      readonly id: string;
      readonly aliases: readonly string[];
      /** "HIGH" or "severity unknown". */
      readonly severityText: string;
      /** null when the url fails the pattern (Requirement 21.3). */
      readonly href: string | null;
    }[];
  }[];
  /** "No advisory list is available for this version" when the list is empty and openVulnerabilityCount > 0 (Requirement 10.17), else null. */
  readonly advisoryEmptyText: string | null;
  readonly links: {
    readonly registry: string | null;
    readonly sourceRepo: string | null;
  };
  /** Merged status DEAD (Requirement 10.13). */
  readonly resurrect: boolean;
}

// ---- notes (Requirement 11) --------------------------------------------------------------------
export interface NotesModel {
  readonly sources: readonly {
    readonly name: SourceName;
    readonly label: string;
    readonly status: SourceStatusWord;
    /** Distinct per status (Requirement 11.2). */
    readonly symbol: string;
    /** "<source name>: partial, some facts that depend on it are unknown". */
    readonly alert: string | null;
  }[];
  readonly sections: readonly {
    readonly title: string;
    readonly groups: readonly {
      /** Note code, or 'other' for the unknown-code section. */
      readonly code: string;
      readonly heading: string;
      readonly count: number;
      /** Plain messages in API order. */
      readonly messages: readonly string[];
      /** min(5, count), the rest behind "Show all" (Requirement 11.5). */
      readonly previewCount: number;
    }[];
  }[];
  readonly capBanner: { readonly message: string; readonly skippedCount: number } | null;
  readonly empty: { readonly message: string } | null;
  readonly manifestWarnings: readonly {
    readonly path: string;
    readonly warnings: readonly string[];
  }[];
  readonly discoveryNote: string | null;
  readonly picker: PickerModel | null;
}

// ---- errors and picker (Requirement 13) --------------------------------------------------------
export interface PickerModel {
  readonly candidates: readonly {
    readonly path: string;
    /** Manifest format and size: only for the picker of a `no-root-manifest` note (Requirement 11.11). */
    readonly format?: string;
    readonly sizeBytes?: number | null;
    readonly checked: boolean;
    readonly disabled: boolean;
  }[];
  /** SCAN_MAX_MANIFESTS. */
  readonly limit: number;
  /** URL for the current selection, or null while nothing is selected. */
  readonly scanUrl: string | null;
}
export type ErrorInput =
  | {
      readonly kind: 'api';
      readonly status: number;
      readonly error: ScanErrorBody;
      readonly retryAfterSeconds: number | null;
      readonly submittedValue: string;
      readonly repoValue: string;
      readonly selectedManifests: readonly string[];
    }
  | {
      readonly kind: 'client';
      readonly failure: ClientFailureKind;
      readonly submittedValue: string;
    };
export type ErrorActionId =
  | 'edit-url'
  | 'retry'
  | 'scan-default-branch'
  | 'scan-root'
  | 'scan-selected'
  | 'back-to-gate';
export interface ErrorModel {
  readonly code: ScanErrorBody['code'] | ClientFailureKind;
  readonly heading: string;
  /** error.message exactly, or the fixed sentence of a Client_Failure (Requirement 13.8). */
  readonly plainMessage: string;
  readonly httpStatus: number | null;
  readonly hint: string | null;
  /** invalid-url: the named part; otherwise null. */
  readonly invalidPart: string | null;
  readonly actions: readonly { readonly id: ErrorActionId; readonly label: string }[];
  /** null when there is no Retry action; 0 when enabled at once; otherwise seconds until enabled. */
  readonly retryCooldownSeconds: number | null;
  readonly picker: PickerModel | null;
  /** URL of the "Scan the default branch" action, or null. */
  readonly defaultBranchUrl: string | null;
  readonly rootScanUrl: string | null;
}

// ---- scanning (Requirement 4) ------------------------------------------------------------------
export interface StageState {
  readonly id: 1 | 2 | 3 | 4;
  readonly label: string;
  readonly state: 'done' | 'in progress' | 'waiting';
}
