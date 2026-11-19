import { CACHE_MAX_ENTRIES } from '../../pipeline/constants';
import type { CacheEntry, CacheStore, JsonValue } from '../../pipeline/ports/cache';
import type { Clock } from '../../pipeline/ports/runtime';

interface StoredEntry {
  readonly value: JsonValue;
  readonly storedAtMs: number;
  readonly ttlSeconds: number;
}

// Requirements 19.1, 19.9, 19.10, 19.12
/** L1 cache: an insertion-ordered Map used as an LRU. The first key is the least recently used. */
export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, StoredEntry>();

  constructor(
    private readonly clock: Clock,
    private readonly maxEntries: number = CACHE_MAX_ENTRIES,
  ) {}

  get(key: string): Promise<CacheEntry | null> {
    const entry = this.entries.get(key);
    if (entry === undefined) return Promise.resolve(null);
    const now = this.clock();
    if (now < entry.storedAtMs || now - entry.storedAtMs >= entry.ttlSeconds * 1000) {
      this.entries.delete(key);
      return Promise.resolve(null);
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return Promise.resolve({ value: entry.value, storedAtMs: entry.storedAtMs });
  }

  set(
    key: string,
    value: JsonValue,
    ttlSeconds: number,
    options?: { readonly storedAtMs?: number },
  ): Promise<void> {
    const storedAtMs = options?.storedAtMs ?? this.clock();
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxEntries) {
      const first = this.entries.keys().next();
      if (first.done !== true) this.entries.delete(first.value);
    }
    this.entries.set(key, { value, storedAtMs, ttlSeconds });
    return Promise.resolve();
  }

  size(): number {
    return this.entries.size;
  }
}
