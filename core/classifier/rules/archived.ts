// Rule 8.1: archived repositories are abandoned.
import type { NormalizedFacts } from '../../facts/normalize';
import type { Reason } from '../../model/types';
import { sentence, type Rule } from './types';

// Requirement 8.1
export const archivedRule: Rule = {
  ruleId: '8.1',
  evaluate(f: NormalizedFacts): Reason | null {
    if (f.archived !== true) return null;
    return {
      ruleId: '8.1',
      message: sentence('archived is true, so the repository is archived and the package is abandoned'),
      facts: [{ field: 'archived', value: true }],
    };
  },
};
