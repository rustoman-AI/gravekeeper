// Requirement 16.5, 16.8, 16.12, 17.5, 17.8
import type { LogEntry, Logger, ReasonCategory, SourceName, SourceResult } from '../ports';
import type { WorkLedger } from './ledger';
import type { UnitOutcome } from './types';

type FailedResult = Extract<SourceResult, { readonly kind: 'failed' }>;

const DEADLINE_RESULT: FailedResult = {
  kind: 'failed',
  reason: 'deadline',
  status: null,
  headers: null,
};

/** Writes a log line and ignores a Logger that throws. */
export function safeLog(logger: Logger, entry: LogEntry): void {
  try {
    logger.log(entry);
  } catch {
    // A failing Logger never affects a scan.
  }
}

/**
 * Settles with `promise`, or with a `deadline` failure the moment `signal`
 * aborts, whichever comes first. A source that ignores the signal cannot hold
 * the scan past the deadline. A rejection (adapters never reject) becomes a
 * `network` failure so a bug cannot escape the unit.
 */
export function raceAbort<T>(
  promise: Promise<SourceResult<T>>,
  signal: AbortSignal,
): Promise<SourceResult<T> | FailedResult> {
  if (signal.aborted) return Promise.resolve(DEADLINE_RESULT);
  return new Promise((resolve) => {
    const onAbort = (): void => resolve(DEADLINE_RESULT);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve({ kind: 'failed', reason: 'network', status: null, headers: null });
      },
    );
  });
}

function outcomeOf(result: SourceResult): UnitOutcome {
  if (result.kind === 'failed') return { ok: false, reason: result.reason };
  // Design D5: a 2xx body that is not JSON is a failed unit.
  if (result.kind === 'unparsable') return { ok: false, reason: 'http-error' };
  return { ok: true };
}

export interface UnitRunner {
  /**
   * Runs one Work_Unit and records its outcome. With an aborted signal the
   * call is not made and `deadline` is recorded (R16.12). `ok` and `absent`
   * results are recorded as ok, `failed` with its reason, `unparsable` as
   * `http-error` (design D5).
   */
  runUnit<T>(
    source: SourceName,
    unitKey: string,
    call: () => Promise<SourceResult<T>>,
  ): Promise<SourceResult<T> | FailedResult>;
  /** Records an Applicable_Unit that was not sent. */
  skipUnit(source: SourceName, unitKey: string, reason: ReasonCategory): void;
}

/** Binds the unit helpers to one scan's ledger and Scan_Deadline_Signal. */
export function createUnitRunner(ledger: WorkLedger, signal: AbortSignal): UnitRunner {
  return {
    async runUnit<T>(
      source: SourceName,
      unitKey: string,
      call: () => Promise<SourceResult<T>>,
    ): Promise<SourceResult<T> | FailedResult> {
      if (signal.aborted) {
        ledger.record(source, unitKey, { ok: false, reason: 'deadline' });
        return DEADLINE_RESULT;
      }
      let pending: Promise<SourceResult<T>>;
      try {
        pending = call();
      } catch {
        pending = Promise.reject(new Error('call threw'));
      }
      const result = await raceAbort(pending, signal);
      ledger.record(source, unitKey, outcomeOf(result));
      return result;
    },
    skipUnit(source, unitKey, reason) {
      ledger.record(source, unitKey, { ok: false, reason });
    },
  };
}
