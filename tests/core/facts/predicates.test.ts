import { describe, expect, it } from 'vitest';
import { normalizeFacts } from '../../../core/facts/normalize';
import {
  isAbandoned,
  isDormant,
  isReleaseAbandoned,
  isStaleRelease,
  isVulnerable,
} from '../../../core/facts/predicates';
import { ABANDONMENT_DAYS, COMMIT_ABANDONMENT_DAYS, STALE_DAYS } from '../../../core/model/constants';

const facts = (over: Record<string, unknown> = {}) =>
  normalizeFacts({
    daysSinceLastRelease: 10,
    daysSinceLastCommit: 10,
    archived: false,
    deprecated: false,
    openVulnerabilityCount: 0,
    maxSeverity: 'LOW',
    maintainerCount: 3,
    ...over,
  });

describe('isVulnerable', () => {
  it.each([
    [0, false],
    [1, true],
    [5, true],
    [-1, false],
    [0.5, false],
    [1.5, false],
    [undefined, false],
    ['2', false],
    [NaN, false],
  ])('count %s -> %s', (count, expected) => {
    expect(isVulnerable(facts({ openVulnerabilityCount: count }))).toBe(expected);
  });

  it('is false when the field is missing', () => {
    expect(isVulnerable(normalizeFacts({}))).toBe(false);
  });
});

describe('release abandonment boundaries (commit at COMMIT_ABANDONMENT_DAYS)', () => {
  const commit = COMMIT_ABANDONMENT_DAYS;
  it.each([
    [ABANDONMENT_DAYS - 1, false],
    [ABANDONMENT_DAYS, true],
    [ABANDONMENT_DAYS + 1, true],
  ])('release %s days -> abandoned %s', (days, expected) => {
    const f = facts({ daysSinceLastRelease: days, daysSinceLastCommit: commit });
    expect(isReleaseAbandoned(f)).toBe(expected);
    expect(isAbandoned(f)).toBe(expected);
    expect(isDormant(f)).toBe(false);
  });

  it('unknown release is never release-abandoned', () => {
    const f = facts({ daysSinceLastRelease: undefined, daysSinceLastCommit: 9999 });
    expect(isReleaseAbandoned(f)).toBe(false);
    expect(isAbandoned(f)).toBe(false);
    expect(isDormant(f)).toBe(false);
    expect(isStaleRelease(f)).toBe(false);
  });
});

describe('commit threshold boundaries (old release)', () => {
  it.each([
    [STALE_DAYS - 1, false, true],
    [STALE_DAYS, false, true],
    [COMMIT_ABANDONMENT_DAYS - 1, false, true],
    [COMMIT_ABANDONMENT_DAYS, true, false],
    [COMMIT_ABANDONMENT_DAYS + 1, true, false],
  ])('commit %s days -> abandoned %s, dormant %s', (days, abandoned, dormant) => {
    const f = facts({ daysSinceLastRelease: ABANDONMENT_DAYS, daysSinceLastCommit: days });
    expect(isReleaseAbandoned(f)).toBe(abandoned);
    expect(isAbandoned(f)).toBe(abandoned);
    expect(isDormant(f)).toBe(dormant);
  });

  it('unknown commit is assumed stale: abandoned, not dormant', () => {
    const f = facts({ daysSinceLastRelease: ABANDONMENT_DAYS, daysSinceLastCommit: undefined });
    expect(isReleaseAbandoned(f)).toBe(true);
    expect(isAbandoned(f)).toBe(true);
    expect(isDormant(f)).toBe(false);
  });

  it('release below the abandonment threshold is neither abandoned nor dormant', () => {
    const f = facts({ daysSinceLastRelease: ABANDONMENT_DAYS - 1, daysSinceLastCommit: 0 });
    expect(isAbandoned(f)).toBe(false);
    expect(isDormant(f)).toBe(false);
  });
});

describe('isStaleRelease boundaries', () => {
  it.each([
    [STALE_DAYS - 1, false],
    [STALE_DAYS, true],
    [STALE_DAYS + 1, true],
    [ABANDONMENT_DAYS - 1, true],
    [ABANDONMENT_DAYS, false],
    [ABANDONMENT_DAYS + 1, false],
  ])('release %s days -> %s', (days, expected) => {
    expect(isStaleRelease(facts({ daysSinceLastRelease: days }))).toBe(expected);
  });
});

describe('archived, deprecated and maintainerCount', () => {
  it('archived alone makes a fresh package abandoned', () => {
    const f = facts({ archived: true });
    expect(isAbandoned(f)).toBe(true);
    expect(isReleaseAbandoned(f)).toBe(false);
  });

  it('deprecated alone makes a fresh package abandoned', () => {
    const f = facts({ deprecated: true });
    expect(isAbandoned(f)).toBe(true);
    expect(isReleaseAbandoned(f)).toBe(false);
  });

  it('unknown archived/deprecated do not make a package abandoned', () => {
    expect(isAbandoned(facts({ archived: undefined, deprecated: 'yes' }))).toBe(false);
  });

  it('maintainerCount 0 does not make a package abandoned', () => {
    expect(isAbandoned(facts({ maintainerCount: 0 }))).toBe(false);
  });

  it('maintainerCount has no influence on any predicate', () => {
    const cases = [
      {},
      { daysSinceLastRelease: ABANDONMENT_DAYS, daysSinceLastCommit: STALE_DAYS },
      { daysSinceLastRelease: ABANDONMENT_DAYS, daysSinceLastCommit: 1 },
      { daysSinceLastRelease: STALE_DAYS },
      { openVulnerabilityCount: 2 },
    ];
    for (const c of cases) {
      const results = [0, 1, 50, undefined].map((m) => {
        const f = facts({ ...c, maintainerCount: m });
        return [isVulnerable(f), isReleaseAbandoned(f), isDormant(f), isAbandoned(f), isStaleRelease(f)];
      });
      for (const r of results) expect(r).toEqual(results[0]);
    }
  });
});

describe('isReleaseAbandoned and isDormant are mutually exclusive', () => {
  it('never both true across a boundary grid', () => {
    const days = [undefined, 0, STALE_DAYS - 1, STALE_DAYS, STALE_DAYS + 1, ABANDONMENT_DAYS - 1, ABANDONMENT_DAYS, ABANDONMENT_DAYS + 1];
    for (const r of days) {
      for (const c of days) {
        const f = facts({ daysSinceLastRelease: r, daysSinceLastCommit: c });
        expect(isReleaseAbandoned(f) && isDormant(f)).toBe(false);
      }
    }
  });
});
