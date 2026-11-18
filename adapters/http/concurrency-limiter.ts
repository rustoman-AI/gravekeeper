import type { Clock, ConcurrencyLimiter, Timer } from '../../pipeline/ports/runtime';

// Requirement 15.3, 15.14, 15.16
export interface ConcurrencyLimiterRuntime {
  readonly clock: Clock;
  readonly timer: Timer;
}

interface Waiter {
  grant(): void;
}

/**
 * At most `limit` tasks run at once. Slots are granted in FIFO order. A slot wait or a spacing wait
 * that is aborted resolves `{ acquired: false }` without running the task. When `minIntervalMs` > 0,
 * any two task starts are at least `minIntervalMs` apart on the injected clock.
 */
export function createConcurrencyLimiter(
  limit: number,
  minIntervalMs: number,
  runtime: ConcurrencyLimiterRuntime,
): ConcurrencyLimiter {
  const { clock, timer } = runtime;
  const queue: Waiter[] = [];
  let active = 0;
  /** Earliest clock reading at which the next task may start. */
  let nextStartAt = Number.NEGATIVE_INFINITY;

  function acquireSlot(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    if (active < limit && queue.length === 0) {
      active += 1;
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      const onAbort = (): void => {
        const index = queue.indexOf(waiter);
        if (index >= 0) queue.splice(index, 1);
        resolve(false);
      };
      const waiter: Waiter = {
        grant: () => {
          signal.removeEventListener('abort', onAbort);
          active += 1;
          resolve(true);
        },
      };
      queue.push(waiter);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  function releaseSlot(): void {
    active -= 1;
    const next = queue.shift();
    if (next !== undefined) next.grant();
  }

  /** Reserves the next start time and waits for it. Returns false when aborted. */
  async function waitForSpacing(signal: AbortSignal): Promise<boolean> {
    if (minIntervalMs <= 0) return true;
    const now = clock();
    const startAt = Math.max(now, nextStartAt);
    const reservedNext = startAt + minIntervalMs;
    nextStartAt = reservedNext;
    const waitMs = startAt - now;
    if (waitMs <= 0) return !signal.aborted;
    const outcome = await timer.sleep(waitMs, signal);
    if (outcome === 'aborted') {
      // Give the reservation back when no later start has been scheduled behind it.
      if (nextStartAt === reservedNext) nextStartAt = startAt;
      return false;
    }
    return true;
  }

  return {
    async run<T>(task: () => Promise<T>, signal: AbortSignal) {
      if (!(await acquireSlot(signal))) return { acquired: false } as const;
      try {
        if (!(await waitForSpacing(signal))) return { acquired: false } as const;
        const value = await task();
        return { acquired: true, value } as const;
      } finally {
        releaseSlot();
      }
    },
  };
}
