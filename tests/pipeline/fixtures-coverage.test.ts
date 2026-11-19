import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadFixtureSet } from '../support/fixture-http-client';
import { ENDPOINT_FACT_MAP, type EndpointFactRow } from '../support/endpoint-fact-map';
import { pathExists, type LiveResponse } from '../live/live-support';

// Requirement 23.13
// Every verified Endpoint_Fact_Map row (except EF-4, EF-11, EF-23, EF-24 and the
// Not verified paths) has at least one recorded response containing every path.

const FIXTURES = join(__dirname, '..', 'fixtures');
const EXCLUDED = new Set(['EF-4', 'EF-11', 'EF-23', 'EF-24']);

interface Candidate {
  readonly source: string;
  readonly method: string;
  readonly url: string;
  readonly response: LiveResponse;
}

function fixtureDirs(): string[] {
  const dirs: string[] = [];
  const add = (root: string): void => {
    for (const d of readdirSync(root, { withFileTypes: true })) {
      if (d.isDirectory() && existsSync(join(root, d.name, 'index.json'))) {
        dirs.push(join(root, d.name));
      }
    }
  };
  add(FIXTURES);
  const supplementary = join(FIXTURES, '_supplementary');
  if (existsSync(supplementary)) add(supplementary);
  return dirs;
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function loadCandidates(): Candidate[] {
  const out: Candidate[] = [];
  for (const dir of fixtureDirs()) {
    const set = loadFixtureSet(dir);
    for (const entry of set.entries.values()) {
      const { response } = set.read(entry);
      out.push({
        source: entry.source,
        method: entry.method,
        url: entry.url,
        response: {
          body: parseBody(response.bodyText),
          bodyText: response.bodyText,
          headers: response.headers as unknown as LiveResponse['headers'],
        },
      });
    }
  }
  return out;
}

function requiredPaths(row: EndpointFactRow): string[] {
  const optional = new Set(row.notVerifiedPaths ?? []);
  return row.paths.filter((p) => !optional.has(p));
}

/** First path missing in the best-matching response, or null when some response has all paths. */
function firstMissing(row: EndpointFactRow, candidates: readonly Candidate[]): string | null {
  const paths = requiredPaths(row);
  let best: string[] | null = null;
  for (const c of candidates) {
    if (c.source !== row.source) continue;
    if (c.method !== row.requestMatcher.method || !row.requestMatcher.url.test(c.url)) continue;
    const missing = paths.filter((p) => !pathExists(c.response, p));
    if (missing.length === 0) return null;
    if (best === null || missing.length < best.length) best = missing;
  }
  return best === null ? (paths[0] ?? null) : (best[0] ?? null);
}

describe('fixture coverage of the Endpoint_Fact_Map (R23.13)', () => {
  const candidates = loadCandidates();
  const rows = ENDPOINT_FACT_MAP.filter((r) => r.verified && !EXCLUDED.has(r.id));

  it('finds recorded responses', () => {
    expect(candidates.length).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(0);
  });

  for (const row of rows) {
    it(`${row.id} ${row.source} is covered by one recorded response`, () => {
      const missing = firstMissing(row, candidates);
      if (missing !== null) {
        throw new Error(`${row.id} ${row.source} missing path ${missing}`);
      }
    });
  }
});
