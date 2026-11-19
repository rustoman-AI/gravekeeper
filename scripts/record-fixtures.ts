import { join, resolve } from 'node:path';
import { readGithubToken } from '../adapters/runtime/token-reader';
import { FIXTURE_SET_MAX_BYTES, GITHUB_DEFAULT_WEB_HOST } from '../pipeline/constants';
import { runScan } from '../pipeline/scan/run-scan';
import type { RequestContext } from '../pipeline/ports/http';
import { FixtureHttpClient } from '../tests/support/fixture-http-client';
import {
  describeOversize,
  discardStaged,
  FixtureRejectedError,
  promoteStagedSet,
  RECORDER_VERSION,
  stageFixtureSet,
  type FixtureMetadata,
} from './fixtures/fixture-set';
import { missingPreconditions } from './fixtures/preconditions';
import {
  buildScanDeps,
  buildSourcesOver,
  createRecordingStack,
  recordingConfig,
  RECORDING_DEADLINE_MS,
} from './fixtures/recorder-stack';
import { SUPPLEMENTARY_SPECS, supplementaryGate } from './fixtures/supplementary';
import { resolveUserAgent, readRuntimeEnv } from '../adapters/runtime/env';

// Requirement 23.2, 23.3, 23.4, 23.6, 23.7, 23.10, 23.16, 20.13
// Fixture_Recorder (flag-gated). Run only with the user's go-ahead: it sends live requests.

const FIXTURES_ROOT = resolve(__dirname, '..', 'tests', 'fixtures');

interface RepoSpec {
  readonly kind: 'npm' | 'python' | 'rust';
  readonly owner: string;
  readonly repo: string;
}

/** The three fixture repositories of the design ("The three fixture repositories"). */
const REPOS: readonly RepoSpec[] = [
  { kind: 'npm', owner: 'request', repo: 'request' },
  { kind: 'python', owner: 'revmic', repo: 'canopy' },
  { kind: 'rust', owner: 'ajeetdsouza', repo: 'zoxide' },
];

function stagingPath(label: string): string {
  return join(FIXTURES_ROOT, `.recording-${label}`);
}

/** R23.4 replay check of a staged set: `ok` true, nothing missing, one archived or deprecated dependency. */
async function replayCheck(stagingDir: string, repo: RepoSpec, asOf: string): Promise<string | null> {
  const config = recordingConfig();
  const client = new FixtureHttpClient(stagingDir);
  const { http: _http, ...sources } = buildSourcesOver(client, config, true, resolveUserAgent(readRuntimeEnv()));
  void _http;
  const startedAtMs = Date.parse(asOf);
  const outcome = await runScan(
    {
      repo: { host: GITHUB_DEFAULT_WEB_HOST, owner: repo.owner, repo: repo.repo, branch: null },
      manifests: [],
      asOf,
      startedAtMs,
    },
    buildScanDeps(sources, config, () => startedAtMs),
  );
  const first = client.misses[0];
  if (first !== undefined) return `replay missed a request (source ${first.source}, ${first.method})`;
  if (!outcome.ok) return `replay scan failed with ${outcome.error.code}`;
  const flagged = outcome.value.dependencies.some(
    (d) => d.facts.archived === true || d.facts.deprecated === true,
  );
  return flagged ? null : 'replay scan has no dependency with archived or deprecated true (R23.4)';
}

/** Replaces the previous set by the staged one (size and replay checks have passed). */
function finish(label: string, stagingDir: string, targetDir: string, totalBytes: number): null {
  promoteStagedSet(stagingDir, targetDir);
  console.log(`${label}: written (${totalBytes} bytes)`);
  return null;
}

async function recordRepo(spec: RepoSpec, token: string | null): Promise<string | null> {
  const label = `${spec.owner}__${spec.repo}`.toLowerCase();
  const stagingDir = stagingPath(label);
  const stack = createRecordingStack();
  const startedAtMs = Date.now();
  const asOf = new Date(startedAtMs).toISOString();
  try {
    const outcome = await runScan(
      {
        repo: { host: GITHUB_DEFAULT_WEB_HOST, owner: spec.owner, repo: spec.repo, branch: null },
        manifests: [],
        asOf,
        startedAtMs,
      },
      stack.deps,
    );
    if (!outcome.ok) return `${label}: scan failed with ${outcome.error.code}`;
    if (stack.recorder.failures > 0) {
      return `${label}: ${stack.recorder.failures} request(s) failed while recording; the set would be incomplete`;
    }
    const result = outcome.value;
    const metadata: FixtureMetadata = {
      kind: spec.kind,
      canonicalRepoUrl: `https://${result.repo.host}/${result.repo.owner}/${result.repo.repo}`,
      recordedAt: new Date().toISOString(),
      asOf,
      manifestPaths: result.manifests.map((m) => m.path),
      recorderVersion: RECORDER_VERSION,
    };
    const staged = stageFixtureSet(stagingDir, metadata, stack.recorder.responses(), token);
    const targetDir = join(FIXTURES_ROOT, label);
    const problem = await (async (): Promise<string | null> => {
      if (staged.totalBytes > FIXTURE_SET_MAX_BYTES) {
        return describeOversize(label, staged, FIXTURE_SET_MAX_BYTES);
      }
      const replay = await replayCheck(stagingDir, spec, asOf);
      return replay === null ? null : `${label}: ${replay}`;
    })();
    if (problem !== null) return problem;
    return finish(label, stagingDir, targetDir, staged.totalBytes);
  } catch (error) {
    return `${label}: ${error instanceof FixtureRejectedError ? error.message : describeError(error)}`;
  } finally {
    discardStaged(stagingDir);
  }
}

async function recordSupplementary(name: string, token: string | null): Promise<string | null> {
  const spec = SUPPLEMENTARY_SPECS.find((s) => s.name === name);
  if (spec === undefined) return `${name}: unknown supplementary set`;
  const label = `_supplementary__${name}`;
  const stagingDir = stagingPath(label);
  const stack = createRecordingStack();
  const startedAtMs = Date.now();
  const asOf = new Date(startedAtMs).toISOString();
  const ctx: RequestContext = {
    signal: new AbortController().signal,
    deadlineAtMs: startedAtMs + RECORDING_DEADLINE_MS,
  };
  try {
    await spec.run(stack, ctx, supplementaryGate());
    if (stack.recorder.failures > 0) return `${label}: ${stack.recorder.failures} request(s) failed while recording`;
    const responses = stack.recorder.responses();
    if (responses.length === 0) return `${label}: nothing was recorded`;
    const metadata: FixtureMetadata = {
      kind: 'supplementary',
      canonicalRepoUrl: null,
      recordedAt: new Date().toISOString(),
      asOf,
      manifestPaths: [],
      recorderVersion: RECORDER_VERSION,
    };
    const staged = stageFixtureSet(stagingDir, metadata, responses, token);
    if (staged.totalBytes > FIXTURE_SET_MAX_BYTES) {
      return describeOversize(label, staged, FIXTURE_SET_MAX_BYTES);
    }
    // Replay check: every recorded request is answered by the staged files.
    const client = new FixtureHttpClient(stagingDir);
    for (const { file } of responses) {
      const outcome = await client.execute(
        {
          ...file.request,
          headers: {},
          auth: 'none',
          notFound: 'absent',
          cache: null,
          gate: null,
        },
        ctx,
      );
      if (outcome.kind === 'failed') return `${label}: replay missed a request (source ${file.request.source})`;
    }
    return finish(label, stagingDir, join(FIXTURES_ROOT, '_supplementary', name), staged.totalBytes);
  } catch (error) {
    return `${label}: ${error instanceof FixtureRejectedError ? error.message : describeError(error)}`;
  } finally {
    discardStaged(stagingDir);
  }
}

/** Error text without any chance of carrying the token: name and code only. */
function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return 'unknown error';
}

async function main(): Promise<number> {
  const token = readGithubToken();
  const missing = missingPreconditions(process.env.GRAVEKEEPER_LIVE_TESTS, token);
  if (missing.length > 0) {
    console.error(`fixtures:record refused. Missing or invalid: ${missing.join(', ')}.`);
    return 1;
  }
  const failures: string[] = [];
  // `--only supplementary` records just the supplementary sets (repo sets stay untouched).
  const onlySupplementary = process.argv.slice(2).join(' ').includes('--only supplementary');
  for (const spec of onlySupplementary ? [] : REPOS) {
    const problem = await recordRepo(spec, token);
    if (problem !== null) failures.push(problem);
  }
  for (const spec of SUPPLEMENTARY_SPECS) {
    const problem = await recordSupplementary(spec.name, token);
    if (problem !== null) failures.push(problem);
  }
  for (const failure of failures) console.error(failure);
  if (failures.length > 0) {
    console.error(`fixtures:record finished with ${failures.length} failure(s); previous fixtures are unchanged for those sets.`);
    return 1;
  }
  console.log('fixtures:record finished.');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(describeError(error));
    process.exit(1);
  },
);
