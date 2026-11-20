'use client';

import { SCAN_SLOW_NOTICE_MS, stageAt, stageStates } from '../view-model/index';
import { useElapsed } from './hooks/use-elapsed';
import type { UseElapsedOptions } from './hooks/use-elapsed';
import { useReducedMotion } from './hooks/use-reduced-motion';
import { StageList } from './stage-list';

export interface ScanningScreenProps {
  /** Scan start time from the session; 0 or less counts from mount. */
  readonly startedAtMs: number;
  readonly repoLabel?: string;
  readonly onCancel: () => void;
  /** Injected clock and timer, for tests. */
  readonly now?: UseElapsedOptions['now'];
  readonly setInterval?: UseElapsedOptions['setInterval'];
  readonly clearInterval?: UseElapsedOptions['clearInterval'];
  /** Overrides the media query when given. */
  readonly reducedMotion?: boolean;
}

/** Requirement 4: the scanning screen. No percentage, no numeric progress, no remaining time. */
export function ScanningScreen({
  startedAtMs,
  repoLabel,
  onCancel,
  now,
  setInterval,
  clearInterval,
  reducedMotion,
}: ScanningScreenProps) {
  const preferred = useReducedMotion();
  const still = reducedMotion ?? preferred;
  const elapsed = useElapsed(startedAtMs, { now, setInterval, clearInterval });
  const stages = stageStates(elapsed);
  const current = stages[stageAt(elapsed)];
  const slow = elapsed >= SCAN_SLOW_NOTICE_MS;

  return (
    <section
      aria-labelledby="scanning-heading"
      className="gk-scanning relative mx-auto max-w-2xl overflow-hidden p-6"
    >
      <button
        type="button"
        onClick={onCancel}
        className="relative z-10 rounded border border-bone-muted px-4 py-2 text-bone"
      >
        Cancel
      </button>
      {still ? null : (
        <div aria-hidden="true" className="gk-scanning-decor">
          <div className="gk-scanning-fog" />
          <div className="gk-scanning-lantern" />
        </div>
      )}
      <div className="relative z-10 mt-6 space-y-4">
        <h1 id="scanning-heading" className="text-2xl text-bone">
          The caretaker is scanning
          {repoLabel ? <span className="block text-lg text-bone-muted">{repoLabel}</span> : null}
        </h1>
        <StageList stages={stages} />
        <p className="text-bone-muted">
          The stages are approximate because the sources are queried in parallel.
        </p>
        {slow ? (
          <p className="text-amber">Large repositories can take up to 25 seconds.</p>
        ) : null}
        <p role="status" aria-live="polite" className="sr-only">
          {current?.label ?? ''}
        </p>
      </div>
    </section>
  );
}
