import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, RequestContext, WorkUnitOutcome } from '../../pipeline/ports/http';
import { allowHeaders } from '../../scripts/fixtures/allow-headers';
import { assertNoSecrets, SecretFoundError } from '../../scripts/fixtures/assert-no-secrets';
import {
  describeOversize,
  discardStaged,
  FixtureRejectedError,
  promoteStagedSet,
  RECORDER_VERSION,
  stageFixtureSet,
  type FixtureMetadata,
} from '../../scripts/fixtures/fixture-set';
import { missingPreconditions } from '../../scripts/fixtures/preconditions';
import { RecordingHttpClient } from '../../scripts/fixtures/recording-http-client';

// Requirement 23.6, 23.7, 23.10, 23.16, 20.13
// Secret-like strings are built by concatenation so scanners do not flag this file.
const PREFIXES = ['gh' + 'p_', 'gh' + 'o_', 'gh' + 'u_', 'gh' + 's_', 'gh' + 'r_', 'github' + '_pat_'];
const TOKEN = 'gh' + 'p_' + 'a'.repeat(36);
const AUTH = 'Author' + 'ization';

const ctx: RequestContext = { signal: new AbortController().signal, deadlineAtMs: Number.MAX_SAFE_INTEGER };

function request(path: string): HttpRequest {
  return {
    source: 'npm',
    method: 'GET',
    url: `https://registry.example.test/${path}`,
    headers: {},
    body: null,
    auth: 'none',
    notFound: 'absent',
    cache: null,
    gate: null,
  };
}

function okClient(headers: Record<string, string>, bodyText = '{}'): HttpClient {
  return {
    async execute(): Promise<WorkUnitOutcome> {
      return { kind: 'ok', status: 200, bodyText, headers, attempts: 1, fromCache: false };
    },
  };
}

const metadata: FixtureMetadata = {
  kind: 'npm',
  canonicalRepoUrl: 'https://github.com/o/r',
  recordedAt: '2025-01-01T00:00:00.000Z',
  asOf: '2025-01-01T00:00:00.000Z',
  manifestPaths: ['package.json'],
  recorderVersion: RECORDER_VERSION,
};

async function record(client: HttpClient, paths: readonly string[]): Promise<RecordingHttpClient> {
  const recorder = new RecordingHttpClient(client);
  for (const p of paths) await recorder.execute(request(p), ctx);
  return recorder;
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gk-record-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('allow-listed headers (R23.7)', () => {
  it('writes none of Authorization, set-cookie, x-request-id', async () => {
    const recorder = await record(
      okClient({ [AUTH]: 'x', 'set-cookie': 'a=b', 'x-request-id': '1' }),
      ['a'],
    );
    const [only] = recorder.responses();
    expect(only?.file.response.headers).toEqual({});
  });

  it('keeps only content-type, retry-after and x-ratelimit-*', () => {
    expect(
      allowHeaders({ 'Content-Type': 'application/json', 'Retry-After': '3', 'X-RateLimit-Remaining': '9', ETag: 'z' }),
    ).toEqual({ 'content-type': 'application/json', 'retry-after': '3', 'x-ratelimit-remaining': '9' });
  });

  it('staged files contain no dropped header', async () => {
    const recorder = await record(okClient({ 'set-cookie': 'a=b', 'x-request-id': '1' }), ['a']);
    const dir = join(root, 's');
    stageFixtureSet(dir, metadata, recorder.responses(), null);
    const file = join(dir, 'responses', 'npm', readdirSync(join(dir, 'responses', 'npm'))[0] as string);
    const text = readFileSync(file, 'utf8');
    expect(text).not.toContain('set-cookie');
    expect(text).not.toContain('x-request-id');
  });
});

describe('assertNoSecrets (R23.6, R20.13)', () => {
  it('accepts clean text', () => {
    expect(() => assertNoSecrets('{"a":1}', TOKEN)).not.toThrow();
  });

  it('rejects the token', () => {
    expect(() => assertNoSecrets(`{"a":"${TOKEN}"}`, TOKEN)).toThrow(SecretFoundError);
  });

  it('rejects Bearer ', () => {
    expect(() => assertNoSecrets('{"a":"Bearer xyz"}', null)).toThrow(SecretFoundError);
  });

  it.each(PREFIXES)('rejects prefix %s', (prefix) => {
    expect(() => assertNoSecrets(`{"a":"${prefix}abc"}`, null)).toThrow(SecretFoundError);
  });

  it('rejects an Authorization header in any case', () => {
    expect(() => assertNoSecrets(`{"${AUTH}":"x"}`, null)).toThrow(SecretFoundError);
    expect(() => assertNoSecrets(`{"${AUTH.toLowerCase()}":"x"}`, null)).toThrow(SecretFoundError);
  });

  it('does not echo the token in its message', () => {
    try {
      assertNoSecrets(`x${TOKEN}`, TOKEN);
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(TOKEN);
    }
  });
});

describe('preconditions (R23.10)', () => {
  it('refuses without the flag', () => {
    expect(missingPreconditions(undefined, TOKEN)).toHaveLength(1);
    expect(missingPreconditions('0', TOKEN)[0]).toContain('GRAVEKEEPER_LIVE_TESTS');
  });

  it('refuses without the token', () => {
    expect(missingPreconditions('1', null)).toEqual(['GITHUB_TOKEN']);
  });

  it('refuses without both and allows with both', () => {
    expect(missingPreconditions(undefined, null)).toHaveLength(2);
    expect(missingPreconditions('1', TOKEN)).toEqual([]);
  });
});

describe('oversized set (R23.16)', () => {
  it('names the five largest files and promotes nothing', async () => {
    const target = join(root, 'target');
    mkdirSync(target);
    writeFileSync(join(target, 'old.json'), 'old');
    const sizes = [10, 500, 20, 600, 30, 700, 40, 800];
    const recorder = new RecordingHttpClient({
      async execute(req): Promise<WorkUnitOutcome> {
        const n = Number(req.url.split('/').pop());
        return { kind: 'ok', status: 200, bodyText: 'x'.repeat(sizes[n] as number), headers: {}, attempts: 1, fromCache: false };
      },
    });
    for (let i = 0; i < sizes.length; i += 1) await recorder.execute(request(String(i)), ctx);
    const staging = join(root, 'staging');
    const staged = stageFixtureSet(staging, metadata, recorder.responses(), null);
    const message = describeOversize('label', staged, 1000);
    expect(message).toContain('exceeds FIXTURE_SET_MAX_BYTES 1000');
    const listed = message.split('\n').filter((l) => l.includes('responses/npm/'));
    expect(listed).toHaveLength(5);
    const bytes = listed.map((l) => Number(/(\d+) bytes/.exec(l)?.[1]));
    expect(bytes).toEqual([...bytes].sort((a, b) => b - a));
    expect(Math.min(...bytes)).toBeGreaterThan(staged.responseFiles[5]?.bytes ?? 0);
    // The recorder discards staging without promoting: the target is untouched.
    discardStaged(staging);
    expect(existsSync(staging)).toBe(false);
    expect(readdirSync(target)).toEqual(['old.json']);
  });
});

describe('rejection leaves previous fixtures unchanged (R23.6, R23.16)', () => {
  it('throws FixtureRejectedError, removes staging, keeps the target', async () => {
    const target = join(root, 'target');
    mkdirSync(target);
    writeFileSync(join(target, 'old.json'), 'old');
    const recorder = await record(okClient({}, `{"t":"${TOKEN}"}`), ['a']);
    const staging = join(root, 'staging');
    let thrown: unknown;
    try {
      stageFixtureSet(staging, metadata, recorder.responses(), TOKEN);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FixtureRejectedError);
    expect((thrown as Error).message).not.toContain(TOKEN);
    expect(existsSync(staging)).toBe(false);
    expect(readFileSync(join(target, 'old.json'), 'utf8')).toBe('old');
    expect(readdirSync(target)).toEqual(['old.json']);
  });

  it('promotion replaces the previous set when staging is accepted', async () => {
    const target = join(root, 'target');
    mkdirSync(target);
    writeFileSync(join(target, 'old.json'), 'old');
    const recorder = await record(okClient({}), ['a']);
    const staging = join(root, 'staging');
    stageFixtureSet(staging, metadata, recorder.responses(), TOKEN);
    promoteStagedSet(staging, target);
    expect(existsSync(join(target, 'old.json'))).toBe(false);
    expect(existsSync(join(target, 'metadata.json'))).toBe(true);
    expect(existsSync(`${target}.replaced`)).toBe(false);
  });
});
