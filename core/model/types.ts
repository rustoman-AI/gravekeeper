// Model types for the dependency-graveyard-core spec (design: Data Models).
// Types only. Constants live in constants.ts.

export type ManifestFormat = 'package.json' | 'requirements.txt' | 'pyproject.toml' | 'Cargo.toml';
export type Ecosystem = 'npm' | 'pypi' | 'cargo';
/** Source_Kind */
export type SourceKind = 'registry' | 'git' | 'path';
export type Scope = 'runtime' | 'dev' | 'build' | 'optional' | 'peer';
/** Ordered low to high. */
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Status = 'ALIVE' | 'HAUNTED' | 'DEAD';
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
/** Unassessed_Reason */
export type UnassessedReason = 'non-registry-source' | 'no-health-data';

export interface Dependency {
  /** Normalized name: identity, ordering and deduplication use it. pypi: PEP503_Normalization of rawName. npm, cargo: equal to rawName. */
  readonly name: string;
  /** Name as written in the manifest. Always set by the parser (npm and cargo: equal to name). Excluded from Dependency_Set comparison. */
  readonly rawName: string;
  readonly ecosystem: Ecosystem;
  readonly versionSpec: string;
  readonly scope: Scope;
  readonly sourceKind: SourceKind;
}

/** Serializer input: a Dependency whose rawName is optional (glossary: Dependency). */
export type SerializableDependency = Omit<Dependency, 'rawName'> & {
  readonly rawName?: string;
};

/** Dependency_Set element: the five compared fields. rawName is excluded (glossary: Dependency_Set). */
export type DependencyIdentity = Omit<Dependency, 'rawName'>;

/**
 * Dependency_Key: (name, scope), where name is the normalized name. The ecosystem is fixed by the
 * Manifest_Format, so it is not part of the key. Encoded for Map/Set use as JSON.stringify([name, scope]).
 */
export type DependencyKey = readonly [name: string, scope: Scope];

/** Package_Key used by the Summarizer. Encoded as JSON.stringify([ecosystem, name, sourceKind]). */
export type PackageKey = readonly [ecosystem: Ecosystem, name: string, sourceKind: SourceKind];

/** Parse_Result */
export interface ParseResult {
  readonly dependencies: readonly Dependency[];
  readonly warnings: readonly string[];
}

/** Callers should supply this shape. classify() accepts `unknown` and validates at runtime. */
export interface HealthFacts {
  readonly daysSinceLastRelease: number | null;
  readonly daysSinceLastCommit: number | null;
  readonly archived: boolean | null;
  readonly deprecated: boolean | null;
  readonly openVulnerabilityCount: number | null;
  readonly maxSeverity: Severity | null;
  readonly maintainerCount: number | null;
}

/** What may arrive at runtime across a trust boundary: any field may be missing or wrongly typed. */
export type RawHealthFacts = { readonly [K in keyof HealthFacts]?: unknown };
export type HealthFactField = keyof HealthFacts;

export type RuleId =
  | '6.3'
  | '7.2'
  | '8.1'
  | '8.2'
  | '8.3'
  | '8.4'
  | '10.6'
  | '10.7'
  | '10.8'
  | '11.2';

export interface ReasonFact {
  readonly field: HealthFactField;
  /** Normalized value, null = unknown. */
  readonly value: number | boolean | Severity | null;
}

export interface Reason {
  readonly ruleId: RuleId;
  /** One English sentence, 1 to 200 chars. */
  readonly message: string;
  readonly facts: readonly ReasonFact[];
}

export interface Classification {
  readonly status: Status;
  /** Integer 0..100. */
  readonly score: number;
  /** 1..20, ascending ruleId. */
  readonly reasons: readonly Reason[];
  readonly vulnerable: boolean;
  readonly abandoned: boolean;
  readonly dormant: boolean;
}

/** Assessed_Dependency (input of summarize). */
export interface AssessedDependency {
  readonly dependency: Dependency;
  readonly classification: Classification | null;
}

/** Merged_Classification: the Classification chosen for a group, or null when every entry has null. */
export type MergedClassification = Classification | null;

/** Unique_Package, one per Package_Key. */
export interface UniquePackage {
  readonly name: string;
  readonly ecosystem: Ecosystem;
  readonly sourceKind: SourceKind;
  /** Set of scopes, sorted in SCOPE_ORDER, no repeats. */
  readonly scopes: readonly Scope[];
  readonly classification: MergedClassification;
}

/** Assessed_Package: a Unique_Package with sourceKind 'registry' and a non-null Merged_Classification. */
export interface AssessedPackage extends UniquePackage {
  readonly sourceKind: 'registry';
  readonly classification: Classification;
}

/** Ranked_Package, entry of Repo_Summary.worst. */
export interface RankedPackage {
  readonly name: string;
  readonly ecosystem: Ecosystem;
  readonly sourceKind: SourceKind;
  readonly scopes: readonly Scope[];
  readonly classification: Classification;
}

/** Unassessed_Item */
export interface UnassessedItem {
  readonly name: string;
  readonly ecosystem: Ecosystem;
  readonly sourceKind: SourceKind;
  readonly scopes: readonly Scope[];
  readonly unassessedReason: UnassessedReason;
}

/** Repo_Summary */
export interface RepoSummary {
  readonly total: number;
  readonly assessed: number;
  readonly unassessed: number;
  readonly counts: {
    readonly ALIVE: number;
    readonly HAUNTED: number;
    readonly DEAD: number;
  };
  readonly averageScore: number | null;
  readonly maxScore: number | null;
  readonly maxScorePackage: {
    readonly name: string;
    readonly ecosystem: Ecosystem;
  } | null;
  readonly grade: Grade | null;
  readonly worst: readonly RankedPackage[];
  readonly unassessedItems: readonly UnassessedItem[];
}
