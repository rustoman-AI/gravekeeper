/*
 * The only file that imports `@renovatebot/pep440`. Every function catches
 * every library exception and returns null, false or 0, so the Mappers stay
 * total.
 */
import * as pep440 from '@renovatebot/pep440';

/** The input itself when it is a valid PEP 440 specifier, otherwise null. */
export function pepRange(range: string): string | null {
  try {
    if (typeof range !== 'string') return null;
    return pep440.validRange(range) === true ? range : null;
  } catch {
    return null;
  }
}

/** `{ isPrerelease }` for a valid PEP 440 version, otherwise null. A pre-release or dev-release segment makes it a prerelease. */
export function pepVersion(v: string): { isPrerelease: boolean } | null {
  try {
    if (typeof v !== 'string') return null;
    const parsed = pep440.parse(v);
    if (parsed === null || parsed === undefined) return null;
    return { isPrerelease: parsed.pre != null || parsed.dev != null };
  } catch {
    return null;
  }
}

/** PEP 440 ordering: negative, zero or positive. 0 on any error. */
export function pepCompare(a: string, b: string): number {
  try {
    const result = pep440.compare(a, b);
    return Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

/** True when the version satisfies the specifier. False on any error. */
export function pepSatisfies(v: string, range: string): boolean {
  try {
    return pep440.satisfies(v, range) === true;
  } catch {
    return false;
  }
}
