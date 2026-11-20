import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createScanClient } from '../../client/scan-client';
import type { ScanClientOutcome } from '../../client/scan-client';
import { buildRequestBody, canonicalRepoUrl } from '../../view-model/index';
import type {
  CacheStatus,
  ParsedScanResult,
  ParseOutcome,
  ScanRequestBody,
  UrlState,
} from '../../view-model/index';

/** The injected client. `createScanClient(deps)` returns one. */
export interface ScanRunner {
  run(request: ScanRequestBody, signal: AbortSignal): Promise<ScanClientOutcome>;
}

export type FailedOutcome = Extract<ParseOutcome, { kind: 'error' | 'failure' }>;

export type ScanSession =
  | { readonly phase: 'idle' }
  | { readonly phase: 'scanning'; readonly requestKey: string; readonly startedAtMs: number }
  | {
      readonly phase: 'result';
      readonly requestKey: string;
      readonly canonicalKey: string;
      readonly result: ParsedScanResult;
      readonly cache: CacheStatus;
    }
  | {
      readonly phase: 'failed';
      readonly requestKey: string;
      readonly outcome: FailedOutcome;
      readonly arrivedAtMs: number;
    };

export type ScanAction =
  | { readonly type: 'start'; readonly requestKey: string; readonly nowMs: number }
  | {
      readonly type: 'finish';
      readonly requestKey: string;
      readonly outcome: ParseOutcome;
      readonly canonicalKey: string | null;
      readonly nowMs: number;
    }
  | { readonly type: 'reset' };

export const IDLE_SESSION: ScanSession = { phase: 'idle' };

/** D3: request identity. */
export function requestKeyOf(state: Pick<UrlState, 'repo' | 'manifests'>): string {
  return JSON.stringify([state.repo, state.manifests]);
}

/** D3: key of the same request after `repo` is replaced by the canonical repository URL. */
export function canonicalKeyOf(result: ParsedScanResult, manifests: readonly string[]): string {
  return JSON.stringify([canonicalRepoUrl(result.repo), manifests]);
}

export function scanReducer(session: ScanSession, action: ScanAction): ScanSession {
  switch (action.type) {
    case 'start':
      if (session.phase === 'scanning' && session.requestKey === action.requestKey) return session;
      return { phase: 'scanning', requestKey: action.requestKey, startedAtMs: action.nowMs };
    case 'finish': {
      // A result for any request other than the one in flight is ignored.
      if (session.phase !== 'scanning' || session.requestKey !== action.requestKey) return session;
      const { outcome } = action;
      if (outcome.kind === 'result') {
        return {
          phase: 'result',
          requestKey: action.requestKey,
          canonicalKey: action.canonicalKey ?? action.requestKey,
          result: outcome.result,
          cache: outcome.cache,
        };
      }
      return {
        phase: 'failed',
        requestKey: action.requestKey,
        outcome,
        arrivedAtMs: action.nowMs,
      };
    }
    case 'reset':
      return IDLE_SESSION;
  }
}

/** Production client: the browser's fetch and timers. Built per call so SSR never touches `window`. */
export const defaultScanClient: ScanRunner = {
  run(request, signal) {
    return createScanClient({
      fetchImpl: (input, init) => fetch(input, init),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    }).run(request, signal);
  },
};

export interface UseScanOptions {
  readonly client?: ScanRunner;
  readonly now?: () => number;
  /** Called with the canonical repo URL state after a result, to replace the URL without a rescan. */
  readonly onCanonical?: (canonicalRepo: string) => void;
}

export interface UseScanApi {
  readonly session: ScanSession;
  /** Sends the current request again (Retry, rescan). */
  rescan(): void;
}

interface Held {
  readonly requestKey: string;
  readonly canonicalKey: string;
}

/**
 * Runs one scan per request key. The effect aborts its request on cleanup. A result for an
 * aborted or superseded request is ignored. Sending is deferred by one microtask, so the
 * StrictMode mount/cleanup/mount sequence sends exactly one request.
 */
export function useScan(urlState: UrlState, options: UseScanOptions = {}): UseScanApi {
  const client = options.client ?? defaultScanClient;
  const now = options.now ?? Date.now;
  const onCanonical = options.onCanonical;

  const [session, dispatch] = useReducer(scanReducer, IDLE_SESSION);
  const [attempt, setAttempt] = useState(0);
  const held = useRef<Held | null>(null);
  const clientRef = useRef(client);
  const nowRef = useRef(now);
  const canonicalRef = useRef(onCanonical);
  useEffect(() => {
    clientRef.current = client;
    nowRef.current = now;
    canonicalRef.current = onCanonical;
  });

  const { repo, manifests } = urlState;
  const key = repo === null ? null : requestKeyOf({ repo, manifests });

  useEffect(() => {
    if (key === null || repo === null) {
      held.current = null;
      dispatch({ type: 'reset' });
      return undefined;
    }
    const current = held.current;
    if (current !== null && (current.requestKey === key || current.canonicalKey === key)) {
      return undefined; // the held result already answers this URL (Requirement 3.4)
    }
    held.current = null;

    const controller = new AbortController();
    let cancelled = false;
    dispatch({ type: 'start', requestKey: key, nowMs: nowRef.current() });

    queueMicrotask(() => {
      if (cancelled) return;
      const request = buildRequestBody({ repo, manifests, view: 'scene' });
      void clientRef.current.run(request, controller.signal).then((outcome) => {
        if (cancelled || controller.signal.aborted || outcome.kind === 'aborted') return;
        const canonicalKey =
          outcome.kind === 'result' ? canonicalKeyOf(outcome.result, manifests) : null;
        if (outcome.kind === 'result' && canonicalKey !== null) {
          held.current = { requestKey: key, canonicalKey };
        }
        dispatch({
          type: 'finish',
          requestKey: key,
          outcome,
          canonicalKey,
          nowMs: nowRef.current(),
        });
        if (outcome.kind === 'result') canonicalRef.current?.(canonicalRepoUrl(outcome.result.repo));
      });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `repo` and `manifests` are encoded in `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const rescan = useCallback(() => {
    held.current = null;
    setAttempt((n) => n + 1);
  }, []);

  // Derived while the effect has not yet started the request for the current key.
  let visible: ScanSession;
  if (key === null) {
    visible = IDLE_SESSION;
  } else if (
    session.phase !== 'idle' &&
    (session.requestKey === key || (session.phase === 'result' && session.canonicalKey === key))
  ) {
    visible = session;
  } else {
    visible = { phase: 'scanning', requestKey: key, startedAtMs: 0 };
  }
  return { session: visible, rescan };
}
