// Requirement 13.2, 13.10
/**
 * Reads an own property of `value`. Returns `undefined` for anything
 * unreadable: primitives, missing keys, inherited keys, throwing getters
 * and throwing proxies.
 */
export function readOwn(value: unknown, key: string): unknown {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return undefined;
    }
    if (!Object.hasOwn(value, key)) return undefined;
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}
