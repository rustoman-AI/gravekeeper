// Requirement 21.9, 21.10, 21.11, 21.13, 21.16
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as route from '../../app/api/scan/route';
import { ROUTE_MAX_DURATION_SECONDS, SCAN_DEADLINE_MS, SCAN_RESPONSE_MARGIN_MS } from '../../pipeline/constants';

const ROUTE_PATH = resolve(__dirname, '../../app/api/scan/route.ts');
const source = readFileSync(ROUTE_PATH, 'utf8');

const METHODS = ['POST', 'GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
const NON_POST = METHODS.filter((m) => m !== 'POST');

type Handler = (request: Request) => Promise<Response>;
const handlers = route as unknown as Record<string, Handler>;

function call(method: string, body?: string): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) init.body = body;
  return handlers[method](new Request('http://localhost/api/scan', init));
}

function headersOf(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers.entries());
}

describe('scan route source text (R21.16, R21.10)', () => {
  it('declares maxDuration as a number literal equal to ROUTE_MAX_DURATION_SECONDS', () => {
    const match = /^export const maxDuration\s*=\s*(\d+)\s*;/m.exec(source);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(ROUTE_MAX_DURATION_SECONDS);
    expect(ROUTE_MAX_DURATION_SECONDS * 1000).toBeGreaterThan(SCAN_DEADLINE_MS + SCAN_RESPONSE_MARGIN_MS);
    expect(route.maxDuration).toBe(ROUTE_MAX_DURATION_SECONDS);
  });

  it.each(['runtime', 'dynamic', 'revalidate', 'fetchCache'])('does not export %s', (name) => {
    const pattern = new RegExp(`export\\s+(const|let|var|function|async\\s+function)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`);
    expect(source).not.toMatch(pattern);
    expect(Object.keys(route)).not.toContain(name);
  });

  it.each(METHODS)('exports %s', (method) => {
    expect(source).toMatch(new RegExp(`export const ${method}\\s*=`));
    expect(typeof handlers[method]).toBe('function');
  });

  it('exports only maxDuration and the seven methods', () => {
    expect(Object.keys(route).sort()).toEqual(['maxDuration', ...METHODS].sort());
  });

  it('contains no scan logic', () => {
    for (const forbidden of [/\bfetch\s*\(/, /\bJSON\.parse\b/, /\.json\s*\(\s*\)/, /\bnew URL\b/, /\bparseRepoUrl\b/, /\brunScan\b/]) {
      expect(source).not.toMatch(forbidden);
    }
  });
});

describe('scan route non-POST methods (R21.13, R21.9, R21.11)', () => {
  it.each(NON_POST.filter((m) => m !== 'HEAD'))('%s answers the JSON 405 with Allow: POST', async (method) => {
    const response = await call(method);
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = (await response.json()) as { ok: boolean; error: { code: string; details?: { reason: string } } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('invalid-request');
    expect(body.error.details).toEqual({ reason: 'method-not-allowed' });
  });

  it('HEAD has an empty body with the same status and headers as GET', async () => {
    const head = await call('HEAD');
    const get = await call('GET');
    expect(head.status).toBe(405);
    expect(head.status).toBe(get.status);
    expect(await head.text()).toBe('');
    const headHeaders = headersOf(head);
    const getHeaders = headersOf(get);
    expect(headHeaders['allow']).toBe('POST');
    expect(headHeaders['content-type']).toBe('application/json');
    expect(headHeaders['cache-control']).toBe('no-store');
    expect(headHeaders['allow']).toBe(getHeaders['allow']);
    expect(headHeaders['content-type']).toBe(getHeaders['content-type']);
    expect(headHeaders['cache-control']).toBe(getHeaders['cache-control']);
  });

  it('answers 405 before reading a body', async () => {
    const response = await call('PUT', '{not json');
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });
});
