// Requirement 7.4, 7.5, 7.6, 7.11, 8.7, 8.8, 8.9, 9.1, 9.2, 9.3, 12.5, 12.16, 17.8
import type { Ecosystem } from '@/core';
import { DEPSDEV_BATCH_SIZE, OSV_BATCH_SIZE } from '../constants';
import {
  exactPin,
  mapDepsDevVersion,
  mapDepsDevVersionBatch,
  mapOsvQueryBatch,
  readDepsDevVersions,
  selectVersion,
} from '../mapping';
import type {
  BatchEntry,
  Fetched,
  OsvQueryResult,
  SourceRepo,
  VersionSelection,
} from '../mapping';
import type { RequestContext, SourceName, SourceResult } from '../ports';
import type { DepsDevSystem, VersionRequest } from '../ports/depsdev-source';
import type { OsvEcosystem, OsvQuery } from '../ports/osv-source';
import { batchFallbackNote, sourceRepoUnverifiedNote } from './notes';
import { raceAbort } from './run-unit';
import type { UnitRunner } from './run-unit';
import { targetKey } from './targets';
import type { LookupTarget, ScanDeps, ScanNote } from './types';

type RunResult = Awaited<ReturnType<UnitRunner['runUnit']>>;

export interface VersionStageInput {
  readonly sources: Pick<ScanDeps['sources'], 'depsdev' | 'osv' | 'pypi'>;
  readonly runner: UnitRunner;
  readonly ctx: RequestContext;
  /** The looked-up Lookup_Targets (after the cap). */
  readonly targets: readonly LookupTarget[];
  /** `RegistryStageResult.depsdevPackages`, keyed by `targetKey`. */
  readonly depsdevPackages: ReadonlyMap<string, RunResult>;
  /** Web_Host of the validated configuration (Source_Repo host, R8.7). */
  readonly webHost: string;
}

/** Results of stage S6. Maps are keyed by `targetKey(ecosystem, name)`. */
export interface VersionStageResult {
  /** One selection per target. `selected: null` when deps.dev gave no usable package document. */
  readonly selections: ReadonlyMap<string, VersionSelection>;
  /**
   * Source_Repo per target with a Selected_Version: `ok` with the repo or null (no qualifying
   * entry), `absent` (HTTP 404 counted ok), `unavailable` (failed, R8.15). Targets without a
   * Selected_Version have no entry.
   */
  readonly sourceRepos: ReadonlyMap<string, Fetched<SourceRepo | null>>;
  /** OSV ids per target with a Selected_Version; `unavailable` when its batch failed. */
  readonly osv: ReadonlyMap<string, OsvQueryResult | 'unavailable'>;
  /** PyPI per-version document (EF-22) of every `pypi` target with a Selected_Version. */
  readonly pypiProjects: ReadonlyMap<string, Fetched<unknown>>;
  /** `batch-fallback` (at most one) and `source-repo-unverified` notes. */
  readonly notes: readonly ScanNote[];
}

const DEPSDEV_SYSTEM: { readonly [E in Ecosystem]: DepsDevSystem } = {
  npm: 'npm',
  pypi: 'pypi',
  cargo: 'cargo',
};

const OSV_ECOSYSTEM: { readonly [E in Ecosystem]: OsvEcosystem } = {
  npm: 'npm',
  pypi: 'PyPI',
  cargo: 'crates.io',
};

/** Work_Unit keys, unique within a scan together with the source name. */
export const versionUnitKeys = {
  versionBatch: (index: number): string => `versionbatch:${index}`,
  version: (t: Pick<LookupTarget, 'ecosystem' | 'name'>, version: string): string =>
    `version:${t.ecosystem}:${t.name}:${version}`,
  osvBatch: (index: number): string => `osv:batch:${index}`,
  /** An osv query that was not sent because the deps.dev package request failed (R17.8). */
  osvTarget: (t: Pick<LookupTarget, 'ecosystem' | 'name'>): string =>
    `osv:target:${t.ecosystem}:${t.name}`,
  pypiProject: (name: string, version: string): string => `pypi:${name}:${version}`,
};

function fetchedOf(result: SourceResult | RunResult): Fetched<unknown> {
  if (result.kind === 'ok') return { state: 'ok', body: result.body };
  if (result.kind === 'absent') return { state: 'absent' };
  return { state: 'unavailable' };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface Selected {
  readonly target: LookupTarget;
  readonly key: string;
  readonly version: string;
}

/**
 * Stage S6: version choice, Source_Repo, OSV ids and PyPI maintainers.
 *
 * The PyPI per-version request (EF-22) belongs to this stage (design S6, R12.5): it needs the
 * Selected_Version and sends nothing, and counts no Work_Unit, for a pypi target without one
 * (R12.16).
 *
 * Unit accounting:
 * - A `versionbatch` unit is recorded only when its body is usable. A batch that fails, is not
 *   JSON or has no `responses` array is replaced by single version documents, one unit each,
 *   and one `batch-fallback` note (R8.8). A request without a matching response is replaced
 *   the same way.
 * - An OSV batch with a `results` length different from its `queries` is recorded `failed`
 *   (`http-error`), and its targets get `unavailable` (R9.2).
 * - A target whose deps.dev package request `failed` gets an osv unit recorded as `prerequisite`
 *   (R17.8). A 404 or a package without a selectable version is not an Applicable_Unit.
 */
export async function runVersionStage(input: VersionStageInput): Promise<VersionStageResult> {
  const { sources, runner, ctx, targets, depsdevPackages, webHost } = input;

  const selections = new Map<string, VersionSelection>();
  const selected: Selected[] = [];
  for (const target of targets) {
    const key = targetKey(target.ecosystem, target.name);
    const pkg = depsdevPackages.get(key);
    if (pkg === undefined || pkg.kind !== 'ok') {
      selections.set(key, { selected: null, basis: null, notes: [] });
      // 404 is an `ok` unit with nothing to look up. Only a failed request is a prerequisite.
      if (pkg === undefined || pkg.kind === 'failed' || pkg.kind === 'unparsable') {
        runner.skipUnit('osv', versionUnitKeys.osvTarget(target), 'prerequisite');
      }
      continue;
    }
    const { versions, defaultVersion } = readDepsDevVersions(pkg.body);
    const pins: string[] = [];
    for (const spec of target.versionSpecs) {
      const pin = exactPin(spec, target.ecosystem);
      if (pin !== null) pins.push(pin);
    }
    const selection = selectVersion(pins, versions, defaultVersion);
    selections.set(key, selection);
    if (selection.selected !== null) {
      selected.push({ target, key, version: selection.selected });
    }
  }

  const sourceRepos = new Map<string, Fetched<SourceRepo | null>>();
  const osv = new Map<string, OsvQueryResult | 'unavailable'>();
  const pypiProjects = new Map<string, Fetched<unknown>>();
  const notes: ScanNote[] = [];
  let fallbackNoted = false;

  /** Runs a batch call without recording; the caller records the outcome it decides on. */
  const callRaw = async (call: () => Promise<SourceResult>): Promise<RunResult> => {
    let pending: Promise<SourceResult>;
    try {
      pending = call();
    } catch {
      pending = Promise.reject(new Error('call threw'));
    }
    return raceAbort(pending, ctx.signal);
  };

  /** Records an already known outcome in the ledger through the runner. */
  const record = (source: SourceName, unitKey: string, result: RunResult): Promise<RunResult> =>
    runner.runUnit(source, unitKey, () => Promise.resolve(result));

  const singleVersion = async (item: Selected): Promise<void> => {
    const result = await runner.runUnit('depsdev', versionUnitKeys.version(item.target, item.version), () =>
      sources.depsdev.getVersion(
        DEPSDEV_SYSTEM[item.target.ecosystem],
        item.target.name,
        item.version,
        ctx,
      ),
    );
    if (result.kind === 'ok') {
      sourceRepos.set(item.key, { state: 'ok', body: mapDepsDevVersion(result.body, webHost) });
    } else if (result.kind === 'absent') {
      sourceRepos.set(item.key, { state: 'absent' });
    } else {
      sourceRepos.set(item.key, { state: 'unavailable' });
    }
  };

  const fallback = async (items: readonly Selected[]): Promise<void> => {
    if (items.length === 0) return;
    // After the deadline the singles are recorded as `deadline` without a request; no note then.
    if (!fallbackNoted && !ctx.signal.aborted) {
      fallbackNoted = true;
      notes.push(batchFallbackNote());
    }
    await Promise.all(items.map(singleVersion));
  };

  const runVersionBatch = async (items: readonly Selected[], index: number): Promise<void> => {
    const requests: VersionRequest[] = items.map((item) => ({
      system: DEPSDEV_SYSTEM[item.target.ecosystem],
      name: item.target.name,
      version: item.version,
    }));
    const result = await callRaw(() => sources.depsdev.getVersionBatch(requests, ctx));
    const entries: readonly BatchEntry[] | null =
      result.kind === 'ok' ? mapDepsDevVersionBatch(result.body, requests, webHost) : null;
    if (entries === null) {
      // Failed, not JSON, or no `responses` array: the batch unit is replaced (R8.8).
      await fallback(items);
      return;
    }
    await record('depsdev', versionUnitKeys.versionBatch(index), result);
    const unmatched: Selected[] = [];
    items.forEach((item, i) => {
      const entry = entries[i];
      if (entry === undefined || !entry.found) unmatched.push(item);
      else sourceRepos.set(item.key, { state: 'ok', body: entry.sourceRepo });
    });
    await fallback(unmatched);
  };

  const runOsvBatch = async (items: readonly Selected[], index: number): Promise<void> => {
    const queries: OsvQuery[] = items.map((item) => ({
      name: item.target.name,
      ecosystem: OSV_ECOSYSTEM[item.target.ecosystem],
      version: item.version,
    }));
    const result = await callRaw(() => sources.osv.queryBatch(queries, ctx));
    const unitKey = versionUnitKeys.osvBatch(index);
    if (result.kind !== 'ok') {
      await record('osv', unitKey, result);
      for (const item of items) osv.set(item.key, 'unavailable');
      return;
    }
    const mapping = mapOsvQueryBatch(result.body, queries.length);
    if (mapping.kind === 'length-mismatch') {
      await record('osv', unitKey, { kind: 'failed', reason: 'http-error', status: null, headers: null });
      for (const item of items) osv.set(item.key, 'unavailable');
      return;
    }
    await record('osv', unitKey, result);
    items.forEach((item, i) => {
      osv.set(item.key, mapping.results[i] ?? { kind: 'invalid' });
    });
  };

  const runPypi = async (item: Selected): Promise<void> => {
    const result = await runner.runUnit('pypi', versionUnitKeys.pypiProject(item.target.name, item.version), () =>
      sources.pypi.getProject(item.target.name, item.version, ctx),
    );
    pypiProjects.set(item.key, fetchedOf(result));
  };

  await Promise.all([
    ...chunk(selected, DEPSDEV_BATCH_SIZE).map(runVersionBatch),
    ...chunk(selected, OSV_BATCH_SIZE).map(runOsvBatch),
    ...selected.filter((s) => s.target.ecosystem === 'pypi').map(runPypi),
  ]);

  // R8.14: one note per target whose Source_Repo was derived.
  for (const item of selected) {
    const repo = sourceRepos.get(item.key);
    if (repo !== undefined && repo.state === 'ok' && repo.body !== null) {
      notes.push(
        sourceRepoUnverifiedNote(
          item.target.ecosystem,
          item.target.name,
          `${webHost}/${repo.body.owner}/${repo.body.name}`,
        ),
      );
    }
  }

  return { selections, sourceRepos, osv, pypiProjects, notes };
}
