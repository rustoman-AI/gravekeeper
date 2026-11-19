// Requirements 2.1 to 2.9 (scan-accuracy)
import { describe, expect, it } from 'vitest';
import { classify } from '../../../core';
import { unknownFactsRule } from '../../../core/classifier/rules/unknown-facts';
import { normalizeFacts } from '../../../core/facts/normalize';

const valid = {
  daysSinceLastRelease: 10,
  daysSinceLastCommit: 5,
  archived: false,
  deprecated: false,
  openVulnerabilityCount: 0,
  maxSeverity: 'LOW',
  maintainerCount: 3,
};
const without = (...names: string[]) => {
  const raw: Record<string, unknown> = { ...valid };
  for (const n of names) delete raw[n];
  return raw;
};
const msg = (raw: unknown) => unknownFactsRule.evaluate(normalizeFacts(raw))?.message;

describe('unknown-facts rule text', () => {
  it('uses the singular text for one name', () => {
    expect(msg(without('daysSinceLastCommit'))).toBe(
      'This health fact is unknown and adds no risk points: daysSinceLastCommit.',
    );
  });

  it('joins two names with "and"', () => {
    expect(msg(without('daysSinceLastRelease', 'daysSinceLastCommit'))).toBe(
      'These health facts are unknown and add no risk points: daysSinceLastRelease and daysSinceLastCommit.',
    );
  });

  it('joins three names with a comma and "and"', () => {
    expect(msg(without('daysSinceLastRelease', 'daysSinceLastCommit', 'archived'))).toBe(
      'These health facts are unknown and add no risk points: daysSinceLastRelease, daysSinceLastCommit and archived.',
    );
  });

  it('lists all seven names within 200 characters', () => {
    const m = msg({})!;
    expect(m.startsWith('These health facts are unknown and add no risk points: ')).toBe(true);
    for (const n of Object.keys(valid)) expect(m).toContain(n);
    expect(m.length).toBeLessThanOrEqual(200);
    expect(m.endsWith('.')).toBe(true);
  });
});

describe('unknown-facts rule maxSeverity exception', () => {
  it('count 0 with only maxSeverity unknown gives no 6.3 and one 11.2', () => {
    const raw = without('maxSeverity');
    expect(msg(raw)).toBeUndefined();
    const c = classify(raw);
    expect(c.reasons.map((r) => r.ruleId)).toEqual(['11.2']);
  });

  it('count 0 with maxSeverity and another field unknown lists only the other field', () => {
    expect(msg(without('maxSeverity', 'archived'))).toBe(
      'This health fact is unknown and adds no risk points: archived.',
    );
  });

  it('unknown count lists maxSeverity', () => {
    expect(msg(without('openVulnerabilityCount', 'maxSeverity'))).toContain('maxSeverity');
  });

  it('count 1 with unknown maxSeverity lists it', () => {
    const raw = { ...without('maxSeverity'), openVulnerabilityCount: 1 };
    expect(msg(raw)).toBe('This health fact is unknown and adds no risk points: maxSeverity.');
  });

  it.each([-1, 0.5, 1.5, NaN])('invalid count %p does not trigger the exception', (count) => {
    const raw = { ...without('maxSeverity'), openVulnerabilityCount: count };
    const m = msg(raw)!;
    expect(m).toContain('maxSeverity');
    expect(m).toContain('openVulnerabilityCount');
  });
});
