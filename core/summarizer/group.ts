import { CONSTANTS } from '../model';
import type { AssessedDependency, Classification, Ecosystem, Scope, SourceKind } from '../model';

/** Entries sharing one Package_Key, before the classifications are merged. */
export interface PackageGroup {
  readonly name: string;
  readonly ecosystem: Ecosystem;
  readonly sourceKind: SourceKind;
  /** Sorted in SCOPE_ORDER, no repeats. */
  readonly scopes: readonly Scope[];
  /** Non-null classifications of the group, in input order. */
  readonly classifications: readonly Classification[];
}

interface MutableGroup {
  readonly name: string;
  readonly ecosystem: Ecosystem;
  readonly sourceKind: SourceKind;
  readonly scopeSet: Set<Scope>;
  readonly classifications: Classification[];
}

/**
 * Groups entries by Package_Key in one pass. Does not mutate the input.
 * Groups come out in first-seen order. Map keys keep names such as `__proto__` safe.
 */
export function groupAssessed(entries: readonly AssessedDependency[]): PackageGroup[] {
  // Requirement 12.1: Package_Key is JSON.stringify([ecosystem, name, sourceKind]); scope and versionSpec are not part of it.
  const groups = new Map<string, MutableGroup>();
  for (const entry of entries) {
    const { name, ecosystem, sourceKind, scope } = entry.dependency;
    const key = JSON.stringify([ecosystem, name, sourceKind]);
    let group = groups.get(key);
    if (group === undefined) {
      group = { name, ecosystem, sourceKind, scopeSet: new Set<Scope>(), classifications: [] };
      groups.set(key, group);
    }
    group.scopeSet.add(scope);
    if (entry.classification !== null) {
      group.classifications.push(entry.classification);
    }
  }
  const result: PackageGroup[] = [];
  for (const g of groups.values()) {
    result.push({
      name: g.name,
      ecosystem: g.ecosystem,
      sourceKind: g.sourceKind,
      scopes: CONSTANTS.SCOPE_ORDER.filter((s) => g.scopeSet.has(s)),
      classifications: g.classifications,
    });
  }
  return result;
}
