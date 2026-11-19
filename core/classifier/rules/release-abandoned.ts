// Rule 8.3: no recent release and no recent (or unknown) commit activity.
import type { NormalizedFacts } from '../../facts/normalize';
import { isReleaseAbandoned } from '../../facts/predicates';
import { ABANDONMENT_DAYS, COMMIT_ABANDONMENT_DAYS } from '../../model/constants';
import type { Reason } from '../../model/types';
import { sentence, type Rule } from './types';

// Requirement 8.3
export const releaseAbandonedRule: Rule = {
  ruleId: '8.3',
  evaluate(f: NormalizedFacts): Reason | null {
    if (!isReleaseAbandoned(f) || f.daysSinceLastRelease === null) return null;
    const release = f.daysSinceLastRelease;
    const commit = f.daysSinceLastCommit;
    const commitText =
      commit === null
        ? 'daysSinceLastCommit is unknown and assumed stale'
        : `daysSinceLastCommit is ${String(commit)}`;
    return {
      ruleId: '8.3',
      message: sentence(
        `daysSinceLastRelease is ${String(release)}, at least ABANDONMENT_DAYS (${String(ABANDONMENT_DAYS)}), and ${commitText} (not under COMMIT_ABANDONMENT_DAYS (${String(COMMIT_ABANDONMENT_DAYS)})), so the package is abandoned`,
      ),
      facts: [
        { field: 'daysSinceLastRelease', value: release },
        { field: 'daysSinceLastCommit', value: commit },
      ],
    };
  },
};
