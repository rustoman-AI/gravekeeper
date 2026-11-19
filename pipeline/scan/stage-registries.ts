// Requirement 8.1, 12.1, 12.2, 12.5, 12.10, 12.13, 12.14, 16.1
import type { Dependency, Scope } from '@/core';
import { orderCratesLookups } from '../mapping';
import type { RequestContext, SourceResult } from '../ports';
import type { DepsDevSystem } from '../ports/depsdev-source';
import type { UnitRunner } from './run-unit';
import { targetKey } from './targets';
import type { LookupTarget, ScanDeps } from './types';

type RunResult = Awaited<ReturnType<UnitRunner['runUnit']>>;

export interface RegistryStageInput {
  readonly sources: Pick<ScanDeps['sources'], 'depsdev' | 'npm' | 'cratesio'>;
  readonly runner: UnitRunner;
  readonly ctx: RequestContext;
  /** The looked-up Lookup_Targets (after the cap). */
  readonly targets: readonly LookupTarget[];
  /** The parsed dependencies. Only the scopes of `cargo` targets are read (R12.14). */
  readonly dependencies: readonly Dependency[];
}

/** Results of stage S5. Maps are keyed by `targetKey(ecosystem, name)`. */
export interface RegistryStageResult {
  /** deps.dev package document (EF-1) of every target. */
  readonly depsdevPackages: ReadonlyMap<string, RunResult>;
  /** npm `latest` document (EF-20) of every `npm` target. */
  readonly npmLatest: ReadonlyMap<string, RunResult>;
  /** crates.io owners (EF-21) of every `cargo` target. */
  readonly cratesOwners: ReadonlyMap<string, RunResult>;
}

const DEPSDEV_SYSTEM: { readonly [E in LookupTarget['ecosystem']]: DepsDevSystem } = {
  npm: 'npm',
  pypi: 'pypi',
  cargo: 'cargo',
};

/** Work_Unit keys, unique within a scan together with the source name. */
export const registryUnitKeys = {
  depsdevPackage: (t: Pick<LookupTarget, 'ecosystem' | 'name'>): string =>
    `pkg:${t.ecosystem}:${t.name}`,
  npmLatest: (name: string): string => `latest:${name}`,
  cratesOwners: (name: string): string => `owners:${name}`,
};

/**
 * Stage S5: deps.dev package documents, npm `latest` and crates.io owners, all
 * started together. The source limits (depsdev 8, npm 8, cratesio 1 with spacing)
 * are applied by the HTTP client's limiters, not here. Owners calls are started in
 * the order of `orderCratesLookups` (R12.14) so the limiter serves them in that
 * order and the deadline cuts the last ones. An unexpired owners entry is answered
 * by the caching client without a request (R12.13); this stage does nothing extra.
 * PyPI is not part of S5: it needs the Selected_Version and runs in S6 (R12.5).
 */
export async function runRegistryStage(input: RegistryStageInput): Promise<RegistryStageResult> {
  const { sources, runner, ctx, targets, dependencies } = input;

  const depsdevPackages = new Map<string, Promise<RunResult>>();
  const npmLatest = new Map<string, Promise<RunResult>>();
  const cratesOwners = new Map<string, Promise<RunResult>>();

  const start = <T>(
    source: Parameters<UnitRunner['runUnit']>[0],
    unitKey: string,
    call: () => Promise<SourceResult<T>>,
  ): Promise<RunResult> => runner.runUnit(source, unitKey, call);

  for (const target of targets) {
    const key = targetKey(target.ecosystem, target.name);
    depsdevPackages.set(
      key,
      start('depsdev', registryUnitKeys.depsdevPackage(target), () =>
        sources.depsdev.getPackage(DEPSDEV_SYSTEM[target.ecosystem], target.name, ctx),
      ),
    );
    if (target.ecosystem === 'npm') {
      npmLatest.set(
        key,
        start('npm', registryUnitKeys.npmLatest(target.name), () =>
          sources.npm.getLatest(target.name, ctx),
        ),
      );
    }
  }

  const cargoNames = new Set(
    targets.filter((t) => t.ecosystem === 'cargo').map((t) => t.name),
  );
  const scopesByName = new Map<string, Scope[]>();
  for (const dependency of dependencies) {
    if (dependency.ecosystem !== 'cargo' || !cargoNames.has(dependency.name)) continue;
    const scopes = scopesByName.get(dependency.name);
    if (scopes === undefined) scopesByName.set(dependency.name, [dependency.scope]);
    else scopes.push(dependency.scope);
  }
  const ordered = orderCratesLookups(
    [...scopesByName].map(([name, scopes]) => ({ name, scopes })),
  );
  // Targets without a dependency entry (not expected) still get a lookup, last.
  const rest = [...cargoNames].filter((n) => !scopesByName.has(n)).sort();
  for (const name of [...ordered, ...rest]) {
    cratesOwners.set(
      targetKey('cargo', name),
      start('cratesio', registryUnitKeys.cratesOwners(name), () =>
        sources.cratesio.getOwners(name, ctx),
      ),
    );
  }

  const settle = async (
    pending: ReadonlyMap<string, Promise<RunResult>>,
  ): Promise<ReadonlyMap<string, RunResult>> => {
    const entries = await Promise.all(
      [...pending].map(async ([key, promise]) => [key, await promise] as const),
    );
    return new Map(entries);
  };

  const [pkg, npm, owners] = await Promise.all([
    settle(depsdevPackages),
    settle(npmLatest),
    settle(cratesOwners),
  ]);
  return { depsdevPackages: pkg, npmLatest: npm, cratesOwners: owners };
}
