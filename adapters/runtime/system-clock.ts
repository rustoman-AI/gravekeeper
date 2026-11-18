import type { Clock } from '../../pipeline/ports/runtime';

// Requirement 15.10
/** The wall clock: epoch milliseconds. */
export const systemClock: Clock = () => Date.now();
