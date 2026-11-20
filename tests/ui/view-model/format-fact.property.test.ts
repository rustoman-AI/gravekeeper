// Feature: graveyard-ui, Property 19: Fact formatting
// Validates: Requirements 10.4, 10.14
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { HealthFactField } from '../../../core';
import { FACT_FIELDS, formatFact } from '../../../view-model/format-fact';
import { cfg } from '../../support/fc-config';

const DAY_FIELDS: readonly HealthFactField[] = ['daysSinceLastRelease', 'daysSinceLastCommit'];
const BOOL_FIELDS: readonly HealthFactField[] = ['archived', 'deprecated'];
const COUNT_FIELDS: readonly HealthFactField[] = ['openVulnerabilityCount', 'maintainerCount'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

const field = fc.constantFrom(...FACT_FIELDS);
const dayField = fc.constantFrom(...DAY_FIELDS);
const boolField = fc.constantFrom(...BOOL_FIELDS);
const countField = fc.constantFrom(...COUNT_FIELDS);

const nonNumbers = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.boolean(),
  fc.string(),
  fc.constantFrom(...SEVERITIES),
  fc.constantFrom('0', '5', 'yes', 'no', 'true', 'low', 'unknown', ''),
  fc.array(fc.integer(), { maxLength: 2 }),
  fc.constant({}),
);
const badNumbers = fc.oneof(
  fc.integer({ min: -1_000_000, max: -1 }),
  fc.double({ max: -Number.MIN_VALUE, noNaN: true }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.5),
);
const nonIntegers = fc
  .double({ min: 0, max: 1e6, noNaN: true })
  .filter((n) => !Number.isInteger(n));
const naturals = fc.oneof(fc.constant(0), fc.nat(), fc.integer({ min: 0, max: 100000 }));

function expectValid(text: string): void {
  expect(text).not.toBe('');
  expect(text).not.toBe('unknown');
}

describe('P19: Fact formatting', () => {
  it('lists the seven fact fields', () => {
    expect(new Set(FACT_FIELDS).size).toBe(7);
  });

  it('returns "unknown" for any value that is not valid for any field', () => {
    fc.assert(
      fc.property(field, fc.oneof(nonNumbers, badNumbers), (f, v) => {
        const isBoolOk = BOOL_FIELDS.includes(f) && typeof v === 'boolean';
        const isSeverityOk = f === 'maxSeverity' && typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v);
        if (isBoolOk || isSeverityOk) return;
        expect(formatFact(f, v)).toBe('unknown');
      }),
      cfg(),
    );
  });

  it('formats non-negative whole numbers of day fields as "<n> days", and 0 as "0 days"', () => {
    expect(formatFact('daysSinceLastRelease', 0)).toBe('0 days');
    expect(formatFact('daysSinceLastCommit', 0)).toBe('0 days');
    fc.assert(
      fc.property(dayField, naturals, (f, n) => {
        const text = formatFact(f, n);
        expectValid(text);
        expect(text).toBe(`${String(n)} days`);
      }),
      cfg(),
    );
  });

  it('formats booleans as "yes" and "no", and false as "no"', () => {
    expect(formatFact('archived', false)).toBe('no');
    expect(formatFact('deprecated', false)).toBe('no');
    fc.assert(
      fc.property(boolField, fc.boolean(), (f, b) => {
        const text = formatFact(f, b);
        expectValid(text);
        expect(text).toBe(b ? 'yes' : 'no');
      }),
      cfg(),
    );
  });

  it('formats non-negative integer counts as their decimal text and rejects non-integers', () => {
    fc.assert(
      fc.property(countField, naturals, nonIntegers, (f, n, frac) => {
        const text = formatFact(f, n);
        expectValid(text);
        expect(text).toBe(String(n));
        expect(formatFact(f, frac)).toBe('unknown');
      }),
      cfg(),
    );
  });

  it('formats severity words as themselves and every other string as unknown', () => {
    fc.assert(
      fc.property(fc.constantFrom(...SEVERITIES), fc.string(), (sev, s) => {
        const text = formatFact('maxSeverity', sev);
        expectValid(text);
        expect(text).toBe(sev);
        if (!(SEVERITIES as readonly string[]).includes(s)) expect(formatFact('maxSeverity', s)).toBe('unknown');
      }),
      cfg(),
    );
  });

  it('never formats an unknown value as 0, "no" or empty', () => {
    fc.assert(
      fc.property(field, (f) => {
        for (const v of [null, undefined]) {
          const text = formatFact(f, v);
          expect(text).toBe('unknown');
        }
      }),
      cfg(),
    );
  });
});
