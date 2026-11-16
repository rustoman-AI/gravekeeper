import type { Scope } from '../model';

// Requirement 4.6
/** Dependency_Key as a string for Map/Set use. `name` is the normalized name. Injective, so separators in names cannot collide. */
export function dependencyKey(name: string, scope: Scope): string {
  return JSON.stringify([name, scope]);
}
