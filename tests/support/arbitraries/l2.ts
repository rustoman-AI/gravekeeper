import * as fc from 'fast-check';
import type {
  GetRuntimeCache,
  RuntimeCacheLike,
} from '../../../adapters/cache/runtime-cache-store';
import { L2_OPERATION_TIMEOUT_MS } from '../../../pipeline/constants';
import type { LogEntry, Logger } from '../../../pipeline/ports/runtime';
import type { FakeRuntime } from '../fake-runtime';

// Requirement 19.25, 19.28: a fake Runtime Cache whose behaviour is chosen per call.

export type L2Mode =
  | { readonly kind: 'ok' }
  | { readonly kind: 'throw' }
  | { readonly kind: 'never' }
  | { readonly kind: 'late'; readonly ms: number }
  | { readonly kind: 'invalid-envelope'; readonly index: number }
  | { readonly kind: 'paused' };

export const L2_OK: L2Mode = { kind: 'ok' };

/** Values a `get` can return that are not a valid envelope. */
export const INVALID_ENVELOPES: readonly unknown[] = [
  'text',
  42,
  [],
  {},
  { v: 2, storedAtMs: 1, ttlSeconds: 10, value: 1 },
  { v: 1, storedAtMs: 'x', ttlSeconds: 10, value: 1 },
  { v: 1, storedAtMs: Number.NaN, ttlSeconds: 10, value: 1 },
  { v: 1, storedAtMs: 1, ttlSeconds: 0, value: 1 },
  { v: 1, storedAtMs: 1, ttlSeconds: -5, value: 1 },
  { v: 1, storedAtMs: 1, ttlSeconds: 10 },
  { v: 1, storedAtMs: 1, ttlSeconds: 10, value: undefined },
  { v: 1, storedAtMs: 1, ttlSeconds: 10, value: () => 1 },
  { v: 1, storedAtMs: 1, ttlSeconds: 10, value: new Date(0) },
];

export interface L2Call {
  readonly op: 'get' | 'set';
  readonly key: string;
  readonly value?: unknown;
  readonly options?: { name?: string; tags?: string[]; ttl?: number };
}

export interface FakeL2 {
  readonly getCache: GetRuntimeCache;
  readonly calls: L2Call[];
  /** Number of times `getCache()` was invoked. */
  readonly getCacheCalls: () => number;
  /** Entries stored by a `set` that was answered normally or late. */
  readonly storage: Map<string, unknown>;
}

/**
 * `modes` is applied per call in order (get and set share the sequence) and the last
 * mode repeats. A `set` with `invalid-envelope` behaves as `ok`.
 */
export function createFakeL2(runtime: FakeRuntime, modes: readonly L2Mode[] = [L2_OK]): FakeL2 {
  const calls: L2Call[] = [];
  const storage = new Map<string, unknown>();
  let getCacheCalls = 0;
  let callIndex = 0;

  const nextMode = (): L2Mode => {
    const mode = modes[Math.min(callIndex, modes.length - 1)] ?? L2_OK;
    callIndex += 1;
    return mode;
  };

  const later = <T>(ms: number, produce: () => T): Promise<T> =>
    new Promise<T>((resolve) => {
      runtime.timer.setTimeout(() => resolve(produce()), ms);
    });

  const cache: RuntimeCacheLike = {
    get(key) {
      calls.push({ op: 'get', key });
      const mode = nextMode();
      switch (mode.kind) {
        case 'ok':
          return Promise.resolve(storage.has(key) ? storage.get(key) : null);
        case 'throw':
          return Promise.reject(new Error('l2 get failed'));
        case 'paused':
          return Promise.reject(new Error('runtime cache paused'));
        case 'never':
          return new Promise<never>(() => undefined);
        case 'late':
          return later(mode.ms, () => (storage.has(key) ? storage.get(key) : null));
        case 'invalid-envelope':
          return Promise.resolve(INVALID_ENVELOPES[mode.index % INVALID_ENVELOPES.length]);
      }
    },
    set(key, value, options) {
      calls.push({ op: 'set', key, value, options });
      const mode = nextMode();
      switch (mode.kind) {
        case 'ok':
        case 'invalid-envelope':
          storage.set(key, value);
          return Promise.resolve();
        case 'throw':
          return Promise.reject(new Error('l2 set failed'));
        case 'paused':
          return Promise.reject(new Error('runtime cache paused'));
        case 'never':
          return new Promise<void>(() => undefined);
        case 'late':
          return later(mode.ms, () => {
            storage.set(key, value);
          });
      }
    },
  };

  return {
    getCache: () => {
      getCacheCalls += 1;
      return cache;
    },
    calls,
    getCacheCalls: () => getCacheCalls,
    storage,
  };
}

/** A `getCache` that throws (the platform module is unavailable). */
export const throwingGetCache: GetRuntimeCache = () => {
  throw new Error('getCache unavailable');
};

export function createCollectingLogger(): { readonly logger: Logger; readonly lines: LogEntry[] } {
  const lines: LogEntry[] = [];
  return {
    lines,
    logger: {
      log(entry) {
        lines.push(entry);
      },
    },
  };
}

/**
 * True for modes that make a `get` fail (a miss plus one log line). For a `set`,
 * `invalid-envelope` is answered normally, so it does not fail.
 */
export function isFailingMode(mode: L2Mode): boolean {
  return mode.kind !== 'ok' && !(mode.kind === 'late' && mode.ms < L2_OPERATION_TIMEOUT_MS);
}

export const arbL2Mode: fc.Arbitrary<L2Mode> = fc.oneof(
  fc.constant<L2Mode>({ kind: 'ok' }),
  fc.constant<L2Mode>({ kind: 'throw' }),
  fc.constant<L2Mode>({ kind: 'never' }),
  fc.constant<L2Mode>({ kind: 'paused' }),
  fc
    .integer({ min: L2_OPERATION_TIMEOUT_MS + 1, max: L2_OPERATION_TIMEOUT_MS + 5000 })
    .map<L2Mode>((ms) => ({ kind: 'late', ms })),
  fc
    .nat({ max: INVALID_ENVELOPES.length - 1 })
    .map<L2Mode>((index) => ({ kind: 'invalid-envelope', index })),
);

/** Modes that always fail: every operation is a miss or a skipped write. */
export const arbFailingL2Mode: fc.Arbitrary<L2Mode> = arbL2Mode.filter(isFailingMode);

export const arbL2Modes: fc.Arbitrary<L2Mode[]> = fc.array(arbL2Mode, {
  minLength: 1,
  maxLength: 12,
});
