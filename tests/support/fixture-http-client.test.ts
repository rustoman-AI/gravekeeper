import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { HttpRequest, RequestContext, SourceName } from '../../pipeline/ports/http';
import { requestKey } from '../../pipeline/ports/request-key';
import { createFixtureFetch } from './fixture-fetch';
import { FixtureHttpClient } from './fixture-http-client';

// Requirement 23.1, 23.3

const OK_URL = 'https://registry.npmjs.org/left-pad';
const ABSENT_URL = 'https://registry.npmjs.org/missing-pkg';
const UNKNOWN_URL = 'https://registry.npmjs.org/unknown-pkg?secret=abc&x=1';

const context: RequestContext = { signal: new AbortController().signal, deadlineAtMs: 0 };

function request(url: string, source: SourceName = 'npm'): HttpRequest {
  return {
    source,
    method: 'GET',
    url,
    headers: {},
    body: null,
    auth: 'none',
    notFound: 'absent',
    cache: null,
    gate: null,
  };
}

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'fixture-replay-'));
  mkdirSync(join(dir, 'responses', 'npm'), { recursive: true });
  const index: unknown[] = [];
  const add = (
    name: string,
    url: string,
    response: { kind: 'ok' | 'absent'; status: number; bodyText: string },
  ): void => {
    const file = `responses/npm/${name}.json`;
    writeFileSync(
      join(dir, file),
      JSON.stringify({
        request: { source: 'npm', method: 'GET', url, body: null },
        response: { ...response, headers: { 'content-type': 'application/json' } },
      }),
    );
    index.push({
      key: requestKey({ source: 'npm', method: 'GET', url, body: null }),
      file,
      source: 'npm',
      method: 'GET',
      url,
    });
  };
  add('0000000000000001', OK_URL, { kind: 'ok', status: 200, bodyText: '{"name":"left-pad"}' });
  add('0000000000000002', ABSENT_URL, { kind: 'absent', status: 404, bodyText: '' });
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('FixtureHttpClient', () => {
  it('answers a recorded request with ok', async () => {
    const outcome = await new FixtureHttpClient(dir).execute(request(OK_URL), context);
    expect(outcome).toMatchObject({
      kind: 'ok',
      status: 200,
      bodyText: '{"name":"left-pad"}',
      headers: { 'content-type': 'application/json' },
      fromCache: false,
    });
  });

  it('answers a recorded absent request with absent', async () => {
    const outcome = await new FixtureHttpClient(dir).execute(request(ABSENT_URL), context);
    expect(outcome).toMatchObject({ kind: 'absent', status: 404 });
  });

  it('fails an unknown request with http-error and reports it without the query string', async () => {
    const client = new FixtureHttpClient(dir);
    const outcome = await client.execute(request(UNKNOWN_URL), context);
    expect(outcome).toMatchObject({ kind: 'failed', reason: 'http-error', status: null });
    expect(client.misses).toHaveLength(1);
    let message = '';
    try {
      client.assertNoMisses();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('fixture missing for source npm: GET /unknown-pkg');
    expect(message).not.toContain('secret');
  });

  it('does not throw from assertNoMisses when everything was recorded', async () => {
    const client = new FixtureHttpClient(dir);
    await client.execute(request(OK_URL), context);
    expect(() => client.assertNoMisses()).not.toThrow();
  });
});

describe('createFixtureFetch', () => {
  it('answers a recorded URL', async () => {
    const replay = createFixtureFetch(dir);
    const response = await replay.fetch(OK_URL);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"name":"left-pad"}');
    expect((await replay.fetch(ABSENT_URL)).status).toBe(404);
    expect(() => replay.assertNoMisses()).not.toThrow();
  });

  it('rejects an unknown URL and reports it without the query string', async () => {
    const replay = createFixtureFetch(dir);
    await expect(replay.fetch(UNKNOWN_URL)).rejects.toBeInstanceOf(TypeError);
    expect(() => replay.assertNoMisses()).toThrow('fixture missing for source npm: GET /unknown-pkg');
  });
});
