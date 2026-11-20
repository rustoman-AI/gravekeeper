'use client';

import { useEffect, useRef, useState } from 'react';
import { retryRemainingMs } from '@/view-model';

export interface UseCountdownOptions {
  /** Cooldown length in seconds; 0 means enabled at once. */
  readonly cooldownSeconds: number;
  /** Arrival time in milliseconds on the injected clock. 0 or less counts from mount. */
  readonly arrivedAtMs: number;
  readonly now?: () => number;
  readonly setInterval?: (fn: () => void, ms: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

export interface Countdown {
  readonly remainingMs: number;
  /** True once the countdown has run out. */
  readonly ended: boolean;
  /** True from the moment a running countdown ends; used for the single announcement. */
  readonly announce: boolean;
}

const TICK_MS = 1000;

/** A new cooldown or arrival time needs a fresh mount (key). Requirement 13.4: remaining time refreshed once per second; the end is flagged once. */
export function useCountdown(options: UseCountdownOptions): Countdown {
  const { cooldownSeconds, arrivedAtMs } = options;
  const now = options.now ?? Date.now;
  const setTimer = options.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearTimer =
    options.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
  const [remainingMs, setRemainingMs] = useState(() =>
    retryRemainingMs(cooldownSeconds, arrivedAtMs > 0 ? Math.max(0, now() - arrivedAtMs) : 0),
  );
  const [announce, setAnnounce] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false;
    const base = arrivedAtMs > 0 ? arrivedAtMs : now();
    if (retryRemainingMs(cooldownSeconds, Math.max(0, now() - base)) === 0) {
      doneRef.current = true;
      return undefined;
    }
    const handle = setTimer(() => {
      const left = retryRemainingMs(cooldownSeconds, Math.max(0, now() - base));
      setRemainingMs(left);
      if (left === 0 && !doneRef.current) {
        doneRef.current = true;
        clearTimer(handle);
        setAnnounce(true);
      }
    }, TICK_MS);
    return () => {
      clearTimer(handle);
    };
    // Injected functions are read once per start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooldownSeconds, arrivedAtMs]);

  return { remainingMs, ended: remainingMs === 0, announce };
}

