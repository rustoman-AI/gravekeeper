import { compareCodePoints } from '../internal/compare';
import { SCOPE_ORDER } from '../model';
import type { Scope, SerializableDependency } from '../model';

// Requirement 4.8
/** Index of a scope in SCOPE_ORDER. */
export function scopeIndex(scope: Scope): number {
  return SCOPE_ORDER.indexOf(scope);
}

function compareRawName(a: string | undefined, b: string | undefined): number {
  if (a === undefined) return b === undefined ? 0 : -1;
  if (b === undefined) return 1;
  return compareCodePoints(a, b);
}

// Requirement 4.8, 5.12
/**
 * Dependency_Order: normalized name by code point, then scope in SCOPE_ORDER, then
 * ecosystem, versionSpec, sourceKind and rawName (absent first) by code point.
 */
export function compareDependencies(a: SerializableDependency, b: SerializableDependency): number {
  return (
    compareCodePoints(a.name, b.name) ||
    scopeIndex(a.scope) - scopeIndex(b.scope) ||
    compareCodePoints(a.ecosystem, b.ecosystem) ||
    compareCodePoints(a.versionSpec, b.versionSpec) ||
    compareCodePoints(a.sourceKind, b.sourceKind) ||
    compareRawName(a.rawName, b.rawName)
  );
}
