import type { SourceName } from './http';

// Requirement 15.10, 19.10
/** Injected_Clock: epoch milliseconds. The only time source of pipeline, adapters and caches. */
export type Clock = () => number;

// Requirement 15.6, 15.10
/** Random value in [0, 1). The only randomness source. */
export type RandomSource = () => number;

export interface TimerHandle {
  readonly id: unknown;
}

export interface Timer {
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  /** Resolves 'elapsed' after ms, or 'aborted' at once when the signal aborts first. Never rejects. */
  sleep(ms: number, signal: AbortSignal): Promise<'elapsed' | 'aborted'>;
}

// Requirement 20.6, 19.25
/** The only fields a log line can carry. `cache` names an operation of a Cache_Tier. */
export interface LogEntry {
  readonly source: SourceName | 'cache';
  readonly status: number | null;
  readonly durationMs: number;
  readonly code: string;
}

export interface Logger {
  log(entry: LogEntry): void;
}

// Requirement 15.3
/** At most `limit` attempts in flight. A slot wait is abortable. */
export interface ConcurrencyLimiter {
  run<T>(
    task: () => Promise<T>,
    signal: AbortSignal,
  ): Promise<{ readonly acquired: true; readonly value: T } | { readonly acquired: false }>;
}

// Requirement 19.24
/** Runs deferred work (L2 writes) after the response. */
export interface Deferrer {
  defer(work: Promise<unknown>): void;
}
