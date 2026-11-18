import type { Clock, RandomSource, Timer, TimerHandle } from '../../pipeline/ports/runtime';

// Requirement 15.10, 19.10, 23.1

export interface FakeRuntime {
  readonly clock: Clock;
  readonly timer: Timer;
  readonly random: RandomSource;
  /** Moves the clock to the earliest pending timer and runs its callback. False when none is pending. */
  advanceToNextTimer(): boolean;
  /** Lets pending promise continuations run (a few `setImmediate` turns, no real waiting). */
  flush(): Promise<void>;
  /** Number of timers not yet fired or cleared. */
  pendingTimers(): number;
}

interface TimerEntry {
  readonly seq: number;
  readonly dueMs: number;
  readonly callback: () => void;
}

const FLUSH_TURNS = 5;

/**
 * Deterministic runtime. `randomValues` is cycled in order; every value must be in [0, 1).
 * Without values the random source returns 0.
 */
export function createFakeRuntime(
  startMs: number,
  randomValues: readonly number[] = [],
): FakeRuntime {
  let nowMs = startMs;
  let nextSeq = 0;
  let randomIndex = 0;
  const timers = new Map<number, TimerEntry>();

  const clock: Clock = () => nowMs;

  const random: RandomSource = () => {
    if (randomValues.length === 0) return 0;
    const value = randomValues[randomIndex % randomValues.length] as number;
    randomIndex += 1;
    return value;
  };

  const setTimeout = (callback: () => void, ms: number): TimerHandle => {
    const seq = nextSeq;
    nextSeq += 1;
    const delay = Number.isFinite(ms) && ms > 0 ? ms : 0;
    timers.set(seq, { seq, dueMs: nowMs + delay, callback });
    return { id: seq };
  };

  const clearTimeout = (handle: TimerHandle): void => {
    if (typeof handle.id === 'number') timers.delete(handle.id);
  };

  const sleep = (ms: number, signal: AbortSignal): Promise<'elapsed' | 'aborted'> => {
    if (signal.aborted) return Promise.resolve('aborted');
    return new Promise<'elapsed' | 'aborted'>((resolve) => {
      const onAbort = (): void => {
        clearTimeout(handle);
        resolve('aborted');
      };
      const handle = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve('elapsed');
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  };

  const advanceToNextTimer = (): boolean => {
    let next: TimerEntry | undefined;
    for (const entry of timers.values()) {
      if (
        next === undefined ||
        entry.dueMs < next.dueMs ||
        (entry.dueMs === next.dueMs && entry.seq < next.seq)
      ) {
        next = entry;
      }
    }
    if (next === undefined) return false;
    timers.delete(next.seq);
    if (next.dueMs > nowMs) nowMs = next.dueMs;
    next.callback();
    return true;
  };

  const flush = async (): Promise<void> => {
    for (let i = 0; i < FLUSH_TURNS; i += 1) {
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
  };

  return {
    clock,
    timer: { setTimeout, clearTimeout, sleep },
    random,
    advanceToNextTimer,
    flush,
    pendingTimers: () => timers.size,
  };
}

/**
 * Drives the runtime until the promise settles. Rejects with `stuck` when the promise
 * is unsettled and no timer is pending.
 */
export async function runUntilSettled<T>(promise: Promise<T>, runtime: FakeRuntime): Promise<T> {
  const state = { done: false };
  const tracked = promise.then(
    (value) => {
      state.done = true;
      return value;
    },
    (error: unknown) => {
      state.done = true;
      throw error;
    },
  );
  // Avoid an unhandled rejection report while the loop is still running.
  tracked.catch(() => undefined);
  for (;;) {
    await runtime.flush();
    if (state.done) return tracked;
    if (runtime.pendingTimers() === 0) throw new Error('stuck');
    runtime.advanceToNextTimer();
  }
}
