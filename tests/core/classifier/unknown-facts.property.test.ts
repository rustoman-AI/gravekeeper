// Property 2 of scan-accuracy: the 6.3 Reason, checked against the independent facts oracle.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classify } from '../../../core';
import { arbAnyFactsInput, arbRawFacts } from '../../support/arbitraries/facts';
import { cfg } from '../../support/fc-config';
import { oracleReportableUnknownFields, oracleUnknownFactsMessage } from '../../support/oracles/facts-oracle';

// Raw facts with a Valid_Fact open count of 0 and a missing or invalid severity, to hit the exception often.
const arbZeroCountUnknownSeverity = fc
  .tuple(arbRawFacts, fc.constantFrom<unknown>(undefined, null, 'NONE', 7, ''))
  .map(([facts, severity]) => ({ ...facts, openVulnerabilityCount: 0, maxSeverity: severity }));

const check = (input: unknown): void => {
  const names = oracleReportableUnknownFields(input);
  const expected = oracleUnknownFactsMessage(names);
  const r63 = classify(input).reasons.filter((r) => r.ruleId === '6.3');
  if (expected === null) {
    expect(r63).toHaveLength(0);
    return;
  }
  expect(r63).toHaveLength(1);
  expect(r63[0]!.message).toBe(expected);
  expect(r63[0]!.message.length).toBeLessThanOrEqual(200);
};

describe('unknown-facts Reason properties', () => {
  // Feature: scan-accuracy, Property 2: Unreportable severity and the exact text of the unknown-facts Reason
  it('Property 2: the 6.3 Reason has the exact text for the reportable unknown fields', () => {
    // **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.8, 2.9**
    fc.assert(fc.property(fc.oneof(arbRawFacts, arbAnyFactsInput), check), cfg());
  });

  // Feature: scan-accuracy, Property 2: Unreportable severity and the exact text of the unknown-facts Reason
  it('Property 2: an unknown severity is not reported when the open count is a Valid_Fact 0', () => {
    // **Validates: Requirements 2.1, 2.4, 2.8**
    fc.assert(
      fc.property(arbZeroCountUnknownSeverity, (input) => {
        expect(oracleReportableUnknownFields(input)).not.toContain('maxSeverity');
        check(input);
        const r63 = classify(input).reasons.find((r) => r.ruleId === '6.3');
        expect(r63?.message ?? '').not.toContain('maxSeverity');
      }),
      cfg(),
    );
  });
});
