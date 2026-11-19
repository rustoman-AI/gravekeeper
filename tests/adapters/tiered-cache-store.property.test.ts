import { createHash } from 'node:crypto';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MemoryCacheStore } from '../../adapters/cache/memory-cache-store';
import { RuntimeCacheStore } from '../../adapters/cache/runtime-cache-store';
import { TieredCacheStore } from '../../adapters/cache/tiered-cache-store';
import { L2_MAX_BODY_BYTES, L2_MAX_SCAN_BYTES } from '../../pipeline/constants';
import type { CacheEntry, JsonValue, L2EntryKind } from '../../pipeline/ports/cache';
import { L2_OK, arbL2Modes, createCollectingLogger, createFakeL2, type L2Mode } from '../support/arbitraries/l2';
import { cfg } from '../support/fc-config';
import { createFakeRuntime, runUntilSettled, type FakeRuntime } from '../support/fake-runtime';

// Requirement 19.11 (Property 67)

const START = 1_000_000;
const sha256Hex = (text: string): Promise<string> =>
  Promise.resolve(createHash('sha256').update(text).digest('hex'));

/** Each key has one fixed L2 kind (null: L1 only). */
const KEY_KIND: Readonly<Record<string, L2EntryKind | null>> = {
  a: 'scan',
  b: 'scan',
  c: 'osv-advisory',
  d: 'osv-advisory',
  e: null,
  f: null,
};
const KEYS = Object.keys(KEY_KIND);
const limitOf = (kind: L2EntryKind | null): number =>
  kind === 'scan' ? L2_MAX_SCAN_BYTES : L2_MAX_BODY_BYTES;
const BIG: Readonly<Record<string, string>> = {
  scan: 'x'.repeat(L2_MAX_SCAN_BYTES + 1),
  body: 'x'.repeat(L2_MAX_BODY_BYTES + 1),
};

type Op =
  | { readonly kind: 'put'; readonly key: string; readonly n: number; readonly ttl: number; readonly big: boolean }
  | { readonly kind: 'get'; readonly key: string }
  | { readonly kind: 'advance'; readonly ms: number }
  | { readonly kind: 'reset' };

const arbKey = fc.constantFrom(...KEYS);
const arbOp: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant('put' as const),
      key: arbKey,
      n: fc.integer({ min: 0, max: 1000 }),
      ttl: fc.constantFrom(1, 2, 5, 60),
      big: fc.oneof({ weight: 6, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
    }),
  },
  { weight: 6, arbitrary: fc.record({ kind: fc.constant('get' as const), key: arbKey }) },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('advance' as const),
      ms: fc.oneof(fc.integer({ min: 1, max: 70_000 }), fc.constantFrom(999, 1000, 1001, 2000, 5000)),
    }),
  },
  { weight: 2, arbitrary: fc.constant<Op>({ kind: 'reset' }) },
);
const arbOps = fc.array(arbOp, { minLength: 1, maxLength: 60 });

interface Stored {
  readonly value: JsonValue;
  readonly at: number;
  readonly ttl: number;
}
const live = (e: Stored, now: number): boolean => now >= e.at && now - e.at < e.ttl * 1000;
const bytesOf = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;
const valueOf = (op: Extract<Op, { kind: 'put' }>): JsonValue => {
  if (!op.big) return { n: op.n };
  return KEY_KIND[op.key] === 'scan' ? (BIG.scan as string) : (BIG.body as string);
};

function setup(modes: readonly L2Mode[]) {
  const runtime = createFakeRuntime(START);
  const l2 = createFakeL2(runtime, modes);
  const { logger } = createCollectingLogger();
  const l2Store = new RuntimeCacheStore({
    getCache: l2.getCache,
    sha256Hex,
    timer: runtime.timer,
    clock: runtime.clock,
    logger,
  });
  const pending: Promise<unknown>[] = [];
  const newL1 = (): MemoryCacheStore => new MemoryCacheStore(runtime.clock);
  const build = (l1: MemoryCacheStore): TieredCacheStore =>
    new TieredCacheStore({ l1, l2: l2Store, deferrer: { defer: (p) => void pending.push(p) } });
  return { runtime, l2, pending, newL1, build };
}

async function settle(runtime: FakeRuntime, pending: Promise<unknown>[]): Promise<void> {
  await runUntilSettled(Promise.all(pending.splice(0)), runtime);
}

function advance(runtime: FakeRuntime, ms: number): void {
  runtime.timer.setTimeout(() => undefined, ms);
  runtime.advanceToNextTimer();
}

/** No L2 write ever carries a value above the limit of its kind (the kind is part of the L2 key). */
function expectNoOversizeWrites(l2: ReturnType<typeof createFakeL2>): void {
  for (const call of l2.calls) {
    if (call.op !== 'set') continue;
    const kind = call.key.split(':')[2] === 'scan' ? 'scan' : null;
    const envelope = call.value as { value: unknown };
    expect(bytesOf(envelope.value)).toBeLessThanOrEqual(limitOf(kind));
  }
}

describe('Property 67: Tiered cache behaves like one cache that survives instance loss', () => {
  it(
    'with a healthy L2 it matches a two-tier model exactly, across L1 resets',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbOps, async (ops) => {
          const { runtime, l2, pending, newL1, build } = setup([L2_OK]);
          let store = build(newL1());
          const l1m = new Map<string, Stored>();
          const l2m = new Map<string, Stored>();
          for (const op of ops) {
            await settle(runtime, pending);
            const now = runtime.clock();
            if (op.kind === 'put') {
              const kind = KEY_KIND[op.key] ?? null;
              const value = valueOf(op);
              const rec: Stored = { value, at: now, ttl: op.ttl };
              await store.set(op.key, value, op.ttl, { l2Kind: kind });
              l1m.set(op.key, rec);
              if (kind !== null && bytesOf(value) <= limitOf(kind)) l2m.set(op.key, rec);
            } else if (op.kind === 'get') {
              const kind = KEY_KIND[op.key] ?? null;
              const got = await runUntilSettled(store.get(op.key, { l2Kind: kind }), runtime);
              const a = l1m.get(op.key);
              const b = l2m.get(op.key);
              let expected: Stored | null = null;
              if (a !== undefined && live(a, now)) expected = a;
              else if (kind !== null && b !== undefined && live(b, now)) {
                expected = b;
                l1m.set(op.key, b); // promotion keeps storedAt and ttl
              }
              if (expected === null) expect(got).toBeNull();
              else {
                expect(got).not.toBeNull();
                expect((got as CacheEntry).value).toEqual(expected.value);
                expect((got as CacheEntry).storedAtMs).toBe(expected.at);
              }
            } else if (op.kind === 'advance') {
              advance(runtime, op.ms);
            } else {
              store = build(newL1());
              l1m.clear();
            }
          }
          await settle(runtime, pending);
          expectNoOversizeWrites(l2);
        }),
        cfg(),
      );
    },
    120_000,
  );

  it(
    'with any L2 failure sequence it never throws, never returns an expired or unstored value, and never writes an oversize value',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbL2Modes, arbOps, async (modes, ops) => {
          const { runtime, l2, pending, newL1, build } = setup(modes);
          let store = build(newL1());
          const history = new Map<string, Stored[]>();
          for (const op of ops) {
            await settle(runtime, pending);
            const now = runtime.clock();
            if (op.kind === 'put') {
              const kind = KEY_KIND[op.key] ?? null;
              const value = valueOf(op);
              await store.set(op.key, value, op.ttl, { l2Kind: kind });
              history.set(op.key, [...(history.get(op.key) ?? []), { value, at: now, ttl: op.ttl }]);
            } else if (op.kind === 'get') {
              const kind = KEY_KIND[op.key] ?? null;
              const got = await runUntilSettled(store.get(op.key, { l2Kind: kind }), runtime);
              if (got !== null) {
                const at = runtime.clock();
                const match = (history.get(op.key) ?? []).some(
                  (h) =>
                    h.at === got.storedAtMs &&
                    h.ttl === got.ttlSeconds &&
                    JSON.stringify(h.value) === JSON.stringify(got.value),
                );
                expect(match).toBe(true);
                expect(at - got.storedAtMs).toBeGreaterThanOrEqual(0);
                expect(at - got.storedAtMs).toBeLessThan((got.ttlSeconds ?? 0) * 1000);
                if (kind === null) expect(got.ttlSeconds).toBeDefined();
              }
            } else if (op.kind === 'advance') {
              advance(runtime, op.ms);
            } else {
              store = build(newL1());
            }
          }
          await settle(runtime, pending);
          expectNoOversizeWrites(l2);
        }),
        cfg(),
      );
    },
    120_000,
  );
});

it('P67 unit: a live value written to L2 is returned after an L1 reset', async () => {
  const { runtime, pending, newL1, build } = setup([L2_OK]);
  await build(newL1()).set('a', { n: 1 }, 60, { l2Kind: 'scan' });
  await settle(runtime, pending);
  const got = await runUntilSettled(build(newL1()).get('a', { l2Kind: 'scan' }), runtime);
  expect(got?.value).toEqual({ n: 1 });
});
