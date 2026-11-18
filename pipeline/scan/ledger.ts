// Requirement 17.1, 16.5 (append-only ledger)
import type { SourceName } from '../ports';
import type { LedgerEntry, UnitOutcome } from './types';

/**
 * Append-only record of Work_Unit outcomes. `unitKey` is unique per Work_Unit
 * within a scan: a second `record` for a known key is ignored, so the first
 * outcome stands and retries or cache hits cannot double count. A unit that
 * ended before the abort keeps its result (R16.5).
 */
export class WorkLedger {
  private readonly items: LedgerEntry[] = [];
  private readonly keys = new Set<string>();

  /** Returns true when the entry was added, false for a repeated key. */
  record(source: SourceName, unitKey: string, outcome: UnitOutcome): boolean {
    const id = `${source}\u0000${unitKey}`;
    if (this.keys.has(id)) return false;
    this.keys.add(id);
    this.items.push({ source, unitKey, outcome });
    return true;
  }

  /** Live view of the entries in recording order. Callers must not mutate it. */
  get entries(): readonly LedgerEntry[] {
    return this.items;
  }
}
