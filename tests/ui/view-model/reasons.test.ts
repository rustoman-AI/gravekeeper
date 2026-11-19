import { describe, expect, it } from 'vitest';
import type { ReasonFact, RuleId } from '../../../core';
import { glowOf } from '../../../view-model/glow';
import { REASON_PRIORITY, epitaphOf, shortForm, strongestReason } from '../../../view-model/reasons';
import { cls } from './grave-type.test';

const vuln: ReasonFact[] = [
  { field: 'openVulnerabilityCount', value: 3 },
  { field: 'maxSeverity', value: 'HIGH' },
];

describe('strongestReason (R7.4)', () => {
  it('follows the Reason_Priority order', () => {
    expect(REASON_PRIORITY).toEqual(['7.2', '8.1', '8.2', '8.3', '8.4', '10.7', '10.8', '10.6', '6.3', '11.2']);
    for (let i = 0; i < REASON_PRIORITY.length; i++) {
      const rest = REASON_PRIORITY.slice(i);
      expect(strongestReason(cls('HAUNTED', [...rest].reverse()))?.ruleId).toBe(REASON_PRIORITY[i]);
    }
  });
  it('is null for null or empty reasons', () => {
    expect(strongestReason(null)).toBeNull();
    expect(strongestReason(cls('ALIVE', []))).toBeNull();
  });
});

describe('shortForm (R7.5)', () => {
  it('gives each rule short label', () => {
    const expected: Record<Exclude<RuleId, '7.2'>, string> = {
      '8.1': 'archived',
      '8.2': 'deprecated',
      '8.3': 'no release or commit for a long time, may be finished or abandoned',
      '8.4': 'dormant releases',
      '10.7': 'no maintainers',
      '10.8': 'single maintainer',
      '10.6': 'stale release',
      '6.3': 'some facts unknown',
      '11.2': 'no risk signals found',
    };
    for (const [id, text] of Object.entries(expected)) {
      const reason = cls('ALIVE', [id as RuleId]).reasons[0]!;
      expect(shortForm(reason)).toBe(text);
    }
    expect(shortForm(cls('HAUNTED', ['7.2'], vuln).reasons[0]!)).toBe('3 open vulnerabilities (HIGH)');
  });
});

describe('epitaphOf (R7.5, R7.19, R7.20)', () => {
  it('buried tombstone', () => {
    expect(epitaphOf('left-pad', cls('DEAD', ['8.1']))).toBe('left-pad, archived');
  });
  it('unmaintained-advisory 8.2 on a buried package reads deprecated', () => {
    expect(epitaphOf('x', cls('DEAD', ['8.2']))).toBe('x, deprecated');
  });
  it('overgrown with days', () => {
    const days: ReasonFact[] = [{ field: 'daysSinceLastRelease', value: 900 }];
    expect(epitaphOf('old', cls('DEAD', ['8.3'], days))).toBe('old may be finished or abandoned, last release 900 days ago');
  });
  it('overgrown without a valid daysSinceLastRelease', () => {
    expect(epitaphOf('old', cls('DEAD', ['8.3']))).toBe('old may be finished or abandoned');
    const nul: ReasonFact[] = [{ field: 'daysSinceLastRelease', value: null }];
    expect(epitaphOf('old', cls('DEAD', ['8.3'], nul))).toBe('old may be finished or abandoned');
  });
  it('ghost and lantern', () => {
    expect(epitaphOf('g', cls('HAUNTED', ['7.2'], vuln))).toBe('g, 3 open vulnerabilities (HIGH)');
    expect(epitaphOf('g', cls('HAUNTED', ['7.2', '8.3'], vuln))).toBe('g, 3 open vulnerabilities (HIGH)');
    expect(epitaphOf('l', cls('ALIVE', ['11.2']))).toBe('l, no risk signals found');
  });
  it('restless ghost', () => {
    expect(epitaphOf('r', cls('HAUNTED', ['7.2', '8.1'], vuln))).toBe('r, 3 open vulnerabilities (HIGH), also archived');
    expect(epitaphOf('r', cls('HAUNTED', ['7.2', '8.2'], vuln))).toBe('r, 3 open vulnerabilities (HIGH), also deprecated');
    expect(epitaphOf('r', cls('HAUNTED', ['7.2', '8.1', '8.2'], vuln))).toBe(
      'r, 3 open vulnerabilities (HIGH), also archived and deprecated',
    );
  });
});

describe('glowOf (R7.7)', () => {
  it('uses the highest advisory severity first', () => {
    expect(glowOf(['LOW', null, 'CRITICAL'], ['LOW'])).toBe(4);
    expect(glowOf(['LOW'], ['CRITICAL'])).toBe(1);
  });
  it('falls back to facts.maxSeverity when advisories are null or empty', () => {
    expect(glowOf([null, null], ['HIGH', 'LOW'])).toBe(3);
    expect(glowOf([], ['LOW'])).toBe(1);
  });
  it('falls back to MEDIUM when nothing is known', () => {
    expect(glowOf([], [])).toBe(2);
    expect(glowOf([null], [null])).toBe(2);
  });
});
