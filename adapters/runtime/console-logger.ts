import type { LogEntry, Logger } from '../../pipeline/ports/runtime';

// Requirement 20.6
/** Writes one JSON line per entry, carrying only the four LogEntry fields. */
export const consoleLogger: Logger = {
  log(entry: LogEntry): void {
    const line = {
      source: entry.source,
      status: entry.status,
      durationMs: entry.durationMs,
      code: entry.code,
    };
    console.log(JSON.stringify(line));
  },
};
