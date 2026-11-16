// Rule 10.7: no maintainers adds risk points only; it never sets abandoned or status.
import type { NormalizedFacts } from '../../facts/normalize';
import type { Reason } from '../../model/types';
import { sentence, type Rule } from './types';

// Requirement 10.7
export const noMaintainersRule: Rule = {
  ruleId: '10.7',
  evaluate(f: NormalizedFacts): Reason | null {
    if (f.maintainerCount !== 0) return null;
    return {
      ruleId: '10.7',
      message: sentence('maintainerCount is 0, so the package has no maintainers'),
      facts: [{ field: 'maintainerCount', value: 0 }],
    };
  },
};
