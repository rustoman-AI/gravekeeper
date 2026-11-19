import type { CacheEntry, CacheStore, JsonValue, L2EntryKind } from '../../pipeline/ports/cache';
import type { Deferrer } from '../../pipeline/ports/runtime';

// Requirements 19.11, 19.20, 19.23, 19.24, 19.25

export interface TieredCacheStoreDeps {
  readonly l1: CacheStore;
  /** `null` when GRAVEKEEPER_RUNTIME_CACHE is off: L2 is never read or written. */
  readonly l2: CacheStore | null;
  readonly deferrer: Deferrer;
}

/**
 * L1 in front of L2. L2 is used only for a call that carries an `l2Kind` and only when `l2` is not null.
 * The per-kind shape of a value is validated by the typed layer above this store (isCachedResponse,
 * isScanResult), as the design places it. Never throws.
 */
export class TieredCacheStore implements CacheStore {
  constructor(private readonly deps: TieredCacheStoreDeps) {}

  async get(
    key: string,
    options?: { readonly signal?: AbortSignal; readonly l2Kind?: L2EntryKind | null },
  ): Promise<CacheEntry | null> {
    try {
      const hit = await this.deps.l1.get(key, options);
      if (hit !== null) return hit;
    } catch {
      // An L1 failure is a miss.
    }
    const kind = options?.l2Kind;
    const l2 = this.deps.l2;
    if (!kind || l2 === null) return null;
    try {
      const entry = await l2.get(key, options);
      if (entry === null) return null;
      try {
        // The promoted entry keeps storedAtMs and ttlSeconds, so it expires when the L2 entry does.
        // An L2 entry without a lifetime is returned but not promoted.
        if (entry.ttlSeconds !== undefined) {
          await this.deps.l1.set(key, entry.value, entry.ttlSeconds, {
            storedAtMs: entry.storedAtMs,
          });
        }
      } catch {
        // Promotion is best effort; the L2 entry is still a hit.
      }
      return entry;
    } catch {
      return null;
    }
  }

  async set(
    key: string,
    value: JsonValue,
    ttlSeconds: number,
    options?: { readonly storedAtMs?: number; readonly l2Kind?: L2EntryKind | null },
  ): Promise<void> {
    try {
      await this.deps.l1.set(key, value, ttlSeconds, options);
    } catch {
      // Never throws.
    }
    const kind = options?.l2Kind;
    const l2 = this.deps.l2;
    if (!kind || l2 === null) return;
    try {
      const write = l2.set(key, value, ttlSeconds, options).catch(() => undefined);
      this.deps.deferrer.defer(write);
    } catch {
      // A failing Deferrer or L2 never fails the caller.
    }
  }
}
