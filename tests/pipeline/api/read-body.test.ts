import { describe, expect, it } from 'vitest';
import { readRequestBody, type ReadableRequest } from '../../../pipeline/api/read-body';
import { REQUEST_BODY_MAX_BYTES } from '../../../pipeline/constants';

function req(body: Uint8Array | null, headers: Record<string, string> = {}): ReadableRequest {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: { get: (n: string) => lower.get(n.toLowerCase()) ?? null },
    body:
      body === null
        ? null
        : new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(body);
              c.close();
            },
          }),
  };
}

const bytes = (n: number): Uint8Array => new Uint8Array(n).fill(0x61);

describe('readRequestBody', () => {
  it('accepts a body of exactly REQUEST_BODY_MAX_BYTES', async () => {
    const r = await readRequestBody(req(bytes(REQUEST_BODY_MAX_BYTES)));
    expect(r.type).toBe('ok');
    if (r.type === 'ok') expect(r.text.length).toBe(REQUEST_BODY_MAX_BYTES);
  });

  it('rejects REQUEST_BODY_MAX_BYTES + 1 as body-too-large', async () => {
    const r = await readRequestBody(req(bytes(REQUEST_BODY_MAX_BYTES + 1)));
    expect(r).toEqual({ type: 'body-too-large' });
  });

  it('rejects an oversized body split across chunks', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes(40000));
        c.enqueue(bytes(40000));
        c.close();
      },
    });
    const r = await readRequestBody({ headers: { get: () => null }, body: stream });
    expect(r).toEqual({ type: 'body-too-large' });
  });

  it('rejects a declared length over the limit even with a short body', async () => {
    const r = await readRequestBody(
      req(bytes(2), { 'Content-Length': String(REQUEST_BODY_MAX_BYTES + 1) }),
    );
    expect(r).toEqual({ type: 'body-too-large' });
  });

  it('ignores a malformed content-length', async () => {
    const r = await readRequestBody(req(bytes(2), { 'content-length': 'abc' }));
    expect(r).toEqual({ type: 'ok', text: 'aa' });
  });

  it('honours a custom maxBytes', async () => {
    expect(await readRequestBody(req(bytes(4)), 3)).toEqual({ type: 'body-too-large' });
    expect(await readRequestBody(req(bytes(3)), 3)).toEqual({ type: 'ok', text: 'aaa' });
  });

  it('gives invalid-json for invalid UTF-8', async () => {
    const r = await readRequestBody(req(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])));
    expect(r).toEqual({ type: 'invalid-json' });
  });

  it('decodes valid multi-byte UTF-8 and keeps a BOM', async () => {
    const enc = new TextEncoder().encode('\uFEFF"é€"');
    const r = await readRequestBody(req(enc));
    expect(r).toEqual({ type: 'ok', text: '\uFEFF"é€"' });
  });

  it('gives invalid-json for an empty body', async () => {
    expect(await readRequestBody(req(new Uint8Array(0)))).toEqual({ type: 'invalid-json' });
  });

  it('gives invalid-json for a null stream', async () => {
    expect(await readRequestBody(req(null))).toEqual({ type: 'invalid-json' });
  });

  it('gives invalid-json when the stream errors', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.error(new Error('boom'));
      },
    });
    const r = await readRequestBody({ headers: { get: () => null }, body: stream });
    expect(r).toEqual({ type: 'invalid-json' });
  });

  it('works with a real Request', async () => {
    const request = new Request('http://localhost/api/scan', {
      method: 'POST',
      body: '{"a":1}',
    });
    expect(await readRequestBody(request)).toEqual({ type: 'ok', text: '{"a":1}' });
  });
});
