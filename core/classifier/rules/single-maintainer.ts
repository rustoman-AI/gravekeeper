// Rule 10.8: a single maintainer adds risk points only.
import type { NormalizedFacts } from '../../facts/normalize';
import type { Reason } from '../../model/types';
import { sentence, type Rule } from './types';

// Requirement 10.8
export const singleMaintainerRule: Rule = {
  ruleId: '10.8',
  evaluate(f: NormalizedFacts): Reason | null {
    if (f.maintainerCount !== 1) return null;
    return {
      ruleId: '10.8',
      message: sentence('maintainerCount is 1, so the package depends on a single maintainer'),
      facts: [{ field: 'maintainerCount', value: 1 }],
    };
  },
};
