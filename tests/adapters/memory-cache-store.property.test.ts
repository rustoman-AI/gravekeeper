import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MemoryCacheStore } from '../../adapters/cache/memory-cache-store';
import { cfg } from '../support/fc-config';

type Op =
  | { readonly kind: 'set'; readonly key: string; readonly v: number; readonly ttl: number; readonly explicitAt: number | null }
  | { readonly kind: 'get'; readonly key: string }
  | { readonly kind: 'clock'; readonly to: number };

const arbKey = fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f');
const arbOp: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant('set' as const),
    key: arbKey,
    v: fc.integer({ min: 0, max: 1000 }),
    ttl: fc.constantFrom(0, 1, 2, 5, 60),
    explicitAt: fc.option(fc.integer({ min: 0, max: 200_000 }), { nil: null }),
  }),
  fc.record({ kind: fc.constant('get' as const), key: arbKey }),
  fc.record({ kind: fc.constant('clock' as const), to: fc.integer({ min: 0, max: 200_000 }) }),
  // Clock jumps that land exactly on TTL boundaries.
  fc.record({ kind: fc.constant('clock' as const), to: fc.constantFrom(0, 999, 1000, 1001, 2000, 5000, 60_000) }),
);
const arbOps = fc.array(arbOp, { minLength: 1, maxLength: 80 });
const arbMax = fc.integer({ min: 1, max: 4 });

interface ModelEntry {
  readonly v: number;
  readonly at: number;
  readonly ttl: number;
}

function run(
  ops: readonly Op[],
  maxEntries: number,
  check: (store: MemoryCacheStore, model: Map<string, ModelEntry>) => void,
  onGet: (actual: Awaited<ReturnType<MemoryCacheStore['get']>>, expected: ModelEntry | null) => void,
): Promise<void> {
  let now = 0;
  const store = new MemoryCacheStore(() => now, maxEntries);
  const model = new Map<string, ModelEntry>(); // insertion order = LRU order
  return (async () => {
    for (const op of ops) {
      if (op.kind === 'clock') {
        now = op.to;
      } else if (op.kind === 'set') {
        const at = op.explicitAt ?? now;
        await store.set(op.key, op.v, op.ttl, op.explicitAt === null ? undefined : { storedAtMs: at });
        if (model.has(op.key)) model.delete(op.key);
        else if (model.size >= maxEntries) model.delete(model.keys().next().value as string);
        model.set(op.key, { v: op.v, at, ttl: op.ttl });
      } else {
        const m = model.get(op.key);
        let expected: ModelEntry | null = null;
        if (m !== undefined) {
          model.delete(op.key);
          const age = now - m.at;
          if (age >= 0 && age < m.ttl * 1000) {
            model.set(op.key, m); // refresh recency
            expected = m;
          }
        }
        onGet(await store.get(op.key), expected);
      }
      check(store, model);
    }
  })();
}

describe('MemoryCacheStore properties', () => {
  // Feature: scan-pipeline, Property 59: Cache entries live exactly for their TTL
  // Validates: Requirements 19.11, 19.18
  it('P59 cache entries live exactly for their TTL', async () => {
    await fc.assert(
      fc.asyncProperty(arbOps, arbMax, async (ops, max) => {
        await run(
          ops,
          max,
          () => undefined,
          (actual, expected) => {
            if (expected === null) {
              expect(actual).toBeNull();
            } else {
              expect(actual).not.toBeNull();
              expect(actual?.value).toBe(expected.v);
              expect(actual?.storedAtMs).toBe(expected.at);
            }
          },
        );
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 60: Caches never exceed their size limit
  // Validates: Requirements 19.12
  it('P60 caches never exceed their size limit and evict least recently used first', async () => {
    await fc.assert(
      fc.asyncProperty(arbOps, arbMax, async (ops, max) => {
        await run(
          ops,
          max,
          (store, model) => {
            expect(store.size()).toBeLessThanOrEqual(max);
            expect(store.size()).toBe(model.size);
          },
          (actual, expected) => {
            // Eviction order is verified by presence agreement with the LRU model.
            expect(actual === null).toBe(expected === null);
          },
        );
      }),
      cfg(),
    );
  });
});
