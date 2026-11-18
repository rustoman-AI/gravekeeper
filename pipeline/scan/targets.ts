// Requirement 16.1, 16.2, 16.3, 16.4, 16.6, 16.7, 16.10, 13.16
import type { Dependency, Ecosystem } from '@/core';
import { compareCodePoints } from '../mapping/compare-code-points';
import type { LookupTarget, ScanCapped } from './types';

export interface TargetPlan {
  /** Looked-up Lookup_Targets, at most `limit`, ascending by (ecosystem, name) in code point order. */
  readonly targets: readonly LookupTarget[];
  /** `limit`, `total` (Lookup_Targets before the cap) and the skipped targets in the same order. */
  readonly capped: ScanCapped;
}

/** Stable key of a Lookup_Target. The NUL separator cannot occur in an ecosystem or a name. */
export function targetKey(ecosystem: Ecosystem, name: string): string {
  return `${ecosystem}\u0000${name}`;
}

/**
 * Plans the Lookup_Targets of a scan.
 *
 * Only `registry` dependencies form Lookup_Targets. `git` and `path` dependencies are
 * never looked up and never counted, so the assembler keeps them unassessed (null
 * classification, all-null facts). Dependencies of one `(ecosystem, name)` are merged
 * across manifests and scopes into one target whose `versionSpecs` hold every
 * versionSpec in input order; `exactPin` and `selectVersion` derive the version from it.
 * Targets are ordered by ecosystem, then name, in code point order, and cut at `limit`.
 */
export function planLookupTargets(
  dependencies: readonly Dependency[],
  limit: number,
): TargetPlan {
  const byKey = new Map<string, { ecosystem: Ecosystem; name: string; specs: string[] }>();
  for (const dependency of dependencies) {
    if (dependency.sourceKind !== 'registry') continue;
    const key = targetKey(dependency.ecosystem, dependency.name);
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, {
        ecosystem: dependency.ecosystem,
        name: dependency.name,
        specs: [dependency.versionSpec],
      });
    } else {
      existing.specs.push(dependency.versionSpec);
    }
  }

  const ordered: LookupTarget[] = [...byKey.values()]
    .sort(
      (a, b) => compareCodePoints(a.ecosystem, b.ecosystem) || compareCodePoints(a.name, b.name),
    )
    .map((t) => ({ ecosystem: t.ecosystem, name: t.name, versionSpecs: t.specs }));

  const cut = Math.max(0, limit);
  return {
    targets: ordered.slice(0, cut),
    capped: {
      limit,
      total: ordered.length,
      skipped: ordered.slice(cut).map((t) => ({ ecosystem: t.ecosystem, name: t.name })),
    },
  };
}
