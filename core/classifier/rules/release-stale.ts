// Rule 10.6: a release older than STALE_DAYS but younger than ABANDONMENT_DAYS adds stale-age points.
import type { NormalizedFacts } from '../../facts/normalize';
import { isStaleRelease } from '../../facts/predicates';
import type { Reason } from '../../model/types';
import { sentence, type Rule } from './types';

// Requirement 10.6
export const releaseStaleRule: Rule = {
  ruleId: '10.6',
  evaluate(f: NormalizedFacts): Reason | null {
    if (!isStaleRelease(f) || f.daysSinceLastRelease === null) return null;
    const release = f.daysSinceLastRelease;
    return {
      ruleId: '10.6',
      message: sentence(`daysSinceLastRelease is ${String(Math.floor(release))} days, so the last release is stale`),
      facts: [{ field: 'daysSinceLastRelease', value: release }],
    };
  },
};
