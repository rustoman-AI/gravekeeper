import type { RandomSource } from '../../pipeline/ports/runtime';

// Requirement 15.10
/** Random value in [0, 1). */
export const systemRandom: RandomSource = () => Math.random();
