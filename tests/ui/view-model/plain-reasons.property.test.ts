// Feature: graveyard-art, Property GA-P7: Plain reason lines are total and take numbers only from the facts
// Validates: Requirements 8.1, 8.2, 8.3, 8.4
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Reason } from '../../../core/model/types';
import { plainReasonLine } from '../../../view-model/plain-reasons';
import { cfg } from '../../support/fc-config';

const CORE_IDS = ['7.2', '8.1', '8.2', '8.3', '8.4', '10.6', '10.7', '10.8', '6.3', '11.2'];
const FIELDS = ['openVulnerabilityCount', 'maxSeverity', 'daysSinceLastRelease', 'isArchived'];

const arbRuleId = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...CORE_IDS) },
  { weight: 2, arbitrary: fc.string() },
  { weight: 1, arbitrary: fc.string({ unit: 'binary' }) },
  { weight: 1, arbitrary: fc.constantFrom('toString', '__proto__', 'constructor', 'hasOwnProperty') },
);

const arbValue = fc.oneof(
  fc.integer({ min: 0, max: 100000 }),
  fc.integer(),
  fc.nat({ max: Number.MAX_SAFE_INTEGER }),
  fc.double({ noNaN: false }),
  fc.constantFrom(Number.NaN, Infinity, -Infinity, -0, 1.5),
  fc.constantFrom('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'NONE', 'undefined', 'NaN', '42'),
  fc.string(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({}),
  fc.constant([7]),
);

const arbFact = fc.oneof(
  fc.record({
    field: fc.oneof(fc.constantFrom(...FIELDS), fc.string()),
    value: arbValue,
  }),
  fc.record({ field: fc.constantFrom(...FIELDS) }),
  fc.constant(null),
  fc.constant(7),
  fc.constant('openVulnerabilityCount'),
);

const arbFacts = fc.oneof(
  { weight: 6, arbitrary: fc.array(arbFact, { maxLength: 6 }) },
  { weight: 1, arbitrary: fc.constantFrom(undefined, null, 'x', 5, {}) },
);

const arbReason = fc
  .record({ ruleId: arbRuleId, message: fc.oneof(fc.string(), fc.constant('99 days 123')), facts: arbFacts })
  .map((r) => r as unknown as Reason);

/** Integer fact values of the reason, as decimal text. */
function integerFactTexts(reason: Reason): Set<string> {
  const out = new Set<string>();
  const facts: unknown = (reason as { facts?: unknown }).facts;
  if (!Array.isArray(facts)) return out;
  for (const f of facts as unknown[]) {
    if (typeof f !== 'object' || f === null) continue;
    const v = (f as { value?: unknown }).value;
    if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) out.add(String(v));
  }
  return out;
}

describe('GA-P7 Plain reason lines are total and take numbers only from the facts', () => {
  it('GA-P7 returns a clean non-empty deterministic string and never throws', () => {
    fc.assert(
      fc.property(arbReason, (reason) => {
        const line = plainReasonLine(reason);
        expect(typeof line).toBe('string');
        expect(line.length).toBeGreaterThan(0);
        expect(line.trim().length).toBeGreaterThan(0);
        expect(line).not.toContain('undefined');
        expect(line).not.toContain('NaN');
        expect(line).not.toContain('[object');
        expect(plainReasonLine(reason)).toBe(line);
      }),
      cfg(),
    );
  });

  it('GA-P7 every digit sequence is an integer fact value of the reason', () => {
    fc.assert(
      fc.property(arbReason, (reason) => {
        const line = plainReasonLine(reason);
        const allowed = integerFactTexts(reason);
        for (const seq of line.match(/\d+/g) ?? []) {
          expect(allowed.has(seq)).toBe(true);
        }
      }),
      cfg(),
    );
  });

  it('GA-P7 an unknown ruleId gives one fixed line independent of message and facts', () => {
    fc.assert(
      fc.property(
        arbReason.filter((r) => !CORE_IDS.includes(r.ruleId as string)),
        arbReason.filter((r) => !CORE_IDS.includes(r.ruleId as string)),
        (a, b) => {
          expect(plainReasonLine(a)).toBe(plainReasonLine(b));
          expect(plainReasonLine(a)).toContain('no plain wording');
        },
      ),
      cfg(),
    );
  });

  it('GA-P7 every core rule id has a line of its own, different from the unknown line', () => {
    const unknown = plainReasonLine({ ruleId: 'zz', message: '', facts: [] } as unknown as Reason);
    const lines = CORE_IDS.map((id) =>
      plainReasonLine({ ruleId: id, message: 'm', facts: [] } as unknown as Reason),
    );
    for (const l of lines) expect(l).not.toBe(unknown);
    expect(new Set(lines).size).toBe(CORE_IDS.length);
  });
});
