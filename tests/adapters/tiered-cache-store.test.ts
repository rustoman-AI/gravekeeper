import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { MemoryCacheStore } from '../../adapters/cache/memory-cache-store';
import { RuntimeCacheStore } from '../../adapters/cache/runtime-cache-store';
import { TieredCacheStore } from '../../adapters/cache/tiered-cache-store';
import type { L2EntryKind } from '../../pipeline/ports/cache';
import type { Deferrer } from '../../pipeline/ports/runtime';
import { createFakeL2, createCollectingLogger, type L2Mode } from '../support/arbitraries/l2';
import { createFakeRuntime, runUntilSettled } from '../support/fake-runtime';

// Requirements 19.20, 19.23, 19.24, 19.25

const START = 1_000_000;
const KEY = 'key-1';
const KINDS: readonly L2EntryKind[] = ['osv-advisory', 'depsdev-advisory', 'crates-owners', 'scan'];

function setup(modes?: readonly L2Mode[], l2Enabled = true) {
  const runtime = createFakeRuntime(START);
  const state = { now: START };
  const clock = (): number => state.now;
  const fake = createFakeL2(runtime, modes);
  const { logger } = createCollectingLogger();
  const l2 = new RuntimeCacheStore({ getCache: fake.getCache, sha256Hex: (t: string) => Promise.resolve(createHash('sha256').update(t).digest('hex')), timer: runtime.timer, clock, logger });
  const l1 = new MemoryCacheStore(clock);
  const deferred: Promise<unknown>[] = [];
  const deferrer: Deferrer = { defer: (work) => void deferred.push(work) };
  const tiered = new TieredCacheStore({ l1, l2: l2Enabled ? l2 : null, deferrer });
  return { runtime, state, fake, l1, l2, deferred, tiered };
}

describe('TieredCacheStore', () => {
  it('an L1 hit does not touch L2', async () => {
    const s = setup();
    await s.l1.set(KEY, { a: 1 }, 600);
    const hit = await s.tiered.get(KEY, { l2Kind: 'scan' });
    expect(hit?.value).toEqual({ a: 1 });
    expect(s.fake.getCacheCalls()).toBe(0);
    expect(s.fake.calls).toEqual([]);
  });

  it('promotes an L2 hit into L1 with the original lifetime', async () => {
    const s = setup();
    const storedAtMs = START - 100_000;
    await s.l2.set(KEY, { a: 2 }, 600, { storedAtMs, l2Kind: 'scan' });
    expect(s.fake.storage.size).toBe(1);

    const hit = await s.tiered.get(KEY, { l2Kind: 'scan' });
    expect(hit).toEqual({ value: { a: 2 }, storedAtMs, ttlSeconds: 600 });

    const promoted = await s.l1.get(KEY);
    expect(promoted).toEqual({ value: { a: 2 }, storedAtMs, ttlSeconds: 600 });

    // Expires exactly at storedAtMs + ttl, like the L2 entry.
    s.state.now = storedAtMs + 600_000 - 1;
    expect(await s.l1.get(KEY)).not.toBeNull();
    s.state.now = storedAtMs + 600_000;
    expect(await s.l1.get(KEY)).toBeNull();
  });

  it('a short lifetime in L2 is not extended in L1', async () => {
    const s = setup();
    await s.l2.set(KEY, 'v', 30, { storedAtMs: START, l2Kind: 'osv-advisory' });
    await s.tiered.get(KEY, { l2Kind: 'osv-advisory' });
    s.state.now = START + 30_000;
    expect(await s.l1.get(KEY)).toBeNull();
  });

  it('an L2 miss returns null', async () => {
    const s = setup();
    expect(await s.tiered.get(KEY, { l2Kind: 'scan' })).toBeNull();
    expect(s.fake.calls.map((c) => c.op)).toEqual(['get']);
  });

  it.each(KINDS)('reads and writes L2 for kind %s', async (kind) => {
    const s = setup();
    await s.tiered.set(KEY, { k: kind }, 600, { l2Kind: kind });
    expect(s.deferred).toHaveLength(1);
    await vi.waitFor(() => expect(s.fake.calls).toHaveLength(1));
    await runUntilSettled(s.deferred[0] as Promise<unknown>, s.runtime);
    expect(s.fake.storage.size).toBe(1);
    expect([...s.fake.storage.keys()][0]).toContain(`:${kind}:`);

    const fresh = new TieredCacheStore({
      l1: new MemoryCacheStore(() => s.state.now),
      l2: s.l2,
      deferrer: { defer: () => undefined },
    });
    const hit = await fresh.get(KEY, { l2Kind: kind });
    expect(hit?.value).toEqual({ k: kind });
  });

  it.each([null, undefined])('l2Kind %s never reads or writes L2', async (l2Kind) => {
    const s = setup();
    await s.tiered.set(KEY, 'v', 600, { l2Kind });
    expect(s.deferred).toHaveLength(0);
    expect((await s.tiered.get(KEY, { l2Kind }))?.value).toBe('v'); // L1
    expect(await s.tiered.get('other', { l2Kind })).toBeNull();
    expect(await s.tiered.get('other')).toBeNull();
    await s.tiered.set('x', 'v', 600);
    expect(s.fake.getCacheCalls()).toBe(0);
    expect(s.fake.calls).toEqual([]);
    expect(s.deferred).toHaveLength(0);
  });

  it('defers the L2 write and does not await it', async () => {
    const s = setup([{ kind: 'late', ms: 100 }]);
    const flags = { setResolved: false, l2Settled: false };
    await s.tiered.set(KEY, 'v', 600, { l2Kind: 'crates-owners' });
    flags.setResolved = true;
    expect(s.deferred).toHaveLength(1);
    await vi.waitFor(() => expect(s.fake.calls).toHaveLength(1));
    const work = (s.deferred[0] as Promise<unknown>).then(() => {
      flags.l2Settled = true;
    });
    await s.runtime.flush();
    expect(flags.setResolved).toBe(true);
    expect(flags.l2Settled).toBe(false);
    expect(s.fake.storage.size).toBe(0);
    // L1 has it already.
    expect((await s.l1.get(KEY))?.value).toBe('v');

    await runUntilSettled(work, s.runtime);
    expect(flags.l2Settled).toBe(true);
    expect(s.fake.storage.size).toBe(1);
  });

  it('a failing L2 write or a throwing Deferrer never fails set', async () => {
    const s = setup([{ kind: 'throw' }]);
    await s.tiered.set(KEY, 'v', 600, { l2Kind: 'scan' });
    await vi.waitFor(() => expect(s.fake.calls).toHaveLength(1));
    await expect(runUntilSettled(s.deferred[0] as Promise<unknown>, s.runtime)).resolves.toBe(
      undefined,
    );

    const throwing = new TieredCacheStore({
      l1: s.l1,
      l2: s.l2,
      deferrer: {
        defer: () => {
          throw new Error('no after()');
        },
      },
    });
    await expect(throwing.set('k2', 'v', 600, { l2Kind: 'scan' })).resolves.toBeUndefined();
  });

  it('an L2 read failure is a miss', async () => {
    const s = setup([{ kind: 'throw' }]);
    expect(await s.tiered.get(KEY, { l2Kind: 'scan' })).toBeNull();
  });

  it('with L2 off nothing reaches L2 and L1 still works', async () => {
    const s = setup(undefined, false);
    await s.tiered.set(KEY, 'v', 600, { l2Kind: 'scan' });
    expect((await s.tiered.get(KEY, { l2Kind: 'scan' }))?.value).toBe('v');
    expect(await s.tiered.get('missing', { l2Kind: 'osv-advisory' })).toBeNull();
    expect(s.deferred).toHaveLength(0);
    expect(s.fake.getCacheCalls()).toBe(0);
  });
});
