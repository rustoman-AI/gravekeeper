'use client';

import { useEffect, useState } from 'react';

export interface UseElapsedOptions {
  /** Injected clock, milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Injected timer. Defaults to the global `setInterval`. */
  readonly setInterval?: (fn: () => void, ms: number) => unknown;
  /** Injected timer cancel. Defaults to the global `clearInterval`. */
  readonly clearInterval?: (handle: unknown) => void;
  /** Tick period in milliseconds. Default 250. */
  readonly tickMs?: number;
}

const DEFAULT_TICK_MS = 250;

/**
 * Milliseconds elapsed since `startedAtMs`, refreshed on a timer. A `startedAtMs` of 0 or less
 * (the interim scanning phase before the request has started) counts from the moment the
 * effect runs, so the elapsed time never starts huge. The result is never negative.
 */
export function useElapsed(startedAtMs: number, options: UseElapsedOptions = {}): number {
  const now = options.now ?? Date.now;
  const tickMs = options.tickMs ?? DEFAULT_TICK_MS;
  const setTimer = options.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearTimer =
    options.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const base = startedAtMs > 0 ? startedAtMs : now();
    const handle = setTimer(() => {
      setElapsed(Math.max(0, now() - base));
    }, tickMs);
    return () => {
      clearTimer(handle);
    };
    // The injected functions are read once per start; a new start time restarts the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAtMs, tickMs]);

  return elapsed;
}
