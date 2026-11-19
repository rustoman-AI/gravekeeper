import {
  CACHE_KEY_VERSION,
  L2_MAX_BODY_BYTES,
  L2_MAX_SCAN_BYTES,
  L2_OPERATION_TIMEOUT_MS,
} from '../../pipeline/constants';
import type { CacheEntry, CacheStore, JsonValue, L2EntryKind } from '../../pipeline/ports/cache';
import type { Clock, Logger, Timer } from '../../pipeline/ports/runtime';

// Requirements 19.19, 19.20, 19.23, 19.24, 19.25, 19.26, 19.28

/** The part of the `RuntimeCache` of `@vercel/functions` that this store uses. */
export interface RuntimeCacheLike {
  get(key: string): Promise<unknown | null>;
  set(
    key: string,
    value: unknown,
    options?: { name?: string; tags?: string[]; ttl?: number },
  ): Promise<void>;
}

export type GetRuntimeCache = () => RuntimeCacheLike;

export interface RuntimeCacheStoreDeps {
  readonly getCache: GetRuntimeCache;
  readonly timer: Timer;
  readonly clock: Clock;
  readonly logger: Logger;
  /** Hex SHA-256 of the L1 key. Defaults to Web Crypto; tests inject a synchronous-resolving one. */
  readonly sha256Hex?: (text: string) => Promise<string>;
}

export const L2_TAG = 'gravekeeper-v1';
const ENVELOPE_VERSION = 1;
const TIMED_OUT = Symbol('l2-timeout');

interface Envelope {
  readonly v: 1;
  readonly storedAtMs: number;
  readonly ttlSeconds: number;
  readonly value: JsonValue;
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 64) return false;
  if (value === null) return true;
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'object': {
      if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1));
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return false;
      return Object.values(value as Record<string, unknown>).every((item) =>
        isJsonValue(item, depth + 1),
      );
    }
    default:
      return false;
  }
}

function parseEnvelope(raw: unknown): Envelope | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  if (e.v !== ENVELOPE_VERSION) return null;
  if (typeof e.storedAtMs !== 'number' || !Number.isFinite(e.storedAtMs)) return null;
  if (typeof e.ttlSeconds !== 'number' || !Number.isFinite(e.ttlSeconds) || e.ttlSeconds <= 0) {
    return null;
  }
  if (!('value' in e) || !isJsonValue(e.value)) return null;
  return { v: 1, storedAtMs: e.storedAtMs, ttlSeconds: e.ttlSeconds, value: e.value };
}

async function defaultSha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function maxBytesFor(kind: L2EntryKind): number {
  return kind === 'scan' ? L2_MAX_SCAN_BYTES : L2_MAX_BODY_BYTES;
}

/** L2 Cache_Tier over the Vercel Runtime Cache. Never throws; every failure is a miss or a skipped write. */
export class RuntimeCacheStore implements CacheStore {
  constructor(private readonly deps: RuntimeCacheStoreDeps) {}

  private hash(text: string): Promise<string> {
    return (this.deps.sha256Hex ?? defaultSha256Hex)(text);
  }

  async get(
    key: string,
    options?: { readonly signal?: AbortSignal; readonly l2Kind?: L2EntryKind | null },
  ): Promise<CacheEntry | null> {
    const kind = options?.l2Kind;
    if (!kind) return null;
    const signal = options?.signal;
    if (signal?.aborted) return null;
    const startedAt = this.deps.clock();
    try {
      const raw = await this.bounded(async () => {
        const l2Key = `gravekeeper:v${CACHE_KEY_VERSION}:${kind}:${await this.hash(key)}`;
        return this.deps.getCache().get(l2Key);
      }, signal);
      if (raw === TIMED_OUT) {
        this.fail(startedAt);
        return null;
      }
      if (raw === null || raw === undefined) return null;
      const envelope = parseEnvelope(raw);
      if (envelope === null) {
        this.fail(startedAt);
        return null;
      }
      const age = this.deps.clock() - envelope.storedAtMs;
      if (age < 0 || age >= envelope.ttlSeconds * 1000) return null;
      return {
        value: envelope.value,
        storedAtMs: envelope.storedAtMs,
        ttlSeconds: envelope.ttlSeconds,
      };
    } catch {
      if (signal?.aborted) return null;
      this.fail(startedAt);
      return null;
    }
  }

  async set(
    key: string,
    value: JsonValue,
    ttlSeconds: number,
    options?: { readonly storedAtMs?: number; readonly l2Kind?: L2EntryKind | null },
  ): Promise<void> {
    const kind = options?.l2Kind;
    if (!kind) return;
    const startedAt = this.deps.clock();
    try {
      if (!(ttlSeconds > 0) || !Number.isFinite(ttlSeconds)) return;
      const envelope: Envelope = {
        v: 1,
        storedAtMs: options?.storedAtMs ?? startedAt,
        ttlSeconds,
        value,
      };
      // R19.28: the limit applies to the serialized entry value, not the envelope around it.
      const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
      if (bytes > maxBytesFor(kind)) return;
      const outcome = await this.bounded(async () => {
        const l2Key = `gravekeeper:v${CACHE_KEY_VERSION}:${kind}:${await this.hash(key)}`;
        await this.deps
          .getCache()
          .set(l2Key, envelope, { ttl: ttlSeconds, tags: [L2_TAG], name: '' });
        return null;
      });
      if (outcome === TIMED_OUT) this.fail(startedAt);
    } catch {
      this.fail(startedAt);
    }
  }

  /** Races `work` against L2_OPERATION_TIMEOUT_MS on the injected timer, and against `signal`. */
  private bounded<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T | typeof TIMED_OUT> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        this.deps.timer.clearTimeout(handle);
        signal?.removeEventListener('abort', onAbort);
        fn();
      };
      const onAbort = (): void => finish(() => reject(new Error('aborted')));
      const handle = this.deps.timer.setTimeout(
        () => finish(() => resolve(TIMED_OUT)),
        L2_OPERATION_TIMEOUT_MS,
      );
      signal?.addEventListener('abort', onAbort, { once: true });
      let promise: Promise<T>;
      try {
        promise = work();
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      promise.then(
        (v) => finish(() => resolve(v)),
        (e: unknown) => finish(() => reject(e)),
      );
    });
  }

  private fail(startedAt: number): void {
    try {
      this.deps.logger.log({
        source: 'cache',
        status: null,
        durationMs: Math.max(0, this.deps.clock() - startedAt),
        code: 'l2-cache-error',
      });
    } catch {
      // Logging must never break a scan.
    }
  }
}
