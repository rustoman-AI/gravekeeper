import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AdapterReason,
  CacheEntry,
  CacheStore,
  CratesIoSource,
  DepsDevSource,
  GithubSource,
  HttpRequest,
  JsonValue,
  NpmSource,
  OsvSource,
  PypiSource,
  RequestContext,
  SourceHeaders,
  SourceName,
  SourceResult,
  WorkUnitOutcome,
} from '../../pipeline/ports';

describe('port types', () => {
  // Requirement 22.1, 22.11
  it('WorkUnitOutcome is a discriminated union of ok, absent and failed', () => {
    expectTypeOf<WorkUnitOutcome['kind']>().toEqualTypeOf<'ok' | 'absent' | 'failed'>();
    expectTypeOf<Extract<WorkUnitOutcome, { kind: 'ok' }>['bodyText']>().toEqualTypeOf<string>();
    expectTypeOf<Extract<WorkUnitOutcome, { kind: 'absent' }>['status']>().toEqualTypeOf<404>();
    expectTypeOf<Extract<WorkUnitOutcome, { kind: 'failed' }>['reason']>().toEqualTypeOf<AdapterReason>();
    expectTypeOf<Extract<WorkUnitOutcome, { kind: 'failed' }>['headers']>().toEqualTypeOf<SourceHeaders | null>();
  });

  it('SourceResult is a discriminated union of ok, absent, unparsable and failed', () => {
    expectTypeOf<SourceResult['kind']>().toEqualTypeOf<'ok' | 'absent' | 'unparsable' | 'failed'>();
    expectTypeOf<Extract<SourceResult<string>, { kind: 'ok' }>['body']>().toEqualTypeOf<string>();
    expectTypeOf<Extract<SourceResult, { kind: 'failed' }>['status']>().toEqualTypeOf<number | null>();
  });

  it('HttpRequest has the documented fields', () => {
    expectTypeOf<HttpRequest['source']>().toEqualTypeOf<SourceName>();
    expectTypeOf<HttpRequest['method']>().toEqualTypeOf<'GET' | 'POST'>();
    expectTypeOf<HttpRequest['body']>().toEqualTypeOf<string | null>();
    expectTypeOf<HttpRequest['auth']>().toEqualTypeOf<'none' | 'github'>();
    expectTypeOf<HttpRequest['notFound']>().toEqualTypeOf<'absent' | 'failed'>();
    expectTypeOf<HttpRequest['url']>().toEqualTypeOf<string>();
  });

  it('CacheStore get and set return promises of the documented values', () => {
    expectTypeOf<CacheStore['get']>().returns.toEqualTypeOf<Promise<CacheEntry | null>>();
    expectTypeOf<CacheStore['set']>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<CacheEntry['value']>().toEqualTypeOf<JsonValue>();
  });

  it('the six source interfaces take a RequestContext', () => {
    expectTypeOf<NpmSource['getLatest']>().parameter(1).toEqualTypeOf<RequestContext>();
    expectTypeOf<NpmSource['getVersion']>().parameters.toEqualTypeOf<[string, string, RequestContext]>();
    expectTypeOf<NpmSource['getVersion']>().returns.toEqualTypeOf<Promise<SourceResult>>();
    expectTypeOf<OsvSource['queryBatch']>().returns.toEqualTypeOf<Promise<SourceResult>>();
    expectTypeOf<GithubSource['hasToken']>().returns.toEqualTypeOf<boolean>();
    expectTypeOf<DepsDevSource>().toBeObject();
    expectTypeOf<CratesIoSource>().toBeObject();
    expectTypeOf<PypiSource>().toBeObject();
  });
});

describe('pipeline/ports imports', () => {
  // Requirement 22.11
  const dir = join(process.cwd(), 'pipeline', 'ports');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  const specifiers = (text: string): string[] =>
    [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

  it('finds the port files', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of files) {
    it(`${file} imports only /core, sibling ports or pipeline/constants`, () => {
      const text = readFileSync(join(dir, file), 'utf8');
      for (const spec of specifiers(text)) {
        const allowed =
          /^\.\/[a-z0-9-]+$/.test(spec) ||
          spec === '../constants' ||
          /^(\.\.\/)+core(\/|$)/.test(spec) ||
          /^@\/core(\/|$)/.test(spec);
        expect(allowed, `${file} imports ${spec}`).toBe(true);
      }
    });
  }
});
