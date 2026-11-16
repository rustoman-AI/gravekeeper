// Rule 8.2: deprecated packages are abandoned.
import type { NormalizedFacts } from '../../facts/normalize';
import type { Reason } from '../../model/types';
import { sentence, type Rule } from './types';

// Requirement 8.2
export const deprecatedRule: Rule = {
  ruleId: '8.2',
  evaluate(f: NormalizedFacts): Reason | null {
    if (f.deprecated !== true) return null;
    return {
      ruleId: '8.2',
      message: sentence('deprecated is true, so the package is deprecated and abandoned'),
      facts: [{ field: 'deprecated', value: true }],
    };
  },
};
