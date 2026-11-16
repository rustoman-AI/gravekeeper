import type { AssessedPackage, UnassessedItem, UnassessedReason, UniquePackage } from '../model/types';

/** Unique_Packages split into Assessed_Packages and Unassessed_Items, each in input order. */
export interface Partition {
  readonly assessed: AssessedPackage[];
  readonly unassessedItems: UnassessedItem[];
}

/** Unassessed_Reason of a Unique_Package, or null when it is an Assessed_Package. */
export function unassessedReasonOf(pkg: UniquePackage): UnassessedReason | null {
  // Requirements 12.2, 12.14: a non-registry source takes precedence over missing data.
  if (pkg.sourceKind !== 'registry') return 'non-registry-source';
  if (pkg.classification === null) return 'no-health-data';
  return null;
}

/** Splits Unique_Packages into assessed and unassessed. Does not mutate the input. */
export function partitionPackages(packages: readonly UniquePackage[]): Partition {
  // Requirements 12.2, 12.14
  const assessed: AssessedPackage[] = [];
  const unassessedItems: UnassessedItem[] = [];
  for (const pkg of packages) {
    const reason = unassessedReasonOf(pkg);
    if (reason === null) {
      assessed.push({
        name: pkg.name,
        ecosystem: pkg.ecosystem,
        sourceKind: 'registry',
        scopes: pkg.scopes,
        classification: pkg.classification as NonNullable<UniquePackage['classification']>,
      });
    } else {
      unassessedItems.push({
        name: pkg.name,
        ecosystem: pkg.ecosystem,
        sourceKind: pkg.sourceKind,
        scopes: pkg.scopes,
        unassessedReason: reason,
      });
    }
  }
  return { assessed, unassessedItems };
}
