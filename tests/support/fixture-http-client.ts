import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  HttpClient,
  HttpRequest,
  RequestContext,
  SourceHeaders,
  SourceName,
  WorkUnitOutcome,
} from '../../pipeline/ports/http';
import { requestKey } from '../../pipeline/ports/request-key';

// Requirement 23.1, 23.3

/** One line of `index.json`. */
export interface FixtureIndexEntry {
  readonly key: string;
  /** Path relative to the fixture directory, e.g. `responses/npm/0123456789abcdef.json`. */
  readonly file: string;
  readonly source: SourceName;
  readonly method: 'GET' | 'POST';
  readonly url: string;
}

/** Content of one `responses/<source>/<hash16>.json` file. */
export interface FixtureResponseFile {
  readonly request: {
    readonly source: SourceName;
    readonly method: 'GET' | 'POST';
    readonly url: string;
    readonly body: string | null;
  };
  readonly response: {
    readonly kind: 'ok' | 'absent';
    readonly status: number;
    readonly headers: SourceHeaders;
    readonly bodyText: string;
  };
}

export const FIXTURE_SOURCE_NAMES: readonly SourceName[] = [
  'github',
  'depsdev',
  'osv',
  'npm',
  'cratesio',
  'pypi',
];

/** Index of one fixture directory. Response files are read on first use. */
export interface FixtureSet {
  readonly dir: string;
  readonly entries: ReadonlyMap<string, FixtureIndexEntry>;
  read(entry: FixtureIndexEntry): FixtureResponseFile;
}

export function loadFixtureSet(dir: string): FixtureSet {
  const raw: unknown = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`fixture index is not an array: ${dir}`);
  const entries = new Map<string, FixtureIndexEntry>();
  for (const item of raw as FixtureIndexEntry[]) entries.set(item.key, item);
  const cache = new Map<string, FixtureResponseFile>();
  return {
    dir,
    entries,
    read(entry) {
      let file = cache.get(entry.file);
      if (file === undefined) {
        file = JSON.parse(readFileSync(join(dir, entry.file), 'utf8')) as FixtureResponseFile;
        cache.set(entry.file, file);
      }
      return file;
    },
  };
}

/** `<METHOD> <path>` of a URL: no origin, no query string, no fragment. */
export function describePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    const cut = url.search(/[?#]/);
    return cut === -1 ? url : url.slice(0, cut);
  }
}

export function missingMessage(source: string, method: string, url: string): string {
  return `fixture missing for source ${source}: ${method} ${describePath(url)}`;
}

export interface FixtureMiss {
  readonly source: string;
  readonly method: string;
  readonly url: string;
}

/** Replays recorded responses at the HttpClient level (design: "Replay"). */
export class FixtureHttpClient implements HttpClient {
  readonly misses: FixtureMiss[] = [];
  private readonly set: FixtureSet;

  constructor(fixtureDir: string) {
    this.set = loadFixtureSet(fixtureDir);
  }

  execute(request: HttpRequest, _context: RequestContext): Promise<WorkUnitOutcome> {
    void _context;
    const entry = this.set.entries.get(requestKey(request));
    if (entry === undefined) {
      this.misses.push({ source: request.source, method: request.method, url: request.url });
      return Promise.resolve({
        kind: 'failed',
        reason: 'http-error',
        status: null,
        headers: null,
        attempts: 1,
      });
    }
    const { response } = this.set.read(entry);
    if (response.kind === 'absent') {
      return Promise.resolve({
        kind: 'absent',
        status: 404,
        headers: response.headers,
        attempts: 1,
        fromCache: false,
      });
    }
    return Promise.resolve({
      kind: 'ok',
      status: response.status,
      bodyText: response.bodyText,
      headers: response.headers,
      attempts: 1,
      fromCache: false,
    });
  }

  /** Fails with `fixture missing for source <name>: <METHOD> <path>` for the first miss. */
  assertNoMisses(): void {
    const first = this.misses[0];
    if (first === undefined) return;
    throw new Error(missingMessage(first.source, first.method, first.url));
  }
}
