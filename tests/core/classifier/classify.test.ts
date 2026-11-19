import { describe, expect, it } from 'vitest';
import { classify, CONSTANTS } from '../../../core';

const { ABANDONMENT_DAYS, COMMIT_ABANDONMENT_DAYS, STALE_DAYS } = CONSTANTS;

const base = {
  daysSinceLastRelease: 10,
  daysSinceLastCommit: 5,
  archived: false,
  deprecated: false,
  openVulnerabilityCount: 0,
  maxSeverity: 'LOW',
  maintainerCount: 3,
};
const withFacts = (o: Record<string, unknown>) => ({ ...base, ...o });
type Classified = ReturnType<typeof classify>;
const isClassified = (x: unknown): x is Classified =>
  typeof x === 'object' && x !== null && 'reasons' in x && 'status' in x && 'score' in x;
const ids = (input: unknown) => (isClassified(input) ? input : classify(input)).reasons.map((r) => r.ruleId);

describe('classify: status precedence (9.1 to 9.4)', () => {
  it('9.1 vulnerable is HAUNTED', () => {
    const c = classify(withFacts({ openVulnerabilityCount: 1 }));
    expect(c.status).toBe('HAUNTED');
    expect(c.vulnerable).toBe(true);
    expect(c.abandoned).toBe(false);
  });

  it('9.2 abandoned and not vulnerable is DEAD', () => {
    const c = classify(withFacts({ archived: true }));
    expect(c.status).toBe('DEAD');
    expect(c.abandoned).toBe(true);
  });

  it('9.3 neither is ALIVE', () => {
    const c = classify(base);
    expect(c.status).toBe('ALIVE');
    expect(c.vulnerable).toBe(false);
    expect(c.abandoned).toBe(false);
  });

  it('9.4 haunted and abandoned is HAUNTED and keeps both Reason sets', () => {
    const c = classify(withFacts({ openVulnerabilityCount: 2, maxSeverity: 'HIGH', archived: true }));
    expect(c.status).toBe('HAUNTED');
    expect(c.vulnerable).toBe(true);
    expect(c.abandoned).toBe(true);
    expect(c.reasons.map((r) => r.ruleId)).toEqual(['7.2', '8.1']);
  });

  it('dormant stays ALIVE', () => {
    const c = classify(withFacts({ daysSinceLastRelease: ABANDONMENT_DAYS, daysSinceLastCommit: COMMIT_ABANDONMENT_DAYS - 1 }));
    expect(c.status).toBe('ALIVE');
    expect(c.dormant).toBe(true);
    expect(c.abandoned).toBe(false);
    expect(ids(c)).toEqual(['8.4']);
  });
});

describe('classify: Reasons', () => {
  it('all-unknown input is ALIVE, score 0, with exactly one 6.3 Reason', () => {
    const c = classify({});
    expect(c.status).toBe('ALIVE');
    expect(c.score).toBe(0);
    expect(c.reasons).toHaveLength(1);
    expect(c.reasons[0]?.ruleId).toBe('6.3');
  });

  it('no signals gives exactly one 11.2 Reason', () => {
    const c = classify(base);
    expect(c.reasons).toHaveLength(1);
    expect(c.reasons[0]?.ruleId).toBe('11.2');
    expect(c.score).toBe(0);
  });

  it('Reason count is between 1 and 20 and ruleIds ascend', () => {
    const inputs: unknown[] = [
      {},
      base,
      withFacts({
        archived: true,
        deprecated: true,
        openVulnerabilityCount: 7,
        maxSeverity: 'CRITICAL',
        daysSinceLastRelease: 5000,
        daysSinceLastCommit: 5000,
        maintainerCount: 0,
      }),
      withFacts({ daysSinceLastRelease: STALE_DAYS, maintainerCount: 1, deprecated: true }),
    ];
    for (const input of inputs) {
      const r = classify(input).reasons;
      expect(r.length).toBeGreaterThanOrEqual(1);
      expect(r.length).toBeLessThanOrEqual(20);
    }
    const all = ids(
      withFacts({
        archived: true,
        deprecated: true,
        openVulnerabilityCount: 7,
        daysSinceLastRelease: 5000,
        daysSinceLastCommit: 5000,
        maintainerCount: 0,
        maxSeverity: 'bogus',
      }),
    );
    expect(all).toEqual(['6.3', '7.2', '8.1', '8.2', '8.3', '10.7']);
    const num = (s: string) => s.split('.').map(Number);
    for (let i = 1; i < all.length; i++) {
      const [a1 = 0, a2 = 0] = num(all[i - 1] as string);
      const [b1 = 0, b2 = 0] = num(all[i] as string);
      expect(a1 < b1 || (a1 === b1 && a2 < b2)).toBe(true);
    }
  });
});

describe('classify: totality', () => {
  it('a throwing getter still returns a Classification', () => {
    const hostile = {
      get daysSinceLastRelease(): number {
        throw new Error('boom');
      },
      archived: true,
    };
    const c = classify(hostile);
    expect(c.reasons.length).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(c.score)).toBe(true);
    expect(['ALIVE', 'DEAD', 'HAUNTED']).toContain(c.status);
  });

  it('a throwing Proxy still returns a Classification', () => {
    const p = new Proxy(
      {},
      {
        has() {
          throw new Error('x');
        },
        getOwnPropertyDescriptor() {
          throw new Error('x');
        },
        get() {
          throw new Error('x');
        },
      },
    );
    expect(classify(p).reasons.length).toBeGreaterThanOrEqual(1);
  });

  it.each([null, undefined, 42, 'str', true, [], Symbol('s')])('non-object input %p returns a Classification', (v) => {
    const c = classify(v);
    expect(c.status).toBe('ALIVE');
    expect(c.score).toBe(0);
    expect(c.reasons).toHaveLength(1);
    expect(c.reasons[0]?.ruleId).toBe('6.3');
  });
});

describe('classify: score', () => {
  it('CRITICAL vulnerable scores at least 50', () => {
    for (const count of [1, 2, 7, 100]) {
      const c = classify(withFacts({ openVulnerabilityCount: count, maxSeverity: 'CRITICAL' }));
      expect(c.score).toBeGreaterThanOrEqual(50);
    }
  });

  it('vulnerability count points: 1, 2, 3, 4, 7 with LOW', () => {
    const score = (n: number) => classify(withFacts({ openVulnerabilityCount: n })).score;
    expect([1, 2, 3, 4, 7].map(score)).toEqual([10, 12, 14, 15, 15]);
  });

  it('unknown severity with vulnerabilities assumes MEDIUM and says so', () => {
    for (const maxSeverity of [undefined, 'nope']) {
      const c = classify(withFacts({ openVulnerabilityCount: 1, maxSeverity }));
      expect(c.score).toBe(20);
      expect(c.reasons.find((r) => r.ruleId === '7.2')?.message).toContain('assumed');
    }
  });

  it('severity is ignored when the count is 0', () => {
    expect(classify(withFacts({ maxSeverity: 'CRITICAL' })).score).toBe(0);
  });

  it('components are capped and the worst case is exactly 100', () => {
    const capped = classify(
      withFacts({ archived: true, deprecated: true, daysSinceLastRelease: 5000, daysSinceLastCommit: 5000 }),
    );
    expect(capped.score).toBe(30);
    expect(classify(withFacts({ openVulnerabilityCount: 7, maxSeverity: 'CRITICAL' })).score).toBe(55);
    const worst = classify({
      daysSinceLastRelease: 5000,
      daysSinceLastCommit: 5000,
      archived: true,
      deprecated: true,
      openVulnerabilityCount: 7,
      maxSeverity: 'CRITICAL',
      maintainerCount: 0,
    });
    expect(worst.score).toBe(100);
  });

  it.each([
    [{}],
    [base],
    [{ ...base, openVulnerabilityCount: Number.MAX_SAFE_INTEGER, maxSeverity: 'CRITICAL', maintainerCount: 0 }],
    [{ ...base, daysSinceLastRelease: Infinity, openVulnerabilityCount: NaN }],
  ])('score is an integer in 0..100 for %j', (input) => {
    const s = classify(input).score;
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe('classify: boundary table', () => {
  const rel = (daysSinceLastRelease: number, daysSinceLastCommit: unknown = 5) =>
    classify(withFacts({ daysSinceLastRelease, daysSinceLastCommit }));

  it('release at ABANDONMENT_DAYS - 1 has 10.6 only', () => {
    const c = rel(ABANDONMENT_DAYS - 1, STALE_DAYS);
    expect(c.reasons.map((r) => r.ruleId)).toEqual(['10.6']);
    expect(c.abandoned).toBe(false);
    expect(c.score).toBe(10);
  });

  it('release at STALE_DAYS - 1 has no age Reason, at STALE_DAYS has 10.6', () => {
    expect(ids(rel(STALE_DAYS - 1))).toEqual(['11.2']);
    expect(ids(rel(STALE_DAYS))).toEqual(['10.6']);
  });

  it('release 0, -0 and fractional values are valid', () => {
    expect(ids(rel(0))).toEqual(['11.2']);
    expect(ids(rel(-0))).toEqual(['11.2']);
    expect(ids(rel(STALE_DAYS - 0.5))).toEqual(['11.2']);
    expect(ids(rel(STALE_DAYS + 0.5))).toEqual(['10.6']);
  });

  it.each([NaN, Infinity, -Infinity, -1])('release %p is unknown (6.3 only)', (v) => {
    const c = classify(withFacts({ daysSinceLastRelease: v }));
    expect(ids(c)).toEqual(['6.3']);
    expect(c.score).toBe(0);
  });

  it('release >= 730 with commit COMMIT_ABANDONMENT_DAYS - 1 is dormant (8.4, not 8.3)', () => {
    const c = rel(ABANDONMENT_DAYS, COMMIT_ABANDONMENT_DAYS - 1);
    expect(ids(c)).toEqual(['8.4']);
    expect(c.dormant).toBe(true);
    expect(c.abandoned).toBe(false);
    expect(c.score).toBe(10);
  });

  it('release >= 730 with commit COMMIT_ABANDONMENT_DAYS is abandoned (8.3, not 8.4)', () => {
    const c = rel(ABANDONMENT_DAYS, COMMIT_ABANDONMENT_DAYS);
    expect(ids(c)).toContain('8.3');
    expect(ids(c)).not.toContain('8.4');
    expect(c.abandoned).toBe(true);
    expect(c.dormant).toBe(false);
    expect(c.status).toBe('DEAD');
    expect(c.score).toBe(20);
  });

  it('release >= 730 with unknown commit is abandoned and the Reason says assumed stale', () => {
    const c = classify({ ...base, daysSinceLastRelease: ABANDONMENT_DAYS, daysSinceLastCommit: undefined });
    expect(c.abandoned).toBe(true);
    expect(c.reasons.find((r) => r.ruleId === '8.3')?.message).toMatch(/assumed/i);
  });

  it('release >= 730 with commit 0 is dormant', () => {
    expect(ids(rel(ABANDONMENT_DAYS + 1000, 0))).toEqual(['8.4']);
  });

  it('openVulnerabilityCount 0 is not vulnerable; invalid counts are unknown', () => {
    expect(classify(base).vulnerable).toBe(false);
    for (const v of [-1, 0.5, NaN, Infinity, null]) {
      const c = classify(withFacts({ openVulnerabilityCount: v }));
      expect(c.vulnerable).toBe(false);
      expect(ids(c)).toEqual(['6.3']);
    }
  });

  it('openVulnerabilityCount 1 and 100 are vulnerable', () => {
    expect(classify(withFacts({ openVulnerabilityCount: 1 })).vulnerable).toBe(true);
    expect(classify(withFacts({ openVulnerabilityCount: 100 })).vulnerable).toBe(true);
  });

  it('each severity gives its points at count 1', () => {
    const pts = (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(
      (maxSeverity) => classify(withFacts({ openVulnerabilityCount: 1, maxSeverity })).score,
    );
    expect(pts).toEqual([10, 20, 35, 50]);
  });

  it('maintainerCount 0, 1, 2 and invalid values', () => {
    const m = (maintainerCount: unknown) => classify(withFacts({ maintainerCount }));
    expect(ids(m(0))).toEqual(['10.7']);
    expect(m(0).score).toBe(15);
    expect(ids(m(1))).toEqual(['10.8']);
    expect(m(1).score).toBe(5);
    expect(ids(m(2))).toEqual(['11.2']);
    for (const v of [null, -1, 1.5]) {
      expect(ids(m(v))).toEqual(['6.3']);
      expect(m(v).score).toBe(0);
    }
  });

  it('maintainerCount 0 does not make the package DEAD (8.9, 8.12)', () => {
    const c = classify(withFacts({ maintainerCount: 0 }));
    expect(c.status).toBe('ALIVE');
    expect(c.abandoned).toBe(false);
  });

  it('archived, deprecated and release abandonment are capped at 30 together', () => {
    const c = classify(
      withFacts({ archived: true, deprecated: true, daysSinceLastRelease: ABANDONMENT_DAYS, daysSinceLastCommit: COMMIT_ABANDONMENT_DAYS }),
    );
    expect(ids(c)).toEqual(['8.1', '8.2', '8.3']);
    expect(c.score).toBe(30);
  });
});
