// Requirement 11.1, 11.2, 11.7, 11.8, 11.12, 11.13, 14.3, 14.4, 17.5, 17.8
import { GRAPHQL_BATCH_SIZE } from '../constants';
import { buildRepositoriesQuery, mapGraphqlRepos, planGraphqlBatches } from '../mapping';
import type {
  Fetched,
  GraphqlBatch,
  GraphqlRepoResult,
  IsoInstant,
  SourceRepo,
  VersionSelection,
} from '../mapping';
import type { RequestContext, SourceResult } from '../ports';
import type { GithubBudget } from './github-budget';
import { githubBudgetLowNote, githubTokenMissingNote } from './notes';
import { raceAbort } from './run-unit';
import type { UnitRunner } from './run-unit';
import { targetKey } from './targets';
import type { LookupTarget, ScanDeps, ScanNote } from './types';

type RunResult = Awaited<ReturnType<UnitRunner['runUnit']>>;

export interface RepoFactsStageInput {
  readonly sources: Pick<ScanDeps['sources'], 'github'>;
  readonly runner: UnitRunner;
  readonly ctx: RequestContext;
  readonly budget: GithubBudget;
  readonly asOf: IsoInstant;
  /** The looked-up Lookup_Targets (after the cap), ascending by ecosystem then name (R11.2). */
  readonly targets: readonly LookupTarget[];
  /** `VersionStageResult.selections`. */
  readonly selections: ReadonlyMap<string, VersionSelection>;
  /** `VersionStageResult.sourceRepos`. */
  readonly sourceRepos: ReadonlyMap<string, Fetched<SourceRepo | null>>;
  /** `RegistryStageResult.depsdevPackages`: a failed package request makes the target a prerequisite failure. */
  readonly depsdevPackages: ReadonlyMap<string, RunResult>;
}

/** Results of stage S8. */
export interface RepoFactsStageResult {
  /**
   * Per target, keyed by `targetKey`, ready for `RawTargetInputs.repository`. `no-source-repo`
   * for a target with no Source_Repo or whose Source_Repo is unknown; `unavailable` when the
   * request was not sent or failed.
   */
  readonly repository: ReadonlyMap<string, Fetched<GraphqlRepoResult> | 'no-source-repo'>;
  /** `github-token-missing` and `github-budget-low`, each at most once. */
  readonly notes: readonly ScanNote[];
}

/** Work_Unit keys of this stage. */
export const repoFactsUnitKeys = {
  batch: (index: number): string => `repos:batch:${index}`,
  /** A GraphQL request prevented because the Source_Repo is unknown (R17.8). */
  target: (t: Pick<LookupTarget, 'ecosystem' | 'name'>): string =>
    `repos:target:${t.ecosystem}:${t.name}`,
};

function repoKey(repo: SourceRepo): string {
  return `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}`;
}

const FAILED_UNIT: RunResult = { kind: 'failed', reason: 'http-error', status: null, headers: null };

/**
 * Stage S8: repository facts through GraphQL batches (EF-17).
 *
 * - A target whose deps.dev package request failed, or whose version document request failed
 *   (`unavailable`), gets one `prerequisite` unit and no request (R17.8). A target with no
 *   Source_Repo is not an Applicable_Unit (R11.7).
 * - Distinct Source_Repos are planned into batches; each batch is one `github` unit, sent one
 *   at a time. The `github` limiter is held by the HTTP client behind the source.
 * - Without a token every batch unit is `token-missing`, nothing is sent, and one
 *   `github-token-missing` note is added (R11.8).
 * - When the budget gate is closed before a batch, that batch and every later one is recorded
 *   `budget` without a request. One `github-budget-low` note is added when any batch ended
 *   `budget` (R11.13, R14.4).
 * - A batch whose alias results include a `failed` alias (foreign error type, missing data, or
 *   an unusable body) is recorded `failed` with reason `http-error` (R11.9, R11.12, R11.15). The
 *   data of its other aliases is kept. A `NOT_FOUND` alias is `ok` with null facts (R11.5).
 */
export async function runRepoFactsStage(input: RepoFactsStageInput): Promise<RepoFactsStageResult> {
  const { sources, runner, ctx, budget, asOf, targets, selections, sourceRepos, depsdevPackages } =
    input;

  const repository = new Map<string, Fetched<GraphqlRepoResult> | 'no-source-repo'>();
  const notes: ScanNote[] = [];

  // Source_Repo per target, first in target order wins the spelling (R11.2).
  const repoOfTarget = new Map<string, SourceRepo>();
  const distinct: SourceRepo[] = [];
  for (const target of targets) {
    const key = targetKey(target.ecosystem, target.name);
    repository.set(key, 'no-source-repo');

    const pkg = depsdevPackages.get(key);
    const packageFailed = pkg === undefined || pkg.kind === 'failed' || pkg.kind === 'unparsable';
    const selected = selections.get(key)?.selected ?? null;
    const repoDoc = sourceRepos.get(key);
    const versionDocFailed =
      selected !== null && (repoDoc === undefined || repoDoc.state === 'unavailable');
    if (packageFailed || versionDocFailed) {
      runner.skipUnit('github', repoFactsUnitKeys.target(target), 'prerequisite');
      repository.set(key, { state: 'unavailable' });
      continue;
    }
    if (repoDoc !== undefined && repoDoc.state === 'ok' && repoDoc.body !== null) {
      repoOfTarget.set(key, repoDoc.body);
      distinct.push(repoDoc.body);
    }
  }

  const batches: readonly GraphqlBatch[] = planGraphqlBatches(distinct, GRAPHQL_BATCH_SIZE);
  /** Result per lowercase `owner/name`; absent for a repo whose batch was not answered. */
  const byRepo = new Map<string, Fetched<GraphqlRepoResult>>();
  for (const batch of batches) {
    for (const { repo } of batch.aliases) byRepo.set(repoKey(repo), { state: 'unavailable' });
  }

  const hasToken = sources.github.hasToken();
  let budgetStopped = false;

  if (!hasToken) {
    batches.forEach((_, index) => {
      runner.skipUnit('github', repoFactsUnitKeys.batch(index), 'token-missing');
    });
    notes.push(githubTokenMissingNote());
  } else {
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index] as GraphqlBatch;
      const unitKey = repoFactsUnitKeys.batch(index);
      if (ctx.signal.aborted) {
        runner.skipUnit('github', unitKey, 'deadline');
        continue;
      }
      if (budgetStopped || !budget.allow()) {
        budgetStopped = true;
        runner.skipUnit('github', unitKey, 'budget');
        continue;
      }

      const { query, variables } = buildRepositoriesQuery(batch.aliases);
      // Sent without recording: the outcome also depends on the alias results (R11.9, R11.12).
      let pending: Promise<SourceResult>;
      try {
        pending = sources.github.queryRepositories(query, variables, ctx, budget);
      } catch {
        pending = Promise.reject(new Error('call threw'));
      }
      const result: RunResult = await raceAbort(pending, ctx.signal);

      let recorded: RunResult = result;
      if (result.kind === 'failed') {
        // The HTTP client may stop on the gate between attempts (R15.17).
        if (result.reason === 'budget') budgetStopped = true;
      } else if (result.kind === 'ok') {
        budget.observeGraphql(result.body);
        const mapped = mapGraphqlRepos(result.body, batch, asOf);
        for (const item of mapped) {
          const alias = batch.aliases.find((a) => a.alias === item.alias);
          if (alias === undefined) continue;
          byRepo.set(
            repoKey(alias.repo),
            item.kind === 'failed' ? { state: 'unavailable' } : { state: 'ok', body: item },
          );
        }
        if (mapped.some((item) => item.kind === 'failed')) recorded = FAILED_UNIT;
      }
      await runner.runUnit('github', unitKey, () => Promise.resolve(recorded));
    }
    if (budgetStopped) notes.push(githubBudgetLowNote(budget.remaining ?? 0, budget.resetAt));
  }

  for (const [key, repo] of repoOfTarget) {
    repository.set(key, byRepo.get(repoKey(repo)) ?? { state: 'unavailable' });
  }

  return { repository, notes };
}
