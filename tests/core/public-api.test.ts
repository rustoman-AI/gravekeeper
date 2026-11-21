// Validates: Requirements 13.5
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Result, SerializeError } from '../../core';
import * as core from '../../core';
import {
  CONSTANTS,
  CORE_ALLOWED_PACKAGES,
  type AssessedDependency,
  type Classification,
  type Dependency,
  type AssessedDependency as AssessedDep,
  type HealthFacts,
  type ManifestFormat,
  type SerializableDependency,
  classify,
  parseManifest,
  serializeManifest,
  summarize,
  type ParseResult,
  type RankedPackage,
  type Reason,
  type RepoSummary,
  type SourceKind,
  type UnassessedItem,
  type UniquePackage,
} from '../../core';

const EXPECTED_RUNTIME_EXPORTS: string[] = [
  'ABANDONED_AGE_POINTS',
  'ABANDONMENT_DAYS',
  'ABANDONMENT_POINTS_CAP',
  'ARCHIVED_POINTS',
  'COMMIT_ABANDONMENT_DAYS',
  'CONSTANTS',
  'CORE_ALLOWED_PACKAGES',
  'DEFAULT_SEVERITY',
  'DEPRECATED_POINTS',
  'DORMANT_RELEASE_POINTS',
  'GRADE_A_MAX',
  'GRADE_B_MAX',
  'GRADE_C_MAX',
  'GRADE_D_MAX',
  'MAINTAINER_POINTS_CAP',
  'MAX_MANIFEST_LENGTH',
  'MAX_SERIALIZED_DEPENDENCIES',
  'NO_MAINTAINER_POINTS',
  'SCOPE_ORDER',
  'SEVERITIES',
  'SEVERITY_POINTS',
  'SINGLE_MAINTAINER_POINTS',
  'STALE_AGE_POINTS',
  'STALE_DAYS',
  'VULNERABILITY_POINTS_CAP',
  'VULN_COUNT_POINTS_CAP',
  'VULN_COUNT_POINTS_EACH',
  'WORST_LIST_SIZE',
  'classify',
  'compareClassifications',
  'detectPyprojectTool',
  'mergeClassifications',
  'parseManifest',
  'serializeManifest',
  'summarize',
  'uniquePackages',
];

describe('core public entry point', () => {
  it('exports Dependency with rawName and the required fields', () => {
    expectTypeOf<Dependency>().toHaveProperty('rawName');
    expectTypeOf<Dependency['rawName']>().toEqualTypeOf<string>();
    expectTypeOf<Dependency['name']>().toEqualTypeOf<string>();
    expectTypeOf<Dependency['ecosystem']>().toEqualTypeOf<'npm' | 'pypi' | 'cargo'>();
    expectTypeOf<Dependency['versionSpec']>().toEqualTypeOf<string>();
    expectTypeOf<Dependency['scope']>().toEqualTypeOf<'runtime' | 'dev' | 'build' | 'optional' | 'peer'>();
    expectTypeOf<Dependency['sourceKind']>().toEqualTypeOf<SourceKind>();
  });

  it('exports SourceKind', () => {
    expectTypeOf<SourceKind>().toEqualTypeOf<'registry' | 'git' | 'path'>();
  });

  it('exports HealthFacts', () => {
    expectTypeOf<HealthFacts>().toHaveProperty('daysSinceLastRelease');
    expectTypeOf<HealthFacts['archived']>().toEqualTypeOf<boolean | null>();
    expectTypeOf<HealthFacts['maxSeverity']>().toEqualTypeOf<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null>();
    expectTypeOf<HealthFacts['maintainerCount']>().toEqualTypeOf<number | null>();
  });

  it('exports Classification and Reason', () => {
    expectTypeOf<Classification['status']>().toEqualTypeOf<'ALIVE' | 'HAUNTED' | 'DEAD'>();
    expectTypeOf<Classification['score']>().toEqualTypeOf<number>();
    expectTypeOf<Classification['reasons']>().toEqualTypeOf<readonly Reason[]>();
    expectTypeOf<Classification['vulnerable']>().toEqualTypeOf<boolean>();
    expectTypeOf<Reason['message']>().toEqualTypeOf<string>();
    expectTypeOf<Reason>().toHaveProperty('ruleId');
    expectTypeOf<Reason>().toHaveProperty('facts');
  });

  it('exports ParseResult and AssessedDependency', () => {
    expectTypeOf<ParseResult['dependencies']>().toEqualTypeOf<readonly Dependency[]>();
    expectTypeOf<ParseResult['warnings']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<AssessedDependency['dependency']>().toEqualTypeOf<Dependency>();
    expectTypeOf<AssessedDependency['classification']>().toEqualTypeOf<Classification | null>();
  });

  it('exports UniquePackage, RankedPackage and UnassessedItem', () => {
    expectTypeOf<UniquePackage['classification']>().toEqualTypeOf<Classification | null>();
    expectTypeOf<UniquePackage['scopes']>().toEqualTypeOf<readonly Dependency['scope'][]>();
    expectTypeOf<RankedPackage['classification']>().toEqualTypeOf<Classification>();
    expectTypeOf<UnassessedItem['unassessedReason']>().toEqualTypeOf<'non-registry-source' | 'no-health-data'>();
  });

  it('exports RepoSummary', () => {
    expectTypeOf<RepoSummary['total']>().toEqualTypeOf<number>();
    expectTypeOf<RepoSummary['grade']>().toEqualTypeOf<'A' | 'B' | 'C' | 'D' | 'F' | null>();
    expectTypeOf<RepoSummary['worst']>().toEqualTypeOf<readonly RankedPackage[]>();
    expectTypeOf<RepoSummary['unassessedItems']>().toEqualTypeOf<readonly UnassessedItem[]>();
    expectTypeOf<RepoSummary['averageScore']>().toEqualTypeOf<number | null>();
  });

  it('exports CONSTANTS at runtime', () => {
    expect(CONSTANTS.ABANDONMENT_DAYS).toBe(730);
    expect(CONSTANTS.STALE_DAYS).toBe(365);
    expect(CONSTANTS.WORST_LIST_SIZE).toBe(10);
    expect(CONSTANTS.SCOPE_ORDER).toEqual(['runtime', 'dev', 'build', 'optional', 'peer']);
    expect(CONSTANTS.SEVERITY_POINTS).toEqual({ LOW: 10, MEDIUM: 20, HIGH: 35, CRITICAL: 50 });
  });

  it('exports CORE_ALLOWED_PACKAGES at runtime', () => {
    expect(CORE_ALLOWED_PACKAGES).toEqual(['smol-toml']);
    expect(CONSTANTS.CORE_ALLOWED_PACKAGES).toBe(CORE_ALLOWED_PACKAGES);
  });
});

describe('core public functions', () => {
  it('parseManifest(text: unknown, format: ManifestFormat): ParseResult', () => {
    expectTypeOf(parseManifest).parameters.toEqualTypeOf<[text: unknown, format: ManifestFormat]>();
    expectTypeOf(parseManifest).returns.toEqualTypeOf<ParseResult>();
  });

  it('serializeManifest(dependencies, format: unknown): Result<string, SerializeError>', () => {
    expectTypeOf(serializeManifest).parameters.toEqualTypeOf<
      [dependencies: readonly SerializableDependency[], format: unknown]
    >();
    expectTypeOf(serializeManifest).returns.toEqualTypeOf<Result<string, SerializeError>>();
  });

  it('classify(facts: unknown): Classification', () => {
    expectTypeOf(classify).parameters.toEqualTypeOf<[facts: unknown]>();
    expectTypeOf(classify).returns.toEqualTypeOf<Classification>();
  });

  it('summarize(entries: readonly AssessedDependency[]): RepoSummary', () => {
    expectTypeOf(summarize).parameters.toEqualTypeOf<[entries: readonly AssessedDep[]]>();
    expectTypeOf(summarize).returns.toEqualTypeOf<RepoSummary>();
  });

  it('uniquePackages, mergeClassifications and compareClassifications have the expected signatures', () => {
    expectTypeOf(core.uniquePackages).parameters.toEqualTypeOf<[items: readonly AssessedDep[]]>();
    expectTypeOf(core.uniquePackages).returns.toEqualTypeOf<UniquePackage[]>();
    expectTypeOf(core.mergeClassifications).returns.toEqualTypeOf<Classification | null>();
    expectTypeOf(core.compareClassifications).returns.toEqualTypeOf<number>();
  });

  it('has exactly the expected runtime exports', () => {
    expect(Object.keys(core).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
  });
});