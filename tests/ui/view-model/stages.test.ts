import { describe, expect, it } from 'vitest';
import { SCAN_STAGES } from '../../../view-model/constants';
import { stageAt, stageStates } from '../../../view-model/stages';

const LABELS = [
  'Reading the repository',
  'Checking the registries',
  'Consulting the vulnerability records',
  'Asking GitHub about the living',
];

describe('SCAN_STAGES (Requirement 4.1)', () => {
  it('has the four labels in order', () => {
    expect(SCAN_STAGES.map((s) => s.label)).toEqual(LABELS);
  });
});

describe('stageAt (Requirement 4.2)', () => {
  it.each([
    [0, 0],
    [1999, 0],
    [2000, 1],
    [5999, 1],
    [6000, 2],
    [9999, 2],
    [10000, 3],
    [100000, 3],
  ])('elapsed %i ms is stage %i', (elapsed, expected) => {
    expect(stageAt(elapsed)).toBe(expected);
  });
});

describe('stageStates (Requirement 4.3)', () => {
  const states = (ms: number) => stageStates(ms).map((s) => s.state);

  it('marks every stage waiting except the first at 0 ms', () => {
    expect(states(0)).toEqual(['in progress', 'waiting', 'waiting', 'waiting']);
  });

  it('marks earlier stages done, current in progress, later waiting', () => {
    expect(states(2000)).toEqual(['done', 'in progress', 'waiting', 'waiting']);
    expect(states(6000)).toEqual(['done', 'done', 'in progress', 'waiting']);
    expect(states(10000)).toEqual(['done', 'done', 'done', 'in progress']);
  });

  it('keeps the last stage in progress for long elapsed times', () => {
    expect(states(100000)).toEqual(['done', 'done', 'done', 'in progress']);
  });

  it('carries the labels in order', () => {
    expect(stageStates(0).map((s) => s.label)).toEqual(LABELS);
  });
});
