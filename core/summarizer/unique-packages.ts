// uniquePackages(): one Unique_Package per Package_Key, in first-seen order.
import { guard } from '../internal/safe';
import type { AssessedDependency, UniquePackage } from '../model';
import { groupAssessed } from './group';
import { mergeClassifications } from './merge';

export function uniquePackagesUnguarded(items: readonly AssessedDependency[]): UniquePackage[] {
  // Requirement 12.1: classifications merged by the 12.22 order.
  return groupAssessed(items).map((g) => ({
    name: g.name,
    ecosystem: g.ecosystem,
    sourceKind: g.sourceKind,
    scopes: g.scopes,
    classification: mergeClassifications(g.classifications),
  }));
}

// Requirements 9.1-9.4
export function uniquePackages(items: readonly AssessedDependency[]): UniquePackage[] {
  return guard(
    () => uniquePackagesUnguarded(Array.isArray(items) ? items : []),
    () => [],
  );
}
