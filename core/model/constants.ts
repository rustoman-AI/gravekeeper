// Constants for the dependency-graveyard-core spec. Single source of truth for thresholds and weights.
import type { Scope, Severity } from './types';

interface ConstantsShape {
  readonly ABANDONMENT_DAYS: number;
  readonly STALE_DAYS: number;
  readonly SEVERITY_POINTS: Readonly<Record<Severity, number>>;
  readonly DEFAULT_SEVERITY: Severity;
  readonly VULN_COUNT_POINTS_EACH: number;
  readonly VULN_COUNT_POINTS_CAP: number;
  readonly VULNERABILITY_POINTS_CAP: number;
  readonly ARCHIVED_POINTS: number;
  readonly DEPRECATED_POINTS: number;
  readonly ABANDONED_AGE_POINTS: number;
  readonly DORMANT_RELEASE_POINTS: number;
  readonly STALE_AGE_POINTS: number;
  readonly ABANDONMENT_POINTS_CAP: number;
  readonly NO_MAINTAINER_POINTS: number;
  readonly SINGLE_MAINTAINER_POINTS: number;
  readonly MAINTAINER_POINTS_CAP: number;
  readonly GRADE_A_MAX: number;
  readonly GRADE_B_MAX: number;
  readonly GRADE_C_MAX: number;
  readonly GRADE_D_MAX: number;
  readonly MAX_MANIFEST_LENGTH: number;
  readonly WORST_LIST_SIZE: number;
  readonly MAX_SERIALIZED_DEPENDENCIES: number;
  readonly SCOPE_ORDER: readonly Scope[];
  readonly CORE_ALLOWED_PACKAGES: readonly string[];
}

export const CONSTANTS = {
  ABANDONMENT_DAYS: 730,
  STALE_DAYS: 365,
  SEVERITY_POINTS: { LOW: 10, MEDIUM: 20, HIGH: 35, CRITICAL: 50 },
  DEFAULT_SEVERITY: 'MEDIUM',
  VULN_COUNT_POINTS_EACH: 2,
  VULN_COUNT_POINTS_CAP: 5,
  VULNERABILITY_POINTS_CAP: 55,
  ARCHIVED_POINTS: 30,
  DEPRECATED_POINTS: 25,
  ABANDONED_AGE_POINTS: 20,
  DORMANT_RELEASE_POINTS: 10,
  STALE_AGE_POINTS: 10,
  ABANDONMENT_POINTS_CAP: 30,
  NO_MAINTAINER_POINTS: 15,
  SINGLE_MAINTAINER_POINTS: 5,
  MAINTAINER_POINTS_CAP: 15,
  GRADE_A_MAX: 19,
  GRADE_B_MAX: 39,
  GRADE_C_MAX: 59,
  GRADE_D_MAX: 79,
  MAX_MANIFEST_LENGTH: 1_000_000,
  WORST_LIST_SIZE: 10,
  MAX_SERIALIZED_DEPENDENCIES: 10_000,
  SCOPE_ORDER: ['runtime', 'dev', 'build', 'optional', 'peer'],
  CORE_ALLOWED_PACKAGES: ['smol-toml'],
} as const satisfies ConstantsShape;

export const {
  ABANDONMENT_DAYS,
  STALE_DAYS,
  SEVERITY_POINTS,
  DEFAULT_SEVERITY,
  VULN_COUNT_POINTS_EACH,
  VULN_COUNT_POINTS_CAP,
  VULNERABILITY_POINTS_CAP,
  ARCHIVED_POINTS,
  DEPRECATED_POINTS,
  ABANDONED_AGE_POINTS,
  DORMANT_RELEASE_POINTS,
  STALE_AGE_POINTS,
  ABANDONMENT_POINTS_CAP,
  NO_MAINTAINER_POINTS,
  SINGLE_MAINTAINER_POINTS,
  MAINTAINER_POINTS_CAP,
  GRADE_A_MAX,
  GRADE_B_MAX,
  GRADE_C_MAX,
  GRADE_D_MAX,
  MAX_MANIFEST_LENGTH,
  WORST_LIST_SIZE,
  MAX_SERIALIZED_DEPENDENCIES,
  SCOPE_ORDER,
  CORE_ALLOWED_PACKAGES,
} = CONSTANTS;

/** Severities ordered low to high. */
export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const satisfies readonly Severity[];
