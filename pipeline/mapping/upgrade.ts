import { normalizeHintText } from './hint-text';
import { pepCompare, pepVersion } from './range-pep440';
import { semverCompare, semverVersion } from './range-semver';
import { readOwn } from './read-own';
import type { UpgradeSuggestion } from './types';
import { versionDeprecated } from './version-doc-plan';
import { readDepsDevVersions } from './version-select';

export interface ChooseUpgradeInput {
  readonly ecosystem: string;
  readonly depsdevBody: unknown;
  readonly selected: string | null;
  readonly latestBody: unknown;
}

/**
 * Upgrade chooser (resurrect-upgrade, Requirement 4).
 *
 * Requirement 4.8: `isDeprecated` is the deps.dev flag. deps.dev sets it for
 * npm deprecation and reports it as it finds it for PyPI and crates.io. This
 * function decides only from that flag (and the npm `/latest` document in
 * step 4), never from `deprecatedReason`, advisories or any other fact.
 *
 * Requirement 4.5: a package that is HAUNTED by advisories but whose checked
 * version is not deprecated gets no upgrade; OSV is queried for the checked
 * version only, so nothing is known about the default version's advisories.
 *
 * Total: never throws. Independent of the order of `versions[]`.
 */
export function chooseUpgrade(input: ChooseUpgradeInput): UpgradeSuggestion | null {
  try {
    const { ecosystem, depsdevBody, selected, latestBody } = input;

    // Requirement 4.1, 4.2: the checked version must be listed and deprecated.
    if (typeof selected !== 'string' || selected === '') return null;
    if (!versionDeprecated(depsdevBody, selected)) return null;

    // Requirement 4.1: the Upgrade_Target is the default version and must be listed.
    const { defaultVersion, versions } = readDepsDevVersions(depsdevBody);
    if (defaultVersion === null || defaultVersion === '') return null;
    if (!versions.includes(defaultVersion)) return null;

    // Requirement 4.1, 4.2: a deprecated default is never offered.
    if (versionDeprecated(depsdevBody, defaultVersion)) return null;

    // Requirement 4.3: respect an npm `/latest` deprecation that deps.dev has not reported.
    if (ecosystem === 'npm') {
      if (
        readOwn(latestBody, 'version') === defaultVersion &&
        normalizeHintText(readOwn(latestBody, 'deprecated')) !== null
      ) {
        return null;
      }
    }

    // Requirement 4.1, 4.2, 4.4: the existing comparator must rank the default strictly higher.
    if (ecosystem === 'npm' || ecosystem === 'cargo') {
      if (semverVersion(selected) === null || semverVersion(defaultVersion) === null) return null;
      if (semverCompare(defaultVersion, selected) <= 0) return null;
    } else if (ecosystem === 'pypi') {
      if (pepVersion(selected) === null || pepVersion(defaultVersion) === null) return null;
      if (pepCompare(defaultVersion, selected) <= 0) return null;
    } else {
      return null;
    }

    return { version: defaultVersion, basis: 'registry-default' };
  } catch {
    return null;
  }
}
