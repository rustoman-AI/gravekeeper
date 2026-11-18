import { compareCodePoints } from './compare-code-points';
import { readOwn } from './read-own';
import type { VersionSelection } from './types';

const IDENT = '[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*';
const NUMBER = '(?:0|[1-9][0-9]*)';
// Requirement 7.2
const SEMVER = new RegExp(`^${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:-${IDENT})?(?:\\+${IDENT})?$`);
const PYPI_VERSION = /^[0-9][0-9A-Za-z.+!_-]*$/;

/**
 * Returns the Exact_Pin value `<v>` of a `versionSpec`, or null.
 * Total: never throws.
 */
// Requirement 7.1, 7.2, 7.3, 7.10
export function exactPin(versionSpec: unknown, ecosystem: unknown): string | null {
  try {
    if (typeof versionSpec !== 'string') return null;
    const spec = versionSpec.trim();
    if (ecosystem === 'npm' || ecosystem === 'cargo') {
      let v: string | null = null;
      if (ecosystem === 'npm') {
        v = spec.startsWith('=') ? spec.slice(1) : spec;
      } else if (spec.startsWith('=')) {
        v = spec.slice(1);
      }
      return v !== null && SEMVER.test(v) ? v : null;
    }
    if (ecosystem === 'pypi') {
      let v: string;
      if (spec.startsWith('===')) v = spec.slice(3);
      else if (spec.startsWith('==')) v = spec.slice(2);
      else return null;
      return PYPI_VERSION.test(v) ? v : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Selects the version to look up from the Exact_Pins of one Lookup_Target.
 * The result does not depend on the order of `pins`.
 */
// Requirement 7.4, 7.5, 7.6, 7.7, 7.8, 7.11, 7.12, 7.13
export function selectVersion(
  pins: readonly string[],
  versions: readonly string[],
  defaultVersion: string | null,
): VersionSelection {
  const distinct = [...new Set(pins)].sort(compareCodePoints);
  const notes: VersionSelection['notes'][number][] = [];

  if (distinct.length === 1) {
    const pinned = distinct[0] as string;
    const match = versions.find((version) => version === pinned);
    if (match !== undefined) return { selected: match, basis: 'pinned', notes };
    notes.push({ code: 'pin-not-found', pinned });
  } else if (distinct.length > 1) {
    notes.push({ code: 'conflicting-pins', pins: distinct });
  }

  if (defaultVersion === null || defaultVersion === '') {
    notes.push({ code: 'no-default-version' });
    return { selected: null, basis: null, notes };
  }
  return { selected: defaultVersion, basis: 'default', notes };
}

/**
 * Reads the version list and the default version from a deps.dev package
 * document (EF-1). Total: never throws.
 */
// Requirement 7.6, 8.4
export function readDepsDevVersions(body: unknown): {
  defaultVersion: string | null;
  versions: readonly string[];
} {
  const versions: string[] = [];
  let defaultVersion: string | null = null;
  try {
    const list = readOwn(body, 'versions');
    if (Array.isArray(list)) {
      const length = list.length;
      for (let i = 0; i < length; i++) {
        const entry = readOwn(list, String(i));
        const version = readOwn(readOwn(entry, 'versionKey'), 'version');
        if (typeof version !== 'string' || version === '') continue;
        versions.push(version);
        if (defaultVersion === null && readOwn(entry, 'isDefault') === true) {
          defaultVersion = version;
        }
      }
    }
  } catch {
    // keep what was read
  }
  return { defaultVersion, versions };
}
