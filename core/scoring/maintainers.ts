// Maintainer_Component of the Risk_Score.
import type { NormalizedFacts } from '../facts/normalize';
import { MAINTAINER_POINTS_CAP, NO_MAINTAINER_POINTS, SINGLE_MAINTAINER_POINTS } from '../model/constants';

// Requirements 10.7, 10.8, 10.9 (unknown maintainerCount gives no points)
export const maintainerPoints = (f: NormalizedFacts): number => {
  const raw =
    f.maintainerCount === 0
      ? NO_MAINTAINER_POINTS
      : f.maintainerCount === 1
        ? SINGLE_MAINTAINER_POINTS
        : 0;
  return Math.min(MAINTAINER_POINTS_CAP, raw);
};
