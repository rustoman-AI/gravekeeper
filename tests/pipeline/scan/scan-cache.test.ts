import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MemoryCacheStore } from '../../../adapters/cache/memory-cache-store';
import { RuntimeCacheStore } from '../../../adapters/cache/runtime-cache-store';
import { TieredCacheStore } from '../../../adapters/cache/tiered-cache-store';
import {
  L2_MAX_SCAN_BYTES,
  PARTIAL_SCAN_TTL_SECONDS,
  SCAN_CACHE_TTL_SECONDS,
} from '../../../pipeline/constants';
import type { SourceName } from '../../../pipeline/ports';
import type { CacheStore } from '../../../pipeline/ports/cache';
import { createScanCache, isScanResult, storeDecision } from '../../../pipeline/scan/scan-cache';
import type {
  LedgerEntry,
  ScanNote,
  ScanResult,
  SourceStatus,
} from '../../../pipeline/scan/types';
import { createCollectingLogger, createFakeL2 } from '../../support/arbitraries/l2';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';

// Requirements 19.5, 19.7, 19.22, 19.30

type Statuses = { readonly [S in SourceName]: SourceStatus };
const SOURCES: readonly SourceName[] = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];

const allOk: Statuses = {
  github: 'ok',
  depsdev: 'ok',
  osv: 'ok',
  npm: 'ok',
  cratesio: 'ok',
  pypi: 'ok',
};
const withStatus = (source: SourceName, status: SourceStatus): Statuses => ({
  ...allOk,
  [source]: status,
});

const tokenNote: ScanNote = { code: 'github-token-missing', message: 'm' };
const otherNote: ScanNote = { code: 'no-manifests', message: 'm' };

const owners = (name: string, ok: boolean, reason: 'deadline' | 'timeout' = 'deadline'): LedgerEntry => ({
  source: 'cratesio',
  unitKey: `owners:${name}`,
  outcome: ok ? { ok: true } : { ok: false, reason },
});

const SECONDS_PER_PARTIAL = PARTIAL_SCAN_TTL_SECONDS;

describe('storeDecision', () => {
  it('stores an all-ok result for SCAN_CACHE_TTL_SECONDS', () => {
    expect(storeDecision(allOk, [], [])).toEqual({
      store: true,
      ttlSeconds: SCAN_CACHE_TTL_SECONDS,
    });
    expect(storeDecision(allOk, [otherNote], [owners('a', true)])).toEqual({
      store: true,
      ttlSeconds: SCAN_CACHE_TTL_SECONDS,
    });
  });

  it('never stores a result with a github-token-missing note', () => {
    expect(storeDecision(allOk, [tokenNote], [])).toEqual({ store: false });
    expect(
      storeDecision(withStatus('cratesio', 'partial'), [tokenNote], [owners('a', false)]),
    ).toEqual({ store: false });
  });

  it.each(SOURCES)('does not store when %s is partial or failed', (source) => {
    if (source === 'cratesio') {
      // partial cratesio with a non-deadline failure, and failed cratesio
      expect(
        storeDecision(withStatus(source, 'partial'), [], [owners('a', false, 'timeout')]),
      ).toEqual({ store: false });
      expect(storeDecision(withStatus(source, 'failed'), [], [owners('a', false)])).toEqual({
        store: false,
      });
      return;
    }
    expect(storeDecision(withStatus(source, 'partial'), [], [])).toEqual({ store: false });
    expect(storeDecision(withStatus(source, 'failed'), [], [])).toEqual({ store: false });
  });

  describe('partial cratesio (R19.22)', () => {
    const partial = withStatus('cratesio', 'partial');

    it('stores for PARTIAL_SCAN_TTL_SECONDS when every failed unit is a deadline owners unit', () => {
      expect(
        storeDecision(partial, [], [owners('a', true), owners('b', false), owners('c', false)]),
      ).toEqual({ store: true, ttlSeconds: SECONDS_PER_PARTIAL });
    });

    it('does not store when a failed unit failed for another reason', () => {
      expect(
        storeDecision(partial, [], [owners('a', false), owners('b', false, 'timeout')]),
      ).toEqual({ store: false });
    });

    it('does not store when a failed cratesio unit is not an owners lookup', () => {
      const other: LedgerEntry = {
        source: 'cratesio',
        unitKey: 'versions:a',
        outcome: { ok: false, reason: 'deadline' },
      };
      expect(storeDecision(partial, [], [other])).toEqual({ store: false });
    });

    it('does not store when another source is also not ok', () => {
      expect(
        storeDecision({ ...partial, osv: 'partial' }, [], [owners('a', false)]),
      ).toEqual({ store: false });
    });

    it('ignores ledger entries of other sources', () => {
      const foreign: LedgerEntry = {
        source: 'npm',
        unitKey: 'x',
        outcome: { ok: false, reason: 'timeout' },
      };
      expect(storeDecision(partial, [], [owners('a', false), foreign])).toEqual({
        store: true,
        ttlSeconds: SECONDS_PER_PARTIAL,
      });
    });
  });

  it('never stores a margin-path result (deadline failures outside the cratesio owners case)', () => {
    // A margin result has sources cut by the deadline. Only the cratesio-owners case is stored;
    // the runScan-level check that a closed progress skips the store is in task 7.21.
    const github: LedgerEntry = {
      source: 'github',
      unitKey: 'tree',
      outcome: { ok: false, reason: 'deadline' },
    };
    expect(storeDecision(withStatus('github', 'failed'), [], [github])).toEqual({ store: false });
    expect(storeDecision(withStatus('osv', 'partial'), [], [])).toEqual({ store: false });
  });
});

// --- Typed cache -------------------------------------------------------------------------------

const ZERO = { ALIVE: 0, HAUNTED: 0, DEAD: 0 };

function makeResult(notes: readonly ScanNote[] = [], skipped: ScanResult['capped']['skipped'] = []): ScanResult {
  return {
    ok: true,
    asOf: '2024-01-01T00:00:00.000Z',
    repo: {
      host: 'github.com',
      owner: 'o',
      repo: 'r',
      branch: 'main',
      defaultBranch: 'main',
      commitSha: 'abc',
    },
    discovery: { candidates: [], truncatedTree: false, depthLimited: false, countLimited: false },
    manifests: [],
    dependencies: [],
    assessed: [],
    summary: {
      total: 0,
      assessed: 0,
      unassessed: 0,
      counts: ZERO,
      averageScore: null,
      maxScore: null,
      maxScorePackage: null,
      grade: null,
      worst: [],
      unassessedItems: [],
    },
    sources: allOk,
    capped: { limit: 100, total: skipped.length, skipped },
    notes,
  } as ScanResult;
}

const sha256Hex = (text: string): Promise<string> =>
  Promise.resolve(createHash('sha256').update(text).digest('hex'));

function setup() {
  const runtime = createFakeRuntime(1_000_000);
  const l2 = createFakeL2(runtime);
  const { logger } = createCollectingLogger();
  const l1 = new MemoryCacheStore(runtime.clock);
  const pending: Promise<unknown>[] = [];
  const store = new TieredCacheStore({
    l1,
    l2: new RuntimeCacheStore({
      getCache: l2.getCache,
      sha256Hex,
      timer: runtime.timer,
      clock: runtime.clock,
      logger,
    }),
    deferrer: { defer: (work) => void pending.push(work) },
  });
  const settle = (): Promise<unknown> => runUntilSettled(Promise.all(pending), runtime);
  return { runtime, l1, l2, store, settle };
}

describe('createScanCache', () => {
  it('round-trips a result and stores it in L2', async () => {
    const { runtime, l2, store, settle } = setup();
    const cache = createScanCache(store);
    const result = makeResult([otherNote]);
    await cache.set('k', result, SCAN_CACHE_TTL_SECONDS);
    await settle();
    expect(l2.calls.filter((c) => c.op === 'set')).toHaveLength(1);
    expect(l2.calls[0]?.options?.ttl).toBe(SCAN_CACHE_TTL_SECONDS);
    expect(await runUntilSettled(cache.get('k'), runtime)).toEqual(result);
  });

  it('stores a result with capped.skipped entries', async () => {
    const { runtime, store } = setup();
    const cache = createScanCache(store);
    const result = makeResult([], [
      { ecosystem: 'npm', name: 'a' },
      { ecosystem: 'cargo', name: 'b' },
    ]);
    await cache.set('k', result, SCAN_CACHE_TTL_SECONDS);
    expect(await runUntilSettled(cache.get('k'), runtime)).toEqual(result);
  });

  it('stores a partial result with the partial TTL in L1 and L2', async () => {
    const { runtime, l1, l2, store, settle } = setup();
    const cache = createScanCache(store);
    await cache.set('k', makeResult(), PARTIAL_SCAN_TTL_SECONDS);
    await settle();
    expect(l2.calls[0]?.options?.ttl).toBe(PARTIAL_SCAN_TTL_SECONDS);
    expect((await l1.get('k'))?.ttlSeconds).toBe(PARTIAL_SCAN_TTL_SECONDS);
    // expires after the partial TTL
    runtime.timer.setTimeout(() => undefined, PARTIAL_SCAN_TTL_SECONDS * 1000);
    runtime.advanceToNextTimer();
    expect(await l1.get('k')).toBeNull();
  });

  it('treats an invalid cached value as a miss', async () => {
    const { runtime, store } = setup();
    const cache = createScanCache(store);
    await store.set('bad', { ok: true, asOf: 'nope' }, 60);
    expect(await runUntilSettled(cache.get('bad'), runtime)).toBeNull();
    await store.set('extra', { ...makeResult(), extra: 1 } as never, 60);
    expect(await runUntilSettled(cache.get('extra'), runtime)).toBeNull();
    expect(isScanResult(null)).toBe(false);
    expect(isScanResult(makeResult())).toBe(true);
  });

  it('treats a store that throws as a miss and a skipped store', async () => {
    const failing: CacheStore = {
      get: () => Promise.reject(new Error('x')),
      set: () => Promise.reject(new Error('x')),
    };
    const cache = createScanCache(failing);
    expect(await cache.get('k')).toBeNull();
    await expect(cache.set('k', makeResult(), 60)).resolves.toBeUndefined();
  });

  it('keeps a result over L2_MAX_SCAN_BYTES in L1 only', async () => {
    const { runtime, l2, store, settle } = setup();
    const cache = createScanCache(store);
    const big = makeResult([{ code: 'no-manifests', message: 'x'.repeat(L2_MAX_SCAN_BYTES + 1) }]);
    await cache.set('big', big, SCAN_CACHE_TTL_SECONDS);
    await settle();
    expect(l2.calls).toEqual([]);
    expect(await runUntilSettled(cache.get('big'), runtime)).toEqual(big);
  });
});
