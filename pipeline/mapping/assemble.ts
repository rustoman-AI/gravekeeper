import type { RawHealthFacts } from '@/core';
import { compareCodePoints } from './compare-code-points';
import { mapDepsDevPackage } from './deps-dev';
import { mapCratesOwners, mapNpmLatest, mapPypiOwnership } from './maintainers';
import { aggregateAdvisories, mapOsvAdvisory } from './osv-advisory';
import { mapDepsDevAdvisory } from './severity';
import { buildAdvisoryEntries } from './advisories';
import type {
  AdvisoryEntry,
  AdvisoryRecord,
  AssembledFacts,
  Fetched,
  RawTargetInputs,
  TargetNote,
  VersionSelection,
} from './types';
import { chooseVersion } from './version-choose';
import { readDepsDevVersions } from './version-select';

// Requirement 13.4, 13.11, 13.14, 8.4, 8.5, 8.6, 9.6, 9.9, 9.11, 9.22, 12.4

const NO_SELECTION: VersionSelection = { selected: null, basis: null, notes: [] };

function bodyOf<T>(fetched: Fetched<T>): T | undefined {
  return fetched.state === 'ok' ? fetched.body : undefined;
}

function sorted(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort(compareCodePoints);
}

/**
 * Assembles the seven facts and the target notes of one Lookup_Target from
 * its raw inputs. Pure and deterministic.
 */
export function assembleFacts(raw: RawTargetInputs, asOf: string): AssembledFacts {
  const { ecosystem, name } = raw;
  const base = { ecosystem, name };
  const notes: TargetNote[] = [];

  let daysSinceLastRelease: number | null = null;
  let deprecated: boolean | null = null;
  let openVulnerabilityCount: number | null = null;
  let maxSeverity: RawHealthFacts['maxSeverity'] = null;
  let archived: boolean | null = null;
  let daysSinceLastCommit: number | null = null;
  let maintainerCount: number | null = null;
  let selection: VersionSelection = NO_SELECTION;
  let advisories: readonly AdvisoryEntry[] = [];

  const packageFound = raw.depsdevPackage.state === 'ok';

  if (raw.depsdevPackage.state === 'absent') {
    notes.push({ code: 'package-not-found', details: { ...base } });
  }

  if (raw.depsdevPackage.state === 'ok') {
    const body = raw.depsdevPackage.body;
    const { defaultVersion, versions } = readDepsDevVersions(body);
    selection = chooseVersion(ecosystem, raw.versionSpecs, versions, defaultVersion);
    for (const note of selection.notes) {
      if (note.code === 'pin-not-found') {
        notes.push({ code: 'pin-not-found', details: { ...base, pinned: note.pinned } });
      } else if (note.code === 'conflicting-pins') {
        notes.push({ code: 'conflicting-pins', details: { ...base, pins: [...note.pins] } });
      } else if (note.code === 'no-default-version') {
        notes.push({ code: 'no-default-version', details: { ...base } });
      }
    }

    const mapped = mapDepsDevPackage(body, selection.selected, asOf);
    daysSinceLastRelease = mapped.daysSinceLastRelease;
    deprecated = mapped.deprecated;

    // R8.6
    if (ecosystem === 'npm' && selection.basis === 'default' && deprecated === null) {
      const latest = bodyOf(raw.npmLatest);
      deprecated = latest === undefined ? null : mapNpmLatest(latest).deprecated;
    }
  }

  // R12: maintainerCount comes only from the ecosystem's maintainer mapper.
  const maintainersBody = bodyOf(raw.maintainers);
  if (maintainersBody !== undefined) {
    if (ecosystem === 'npm') {
      maintainerCount = mapNpmLatest(maintainersBody).maintainerCount;
    } else if (ecosystem === 'cargo') {
      const owners = mapCratesOwners(maintainersBody);
      maintainerCount = owners.maintainerCount;
      if (owners.lowerBound) notes.push({ code: 'maintainers-lower-bound', details: { ...base } });
    } else {
      maintainerCount = mapPypiOwnership(maintainersBody).maintainerCount;
    }
  }

  // R9: vulnerabilities (only when the package exists and OSV answered).
  const query = raw.osv.queryResult;
  if (packageFound && query !== 'unavailable' && query.kind === 'ids') {
    const records: AdvisoryRecord[] = [];
    const recordsById = new Map<string, AdvisoryRecord>();
    const unfetched = new Set<string>(raw.osv.unfetchedIds);
    const wanted = new Set<string>([...query.ids, ...raw.osv.unfetchedIds]);
    for (const id of wanted) {
      const entry = raw.osv.advisories.get(id);
      const osvBody = entry === undefined ? undefined : bodyOf(entry.osv);
      if (entry === undefined || osvBody === undefined) {
        unfetched.add(id);
        continue;
      }
      const score = mapDepsDevAdvisory(bodyOf(entry.depsdev));
      const record = mapOsvAdvisory(osvBody, score);
      if (record === null) unfetched.add(id);
      else {
        records.push(record);
        recordsById.set(id, record);
      }
    }
    if (selection.selected !== null) advisories = buildAdvisoryEntries([...wanted], recordsById);
    const unfetchedIds = sorted(unfetched);
    const vulnerability = aggregateAdvisories(records, unfetchedIds);
    openVulnerabilityCount = vulnerability.openVulnerabilityCount;
    maxSeverity = vulnerability.maxSeverity;

    if (vulnerability.informationalIds.length > 0) {
      notes.push({
        code: 'informational-advisory-excluded',
        details: { ...base, ids: [...vulnerability.informationalIds] },
      });
    }
    if (ecosystem === 'cargo' && vulnerability.unmaintainedIds.length > 0) {
      deprecated = true;
      notes.push({
        code: 'unmaintained-advisory',
        details: { ...base, ids: [...vulnerability.unmaintainedIds] },
      });
    }
    if (unfetchedIds.length > 0) {
      notes.push({ code: 'advisory-details-incomplete', details: { ...base, ids: unfetchedIds } });
    }
    if (query.truncated) notes.push({ code: 'osv-pagination-ignored', details: { ...base } });
  }

  // R11: repository facts.
  if (packageFound && raw.repository !== 'no-source-repo' && raw.repository.state === 'ok') {
    const repo = raw.repository.body;
    if (repo.kind === 'ok') {
      archived = repo.archived;
      daysSinceLastCommit = repo.daysSinceLastCommit;
    }
  }

  const facts: RawHealthFacts = {
    daysSinceLastRelease,
    daysSinceLastCommit,
    archived,
    deprecated,
    openVulnerabilityCount,
    maxSeverity,
    maintainerCount,
  };
  return { facts, advisories, selection, notes };
}
