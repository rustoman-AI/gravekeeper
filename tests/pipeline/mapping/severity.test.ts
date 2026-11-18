import { describe, expect, it } from 'vitest';
import { mapDepsDevAdvisory, severityOf } from '../../../pipeline/mapping/severity';
// Requirements 10.5, 10.6, 10.7, 10.14, 9.21
const V_CRITICAL = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';
const V_MEDIUM = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N';
const cvss = (score: string, type = 'CVSS_V3') => ({ type, score });

describe('severityOf', () => {
  it('uses a valid Advisory_Score first and 0.0 ends with null despite label and entries', () => {
    const body = { database_specific: { severity: 'HIGH' }, severity: [cvss(V_CRITICAL)] };
    expect(severityOf(0, body)).toBeNull();
    expect(severityOf(6.1, body)).toBe('MEDIUM');
    expect(severityOf(9.8, {})).toBe('CRITICAL');
  });

  it('maps live-verified deps.dev scores', () => {
    // GHSA-p8p7-x288-28g6 cvss3Score 6.1, RUSTSEC-2020-0036 cvss3Score 9.8
    expect(severityOf(mapDepsDevAdvisory({ cvss3Score: 6.1 }), {})).toBe('MEDIUM');
    expect(severityOf(mapDepsDevAdvisory({ cvss3Score: 9.8 }), {})).toBe('CRITICAL');
  });

  it('accepts exact labels and maps MODERATE to MEDIUM', () => {
    const of = (severity: unknown) => severityOf(null, { database_specific: { severity } });
    expect(of('LOW')).toBe('LOW');
    expect(of('HIGH')).toBe('HIGH');
    expect(of('CRITICAL')).toBe('CRITICAL');
    expect(of('MODERATE')).toBe('MEDIUM');
  });

  it('rejects non-exact label forms and falls through', () => {
    const of = (severity: unknown, entries: unknown[] = []) =>
      severityOf(null, { database_specific: { severity }, severity: entries });
    expect(of('moderate')).toBeNull();
    expect(of('Moderate')).toBeNull();
    expect(of('low')).toBeNull();
    expect(of('MEDIUM')).toBeNull();
    expect(of(5)).toBeNull();
    expect(of('moderate', [cvss(V_MEDIUM)])).toBe('MEDIUM');
    expect(of('bogus', [cvss(V_CRITICAL)])).toBe('CRITICAL');
  });

  it('label wins over severity[]', () => {
    const body = { database_specific: { severity: 'LOW' }, severity: [cvss(V_CRITICAL)] };
    expect(severityOf(null, body)).toBe('LOW');
  });

  it('ignores CVSS_V4 entries and invalid vectors, takes the highest valid CVSS_V3', () => {
    expect(severityOf(null, { severity: [cvss(V_CRITICAL, 'CVSS_V4')] })).toBeNull();
    expect(severityOf(null, { severity: [cvss('garbage')] })).toBeNull();
    expect(severityOf(null, { severity: [cvss(V_CRITICAL, 'CVSS_V4'), cvss(V_MEDIUM)] })).toBe('MEDIUM');
    expect(severityOf(null, { severity: [cvss(V_MEDIUM), cvss(V_CRITICAL)] })).toBe('CRITICAL');
    expect(severityOf(null, { severity: [{ type: 'CVSS_V3', score: 9 }] })).toBeNull();
  });

  it('returns null for malformed bodies', () => {
    expect(severityOf(null, null)).toBeNull();
    expect(severityOf(null, {})).toBeNull();
    expect(severityOf(null, { severity: 'x' })).toBeNull();
  });
});

describe('mapDepsDevAdvisory', () => {
  it('accepts finite numbers in [0, 10]', () => {
    expect(mapDepsDevAdvisory({ cvss3Score: 0 })).toBe(0);
    expect(mapDepsDevAdvisory({ cvss3Score: 10 })).toBe(10);
    expect(mapDepsDevAdvisory({ cvss3Score: 6.1 })).toBe(6.1);
  });

  it('rejects NaN, Infinity, out-of-range, strings and missing scores', () => {
    for (const cvss3Score of [NaN, Infinity, -Infinity, 10.1, -0.1, '7.5', null, undefined]) {
      expect(mapDepsDevAdvisory({ cvss3Score })).toBeNull();
    }
    expect(mapDepsDevAdvisory({})).toBeNull();
    expect(mapDepsDevAdvisory(null)).toBeNull();
  });
});
