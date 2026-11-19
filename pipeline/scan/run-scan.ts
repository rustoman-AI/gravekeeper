// Requirement 16.1, 16.3, 16.4, 16.5, 16.9, 16.11, 16.12, 18.7, 21.8
// The scan controller: deadline timer, stages S1 to S9 in the order of the stage table, and the
// progress handle for the margin fallback. Scan_Cache lookup and store are wired in task 7.20.
import { DISCOVERY_MANIFEST_NAMES, DISCOVERY_MAX_DEPTH, DISCOVERY_MAX_MANIFESTS, DISCOVERY_SKIP_DIRS, SCAN_DEADLINE_MS } from '../constants';
import { err, ok } from '../internal/result';
import type { Result } from '../internal/result';
import { guard } from '../internal/safe';
import type { Fetched, RawTargetInputs } from '../mapping';
import type { RequestContext, SourceResult } from '../ports';
import { assembleResult } from './assemble-result';
import type { AssemblyManifest, AssemblySnapshot, PartialProgress } from './assemble-result';
import { GithubBudget } from './github-budget';
import { scanCacheKey } from './cache-keys';
import { WorkLedger } from './ledger';
import { storeDecision } from './scan-cache';
import { renderErrorMessage } from './messages';
import { createUnitRunner } from './run-unit';
import { runAdvisoryStage } from './stage-advisories';
import type { AdvisoryStageResult } from './stage-advisories';
import { runDiscoveryStage } from './stage-discovery';
import { runManifestStage, selectManifestStage } from './stage-manifests';
import { runRegistryStage } from './stage-registries';
import type { RegistryStageResult } from './stage-registries';
import { runRepoFactsStage } from './stage-repo-facts';
import type { RepoFactsStageResult } from './stage-repo-facts';
import { runVersionStage } from './stage-versions';
import type { VersionStageResult } from './stage-versions';
import { planLookupTargets, targetKey } from './targets';
import type { TargetPlan } from './targets';
import type { LedgerEntry, ScanDeps, ScanError, ScanInput, ScanNote, ScanOutcome, ScanProgress, ScanRepo } from './types';

/** The writable side of a `ScanProgress`: what `runScan` feeds and what the margin path reads. */
export interface ScanProgressHandle extends PartialProgress {
  ledger: readonly LedgerEntry[];
  discovery: ScanProgress['discovery'];
  snapshot: AssemblySnapshot | null;
  closed: boolean;
  /** After `close`, a late scan no longer updates the handle. */
  close(): void;
}

/** Creates the progress handle that `handleScanRequest` shares with `runScan`. */
export function createScanProgress(): ScanProgressHandle {
  const handle: ScanProgressHandle = {
    ledger: [],
    discovery: null,
    snapshot: null,
    closed: false,
    close(): void {
      handle.closed = true;
    },
  };
  return handle;
}

type RunResult = SourceResult<unknown> | Extract<SourceResult, { readonly kind: 'failed' }>;

function fetchedOf(result: RunResult | undefined): Fetched<unknown> {
  if (result === undefined) return { state: 'unavailable' };
  if (result.kind === 'ok') return { state: 'ok', body: result.body };
  if (result.kind === 'absent') return { state: 'absent' };
  return { state: 'unavailable' };
}

const internalError = (webHost: string): ScanError => ({
  code: 'internal-error',
  message: renderErrorMessage('internal-error', undefined, webHost),
});

/**
 * Runs one scan. Never rejects: a thrown exception becomes `internal-error` (R21.8).
 * The deadline timer runs on the injected Timer and is cleared when the scan settles.
 */
export function runScan(input: ScanInput, deps: ScanDeps): Promise<Result<ScanOutcome, ScanError>> {
  const failure = (): Result<ScanOutcome, ScanError> => err(internalError(deps.config.webHost));
  return guard(
    () => scan(input, deps).catch(failure),
    () => Promise.resolve(failure()),
  );
}

async function scan(input: ScanInput, deps: ScanDeps): Promise<Result<ScanOutcome, ScanError>> {
  const { sources, timer, config, limits } = deps;
  const webHost = config.webHost;
  const deadlineMs = deps.deadlineMs ?? SCAN_DEADLINE_MS;

  const controller = new AbortController();
  const signal = controller.signal;
  const timerHandle = timer.setTimeout(() => controller.abort(), deadlineMs);
  try {
    const ctx: RequestContext = { signal, deadlineAtMs: input.startedAtMs + deadlineMs };
    const ledger = new WorkLedger();
    const runner = createUnitRunner(ledger, signal);
    const budget = new GithubBudget();

    const progress = deps.progress as ScanProgressHandle | undefined;
    const feed = (update: (handle: ScanProgressHandle) => void): void => {
      if (progress === undefined || progress.closed) return;
      try {
        update(progress);
      } catch {
        // A frozen or foreign handle never affects the scan.
      }
    };
    feed((p) => {
      p.ledger = ledger.entries;
    });

    // S1: discovery. Any error here is the scan's error (R16.11).
    const discovered = await runDiscoveryStage({
      github: sources.github,
      runner,
      budget,
      ctx,
      repo: input.repo,
      limits: {
        maxDepth: DISCOVERY_MAX_DEPTH,
        maxManifests: DISCOVERY_MAX_MANIFESTS,
        manifestNames: DISCOVERY_MANIFEST_NAMES,
        skipDirs: DISCOVERY_SKIP_DIRS,
      },
      webHost,
    });
    if (!discovered.ok) return err(discovered.error);
    const found = discovered.value;
    const repo: ScanRepo = {
      host: webHost,
      owner: found.owner,
      repo: found.repo,
      branch: found.branch,
      defaultBranch: found.defaultBranch,
      commitSha: found.commitSha,
    };

    // S2: selection (no request). From here on the scan always returns a Scan_Result.
    const manifestInput = {
      github: sources.github,
      runner,
      budget,
      ctx,
      discovered: found,
      requested: input.manifests,
      limits: { maxManifests: limits.maxManifests, manifestNames: DISCOVERY_MANIFEST_NAMES },
      webHost,
    };
    const selection = selectManifestStage(manifestInput);
    if (!selection.ok) return err(selection.error);

    // Scan_Cache lookup (R19.5, R19.6): canonical values only. A live entry is returned unchanged.
    const cacheKey = scanCacheKey({
      webHost,
      owner: found.owner,
      repo: found.repo,
      branch: found.branch,
      defaultBranch: found.defaultBranch,
      commitSha: found.commitSha,
      manifestPaths: selection.value.selected,
    });
    const cached = await deps.scanCache.get(cacheKey, signal).catch(() => null);
    if (cached !== null) return ok({ result: cached, fromCache: true });

    // Mutable view of what the stages have produced so far, republished after every stage.
    let manifests: readonly AssemblyManifest[] = [];
    let plan: TargetPlan = {
      targets: [],
      capped: { limit: limits.maxDependencies, total: 0, skipped: [] },
    };
    let raw: ReadonlyMap<string, RawTargetInputs> = new Map();
    let stageNotes: readonly ScanNote[] = [];
    const snapshot = (): AssemblySnapshot => ({
      repo,
      discovery: found.discovery,
      manifests,
      plan,
      raw,
      stageNotes,
    });
    const publish = (): void => feed((p) => {
      p.snapshot = snapshot();
    });
    feed((p) => {
      p.discovery = { commitSha: found.commitSha, selection: selection.value.selected };
    });
    stageNotes = selection.value.notes;
    publish();

    // S3: manifest fetch and parse, one at a time.
    const fetchedManifests = await runManifestStage(manifestInput);
    if (!fetchedManifests.ok) return err(fetchedManifests.error);
    manifests = fetchedManifests.value.manifests;
    const manifestNotes = fetchedManifests.value.notes;
    stageNotes = manifestNotes;
    publish();

    // S4: Lookup_Targets and the cap.
    const dependencies = manifests.flatMap((m) => m.dependencies);
    plan = planLookupTargets(dependencies, limits.maxDependencies);
    const targets = plan.targets;
    publish();

    // S5 to S8 feed the raw inputs of each target.
    const rawOf = (
      registries: RegistryStageResult | null,
      versions: VersionStageResult | null,
      advisories: AdvisoryStageResult | null,
      repoFacts: RepoFactsStageResult | null,
    ): Map<string, RawTargetInputs> => {
      const out = new Map<string, RawTargetInputs>();
      for (const target of targets) {
        const key = targetKey(target.ecosystem, target.name);
        const npmLatest = fetchedOf(registries?.npmLatest.get(key));
        let maintainers: Fetched<unknown> = { state: 'unavailable' };
        if (target.ecosystem === 'npm') maintainers = npmLatest;
        else if (target.ecosystem === 'cargo') maintainers = fetchedOf(registries?.cratesOwners.get(key));
        else maintainers = versions?.pypiProjects.get(key) ?? { state: 'unavailable' };
        out.set(key, {
          ecosystem: target.ecosystem,
          name: target.name,
          versionSpecs: target.versionSpecs,
          depsdevPackage: fetchedOf(registries?.depsdevPackages.get(key)),
          npmLatest,
          maintainers,
          osv: advisories?.osv.get(key) ?? {
            queryResult: versions?.osv.get(key) ?? 'unavailable',
            advisories: new Map(),
            unfetchedIds: [],
          },
          repository: repoFacts?.repository.get(key) ?? 'no-source-repo',
          webHost,
        });
      }
      return out;
    };

    // S5: package documents and registries.
    const registries = await runRegistryStage({
      sources: { depsdev: sources.depsdev, npm: sources.npm, cratesio: sources.cratesio },
      runner,
      ctx,
      targets,
      dependencies,
    });
    raw = rawOf(registries, null, null, null);
    publish();

    // S6: version choice, Source_Repo, OSV ids, PyPI maintainers.
    const versions = await runVersionStage({
      sources: { depsdev: sources.depsdev, osv: sources.osv, pypi: sources.pypi },
      runner,
      ctx,
      targets,
      depsdevPackages: registries.depsdevPackages,
      webHost,
    });
    raw = rawOf(registries, versions, null, null);
    stageNotes = [...manifestNotes, ...versions.notes];
    publish();

    // S7 and S8 run concurrently.
    const [advisories, repoFacts] = await Promise.all([
      runAdvisoryStage({
        sources: { depsdev: sources.depsdev, osv: sources.osv },
        runner,
        ctx,
        osv: versions.osv,
        maxAdvisoryDetails: limits.maxAdvisoryDetails,
      }),
      runRepoFactsStage({
        sources: { github: sources.github },
        runner,
        ctx,
        budget,
        asOf: input.asOf,
        targets,
        selections: versions.selections,
        sourceRepos: versions.sourceRepos,
        depsdevPackages: registries.depsdevPackages,
      }),
    ]);
    raw = rawOf(registries, versions, advisories, repoFacts);
    stageNotes = [...manifestNotes, ...versions.notes, ...repoFacts.notes];
    publish();

    // S9: assemble. In memory only, no I/O (R16.12).
    const result = assembleResult({
      ...snapshot(),
      asOf: input.asOf,
      ledger: [...ledger.entries],
      deadlineReached: signal.aborted,
    });
    // Store rule (R19.5, R19.7, R19.22). Once the margin path closed the handle, the response
    // was assembled from partial progress, so a late full result is not stored (R19.21).
    if (!(progress?.closed ?? false)) {
      const decision = storeDecision(
        result.sources,
        result.notes,
        ledger.entries.filter((entry) => entry.source === 'cratesio'),
      );
      if (decision.store) await deps.scanCache.set(cacheKey, result, decision.ttlSeconds).catch(() => undefined);
    }
    return ok({ result, fromCache: false });
  } finally {
    timer.clearTimeout(timerHandle);
  }
}
