// Pure predicates over NormalizedFacts. maintainerCount is not read by any predicate.
import { ABANDONMENT_DAYS, STALE_DAYS } from '../model/constants';
import type { NormalizedFacts } from './normalize';

// Requirement 7.1
export const isVulnerable = (f: NormalizedFacts): boolean =>
  f.openVulnerabilityCount !== null && f.openVulnerabilityCount >= 1;

// Requirement 8.3 (release-based abandonment; unknown commit counts as stale)
export const isReleaseAbandoned = (f: NormalizedFacts): boolean =>
  f.daysSinceLastRelease !== null &&
  f.daysSinceLastRelease >= ABANDONMENT_DAYS &&
  (f.daysSinceLastCommit === null || f.daysSinceLastCommit >= STALE_DAYS);

// Requirement 8.4
export const isDormant = (f: NormalizedFacts): boolean =>
  f.daysSinceLastRelease !== null &&
  f.daysSinceLastRelease >= ABANDONMENT_DAYS &&
  f.daysSinceLastCommit !== null &&
  f.daysSinceLastCommit < STALE_DAYS;

// Requirements 8.1, 8.2, 8.3
export const isAbandoned = (f: NormalizedFacts): boolean =>
  f.archived === true || f.deprecated === true || isReleaseAbandoned(f);

// Requirement 10.6
export const isStaleRelease = (f: NormalizedFacts): boolean =>
  f.daysSinceLastRelease !== null &&
  f.daysSinceLastRelease >= STALE_DAYS &&
  f.daysSinceLastRelease < ABANDONMENT_DAYS;
