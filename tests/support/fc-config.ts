import type * as fc from 'fast-check';

export const cfg = (over: Partial<fc.Parameters<unknown>> = {}): fc.Parameters<unknown> => ({
  numRuns: Number(process.env.FC_NUM_RUNS ?? 100),
  ...(process.env.FC_SEED ? { seed: Number(process.env.FC_SEED) } : {}),
  ...(process.env.FC_PATH ? { path: process.env.FC_PATH } : {}),
  verbose: 1, // print shrunk counterexample, seed and path on failure
  ...over,
});
