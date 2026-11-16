import { describe, expect, it } from 'vitest';
import { grade, gradeRank, repoGrade } from '../../../core/summarizer/grade';
import type { Grade } from '../../../core/model';

describe('grade (12.15)', () => {
  it.each<[number, Grade]>([
    [0, 'A'],
    [19, 'A'],
    [20, 'B'],
    [39, 'B'],
    [40, 'C'],
    [59, 'C'],
    [60, 'D'],
    [79, 'D'],
    [80, 'F'],
    [100, 'F'],
  ])('grade(%i) is %s', (score, expected) => {
    expect(grade(score)).toBe(expected);
  });
});

describe('repoGrade (12.15, 12.16)', () => {
  it('is null when nothing was assessed', () => {
    expect(repoGrade(null)).toBeNull();
  });

  it('equals grade(maxScore) on both sides of each threshold', () => {
    for (const s of [0, 19, 20, 39, 40, 59, 60, 79, 80, 100]) {
      expect(repoGrade(s)).toBe(grade(s));
    }
  });

  it('is D or F for any maxScore above 59', () => {
    for (let s = 60; s <= 100; s++) {
      expect(['D', 'F']).toContain(repoGrade(s));
    }
  });
});

describe('gradeRank (12.15)', () => {
  it('orders A < B < C < D < F', () => {
    const order: Grade[] = ['A', 'B', 'C', 'D', 'F'];
    for (let i = 1; i < order.length; i++) {
      expect(gradeRank(order[i - 1])).toBeLessThan(gradeRank(order[i]));
    }
  });
});
