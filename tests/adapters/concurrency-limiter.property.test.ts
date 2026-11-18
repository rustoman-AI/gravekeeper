import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { createConcurrencyLimiter } from '../../adapters/http/concurrency-limiter';
import { createFakeRuntime, runUntilSettled } from '../support/fake-runtime';
import { cfg } from '../support/fc-config';

interface TaskSpec {
  readonly durationMs: number;
  readonly fails: boolean;
  /** 'none': never aborted; 'pre': aborted before run; number: aborted at that delay after start. */
  readonly abort: 'none' | 'pre' | number;
}

const taskSpec: fc.Arbitrary<TaskSpec> = fc.record({
  durationMs: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 200 })),
  fails: fc.boolean(),
  abort: fc.oneof(
    { arbitrary: fc.constant('none' as const), weight: 4 },
    { arbitrary: fc.constant('pre' as const), weight: 1 },
    { arbitrary: fc.integer({ min: 0, max: 400 }), weight: 2 },
  ),
});

const scenario = fc.record({
  limit: fc.integer({ min: 1, max: 6 }),
  minIntervalMs: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 50 })),
  startMs: fc.integer({ min: 0, max: 1_000_000 }),
  tasks: fc.array(taskSpec, { minLength: 0, maxLength: 25 }),
});

// Feature: scan-pipeline, Property 45: The concurrency limiter respects its limit
// Validates: Requirements 15.14
describe('P45: The concurrency limiter respects its limit', () => {
  it('never runs more than the limit at once, runs every non-aborted task exactly once, and spaces starts', async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async ({ limit, minIntervalMs, startMs, tasks }) => {
        const rt = createFakeRuntime(startMs);
        const limiter = createConcurrencyLimiter(limit, minIntervalMs, rt);
        const runs = tasks.map(() => 0);
        const startTimes: number[] = [];
        let running = 0;
        let maxRunning = 0;

        const promises = tasks.map((spec, index) => {
          const controller = new AbortController();
          if (spec.abort === 'pre') controller.abort();
          else if (spec.abort !== 'none') {
            rt.timer.setTimeout(() => controller.abort(), spec.abort);
          }
          const result = limiter.run(async () => {
            runs[index] = (runs[index] ?? 0) + 1;
            startTimes.push(rt.clock());
            running += 1;
            maxRunning = Math.max(maxRunning, running);
            try {
              await rt.timer.sleep(spec.durationMs, new AbortController().signal);
              if (spec.fails) throw new Error('task failed');
              return index;
            } finally {
              running -= 1;
            }
          }, controller.signal);
          return result.then(
            (value) => ({ status: 'settled' as const, value }),
            () => ({ status: 'threw' as const }),
          );
        });

        const outcomes = await runUntilSettled(Promise.all(promises), rt);

        expect(maxRunning).toBeLessThanOrEqual(limit);
        expect(running).toBe(0);
        tasks.forEach((spec, index) => {
          const outcome = outcomes[index];
          const count = runs[index] ?? 0;
          expect(count).toBeLessThanOrEqual(1);
          if (spec.abort === 'none') {
            expect(count).toBe(1);
            if (spec.fails) expect(outcome?.status).toBe('threw');
            else expect(outcome).toEqual({ status: 'settled', value: { acquired: true, value: index } });
          } else if (spec.abort === 'pre') {
            expect(count).toBe(0);
            expect(outcome).toEqual({ status: 'settled', value: { acquired: false } });
          } else if (outcome?.status === 'settled' && outcome.value.acquired === false) {
            expect(count).toBe(0);
          } else {
            expect(count).toBe(1);
          }
        });
        if (minIntervalMs > 0) {
          for (let i = 1; i < startTimes.length; i += 1) {
            expect((startTimes[i] as number) - (startTimes[i - 1] as number)).toBeGreaterThanOrEqual(
              minIntervalMs,
            );
          }
        }
      }),
      cfg(),
    );
  });
});
