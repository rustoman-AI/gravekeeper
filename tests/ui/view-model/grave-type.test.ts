import { describe, expect, it } from 'vitest';
import type { Classification, ReasonFact, RuleId, Status } from '../../../core';
import { graveTypeOf, plotKindOf, statusWordOf } from '../../../view-model/grave-type';

export function cls(status: Status, ruleIds: readonly RuleId[], facts: readonly ReasonFact[] = []): Classification {
  return {
    status,
    score: 50,
    reasons: ruleIds.map((ruleId) => ({ ruleId, message: 'm', facts })),
    vulnerable: false,
    abandoned: false,
    dormant: false,
  };
}

describe('graveTypeOf (R7.15, R7.16)', () => {
  it('DEAD with 8.1 or 8.2 is buried', () => {
    expect(graveTypeOf(cls('DEAD', ['8.1']))).toBe('buried');
    expect(graveTypeOf(cls('DEAD', ['8.2']))).toBe('buried');
    expect(graveTypeOf(cls('DEAD', ['8.3', '8.2']))).toBe('buried');
  });
  it('DEAD with only 8.3, or none of 8.1/8.2/8.3, is forgotten', () => {
    expect(graveTypeOf(cls('DEAD', ['8.3']))).toBe('forgotten');
    expect(graveTypeOf(cls('DEAD', ['10.7']))).toBe('forgotten');
    expect(graveTypeOf(cls('DEAD', []))).toBe('forgotten');
  });
  it('HAUNTED, ALIVE and null have no grave type', () => {
    expect(graveTypeOf(cls('HAUNTED', ['7.2', '8.1']))).toBeNull();
    expect(graveTypeOf(cls('ALIVE', ['11.2']))).toBeNull();
    expect(graveTypeOf(null)).toBeNull();
  });
});

describe('plotKindOf (R7.2, R7.20)', () => {
  it('maps every status', () => {
    expect(plotKindOf(cls('DEAD', ['8.1']))).toBe('tombstone');
    expect(plotKindOf(cls('DEAD', ['8.3']))).toBe('overgrown');
    expect(plotKindOf(cls('HAUNTED', ['7.2']))).toBe('ghost');
    expect(plotKindOf(cls('ALIVE', ['11.2']))).toBe('lantern');
    expect(plotKindOf(null)).toBe('unmarked');
  });
  it('HAUNTED with 8.1 only, 8.2 only, or both is restless; 8.3 only stays a ghost', () => {
    expect(plotKindOf(cls('HAUNTED', ['7.2', '8.1']))).toBe('restless');
    expect(plotKindOf(cls('HAUNTED', ['7.2', '8.2']))).toBe('restless');
    expect(plotKindOf(cls('HAUNTED', ['7.2', '8.1', '8.2']))).toBe('restless');
    expect(plotKindOf(cls('HAUNTED', ['7.2', '8.3']))).toBe('ghost');
  });
  it('an unmaintained-advisory 8.2 on a DEAD package is a tombstone', () => {
    expect(plotKindOf(cls('DEAD', ['8.2']))).toBe('tombstone');
  });
});

describe('statusWordOf (R7.6)', () => {
  it('gives the six status words', () => {
    expect(statusWordOf('tombstone')).toBe('dead, buried');
    expect(statusWordOf('overgrown')).toBe('dead, forgotten');
    expect(statusWordOf('ghost')).toBe('haunted');
    expect(statusWordOf('restless')).toBe('haunted, buried');
    expect(statusWordOf('lantern')).toBe('alive');
    expect(statusWordOf('unmarked')).toBe('not assessed');
  });
});
