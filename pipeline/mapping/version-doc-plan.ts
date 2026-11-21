import { isStrictVersion } from '@/core';
import { readOwn } from './read-own';
import { readDepsDevVersions } from './version-select';

/**
 * True only when the deps.dev entry of `version` has `isDeprecated === true`.
 * Total: never throws.
 */
// Requirement 1.1, 1.11
export function versionDeprecated(depsdevBody: unknown, version: string | null): boolean {
  try {
    if (typeof version !== 'string' || version === '') return false;
    const list = readOwn(depsdevBody, 'versions');
    if (!Array.isArray(list)) return false;
    const length = list.length;
    for (let i = 0; i < length; i++) {
      const entry = readOwn(list, String(i));
      if (readOwn(readOwn(entry, 'versionKey'), 'version') !== version) continue;
      if (readOwn(entry, 'isDeprecated') === true) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * The latest version: the non-empty string `version` of the npm `/latest`
 * body, else the deps.dev default, else null. Total.
 */
// Requirement 1.2, 1.3
export function latestVersionOf(latestBody: unknown, depsdevDefault: string | null): string | null {
  try {
    const version = readOwn(latestBody, 'version');
    if (typeof version === 'string' && version !== '') return version;
  } catch {
    // fall through to the default
  }
  return typeof depsdevDefault === 'string' && depsdevDefault !== '' ? depsdevDefault : null;
}

/**
 * True exactly for an npm target whose selected version is strict, deprecated
 * in the deps.dev document and different from the latest (unknown latest
 * counts as different). Pure and total.
 */
// Requirement 1.1, 1.2, 1.3, 1.4, 1.11
export function needsVersionDocument(input: {
  readonly ecosystem: string;
  readonly depsdevBody: unknown;
  readonly selected: string | null;
  readonly latestBody: unknown;
}): boolean {
  try {
    if (input.ecosystem !== 'npm') return false;
    const selected = input.selected;
    if (typeof selected !== 'string' || !isStrictVersion('npm', selected)) return false;
    if (!versionDeprecated(input.depsdevBody, selected)) return false;
    const { defaultVersion } = readDepsDevVersions(input.depsdevBody);
    return selected !== latestVersionOf(input.latestBody, defaultVersion);
  } catch {
    return false;
  }
}
