// Rule 6.3: reports every Unknown_Fact field once.
import type { NormalizedFacts } from '../../facts/normalize';
import type { Reason } from '../../model/types';
import { listNames, sentence, type Rule } from './types';

// Requirement 6.3
export const unknownFactsRule: Rule = {
  ruleId: '6.3',
  evaluate(f: NormalizedFacts): Reason | null {
    if (f.unknownFields.length === 0) return null;
    const names = [...new Set(f.unknownFields)];
    const noun = names.length === 1 ? 'fact is' : 'facts are';
    return {
      ruleId: '6.3',
      message: sentence(`These health ${noun} unknown and add no risk points: ${listNames(names)}`),
      facts: [],
    };
  },
};
