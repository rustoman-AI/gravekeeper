// Requirement 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.12, 3.13, 4.1, 4.11, 16.11, 18.1
import { err, ok } from '../internal/result';
import type { Result } from '../internal/result';
import { discoverManifests, readCommitSha, readRepository } from '../mapping';
import type { DiscoveryLimits, DiscoveryResult, IsoInstant } from '../mapping';
import { readRestRateLimit } from '../mapping/rate-limit';
import type { GithubSource, RequestContext, SourceResult } from '../ports';
import type { GithubBudget } from './github-budget';
import { renderErrorMessage } from './messages';
import type { UnitRunner } from './run-unit';
import type { RepoRef, ScanError } from './types';

/** Work_Unit keys of the three discovery requests. */
export const DISCOVERY_UNIT_KEYS = {
  repository: 'github:repository',
  branch: 'github:branch',
  tree: 'github:tree',
} as const;

export interface DiscoveryStageInput {
  readonly github: GithubSource;
  readonly runner: UnitRunner;
  /** The GitHub_Budget shared by the whole scan; it is also the gate of every request. */
  readonly budget: GithubBudget;
  readonly ctx: RequestContext;
  /** Repo_Ref as parsed (R2.11 canonical form: `branch` is already percent-decoded). */
  readonly repo: RepoRef;
  readonly limits: DiscoveryLimits;
  /** Web_Host of the validated configuration, used by the message renderer. */
  readonly webHost: string;
}

export interface DiscoveryStageOutput {
  /** Canonical owner and repo from `full_name` (R3.12). */
  readonly owner: string;
  readonly repo: string;
  /** The requested branch, or `default_branch` when none was requested (R3.3). */
  readonly branch: string;
  /** `default_branch` of the repository response; the selected branch when GitHub gave none. */
  readonly defaultBranch: string;
  readonly commitSha: string;
  readonly discovery: DiscoveryResult;
  /** The parsed tree response body, for the selection stage. */
  readonly treeBody: unknown;
}

type Step = 'repository' | 'branch' | 'tree';

function scanError(
  code: 'repo-not-found' | 'deadline-exceeded',
  webHost: string,
): ScanError;
function scanError(
  code: 'branch-not-found',
  webHost: string,
  details: { readonly branch: string },
): ScanError;
function scanError(
  code: 'upstream-unavailable',
  webHost: string,
  details: { readonly source: 'github'; readonly resetAt?: IsoInstant },
): ScanError;
function scanError(code: string, webHost: string, details?: object): ScanError {
  const message = renderErrorMessage(
    code as ScanError['code'],
    details as Parameters<typeof renderErrorMessage>[1],
    webHost,
  );
  return (details === undefined ? { code, message } : { code, message, details }) as ScanError;
}

function upstreamUnavailable(webHost: string, resetAt: IsoInstant | null): ScanError {
  return scanError(
    'upstream-unavailable',
    webHost,
    resetAt === null ? { source: 'github' } : { source: 'github', resetAt },
  );
}

/**
 * S1: repository, branch and tree requests in this order, each one only when
 * the previous one succeeded. The repository and branch requests are always
 * sent, so the canonical identity is known before any Scan_Cache lookup
 * (R3.13). Every failure is a typed Scan_Error; nothing throws.
 */
export async function runDiscoveryStage(
  input: DiscoveryStageInput,
): Promise<Result<DiscoveryStageOutput, ScanError>> {
  const { github, runner, budget, ctx, repo: ref, limits, webHost } = input;
  const unavailable = (resetAt: IsoInstant | null): ScanError =>
    upstreamUnavailable(webHost, resetAt);
  const deadline = (): ScanError => scanError('deadline-exceeded', webHost);

  /** Sends one request unless the budget is below the threshold (R3.7, R14.5). */
  async function send(
    step: Step,
    call: () => Promise<SourceResult>,
  ): Promise<Result<SourceResult, ScanError>> {
    if (ctx.signal.aborted) {
      // Records `deadline` without sending.
      await runner.runUnit('github', DISCOVERY_UNIT_KEYS[step], call);
      return err(deadline());
    }
    if (!budget.allow()) {
      runner.skipUnit('github', DISCOVERY_UNIT_KEYS[step], 'budget');
      return err(unavailable(budget.resetAt as IsoInstant | null));
    }
    const result = await runner.runUnit('github', DISCOVERY_UNIT_KEYS[step], call);
    if (result.kind !== 'failed') return ok(result);
    if (result.reason === 'deadline') return err(deadline());
    // Only an integer X-RateLimit-Reset of this response gives a resetAt (R3.7);
    // a request that was not sent for budget reasons reports the budget's own reading.
    const fromHeaders =
      result.headers === null ? null : readRestRateLimit(result.headers).resetAt;
    const fromBudget = result.reason === 'budget' ? (budget.resetAt as IsoInstant | null) : null;
    return err(unavailable(fromHeaders ?? fromBudget));
  }

  try {
    // R3.1: the first GitHub request of the scan, also when a branch was given.
    const repoSent = await send('repository', () =>
      github.getRepository({ owner: ref.owner, repo: ref.repo }, ctx, budget),
    );
    if (!repoSent.ok) return err(repoSent.error);
    const repoResult = repoSent.value;
    if (repoResult.kind === 'absent') return err(scanError('repo-not-found', webHost));
    if (repoResult.kind !== 'ok') return err(unavailable(null)); // unparsable (R3.10)
    const info = readRepository(repoResult.body);
    if (!info.ok) return err(unavailable(null)); // R3.9, R3.10, R3.12
    if (info.value.private) return err(scanError('repo-not-found', webHost)); // R3.2

    const owner = info.value.owner;
    const repo = info.value.repo;
    const branch = ref.branch ?? info.value.defaultBranch; // R3.3
    const defaultBranch = info.value.defaultBranch;

    // R3.4: the branch name is passed unchanged; the adapter encodes it once.
    const branchSent = await send('branch', () =>
      github.getBranch({ owner, repo }, branch, ctx, budget),
    );
    if (!branchSent.ok) return err(branchSent.error);
    const branchResult = branchSent.value;
    if (branchResult.kind === 'absent') {
      return err(scanError('branch-not-found', webHost, { branch })); // R3.5
    }
    if (branchResult.kind !== 'ok') return err(unavailable(null));
    const commitSha = readCommitSha(branchResult.body);
    if (commitSha === null) return err(unavailable(null)); // R3.6, R3.10

    // R4.1, R4.11: a 404 of the tree request is a `failed` unit, so upstream-unavailable.
    const treeSent = await send('tree', () =>
      github.getTree({ owner, repo }, commitSha, ctx, budget),
    );
    if (!treeSent.ok) return err(treeSent.error);
    const treeResult = treeSent.value;
    if (treeResult.kind !== 'ok') return err(unavailable(null));
    const discovered = discoverManifests(treeResult.body, limits);
    if (!discovered.ok) return err(unavailable(null));

    return ok({
      owner,
      repo,
      branch,
      defaultBranch,
      commitSha,
      discovery: discovered.value,
      treeBody: treeResult.body,
    });
  } catch {
    return err(unavailable(null));
  }
}
