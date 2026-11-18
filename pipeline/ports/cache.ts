import type { L2Kind } from './http';

// Requirement 19.1
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface CacheEntry {
  readonly value: JsonValue;
  readonly storedAtMs: number;
}

// Requirement 19.20
/** Which L2 entry kind a key belongs to. `scan` is a complete Scan_Result. `null` or absent: L1 only. */
export type L2EntryKind = 'scan' | L2Kind;

export interface CacheStore {
  /** Returns only a live entry: 0 <= age < ttl. Never throws. A failure is a miss. */
  get(
    key: string,
    options?: { readonly signal?: AbortSignal; readonly l2Kind?: L2EntryKind | null },
  ): Promise<CacheEntry | null>;
  /** Replaces the value, restarts the lifetime, evicts at most one LRU entry when full. Never throws.
   *  `storedAtMs` is kept when an L2 hit is promoted into L1 (Requirement 19.23). */
  set(
    key: string,
    value: JsonValue,
    ttlSeconds: number,
    options?: { readonly storedAtMs?: number; readonly l2Kind?: L2EntryKind | null },
  ): Promise<void>;
}
