// Requirement 21.1, 21.3, 21.8, 21.10, 21.13, 21.14, 21.15, 6.1, 16.12, 16.13, 2.11
/**
 * The Scan_Route handler without Next.js: validation in the order of R21.13, R21.3 and R21.14,
 * the single clock reading (Scan_Start and `asOf`), and the scan raced against the margin timer.
 * Every response goes through `respond`. The function never rejects: an exception anywhere becomes
 * `internal-error` with the fixed message (R21.8).
 */
import { REQUEST_BODY_MAX_BYTES, SCAN_DEADLINE_MS, SCAN_MAX_DEPENDENCIES, SCAN_MAX_MANIFESTS, OSV_MAX_ADVISORY_DETAILS, SCAN_RESPONSE_MARGIN_MS } from '../constants';
import { readGithubConfig } from '../config/github-config';
import type { GithubEnv } from '../config/github-config';
import type { IsoInstant } from '../mapping';
import type { GithubConfig } from '../ports';
import { assemblePartial } from '../scan/assemble-result';
import { renderErrorMessage } from '../scan/messages';
import { createScanProgress, runScan } from '../scan/run-scan';
import type { ScanDeps, ScanErrorBody, ScanInput, ScanOutcome } from '../scan/types';
import { isValidBranchName, parseRepoUrl } from '../url/parse-repo-url';
import { readRequestBody } from './read-body';
import { respond } from './scan-error';
import type { ApiResponse, ScanResponseBody } from './scan-error';
import { checkMediaType, findBranchConflict, validateRequestBody } from './validate-request';

export interface RawScanRequest {
  readonly method: string;
  readonly contentType: string | null;
  readonly contentLength: string | null;
  readonly body: ReadableStream<Uint8Array> | null;
}

export interface ApiDeps extends Omit<ScanDeps, 'config' | 'limits' | 'progress'> {
  /** The GitHub variables of R2.1. The route passes the runtime environment. */
  readonly readEnv: () => GithubEnv;
}

/** `asOf` for responses built before the clock is read. Only `upstream-unavailable` looks at it. */
const NO_AS_OF: IsoInstant = '1970-01-01T00:00:00.000Z';

const errorBody = (error: ScanErrorBody): ScanResponseBody => ({ ok: false, error });

const fail = (error: ScanErrorBody, asOf: IsoInstant = NO_AS_OF): ApiResponse =>
  respond(errorBody(error), asOf);

const internalError = (): ScanErrorBody => ({
  code: 'internal-error',
  message: renderErrorMessage('internal-error', undefined, ''),
});

const outcomeResponse = (outcome: ScanOutcome, asOf: IsoInstant): ApiResponse =>
  outcome.ok ? respond({ ...outcome.value }, asOf) : fail(outcome.error, asOf);

export async function handleScanRequest(request: RawScanRequest, deps: ApiDeps): Promise<ApiResponse> {
  try {
    return await handle(request, deps);
  } catch {
    return fail(internalError());
  }
}

async function handle(request: RawScanRequest, deps: ApiDeps): Promise<ApiResponse> {
  // R21.13: method first, body untouched.
  if (request.method !== 'POST') {
    return fail({
      code: 'invalid-request',
      message: renderErrorMessage('invalid-request', { reason: 'method-not-allowed' }, ''),
      details: { reason: 'method-not-allowed' },
    });
  }

  // R21.3 (a)
  const media = checkMediaType(request.contentType);
  if (!media.ok) return fail(media.error);

  // R21.3 (b), (c)
  const read = await readRequestBody(
    {
      headers: { get: (name) => (name.toLowerCase() === 'content-length' ? request.contentLength : null) },
      body: request.body,
    },
    REQUEST_BODY_MAX_BYTES,
  );
  if (read.type === 'body-too-large') {
    return fail({
      code: 'invalid-request',
      message: renderErrorMessage('invalid-request', { reason: 'body-too-large' }, ''),
      details: { reason: 'body-too-large' },
    });
  }
  if (read.type === 'invalid-json') {
    return fail({
      code: 'invalid-request',
      message: renderErrorMessage('invalid-request', { reason: 'invalid-json' }, ''),
      details: { reason: 'invalid-json' },
    });
  }

  // R21.3 (c) to (h)
  const body = validateRequestBody(read.text);
  if (!body.ok) return fail(body.error);

  // R21.14 (a)
  const config: GithubConfig | ScanErrorBody = configOrError(deps);
  if (isError(config)) return fail(config);

  // R21.14 (b)
  const url = parseRepoUrl(body.value.repoUrl, config.webHost);
  if (!url.ok) return fail(url.error);

  // R21.14 (c)
  const bodyBranch = body.value.branch;
  if (bodyBranch !== undefined && !isValidBranchName(bodyBranch)) {
    return fail({
      code: 'invalid-url',
      message: renderErrorMessage('invalid-url', { part: 'branch' }, config.webHost),
      details: { part: 'branch' },
    });
  }

  // R21.14 (d)
  const conflict = findBranchConflict(bodyBranch, url.value.branch);
  if (conflict !== null) return fail(conflict);

  // R6.1: the one clock reading. Scan_Start and asOf come from it.
  const startedAtMs = deps.clock();
  const asOf: IsoInstant = new Date(startedAtMs).toISOString();

  // R21.14 (e), R21.15
  const input: ScanInput = {
    repo: { ...url.value, branch: bodyBranch ?? url.value.branch },
    manifests: body.value.manifests ?? [],
    asOf,
    startedAtMs,
  };

  const progress = createScanProgress();
  const { readEnv: _readEnv, ...scanDeps } = deps;
  void _readEnv;
  const scan = runScan(input, {
    ...scanDeps,
    config,
    limits: {
      maxManifests: SCAN_MAX_MANIFESTS,
      maxDependencies: SCAN_MAX_DEPENDENCIES,
      maxAdvisoryDetails: OSV_MAX_ADVISORY_DETAILS,
    },
    progress,
  });

  // R16.12, R16.13: the margin race. A late scan result is discarded (and, because the progress
  // is closed, never cached).
  const scanSettled = scan.then(
    (outcome) => ({ kind: 'scan' as const, outcome }),
    () => ({ kind: 'scan' as const, outcome: null }),
  );
  let marginHandle: ReturnType<typeof deps.timer.setTimeout> | undefined;
  const margin = new Promise<{ readonly kind: 'margin' }>((resolve) => {
    marginHandle = deps.timer.setTimeout(
      () => resolve({ kind: 'margin' }),
      SCAN_DEADLINE_MS + SCAN_RESPONSE_MARGIN_MS,
    );
  });
  const winner = await Promise.race([scanSettled, margin]);
  if (marginHandle !== undefined) deps.timer.clearTimeout(marginHandle);

  if (winner.kind === 'margin') {
    progress.close();
    return outcomeResponse(assemblePartial(progress, { asOf, repo: input.repo }), asOf);
  }
  if (winner.outcome === null) return fail(internalError(), asOf);
  return outcomeResponse(winner.outcome, asOf);
}

function configOrError(deps: ApiDeps): GithubConfig | ScanErrorBody {
  const config = readGithubConfig(deps.readEnv());
  return config.ok ? config.value : config.error;
}

function isError(value: GithubConfig | ScanErrorBody): value is ScanErrorBody {
  return 'code' in value;
}
