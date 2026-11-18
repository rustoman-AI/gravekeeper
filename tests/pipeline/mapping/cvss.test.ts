import { describe, expect, it } from 'vitest';
import { cvssSeverity, cvssV3BaseScore, severityFromScore } from '../../../pipeline/mapping/cvss';

// Requirements 10.1, 10.2, 10.3, 10.4, 10.11

const BASE = 'AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';

describe('cvssV3BaseScore published vectors (R10.11)', () => {
  const cases: ReadonlyArray<[string, number, string | null]> = [
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 9.8, 'CRITICAL'],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', 10.0, 'CRITICAL'],
    ['CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H', 8.8, 'HIGH'],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N', 6.1, 'MEDIUM'],
    ['CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N', 1.8, 'LOW'],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N', 0.0, null],
  ];
  it.each(cases)('%s', (vector, score, severity) => {
    expect(cvssV3BaseScore(vector)).toBe(score);
    expect(cvssSeverity(vector)).toBe(severity);
  });

  it('reproduces the same scores for version 3.0', () => {
    expect(cvssV3BaseScore('CVSS:3.0/' + BASE)).toBe(9.8);
    expect(cvssV3BaseScore('CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H')).toBe(10);
    expect(cvssV3BaseScore('CVSS:3.0/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N')).toBe(6.1);
    expect(cvssV3BaseScore('CVSS:3.0/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N')).toBe(1.8);
  });
});

describe('scope changed and version round-up', () => {
  it('uses the changed-scope formula', () => {
    expect(cvssV3BaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:L/I:L/A:N')).toBe(7.2);
    expect(cvssV3BaseScore('CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H')).toBe(9.9);
  });

  it('gives a one-decimal score for both versions on every vector shape sampled', () => {
    for (const version of ['3.0', '3.1']) {
      for (const s of ['U', 'C']) {
        for (const c of ['N', 'L', 'H']) {
          const score = cvssV3BaseScore(`CVSS:${version}/AV:A/AC:H/PR:L/UI:R/S:${s}/C:${c}/I:L/A:N`);
          expect(score).not.toBeNull();
          expect(Math.round((score as number) * 10) / 10).toBe(score);
        }
      }
    }
  });

  it('agrees between 3.0 and 3.1 where the two round-up functions coincide', () => {
    const v = 'AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N';
    expect(cvssV3BaseScore('CVSS:3.0/' + v)).toBe(cvssV3BaseScore('CVSS:3.1/' + v));
  });
});

describe('boundary scores and severity', () => {
  const boundary: ReadonlyArray<[string, number, string]> = [
    ['AV:N/AC:H/PR:H/UI:R/S:U/C:L/I:L/A:L', 3.9, 'LOW'],
    ['AV:N/AC:H/PR:N/UI:N/S:C/C:N/I:N/A:L', 4.0, 'MEDIUM'],
    ['AV:N/AC:L/PR:H/UI:R/S:C/C:N/I:L/A:H', 6.9, 'MEDIUM'],
    ['AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:H', 7.0, 'HIGH'],
    ['AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:H/A:H', 8.9, 'HIGH'],
    ['AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:H', 9.0, 'CRITICAL'],
  ];
  it.each(boundary)('%s scores %s', (metrics, score, severity) => {
    expect(cvssV3BaseScore('CVSS:3.1/' + metrics)).toBe(score);
    expect(cvssSeverity('CVSS:3.1/' + metrics)).toBe(severity);
  });

  it('maps scores to severities at the range edges', () => {
    expect(severityFromScore(0)).toBeNull();
    expect(severityFromScore(0.1)).toBe('LOW');
    expect(severityFromScore(3.9)).toBe('LOW');
    expect(severityFromScore(4.0)).toBe('MEDIUM');
    expect(severityFromScore(6.9)).toBe('MEDIUM');
    expect(severityFromScore(7.0)).toBe('HIGH');
    expect(severityFromScore(8.9)).toBe('HIGH');
    expect(severityFromScore(9.0)).toBe('CRITICAL');
    expect(severityFromScore(10)).toBe('CRITICAL');
  });

  it('compares the unrounded score', () => {
    expect(severityFromScore(3.95)).toBe('LOW');
    expect(severityFromScore(6.99)).toBe('MEDIUM');
    expect(severityFromScore(8.99)).toBe('HIGH');
  });

  it('accepts metrics in any order', () => {
    expect(cvssV3BaseScore('CVSS:3.1/A:H/I:H/C:H/S:U/UI:N/PR:N/AC:L/AV:N')).toBe(9.8);
  });
});

describe('invalid vectors return null', () => {
  const invalid: ReadonlyArray<[string, unknown]> = [
    ['non-string number', 9.8],
    ['null', null],
    ['undefined', undefined],
    ['object', {}],
    ['empty string', ''],
    ['CVSS 4.0 prefix', 'CVSS:4.0/' + BASE],
    ['no prefix', BASE],
    ['lowercase prefix', 'cvss:3.1/' + BASE],
    ['prefix 3.2', 'CVSS:3.2/' + BASE],
    ['prefix without slash', 'CVSS:3.1' + BASE],
    ['prefix only', 'CVSS:3.1/'],
    ['missing metric', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H'],
    ['repeated metric', 'CVSS:3.1/AV:N/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'],
    ['nine segments with unknown key', 'CVSS:3.1/' + BASE + '/E:H'],
    ['temporal key replacing base', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/E:H'],
    ['lowercase key', 'CVSS:3.1/av:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'],
    ['lowercase value', 'CVSS:3.1/AV:n/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'],
    ['value outside set (AV:X)', 'CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'],
    ['value outside set (AC:N)', 'CVSS:3.1/AV:N/AC:N/PR:N/UI:N/S:U/C:H/I:H/A:H'],
    ['value outside set (UI:L)', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:L/S:U/C:H/I:H/A:H'],
    ['value outside set (S:N)', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:N/C:H/I:H/A:H'],
    ['multi-character value', 'CVSS:3.1/AV:NN/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'],
    ['empty value', 'CVSS:3.1/AV:/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'],
    ['empty segment', 'CVSS:3.1/AV:N//AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'],
    ['trailing slash', 'CVSS:3.1/' + BASE + '/'],
    ['segment without colon', 'CVSS:3.1/AVN/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'],
    ['segment with two colons', 'CVSS:3.1/AV:N:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'],
    ['leading space', ' CVSS:3.1/' + BASE],
    ['trailing space', 'CVSS:3.1/' + BASE + ' '],
    ['inner space', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C: H/I:H/A:H'],
    ['trailing newline', 'CVSS:3.1/' + BASE + '\n'],
    ['inner tab', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/\tA:H'],
  ];
  it.each(invalid)('%s', (_name, input) => {
    expect(cvssV3BaseScore(input)).toBeNull();
    expect(cvssSeverity(input)).toBeNull();
  });
});
