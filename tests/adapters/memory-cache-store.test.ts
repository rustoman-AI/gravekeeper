import { describe, expect, it } from 'vitest';
import { MemoryCacheStore } from '../../adapters/cache/memory-cache-store';

function makeClock(start = 1_000_000) {
  let now = start;
  return {
    clock: () => now,
    set: (v: number) => {
      now = v;
    },
    advance: (d: number) => {
      now += d;
    },
  };
}

describe('MemoryCacheStore', () => {
  it('serves an entry at age ttl*1000-1 and expires it at ttl*1000', async () => {
    const c = makeClock();
    const store = new MemoryCacheStore(c.clock);
    await store.set('k', { a: 1 }, 10);
    c.advance(10_000 - 1);
    expect(await store.get('k')).toEqual({ value: { a: 1 }, storedAtMs: 1_000_000 });
    c.advance(1);
    expect(await store.get('k')).toBeNull();
    expect(store.size()).toBe(0);
  });

  it('treats an entry as expired when the clock moves backwards', async () => {
    const c = makeClock();
    const store = new MemoryCacheStore(c.clock);
    await store.set('k', 'v', 100);
    c.set(1_000_000 - 1);
    expect(await store.get('k')).toBeNull();
    expect(store.size()).toBe(0);
  });

  it('evicts the least recently used entry, where get refreshes recency', async () => {
    const c = makeClock();
    const store = new MemoryCacheStore(c.clock, 2);
    await store.set('a', 1, 100);
    await store.set('b', 2, 100);
    await store.get('a');
    await store.set('c', 3, 100);
    expect(await store.get('b')).toBeNull();
    expect((await store.get('a'))?.value).toBe(1);
    expect((await store.get('c'))?.value).toBe(3);
    expect(store.size()).toBe(2);
  });

  it('replacing a key restarts its lifetime and does not evict others', async () => {
    const c = makeClock();
    const store = new MemoryCacheStore(c.clock, 2);
    await store.set('a', 1, 10);
    await store.set('b', 2, 100);
    c.advance(9_000);
    await store.set('a', 3, 10);
    c.advance(9_000);
    expect(await store.get('a')).toEqual({ value: 3, storedAtMs: 1_009_000 });
    expect((await store.get('b'))?.value).toBe(2);
    c.advance(1_000);
    expect(await store.get('a')).toBeNull();
  });

  it('keeps a passed storedAtMs and computes age from it', async () => {
    const c = makeClock();
    const store = new MemoryCacheStore(c.clock);
    await store.set('k', 'v', 10, { storedAtMs: 1_000_000 - 9_000 });
    expect(await store.get('k')).toEqual({ value: 'v', storedAtMs: 991_000 });
    c.advance(1_000);
    expect(await store.get('k')).toBeNull();
  });

  it('separate instances share no state', async () => {
    // The composition-level Upstream_Cache/Scan_Cache check belongs to task 9.14.
    const c = makeClock();
    const upstream = new MemoryCacheStore(c.clock);
    const scan = new MemoryCacheStore(c.clock);
    await upstream.set('k', 'u', 100);
    expect(await scan.get('k')).toBeNull();
    expect(scan.size()).toBe(0);
    await scan.set('k', 's', 100);
    expect((await upstream.get('k'))?.value).toBe('u');
    expect(upstream.size()).toBe(1);
  });
});
