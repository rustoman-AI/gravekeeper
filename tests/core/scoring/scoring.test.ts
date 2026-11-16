import { describe, expect, it } from 'vitest';
import { normalizeFacts } from '../../../core/facts/normalize';
import {
  abandonmentPoints,
  computeScore,
  maintainerPoints,
  scoreComponents,
  vulnerabilityPoints,
} from '../../../core/scoring';

const facts = (o: Record<string, unknown> = {}) => normalizeFacts(o);

const BASE = { LOW: 10, MEDIUM: 20, HIGH: 35, CRITICAL: 50 } as const;
// count -> extra points: 2 per vulnerability beyond the first, capped at 5
const EXTRA: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [2, 2],
  [6, 5],
  [7, 5],
  [100, 5],
];

describe('vulnerabilityPoints (10.2)', () => {
  it('is 0 for zero vulnerabilities and for unknown count', () => {
    expect(vulnerabilityPoints(facts({ openVulnerabilityCount: 0, maxSeverity: 'CRITICAL' }))).toBe(0);
    expect(vulnerabilityPoints(facts({ maxSeverity: 'CRITICAL' }))).toBe(0);
  });

  for (const [sev, base] of Object.entries(BASE)) {
    for (const [count, extra] of EXTRA) {
      it(`${sev} with ${count} vulnerabilities is ${Math.min(55, base + extra)}`, () => {
        const f = facts({ openVulnerabilityCount: count, maxSeverity: sev });
        expect(vulnerabilityPoints(f)).toBe(Math.min(55, base + extra));
      });
    }
  }

  it('treats unknown severity as MEDIUM', () => {
    for (const [count] of EXTRA) {
      expect(vulnerabilityPoints(facts({ openVulnerabilityCount: count }))).toBe(
        vulnerabilityPoints(facts({ openVulnerabilityCount: count, maxSeverity: 'MEDIUM' })),
      );
    }
    expect(vulnerabilityPoints(facts({ openVulnerabilityCount: 1, maxSeverity: 'bogus' }))).toBe(20);
  });

  it('CRITICAL with 7 vulnerabilities is 55', () => {
    expect(vulnerabilityPoints(facts({ openVulnerabilityCount: 7, maxSeverity: 'CRITICAL' }))).toBe(55);
  });

  it('CRITICAL vulnerable scores at least 50', () => {
    for (const [count] of EXTRA) {
      expect(computeScore(facts({ openVulnerabilityCount: count, maxSeverity: 'CRITICAL' }))).toBeGreaterThanOrEqual(50);
    }
  });
});

describe('abandonmentPoints (10.3-10.6, 10.17, 10.23)', () => {
  it('is 0 for healthy or unknown facts', () => {
    expect(abandonmentPoints(facts())).toBe(0);
    expect(abandonmentPoints(facts({ archived: false, deprecated: false, daysSinceLastRelease: 10 }))).toBe(0);
  });

  it('archived is 30', () => {
    expect(abandonmentPoints(facts({ archived: true }))).toBe(30);
  });

  it('deprecated is 25', () => {
    expect(abandonmentPoints(facts({ deprecated: true }))).toBe(25);
  });

  it('release abandonment (8.3) is 20', () => {
    expect(abandonmentPoints(facts({ daysSinceLastRelease: 730, daysSinceLastCommit: 365 }))).toBe(20);
    expect(abandonmentPoints(facts({ daysSinceLastRelease: 730 }))).toBe(20);
  });

  it('dormant is exactly 10 and never adds 20 or stale points', () => {
    const f = facts({ daysSinceLastRelease: 1000, daysSinceLastCommit: 364 });
    expect(abandonmentPoints(f)).toBe(10);
    expect(abandonmentPoints({ ...f, daysSinceLastCommit: 0 })).toBe(10);
  });

  it('stale release is 10', () => {
    expect(abandonmentPoints(facts({ daysSinceLastRelease: 365 }))).toBe(10);
    expect(abandonmentPoints(facts({ daysSinceLastRelease: 729 }))).toBe(10);
    expect(abandonmentPoints(facts({ daysSinceLastRelease: 364 }))).toBe(0);
  });

  it('caps the sum at 30', () => {
    expect(abandonmentPoints(facts({ archived: true, deprecated: true, daysSinceLastRelease: 900 }))).toBe(30);
    expect(abandonmentPoints(facts({ deprecated: true, daysSinceLastRelease: 900 }))).toBe(30);
  });
});

describe('maintainerPoints (10.7, 10.8)', () => {
  it('scores 0 maintainers 15, 1 maintainer 5, 2 maintainers 0, unknown 0', () => {
    expect(maintainerPoints(facts({ maintainerCount: 0 }))).toBe(15);
    expect(maintainerPoints(facts({ maintainerCount: 1 }))).toBe(5);
    expect(maintainerPoints(facts({ maintainerCount: 2 }))).toBe(0);
    expect(maintainerPoints(facts({ maintainerCount: null }))).toBe(0);
    expect(maintainerPoints(facts())).toBe(0);
  });
});

describe('computeScore / scoreComponents (10.16)', () => {
  it('worst case totals 100', () => {
    const f = facts({
      openVulnerabilityCount: 7,
      maxSeverity: 'CRITICAL',
      archived: true,
      deprecated: true,
      daysSinceLastRelease: 5000,
      daysSinceLastCommit: 5000,
      maintainerCount: 0,
    });
    expect(scoreComponents(f)).toEqual({ vulnerability: 55, abandonment: 30, maintainer: 15 });
    expect(computeScore(f)).toBe(100);
  });

  it('sums the components', () => {
    const f = facts({ openVulnerabilityCount: 2, maxSeverity: 'HIGH', deprecated: true, maintainerCount: 1 });
    expect(computeScore(f)).toBe(37 + 25 + 5);
  });

  it('is 0 for all-unknown facts', () => {
    expect(computeScore(facts())).toBe(0);
  });
});
