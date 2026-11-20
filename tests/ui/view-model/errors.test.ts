import { describe, expect, it } from 'vitest';
import { RETRY_FALLBACK_COOLDOWN_SECONDS } from '../../../view-model/constants';
import { buildErrorModel, retryRemainingMs } from '../../../view-model/errors';
import type { ErrorInput } from '../../../view-model/types';

type ApiInput = Extract<ErrorInput, { kind: 'api' }>;
type Body = ApiInput['error'];

const REPO = 'https://github.com/o/r';

function api(status: number, error: unknown, extra: Partial<ApiInput> = {}): ErrorInput {
  return {
    kind: 'api',
    status,
    error: error as Body,
    retryAfterSeconds: null,
    submittedValue: REPO,
    repoValue: REPO,
    selectedManifests: [],
    ...extra,
  };
}

const labels = (input: ErrorInput) => buildErrorModel(input).actions.map((a) => a.label);

describe('buildErrorModel headings and actions (R13.1, R13.2)', () => {
  const cases: ReadonlyArray<{
    status: number;
    body: Record<string, unknown>;
    heading: string;
    actions: string[];
  }> = [
    {
      status: 400,
      body: { code: 'invalid-url', message: 'm', details: { part: 'host' } },
      heading: 'That is not a grave we can find',
      actions: ['Edit the URL', 'Back to the gate'],
    },
    {
      status: 404,
      body: { code: 'repo-not-found', message: 'm' },
      heading: 'No such graveyard',
      actions: ['Edit the URL', 'Back to the gate'],
    },
    {
      status: 404,
      body: { code: 'branch-not-found', message: 'm', details: { branch: 'x' } },
      heading: 'That branch has no graves',
      actions: ['Scan the default branch', 'Edit the URL', 'Back to the gate'],
    },
    {
      status: 422,
      body: { code: 'too-many-manifests', message: 'm', details: { limit: 5, candidates: ['a/package.json'] } },
      heading: 'Too many plots at once',
      actions: ['Scan selected manifests', 'Scan the repository root', 'Back to the gate'],
    },
    {
      status: 404,
      body: { code: 'manifest-not-found', message: 'm', details: { path: 'p', candidates: ['a/package.json'] } },
      heading: 'That manifest is not here',
      actions: ['Scan selected manifests', 'Scan the repository root', 'Back to the gate'],
    },
    {
      status: 503,
      body: { code: 'upstream-unavailable', message: 'm', details: { source: 'github' } },
      heading: 'The gates are shut for now',
      actions: ['Try again', 'Back to the gate'],
    },
    {
      status: 504,
      body: { code: 'deadline-exceeded', message: 'm' },
      heading: 'The night ran out',
      actions: ['Try again', 'Back to the gate'],
    },
    {
      status: 500,
      body: { code: 'internal-error', message: 'm' },
      heading: 'The gravedigger tripped',
      actions: ['Try again', 'Back to the gate'],
    },
    {
      status: 400,
      body: { code: 'invalid-request', message: 'm', details: { reason: 'bad-json' } },
      heading: 'The request was not understood',
      actions: ['Try again', 'Back to the gate'],
    },
  ];

  it.each(cases)('$body.code: heading and actions', ({ status, body, heading, actions }) => {
    const model = buildErrorModel(api(status, body));
    expect(model.code).toBe(body.code);
    expect(model.heading).toBe(heading);
    expect(model.actions.map((a) => a.label)).toEqual(actions);
    expect(model.httpStatus).toBe(status);
  });

  it('adds the hint lines of repo-not-found and invalid-request', () => {
    expect(buildErrorModel(api(404, { code: 'repo-not-found', message: 'm' })).hint).toBe(
      'The repository must exist and be public',
    );
    expect(buildErrorModel(api(400, { code: 'invalid-request', message: 'm', details: { reason: 'x' } })).hint).toBe(
      'This is a fault in Gravekeeper, not in your URL',
    );
  });

  it('maps the three client failures (R13.8)', () => {
    const expected = {
      'network-failure': ['The road is washed out', 'The server could not be reached.'],
      timeout: ['The night ran out', 'The server did not answer in time.'],
      'malformed-response': ['The records are garbled', 'The server sent an answer that Gravekeeper could not read.'],
    } as const;
    for (const [failure, [heading, message]] of Object.entries(expected)) {
      const model = buildErrorModel({
        kind: 'client',
        failure: failure as keyof typeof expected,
        submittedValue: '',
      });
      expect(model.heading).toBe(heading);
      expect(model.plainMessage).toBe(message);
      expect(model.retryCooldownSeconds).toBe(0);
      expect(model.actions.map((a) => a.label)).toEqual(['Try again', 'Back to the gate']);
    }
  });
});

describe('buildErrorModel retry cooldown (R13.4, R13.5, R13.6)', () => {
  const upstream = { code: 'upstream-unavailable', message: 'm', details: { source: 'github' } };

  it('503 with Retry-After 30 gives cooldown 30', () => {
    expect(buildErrorModel(api(503, upstream, { retryAfterSeconds: 30 })).retryCooldownSeconds).toBe(30);
  });

  it('502 without Retry-After gives the fallback cooldown', () => {
    expect(buildErrorModel(api(502, upstream)).retryCooldownSeconds).toBe(RETRY_FALLBACK_COOLDOWN_SECONDS);
  });

  it('deadline-exceeded and internal-error give the fallback cooldown', () => {
    expect(buildErrorModel(api(504, { code: 'deadline-exceeded', message: 'm' })).retryCooldownSeconds).toBe(
      RETRY_FALLBACK_COOLDOWN_SECONDS,
    );
    expect(buildErrorModel(api(500, { code: 'internal-error', message: 'm' })).retryCooldownSeconds).toBe(
      RETRY_FALLBACK_COOLDOWN_SECONDS,
    );
  });

  it('has no cooldown on errors without a Retry action', () => {
    expect(buildErrorModel(api(404, { code: 'repo-not-found', message: 'm' })).retryCooldownSeconds).toBeNull();
  });

  it('counts a cooldown down to zero (R13.14)', () => {
    expect(retryRemainingMs(30, 0)).toBe(30000);
    expect(retryRemainingMs(30, 10000)).toBe(20000);
    expect(retryRemainingMs(30, 40000)).toBe(0);
  });
});

describe('buildErrorModel invalid-url, branch and manifest errors (R13.1, R13.2, R13.15, R13.16)', () => {
  it.each(['url', 'host', 'path', 'owner', 'repository', 'branch'])('invalid-url names the part %s', (part) => {
    const model = buildErrorModel(api(400, { code: 'invalid-url', message: 'm', details: { part } }));
    expect(model.invalidPart).toBe(part);
  });

  it('branch-not-found builds the default-branch URL without the /tree part', () => {
    const model = buildErrorModel(
      api(404, { code: 'branch-not-found', message: 'm', details: { branch: 'dev' } }, { repoValue: `${REPO}/tree/dev` }),
    );
    expect(model.defaultBranchUrl).toBe(`/?repo=${encodeURIComponent(REPO)}`);
  });

  const manifestCodes = [
    ['too-many-manifests', { limit: 5 }],
    ['manifest-not-found', { path: 'x/package.json' }],
  ] as const;

  it.each(manifestCodes)('%s with candidates shows a picker and a root scan', (code, details) => {
    const model = buildErrorModel(
      api(422, { code, message: 'm', details: { ...details, candidates: ['a/package.json', 'b/package.json'] } }),
    );
    expect(model.picker?.candidates.map((c) => c.path)).toEqual(['a/package.json', 'b/package.json']);
    expect(model.actions.map((a) => a.label)).toEqual([
      'Scan selected manifests',
      'Scan the repository root',
      'Back to the gate',
    ]);
    expect(model.rootScanUrl).toBe(`/?repo=${encodeURIComponent(REPO)}`);
  });

  it.each(manifestCodes)('%s with no candidates shows the root scan only', (code, details) => {
    const input = api(422, { code, message: 'm', details: { ...details, candidates: [] } });
    const model = buildErrorModel(input);
    expect(model.picker).toBeNull();
    expect(labels(input)).toEqual(['Scan the repository root', 'Back to the gate']);
    expect(model.rootScanUrl).toBe(`/?repo=${encodeURIComponent(REPO)}`);
  });

  it('root scan drops the selected manifests', () => {
    const model = buildErrorModel(
      api(
        422,
        { code: 'too-many-manifests', message: 'm', details: { limit: 5, candidates: ['a/package.json'] } },
        { selectedManifests: ['a/package.json'] },
      ),
    );
    expect(model.rootScanUrl).not.toContain('manifest');
  });
});

describe('buildErrorModel plain message (R13.1)', () => {
  it('keeps a message with markup characters unchanged', () => {
    const message = '<b>"x" & \'y\'</b> {{z}} `code` <script>alert(1)</script>';
    const model = buildErrorModel(api(500, { code: 'internal-error', message }));
    expect(model.plainMessage).toBe(message);
  });
});
