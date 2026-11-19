// Rule 6.3: reports every reportable Unknown_Fact field once.
import type { NormalizedFacts } from '../../facts/normalize';
import type { Reason } from '../../model/types';
import { listNames, sentence, type Rule } from './types';

// Requirements 2.1 to 2.6 (scan-accuracy)
export const unknownFactsRule: Rule = {
  ruleId: '6.3',
  evaluate(f: NormalizedFacts): Reason | null {
    // A severity cannot exist when no vulnerability is open (open count is a Valid_Fact equal to 0).
    const noOpenVulnerability = f.openVulnerabilityCount === 0;
    const reportable = [...new Set(f.unknownFields)].filter(
      (name) => !(name === 'maxSeverity' && noOpenVulnerability),
    );
    if (reportable.length === 0) return null;
    const text =
      reportable.length === 1
        ? `This health fact is unknown and adds no risk points: ${reportable[0]}`
        : `These health facts are unknown and add no risk points: ${listNames(reportable)}`;
    return { ruleId: '6.3', message: sentence(text), facts: [] };
  },
};
