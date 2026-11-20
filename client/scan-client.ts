import { CLIENT_FETCH_TIMEOUT_MS, parseScanResponse } from '../view-model/index';
import type { ParseOutcome, ScanRequestBody } from '../view-model/index';

export interface ScanClientDeps {
  readonly fetchImpl: typeof fetch;
  readonly setTimer: (fn: () => void, ms: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
}

export type ScanClientOutcome = ParseOutcome | { readonly kind: 'aborted' };

const SCAN_PATH = '/api/scan';

const ABORTED: ScanClientOutcome = { kind: 'aborted' };
const TIMEOUT: ScanClientOutcome = { kind: 'failure', failure: { kind: 'timeout' } };
const NETWORK_FAILURE: ScanClientOutcome = { kind: 'failure', failure: { kind: 'network-failure' } };

/** Browser I/O for one scan request. Never throws; every path resolves to a ScanClientOutcome. */
export function createScanClient(deps: ScanClientDeps): {
  run(request: ScanRequestBody, signal: AbortSignal): Promise<ScanClientOutcome>;
} {
  const { fetchImpl, setTimer, clearTimer } = deps;

  function run(request: ScanRequestBody, signal: AbortSignal): Promise<ScanClientOutcome> {
    return new Promise<ScanClientOutcome>((resolve) => {
      let settled = false;
      let timedOut = false;
      let timerHandle: unknown;
      let timerStarted = false;
      const controller = new AbortController();

      const onCallerAbort = (): void => {
        controller.abort();
        finish(ABORTED);
      };

      function finish(outcome: ScanClientOutcome): void {
        if (settled) return;
        settled = true;
        if (timerStarted) {
          try {
            clearTimer(timerHandle);
          } catch {
            // a failing clearTimer must not break the never-throws contract
          }
        }
        try {
          signal.removeEventListener('abort', onCallerAbort);
        } catch {
          // ignore
        }
        resolve(outcome);
      }

      /** Maps a thrown error from fetch or the body read. */
      function failureOutcome(): ScanClientOutcome {
        if (signal.aborted) return ABORTED;
        if (timedOut) return TIMEOUT;
        return NETWORK_FAILURE;
      }

      try {
        if (signal.aborted) {
          finish(ABORTED);
          return;
        }
        signal.addEventListener('abort', onCallerAbort);
        timerHandle = setTimer(() => {
          if (settled) return;
          timedOut = true;
          controller.abort();
          finish(TIMEOUT);
        }, CLIENT_FETCH_TIMEOUT_MS);
        timerStarted = true;

        let fetched: Promise<Response>;
        try {
          fetched = fetchImpl(SCAN_PATH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            credentials: 'omit',
            cache: 'no-store',
            signal: controller.signal,
          });
        } catch {
          finish(failureOutcome());
          return;
        }

        fetched
          .then(async (response) => {
            if (settled) return;
            let body: unknown;
            try {
              body = await response.json();
            } catch {
              if (settled) return;
              if (signal.aborted || timedOut) {
                finish(failureOutcome());
                return;
              }
              // A body that is not JSON (or could not be read) goes to the parser as undefined.
              body = undefined;
            }
            if (settled) return;
            finish(parseScanResponse(response.status, response.headers, body));
          })
          .catch(() => {
            finish(failureOutcome());
          });
      } catch {
        finish(failureOutcome());
      }
    });
  }

  return { run };
}
