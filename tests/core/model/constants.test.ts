import { describe, expect, it } from 'vitest';
import { CONSTANTS as C, SEVERITIES } from '../../../core/model/constants';

describe('constants table values', () => {
  it('matches the requirements table exactly', () => {
    expect(C.ABANDONMENT_DAYS).toBe(730);
    expect(C.STALE_DAYS).toBe(365);
    expect(C.SEVERITY_POINTS).toEqual({ LOW: 10, MEDIUM: 20, HIGH: 35, CRITICAL: 50 });
    expect(C.DEFAULT_SEVERITY).toBe('MEDIUM');
    expect(C.VULN_COUNT_POINTS_EACH).toBe(2);
    expect(C.VULN_COUNT_POINTS_CAP).toBe(5);
    expect(C.VULNERABILITY_POINTS_CAP).toBe(55);
    expect(C.ARCHIVED_POINTS).toBe(30);
    expect(C.DEPRECATED_POINTS).toBe(25);
    expect(C.ABANDONED_AGE_POINTS).toBe(20);
    expect(C.DORMANT_RELEASE_POINTS).toBe(10);
    expect(C.STALE_AGE_POINTS).toBe(10);
    expect(C.ABANDONMENT_POINTS_CAP).toBe(30);
    expect(C.NO_MAINTAINER_POINTS).toBe(15);
    expect(C.SINGLE_MAINTAINER_POINTS).toBe(5);
    expect(C.MAINTAINER_POINTS_CAP).toBe(15);
    expect(C.GRADE_A_MAX).toBe(19);
    expect(C.GRADE_B_MAX).toBe(39);
    expect(C.GRADE_C_MAX).toBe(59);
    expect(C.GRADE_D_MAX).toBe(79);
    expect(C.MAX_MANIFEST_LENGTH).toBe(1_000_000);
    expect(C.WORST_LIST_SIZE).toBe(10);
    expect(C.MAX_SERIALIZED_DEPENDENCIES).toBe(10_000);
    expect([...C.SCOPE_ORDER]).toEqual(['runtime', 'dev', 'build', 'optional', 'peer']);
    expect([...C.CORE_ALLOWED_PACKAGES]).toEqual(['smol-toml']);
    expect([...SEVERITIES]).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  });
});

describe('constant consistency rules (criterion 10.21)', () => {
  it('component caps sum to 100', () => {
    expect(C.VULNERABILITY_POINTS_CAP + C.ABANDONMENT_POINTS_CAP + C.MAINTAINER_POINTS_CAP).toBe(100);
    expect(C.VULNERABILITY_POINTS_CAP).toBe(C.SEVERITY_POINTS.CRITICAL + C.VULN_COUNT_POINTS_CAP);
  });

  it('STALE_AGE_POINTS <= DORMANT_RELEASE_POINTS < ABANDONED_AGE_POINTS', () => {
    expect(C.STALE_AGE_POINTS).toBeLessThanOrEqual(C.DORMANT_RELEASE_POINTS);
    expect(C.DORMANT_RELEASE_POINTS).toBeLessThan(C.ABANDONED_AGE_POINTS);
  });

  it('dormant points are below archived, deprecated and the abandonment cap', () => {
    expect(C.DORMANT_RELEASE_POINTS).toBeLessThan(
      Math.min(C.ARCHIVED_POINTS, C.DEPRECATED_POINTS, C.ABANDONMENT_POINTS_CAP),
    );
    expect(C.ABANDONED_AGE_POINTS).toBeLessThanOrEqual(C.ABANDONMENT_POINTS_CAP);
  });

  it('lowest severity points are above 0', () => {
    expect(Math.min(...Object.values(C.SEVERITY_POINTS))).toBeGreaterThan(0);
  });

  it('grade thresholds are strictly increasing and below 100', () => {
    expect(C.GRADE_A_MAX).toBeGreaterThanOrEqual(0);
    expect(C.GRADE_A_MAX).toBeLessThan(C.GRADE_B_MAX);
    expect(C.GRADE_B_MAX).toBeLessThan(C.GRADE_C_MAX);
    expect(C.GRADE_C_MAX).toBeLessThan(C.GRADE_D_MAX);
    expect(C.GRADE_D_MAX).toBeLessThan(100);
  });
});
