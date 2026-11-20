'use client';

import { useCountdown } from './hooks/use-countdown';
import type { UseCountdownOptions } from './hooks/use-countdown';

export interface RetryButtonProps {
  label: string;
  cooldownSeconds: number;
  arrivedAtMs: number;
  onRetry: () => void;
  clock?: Pick<UseCountdownOptions, 'now' | 'setInterval' | 'clearInterval'>;
}

/** Deterministic text: "45 seconds", "1 minute 5 seconds". */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const sec = `${String(seconds)} ${seconds === 1 ? 'second' : 'seconds'}`;
  if (minutes === 0) return sec;
  const min = `${String(minutes)} ${minutes === 1 ? 'minute' : 'minutes'}`;
  return seconds === 0 ? min : `${min} ${sec}`;
}

/** Requirements 13.4 to 13.8: disabled until the cooldown ends; the end is announced once. */
export function RetryButton({ label, cooldownSeconds, arrivedAtMs, onRetry, clock }: RetryButtonProps) {
  const { remainingMs, ended, announce } = useCountdown({ cooldownSeconds, arrivedAtMs, ...clock });
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={!ended}
        onClick={onRetry}
        className="min-h-11 self-start rounded bg-amber px-5 font-semibold text-night hover:bg-bone disabled:opacity-60"
      >
        {label}
      </button>
      {ended ? null : <p className="text-bone-muted">You can try again in {formatCountdown(remainingMs)}</p>}
      <p role="status" aria-live="polite" className="sr-only">
        {announce ? 'You can try again now' : ''}
      </p>
    </div>
  );
}
