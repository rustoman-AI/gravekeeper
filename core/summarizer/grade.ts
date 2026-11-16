import {
  GRADE_A_MAX,
  GRADE_B_MAX,
  GRADE_C_MAX,
  GRADE_D_MAX,
} from '../model';
import type { Grade } from '../model';

// Requirement 12.15: one threshold set on the risk score; the first of A, B, C, D
// whose maximum is at least the score wins, otherwise F.
export function grade(score: number): Grade {
  if (score <= GRADE_A_MAX) return 'A';
  if (score <= GRADE_B_MAX) return 'B';
  if (score <= GRADE_C_MAX) return 'C';
  if (score <= GRADE_D_MAX) return 'D';
  return 'F';
}

// Requirement 12.15, 12.16: the repo grade is the grade of the maximum score only
// (averageScore has no grade); null when nothing was assessed.
export function repoGrade(maxScore: number | null): Grade | null {
  return maxScore === null ? null : grade(maxScore);
}

const GRADE_RANK: Readonly<Record<Grade, number>> = { A: 0, B: 1, C: 2, D: 3, F: 4 };

// Requirement 12.15: rank of a grade, higher is worse (A = 0 ... F = 4).
export function gradeRank(g: Grade): number {
  return GRADE_RANK[g];
}
