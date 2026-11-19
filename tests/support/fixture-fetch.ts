import { requestKey } from '../../pipeline/ports/request-key';
import {
  FIXTURE_SOURCE_NAMES,
  loadFixtureSet,
  missingMessage,
  type FixtureIndexEntry,
  type FixtureMiss,
} from './fixture-http-client';

// Requirement 23.1, 23.3

export interface FixtureFetch {
  readonly fetch: typeof fetch;
  readonly misses: FixtureMiss[];
  /** Fails with `fixture missing for source <name>: <METHOD> <path>` for the first miss. */
  assertNoMisses(): void;
}

function sourceOfUrl(url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return 'unknown';
  }
  if (host === 'api.deps.dev') return 'depsdev';
  if (host === 'api.osv.dev') return 'osv';
  if (host === 'registry.npmjs.org') return 'npm';
  if (host === 'crates.io') return 'cratesio';
  if (host === 'pypi.org') return 'pypi';
  return 'github';
}

/**
 * A `fetch` that answers from the fixture index of `fixtureDir`. The fetch call is mapped to the
 * recorded key with `requestKey`, trying each source name for the same method, URL and body.
 * A call without a fixture is recorded in `misses` and rejects with a TypeError (a network failure
 * for the caller), never reaching the network.
 */
export function createFixtureFetch(fixtureDir: string): FixtureFetch {
  const set = loadFixtureSet(fixtureDir);
  const misses: FixtureMiss[] = [];

  const fixtureFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : undefined;
    const url = request !== undefined ? request.url : input instanceof URL ? input.href : String(input);
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    let body: string | null = null;
    if (typeof init?.body === 'string') body = init.body;
    else if (init?.body === undefined && request !== undefined && method === 'POST') {
      body = await request.clone().text();
    }

    let entry: FixtureIndexEntry | undefined;
    if (method === 'GET' || method === 'POST') {
      for (const source of FIXTURE_SOURCE_NAMES) {
        entry = set.entries.get(requestKey({ source, method, url, body }));
        if (entry !== undefined) break;
      }
    }
    if (entry === undefined) {
      const source = sourceOfUrl(url);
      misses.push({ source, method, url });
      throw new TypeError(missingMessage(source, method, url));
    }

    const { response } = set.read(entry);
    const headers = new Headers();
    for (const [name, value] of Object.entries(response.headers)) headers.append(name, value);
    const noBody = response.kind === 'absent' || response.bodyText === '';
    return new Response(noBody ? null : response.bodyText, {
      status: response.kind === 'absent' ? 404 : response.status,
      headers,
    });
  };

  return {
    fetch: fixtureFetch as typeof fetch,
    misses,
    assertNoMisses(): void {
      const first = misses[0];
      if (first === undefined) return;
      throw new Error(missingMessage(first.source, first.method, first.url));
    },
  };
}
