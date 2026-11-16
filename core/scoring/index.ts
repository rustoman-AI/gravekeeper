// Scoring entry point: the three Risk_Score components and their sum.
import type { NormalizedFacts } from '../facts/normalize';
import { abandonmentPoints } from './abandonment';
import { maintainerPoints } from './maintainers';
import { vulnerabilityPoints } from './vulnerability';

export interface ScoreComponents {
  readonly vulnerability: number;
  readonly abandonment: number;
  readonly maintainer: number;
}

// Requirements 10.1, 10.9 (unknown facts contribute no points)
export const scoreComponents = (f: NormalizedFacts): ScoreComponents => ({
  vulnerability: vulnerabilityPoints(f),
  abandonment: abandonmentPoints(f),
  maintainer: maintainerPoints(f),
});

// Requirement 10.1: Risk_Score is the sum of the three components
export const computeScore = (f: NormalizedFacts): number => {
  const c = scoreComponents(f);
  return c.vulnerability + c.abandonment + c.maintainer;
};

export { abandonmentPoints, maintainerPoints, vulnerabilityPoints };
