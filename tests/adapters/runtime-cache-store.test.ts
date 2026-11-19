import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { L2_TAG, RuntimeCacheStore } from '../../adapters/cache/runtime-cache-store';
import {
  CACHE_KEY_VERSION,
  L2_MAX_BODY_BYTES,
  L2_MAX_SCAN_BYTES,
  L2_OPERATION_TIMEOUT_MS,
} from '../../pipeline/constants';
import {
  INVALID_ENVELOPES,
  L2_OK,
  createCollectingLogger,
  createFakeL2,
  throwingGetCache,
  type L2Mode,
} from '../support/arbitraries/l2';
import { createFakeRuntime, runUntilSettled } from '../support/fake-runtime';

// Requirements 19.19, 19.23, 19.24, 19.25, 19.26, 19.28

const START = 1_000_000;
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const sha256Hex = (text: string): Promise<string> => Promise.resolve(sha(text));

function setup(modes: readonly L2Mode[] = [L2_OK]) {
  const runtime = createFakeRuntime(START);
  const l2 = createFakeL2(runtime, modes);
  const { logger, lines } = createCollectingLogger();
  const store = new RuntimeCacheStore({
    getCache: l2.getCache,
    sha256Hex,
    timer: runtime.timer,
    clock: runtime.clock,
    logger,
  });
  return { runtime, l2, lines, store };
}

const advanceBy = (runtime: ReturnType<typeof createFakeRuntime>, ms: number): void => {
  // Moves the fake clock by arming a timer and firing it.
  runtime.timer.setTimeout(() => undefined, ms);
  runtime.advanceToNextTimer();
};

describe('RuntimeCacheStore keys (R19.26)', () => {
  it('uses gravekeeper:v<version>:<kind>:<sha256 of the L1 key> for get and set', async () => {
    const { runtime, l2, store } = setup();
    await runUntilSettled(store.set('l1-key', { a: 1 }, 60, { l2Kind: 'osv-advisory' }), runtime);
    await runUntilSettled(store.get('l1-key', { l2Kind: 'osv-advisory' }), runtime);
    const expected = `gravekeeper:v${CACHE_KEY_VERSION}:osv-advisory:${sha('l1-key')}`;
    expect(l2.calls.map((c) => c.key)).toEqual([expected, expected]);
  });

  it('sets the ttl, the tag and the envelope', async () => {
    const { runtime, l2, store } = setup();
    await runUntilSettled(store.set('k', 'v', 90, { l2Kind: 'scan' }), runtime);
    const call = l2.calls[0];
    expect(call?.options?.ttl).toBe(90);
    expect(call?.options?.tags).toEqual([L2_TAG]);
    expect(call?.value).toEqual({ v: 1, storedAtMs: START, ttlSeconds: 90, value: 'v' });
  });

  it('keeps the key free of the L1 key text', async () => {
    const { runtime, l2, store } = setup();
    await runUntilSettled(store.get('Bearer secret-token', { l2Kind: 'crates-owners' }), runtime);
    expect(l2.calls[0]?.key).not.toContain('secret-token');
    expect(l2.calls[0]?.key.startsWith(`gravekeeper:v${CACHE_KEY_VERSION}:crates-owners:`)).toBe(true);
  });
});

describe('RuntimeCacheStore round trip (R19.23)', () => {
  it('returns a stored value with its original storage instant', async () => {
    const { runtime, store } = setup();
    await runUntilSettled(store.set('k', { x: [1, 2] }, 60, { l2Kind: 'scan' }), runtime);
    advanceBy(runtime, 5000);
    const entry = await runUntilSettled(store.get('k', { l2Kind: 'scan' }), runtime);
    expect(entry).toEqual({ value: { x: [1, 2] }, storedAtMs: START, ttlSeconds: 60 });
  });

  it('honours an explicit storedAtMs', async () => {
    const { runtime, store } = setup();
    await runUntilSettled(
      store.set('k', 1, 60, { l2Kind: 'scan', storedAtMs: START - 10_000 }),
      runtime,
    );
    const entry = await runUntilSettled(store.get('k', { l2Kind: 'scan' }), runtime);
    expect(entry?.storedAtMs).toBe(START - 10_000);
  });

  it('treats an expired entry as a miss without a log line', async () => {
    const { runtime, lines, store } = setup();
    await runUntilSettled(store.set('k', 1, 10, { l2Kind: 'scan' }), runtime);
    advanceBy(runtime, 10_000);
    expect(await runUntilSettled(store.get('k', { l2Kind: 'scan' }), runtime)).toBeNull();
    expect(lines).toHaveLength(0);
  });

  it('treats now < storedAtMs as a miss', async () => {
    const { runtime, store } = setup();
    await runUntilSettled(
      store.set('k', 1, 600, { l2Kind: 'scan', storedAtMs: START + 1 }),
      runtime,
    );
    expect(await runUntilSettled(store.get('k', { l2Kind: 'scan' }), runtime)).toBeNull();
  });

  it('treats an absent key as a miss without a log line', async () => {
    const { runtime, lines, store } = setup();
    expect(await runUntilSettled(store.get('nope', { l2Kind: 'scan' }), runtime)).toBeNull();
    expect(lines).toHaveLength(0);
  });

  it('does nothing for an entry without an L2 kind', async () => {
    const { runtime, l2, store } = setup();
    await runUntilSettled(store.set('k', 1, 60), runtime);
    await runUntilSettled(store.set('k', 1, 60, { l2Kind: null }), runtime);
    expect(await runUntilSettled(store.get('k'), runtime)).toBeNull();
    expect(l2.calls).toHaveLength(0);
    expect(l2.getCacheCalls()).toBe(0);
  });

  it('skips a set with a non-positive ttl', async () => {
    const { runtime, l2, store } = setup();
    await runUntilSettled(store.set('k', 1, 0, { l2Kind: 'scan' }), runtime);
    expect(l2.calls).toHaveLength(0);
  });

  it('returns a miss at once for an aborted signal', async () => {
    const { runtime, l2, store } = setup();
    const controller = new AbortController();
    controller.abort();
    const entry = await runUntilSettled(
      store.get('k', { l2Kind: 'scan', signal: controller.signal }),
      runtime,
    );
    expect(entry).toBeNull();
    expect(l2.calls).toHaveLength(0);
  });
});

describe('RuntimeCacheStore envelope validation (R19.25)', () => {
  it.each(INVALID_ENVELOPES.map((raw, i) => [i, raw] as const))(
    'invalid envelope #%i is a miss with one log line',
    async (index) => {
      const { runtime, lines, store } = setup([{ kind: 'invalid-envelope', index }]);
      expect(await runUntilSettled(store.get('k', { l2Kind: 'scan' }), runtime)).toBeNull();
      expect(lines).toEqual([
        { source: 'cache', status: null, durationMs: 0, code: 'l2-cache-error' },
      ]);
    },
  );
});

describe('RuntimeCacheStore failures (R19.25)', () => {
  const failing: ReadonlyArray<readonly [string, L2Mode]> = [
    ['throw', { kind: 'throw' }],
    ['paused', { kind: 'paused' }],
  ];

  it.each(failing)('a %s get is a miss with one log line', async (_name, mode) => {
    const { runtime, lines, store } = setup([mode]);
    expect(await runUntilSettled(store.get('k', { l2Kind: 'scan' }), runtime)).toBeNull();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ source: 'cache', status: null, code: 'l2-cache-error' });
  });

  it.each(failing)('a %s set is skipped with one log line and no throw', async (_name, mode) => {
    const { runtime, lines, l2, store } = setup([mode]);
    await runUntilSettled(store.set('k', 1, 60, { l2Kind: 'scan' }), runtime);
    expect(lines).toHaveLength(1);
    expect(l2.storage.size).toBe(0);
  });

  it('a throwing getCache is a miss and a skipped write with one line each', async () => {
    const runtime = createFakeRuntime(START);
    const { logger, lines } = createCollectingLogger();
    const store = new RuntimeCacheStore({
      getCache: throwingGetCache,
      sha256Hex,
      timer: runtime.timer,
      clock: runtime.clock,
      logger,
    });
    expect(await runUntilSettled(store.get('k', { l2Kind: 'scan' }), runtime)).toBeNull();
    await runUntilSettled(store.set('k', 1, 60, { l2Kind: 'scan' }), runtime);
    expect(lines).toHaveLength(2);
  });

  it('a throwing logger does not break the operation', async () => {
    const runtime = createFakeRuntime(START);
    const l2 = createFakeL2(runtime, [{ kind: 'throw' }]);
    const store = new RuntimeCacheStore({
      getCache: l2.getCache,
    sha256Hex,
      timer: runtime.timer,
      clock: runtime.clock,
      logger: {
        log() {
          throw new Error('log failed');
        },
      },
    });
    expect(await runUntilSettled(store.get('k', { l2Kind: 'scan' }), runtime)).toBeNull();
  });

  it('logs a failure once per operation across a mixed sequence', async () => {
    const { runtime, lines, store } = setup([
      { kind: 'throw' },
      { kind: 'ok' },
      { kind: 'paused' },
    ]);
    await runUntilSettled(store.get('a', { l2Kind: 'scan' }), runtime);
    await runUntilSettled(store.set('b', 1, 60, { l2Kind: 'scan' }), runtime);
    await runUntilSettled(store.set('c', 1, 60, { l2Kind: 'scan' }), runtime);
    expect(lines).toHaveLength(2);
  });
});

describe('RuntimeCacheStore timeout (R19.24, R19.25)', () => {
  it('a never-settling get times out at L2_OPERATION_TIMEOUT_MS', async () => {
    const { runtime, lines, store } = setup([{ kind: 'never' }]);
    const result = await runUntilSettled(store.get('k', { l2Kind: 'scan' }), runtime);
    expect(result).toBeNull();
    expect(runtime.clock() - START).toBe(L2_OPERATION_TIMEOUT_MS);
    expect(lines).toEqual([
      { source: 'cache', status: null, durationMs: L2_OPERATION_TIMEOUT_MS, code: 'l2-cache-error' },
    ]);
  });

  it('a never-settling set stops waiting at L2_OPERATION_TIMEOUT_MS', async () => {
    const { runtime, lines, store } = setup([{ kind: 'never' }]);
    await runUntilSettled(store.set('k', 1, 60, { l2Kind: 'scan' }), runtime);
    expect(runtime.clock() - START).toBe(L2_OPERATION_TIMEOUT_MS);
    expect(lines).toHaveLength(1);
  });

  it('a late get is a miss, and a late answer adds no second log line', async () => {
    const { runtime, lines, store } = setup([{ kind: 'late', ms: L2_OPERATION_TIMEOUT_MS + 200 }]);
    expect(await runUntilSettled(store.get('k', { l2Kind: 'scan' }), runtime)).toBeNull();
    while (runtime.advanceToNextTimer()) {
      // Let the late answer arrive.
    }
    await runtime.flush();
    expect(lines).toHaveLength(1);
  });

  it('an answer before the timeout is used and clears the timer', async () => {
    const { runtime, lines, store } = setup([
      { kind: 'ok' },
      { kind: 'late', ms: L2_OPERATION_TIMEOUT_MS - 1 },
    ]);
    await runUntilSettled(store.set('k', 7, 60, { l2Kind: 'scan' }), runtime);
    const entry = await runUntilSettled(store.get('k', { l2Kind: 'scan' }), runtime);
    expect(entry?.value).toBe(7);
    expect(lines).toHaveLength(0);
    expect(runtime.pendingTimers()).toBe(0);
  });

  it('an abort during a get is a miss without a log line', async () => {
    const { runtime, lines, store } = setup([{ kind: 'never' }]);
    const controller = new AbortController();
    const pending = store.get('k', { l2Kind: 'scan', signal: controller.signal });
    await runtime.flush();
    controller.abort();
    expect(await runUntilSettled(pending, runtime)).toBeNull();
    expect(lines).toHaveLength(0);
  });
});

describe('RuntimeCacheStore size limits (R19.28)', () => {
  // A string of n characters serializes to n + 2 bytes.
  const stringOfBytes = (bytes: number): string => 'a'.repeat(bytes - 2);

  it('writes a scan value of exactly L2_MAX_SCAN_BYTES', async () => {
    const { runtime, l2, store } = setup();
    await runUntilSettled(
      store.set('k', stringOfBytes(L2_MAX_SCAN_BYTES), 60, { l2Kind: 'scan' }),
      runtime,
    );
    expect(l2.calls).toHaveLength(1);
  });

  it('does not write a scan value one byte over L2_MAX_SCAN_BYTES, and logs nothing', async () => {
    const { runtime, l2, lines, store } = setup();
    await runUntilSettled(
      store.set('k', stringOfBytes(L2_MAX_SCAN_BYTES + 1), 60, { l2Kind: 'scan' }),
      runtime,
    );
    expect(l2.calls).toHaveLength(0);
    expect(lines).toHaveLength(0);
  });

  it.each(['osv-advisory', 'depsdev-advisory', 'crates-owners'] as const)(
    'limits a %s entry to L2_MAX_BODY_BYTES',
    async (kind) => {
      const { runtime, l2, store } = setup();
      await runUntilSettled(
        store.set('ok', stringOfBytes(L2_MAX_BODY_BYTES), 60, { l2Kind: kind }),
        runtime,
      );
      await runUntilSettled(
        store.set('big', stringOfBytes(L2_MAX_BODY_BYTES + 1), 60, { l2Kind: kind }),
        runtime,
      );
      expect(l2.calls).toHaveLength(1);
    },
  );

  it('counts bytes, not characters', async () => {
    const { runtime, l2, store } = setup();
    // Each "é" is 2 bytes in UTF-8, so this is over the body limit in bytes only.
    const value = 'é'.repeat(L2_MAX_BODY_BYTES / 2);
    await runUntilSettled(store.set('k', value, 60, { l2Kind: 'osv-advisory' }), runtime);
    expect(l2.calls).toHaveLength(0);
  });
});

describe('RuntimeCacheStore and getCache (R19.19)', () => {
  it('does not call getCache at construction', () => {
    const { l2 } = setup();
    expect(l2.getCacheCalls()).toBe(0);
  });

  it('calls getCache only inside an operation, once per operation', async () => {
    const { runtime, l2, store } = setup();
    await runUntilSettled(store.set('k', 1, 60, { l2Kind: 'scan' }), runtime);
    expect(l2.getCacheCalls()).toBe(1);
    await runUntilSettled(store.get('k', { l2Kind: 'scan' }), runtime);
    expect(l2.getCacheCalls()).toBe(2);
  });
  // The GRAVEKEEPER_RUNTIME_CACHE=off switch lives in the composition and the tiered store
  // (tasks 7.9, 9.13); "getCache is never called when L2 is off" is tested in 7.10 and 9.14.
});
