// Abandonment_Component of the Risk_Score.
import type { NormalizedFacts } from '../facts/normalize';
import { isDormant, isReleaseAbandoned, isStaleRelease } from '../facts/predicates';
import {
  ABANDONED_AGE_POINTS,
  ABANDONMENT_POINTS_CAP,
  ARCHIVED_POINTS,
  DEPRECATED_POINTS,
  DORMANT_RELEASE_POINTS,
  STALE_AGE_POINTS,
} from '../model/constants';

// Requirements 10.3, 10.4, 10.5, 10.6, 10.17, 10.23
export const abandonmentPoints = (f: NormalizedFacts): number => {
  let subtotal = 0;
  // Requirement 10.3
  if (f.archived === true) subtotal += ARCHIVED_POINTS;
  // Requirement 10.4
  if (f.deprecated === true) subtotal += DEPRECATED_POINTS;
  // Requirement 10.5 (release-based abandonment); dormant and stale never add on top (10.23)
  if (isReleaseAbandoned(f)) subtotal += ABANDONED_AGE_POINTS;
  // Requirements 10.5, 10.23: dormant gives exactly DORMANT_RELEASE_POINTS
  else if (isDormant(f)) subtotal += DORMANT_RELEASE_POINTS;
  // Requirement 10.6
  else if (isStaleRelease(f)) subtotal += STALE_AGE_POINTS;
  // Requirement 10.17
  return Math.min(ABANDONMENT_POINTS_CAP, subtotal);
};
