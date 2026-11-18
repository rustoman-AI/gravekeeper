import { describe, expect, it } from 'vitest';
import { toSourceResult, toTextResult } from '../../adapters/http/source-result';
import type { AdapterReason, SourceHeaders, WorkUnitOutcome } from '../../pipeline/ports/http';

// Requirements 15.15, 3.10

const headers: SourceHeaders = { 'content-type': 'application/json', 'retry-after': '3' };

function ok(bodyText: string, fromCache = false): WorkUnitOutcome {
  return { kind: 'ok', status: 200, bodyText, headers, attempts: 1, fromCache };
}

describe('toSourceResult', () => {
  it('parses valid JSON into an ok result', () => {
    expect(toSourceResult(ok('{"a":[1,2]}', true))).toEqual({
      kind: 'ok',
      status: 200,
      body: { a: [1, 2] },
      headers,
      fromCache: true,
    });
  });

  it('gives unparsable for an empty body', () => {
    expect(toSourceResult(ok(''))).toEqual({ kind: 'unparsable', status: 200, headers });
  });

  it('gives unparsable for truncated JSON', () => {
    expect(toSourceResult(ok('{"a":[1,2'))).toEqual({ kind: 'unparsable', status: 200, headers });
  });

  it('gives unparsable for a non-JSON body', () => {
    expect(toSourceResult(ok('<html>hi</html>')).kind).toBe('unparsable');
  });

  it('treats a JSON scalar as ok', () => {
    for (const [text, value] of [['42', 42], ['"s"', 's'], ['null', null], ['true', true]] as const) {
      const r = toSourceResult(ok(text));
      expect(r.kind).toBe('ok');
      if (r.kind === 'ok') expect(r.body).toBe(value);
    }
  });

  it('maps absent and keeps headers and fromCache', () => {
    const outcome: WorkUnitOutcome = { kind: 'absent', status: 404, headers, attempts: 1, fromCache: true };
    expect(toSourceResult(outcome)).toEqual({ kind: 'absent', headers, fromCache: true });
  });

  it.each<AdapterReason>(['timeout', 'network', 'rate-limited', 'http-error', 'budget', 'deadline'])(
    'maps failed with reason %s',
    (reason) => {
      const withStatus: WorkUnitOutcome = { kind: 'failed', reason, status: 503, headers, attempts: 2 };
      expect(toSourceResult(withStatus)).toEqual({ kind: 'failed', reason, status: 503, headers });
      const bare: WorkUnitOutcome = { kind: 'failed', reason, status: null, headers: null, attempts: 1 };
      expect(toSourceResult(bare)).toEqual({ kind: 'failed', reason, status: null, headers: null });
    },
  );

  it('does not pollute Object.prototype for a __proto__ body', () => {
    const r = toSourceResult(ok('{"__proto__":{"polluted":true},"x":1}'));
    expect(r.kind).toBe('ok');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (r.kind === 'ok') {
      const body = r.body as object;
      expect(Object.getPrototypeOf(body)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(body, '__proto__')).toBe(true);
    }
  });
});

describe('toTextResult', () => {
  it('passes the body text through unparsed, even when empty', () => {
    expect(toTextResult(ok('{not json'))).toMatchObject({ kind: 'ok', body: '{not json' });
    expect(toTextResult(ok(''))).toMatchObject({ kind: 'ok', body: '' });
  });

  it('maps absent and failed like toSourceResult', () => {
    const absent: WorkUnitOutcome = { kind: 'absent', status: 404, headers, attempts: 1, fromCache: false };
    expect(toTextResult(absent)).toEqual({ kind: 'absent', headers, fromCache: false });
    const failed: WorkUnitOutcome = { kind: 'failed', reason: 'timeout', status: null, headers: null, attempts: 3 };
    expect(toTextResult(failed)).toEqual({ kind: 'failed', reason: 'timeout', status: null, headers: null });
  });
});
