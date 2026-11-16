// Rule 8.4: releases are dormant while commits continue; does not set abandoned.
import type { NormalizedFacts } from '../../facts/normalize';
import { isDormant } from '../../facts/predicates';
import type { Reason } from '../../model/types';
import { sentence, type Rule } from './types';

// Requirement 8.4
export const releaseDormantRule: Rule = {
  ruleId: '8.4',
  evaluate(f: NormalizedFacts): Reason | null {
    if (!isDormant(f) || f.daysSinceLastRelease === null || f.daysSinceLastCommit === null) return null;
    const release = f.daysSinceLastRelease;
    const commit = f.daysSinceLastCommit;
    return {
      ruleId: '8.4',
      message: sentence(
        `daysSinceLastRelease is ${String(release)} but daysSinceLastCommit is ${String(commit)}, so the package has dormant releases`,
      ),
      facts: [
        { field: 'daysSinceLastRelease', value: release },
        { field: 'daysSinceLastCommit', value: commit },
      ],
    };
  },
};
