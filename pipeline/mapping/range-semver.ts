/*
 * The only file that imports `semver`. Every function catches every library
 * exception and returns null, false or 0, so the Mappers stay total.
 */
import * as semver from 'semver';

const IDENT = '[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*';
const NUMBER = '(?:0|[1-9][0-9]*)';
// Requirement 7.2 of scan-pipeline
const STRICT_VERSION = new RegExp(
  `^${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:-${IDENT})?(?:\\+${IDENT})?$`,
);

/** The normalised range from `semver.validRange`, or null when it is not a valid range. */
export function semverRange(range: string): string | null {
  try {
    if (typeof range !== 'string') return null;
    return semver.validRange(range);
  } catch {
    return null;
  }
}

/** The input itself when it is a strict semver version, otherwise null. */
export function semverVersion(v: string): string | null {
  try {
    if (typeof v !== 'string' || !STRICT_VERSION.test(v)) return null;
    return semver.parse(v) === null ? null : v;
  } catch {
    return null;
  }
}

/** True when the version has a prerelease list. False for any invalid input. */
export function semverIsPrerelease(v: string): boolean {
  try {
    const list = semver.prerelease(v);
    return list !== null && list.length > 0;
  } catch {
    return false;
  }
}

/** Semver precedence (build metadata ignored): negative, zero or positive. 0 on any error. */
export function semverCompare(a: string, b: string): number {
  try {
    const result = semver.compare(a, b);
    return Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

/** True when the version satisfies the range. False on any error. */
export function semverSatisfies(v: string, range: string): boolean {
  try {
    return semver.satisfies(v, range) === true;
  } catch {
    return false;
  }
}
