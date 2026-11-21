import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as constants from '../../pipeline/constants';

// Requirement 23.11, 21.16, 5.6: constant consistency rules of the Constants section.

const exported = constants as unknown as Record<string, unknown>;

// Reads a constant named in a rule. Fails when the name is not exported.
function read(name: string, source: Record<string, unknown> = exported): unknown {
  if (!Object.hasOwn(source, name)) {
    throw new Error(`constant ${name} is not exported`);
  }
  return source[name];
}

function num(name: string, source: Record<string, unknown> = exported): number {
  const value = read(name, source);
  if (typeof value !== 'number') {
    throw new Error(`constant ${name} is not a number`);
  }
  return value;
}

function names(name: string): readonly string[] {
  const value = read(name);
  if (!Array.isArray(value)) {
    throw new Error(`constant ${name} is not an array`);
  }
  return value as readonly string[];
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

const TABLE_NAMES: readonly string[] = [
  'GITHUB_DEFAULT_API_URL',
  'GITHUB_DEFAULT_GRAPHQL_URL',
  'GITHUB_DEFAULT_WEB_HOST',
  'GITHUB_RAW_HOST',
  'GHES_API_PATH_SUFFIX',
  'REPO_URL_MAX_LENGTH',
  'BRANCH_MAX_LENGTH',
  'OWNER_MAX_LENGTH',
  'REPO_NAME_MAX_LENGTH',
  'URL_IGNORED_QUERY_PARAMS',
  'REQUEST_BODY_MAX_BYTES',
  'DAY_MS',
  'DISCOVERY_MANIFEST_NAMES',
  'DISCOVERY_SKIP_DIRS',
  'DISCOVERY_MAX_DEPTH',
  'DISCOVERY_MAX_MANIFESTS',
  'SCAN_MAX_MANIFESTS',
  'SCAN_MAX_DEPENDENCIES',
  'MAX_RESPONSE_BYTES',
  'REQUEST_TIMEOUT_MS',
  'REQUEST_TOTAL_TIMEOUT_MS',
  'SCAN_DEADLINE_MS',
  'SCAN_RESPONSE_MARGIN_MS',
  'CONCURRENCY_GITHUB',
  'CONCURRENCY_DEPSDEV',
  'CONCURRENCY_OSV',
  'CONCURRENCY_NPM',
  'CONCURRENCY_CRATESIO',
  'CONCURRENCY_PYPI',
  'CRATESIO_MIN_INTERVAL_MS',
  'RETRY_MAX_ATTEMPTS',
  'RETRY_BASE_DELAY_MS',
  'RETRY_MAX_DELAY_MS',
  'RETRY_JITTER_RATIO',
  'RETRY_AFTER_MAX_MS',
  'GITHUB_BUDGET_THRESHOLD',
  'UPSTREAM_CACHE_TTL_SECONDS',
  'ADVISORY_CACHE_TTL_SECONDS',
  'SCAN_CACHE_TTL_SECONDS',
  'CACHE_MAX_ENTRIES',
  'CRATES_OWNERS_TTL_SECONDS',
  'PARTIAL_SCAN_TTL_SECONDS',
  'L2_OPERATION_TIMEOUT_MS',
  'L2_MAX_SCAN_BYTES',
  'L2_MAX_BODY_BYTES',
  'CACHE_KEY_VERSION',
  'REDIRECT_MAX_HOPS',
  'RESPONSE_HEADER_ALLOWLIST',
  'ROUTE_MAX_DURATION_SECONDS',
  'FIXTURE_SET_MAX_BYTES',
  'OSV_BATCH_SIZE',
  'OSV_MAX_ADVISORY_DETAILS',
  'GRAPHQL_BATCH_SIZE',
  'DEPSDEV_BATCH_SIZE',
  'CVSS_RANGES',
  'TOKEN_TEST_MIN_LENGTH',
  'FIXTURE_MIN_REPOS',
  'RANGE_MAX_LENGTH',
  'ADVISORY_URL_PREFIX',
  'CACHE_STATUS_HEADER',
];

describe('constant consistency rules', () => {
  it('DISCOVERY_MAX_MANIFESTS >= SCAN_MAX_MANIFESTS', () => {
    expect(num('DISCOVERY_MAX_MANIFESTS')).toBeGreaterThanOrEqual(num('SCAN_MAX_MANIFESTS'));
  });

  it('REQUEST_TIMEOUT_MS <= REQUEST_TOTAL_TIMEOUT_MS', () => {
    expect(num('REQUEST_TIMEOUT_MS')).toBeLessThanOrEqual(num('REQUEST_TOTAL_TIMEOUT_MS'));
  });

  it('REQUEST_TOTAL_TIMEOUT_MS <= SCAN_DEADLINE_MS', () => {
    expect(num('REQUEST_TOTAL_TIMEOUT_MS')).toBeLessThanOrEqual(num('SCAN_DEADLINE_MS'));
  });

  it('RETRY_BASE_DELAY_MS <= RETRY_MAX_DELAY_MS', () => {
    expect(num('RETRY_BASE_DELAY_MS')).toBeLessThanOrEqual(num('RETRY_MAX_DELAY_MS'));
  });

  it('RETRY_AFTER_MAX_MS < REQUEST_TOTAL_TIMEOUT_MS', () => {
    expect(num('RETRY_AFTER_MAX_MS')).toBeLessThan(num('REQUEST_TOTAL_TIMEOUT_MS'));
  });

  it('GITHUB_BUDGET_THRESHOLD >= 1', () => {
    expect(num('GITHUB_BUDGET_THRESHOLD')).toBeGreaterThanOrEqual(1);
  });

  it('CONCURRENCY_GITHUB = 1', () => {
    expect(num('CONCURRENCY_GITHUB')).toBe(1);
  });

  it('every *_BATCH_SIZE and *_MAX_* value is a positive integer', () => {
    const matching = Object.keys(exported).filter(
      (name) => name.endsWith('_BATCH_SIZE') || name.includes('_MAX_') || name.startsWith('MAX_'),
    );
    expect(matching).toEqual(expect.arrayContaining([
      'OSV_BATCH_SIZE',
      'GRAPHQL_BATCH_SIZE',
      'DEPSDEV_BATCH_SIZE',
      'OSV_MAX_ADVISORY_DETAILS',
      'MAX_RESPONSE_BYTES',
      'SCAN_MAX_MANIFESTS',
    ]));
    for (const name of matching) {
      const value = exported[name];
      expect(typeof value, name).toBe('number');
      expect(isPositiveInteger(value as number), name).toBe(true);
    }
  });

  it('SCAN_RESPONSE_MARGIN_MS is a positive integer', () => {
    expect(isPositiveInteger(num('SCAN_RESPONSE_MARGIN_MS'))).toBe(true);
  });

  it('SCAN_RESPONSE_MARGIN_MS < SCAN_DEADLINE_MS', () => {
    expect(num('SCAN_RESPONSE_MARGIN_MS')).toBeLessThan(num('SCAN_DEADLINE_MS'));
  });

  it('SCAN_DEADLINE_MS + SCAN_RESPONSE_MARGIN_MS < ROUTE_MAX_DURATION_SECONDS * 1000', () => {
    expect(num('SCAN_DEADLINE_MS') + num('SCAN_RESPONSE_MARGIN_MS')).toBeLessThan(
      num('ROUTE_MAX_DURATION_SECONDS') * 1000,
    );
  });

  it('ROUTE_MAX_DURATION_SECONDS * 1000 > SCAN_DEADLINE_MS + SCAN_RESPONSE_MARGIN_MS', () => {
    expect(num('ROUTE_MAX_DURATION_SECONDS') * 1000).toBeGreaterThan(
      num('SCAN_DEADLINE_MS') + num('SCAN_RESPONSE_MARGIN_MS'),
    );
  });

  it('L2_OPERATION_TIMEOUT_MS < REQUEST_TIMEOUT_MS', () => {
    expect(num('L2_OPERATION_TIMEOUT_MS')).toBeLessThan(num('REQUEST_TIMEOUT_MS'));
  });

  it('L2_MAX_SCAN_BYTES <= 2000000', () => {
    expect(num('L2_MAX_SCAN_BYTES')).toBeLessThanOrEqual(2000000);
  });

  it('L2_MAX_BODY_BYTES <= L2_MAX_SCAN_BYTES', () => {
    expect(num('L2_MAX_BODY_BYTES')).toBeLessThanOrEqual(num('L2_MAX_SCAN_BYTES'));
  });

  it('REDIRECT_MAX_HOPS is an integer of at least 0', () => {
    const value = num('REDIRECT_MAX_HOPS');
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  });

  it('PARTIAL_SCAN_TTL_SECONDS < SCAN_CACHE_TTL_SECONDS', () => {
    expect(num('PARTIAL_SCAN_TTL_SECONDS')).toBeLessThan(num('SCAN_CACHE_TTL_SECONDS'));
  });

  it('CRATES_OWNERS_TTL_SECONDS >= UPSTREAM_CACHE_TTL_SECONDS', () => {
    expect(num('CRATES_OWNERS_TTL_SECONDS')).toBeGreaterThanOrEqual(num('UPSTREAM_CACHE_TTL_SECONDS'));
  });

  it('SCAN_MAX_MANIFESTS >= the number of names in DISCOVERY_MANIFEST_NAMES', () => {
    expect(num('SCAN_MAX_MANIFESTS')).toBeGreaterThanOrEqual(names('DISCOVERY_MANIFEST_NAMES').length);
  });

  it('CACHE_KEY_VERSION is a positive integer greater than 1', () => {
    expect(isPositiveInteger(num('CACHE_KEY_VERSION'))).toBe(true);
    expect(num('CACHE_KEY_VERSION')).toBeGreaterThan(1);
  });

  it('DISCOVERY_MANIFEST_NAMES is exactly package.json, requirements.txt, pyproject.toml, Cargo.toml in order', () => {
    expect(names('DISCOVERY_MANIFEST_NAMES')).toEqual([
      'package.json',
      'requirements.txt',
      'pyproject.toml',
      'Cargo.toml',
    ]);
  });

  it('CACHE_KEY_VERSION equals 3', () => {
    expect(num('CACHE_KEY_VERSION')).toBe(3);
  });

  it('RANGE_MAX_LENGTH is a positive integer', () => {
    expect(isPositiveInteger(num('RANGE_MAX_LENGTH'))).toBe(true);
  });

  it('FIXTURE_SET_MAX_BYTES is a positive integer', () => {
    expect(isPositiveInteger(num('FIXTURE_SET_MAX_BYTES'))).toBe(true);
  });

  it('fails when a constant named in a rule is not exported', () => {
    expect(() => num('NOT_A_PIPELINE_CONSTANT')).toThrow(/not exported/);
    expect(() => num('SCAN_DEADLINE_MS', {})).toThrow(/not exported/);
  });

  it('exports every constant named in the rules', () => {
    const ruleNames = [
      'DISCOVERY_MAX_MANIFESTS',
      'SCAN_MAX_MANIFESTS',
      'REQUEST_TIMEOUT_MS',
      'REQUEST_TOTAL_TIMEOUT_MS',
      'SCAN_DEADLINE_MS',
      'RETRY_BASE_DELAY_MS',
      'RETRY_MAX_DELAY_MS',
      'RETRY_AFTER_MAX_MS',
      'GITHUB_BUDGET_THRESHOLD',
      'CONCURRENCY_GITHUB',
      'SCAN_RESPONSE_MARGIN_MS',
      'ROUTE_MAX_DURATION_SECONDS',
      'L2_OPERATION_TIMEOUT_MS',
      'L2_MAX_SCAN_BYTES',
      'L2_MAX_BODY_BYTES',
      'REDIRECT_MAX_HOPS',
      'PARTIAL_SCAN_TTL_SECONDS',
      'SCAN_CACHE_TTL_SECONDS',
      'CRATES_OWNERS_TTL_SECONDS',
      'UPSTREAM_CACHE_TTL_SECONDS',
      'DISCOVERY_MANIFEST_NAMES',
      'CACHE_KEY_VERSION',
      'FIXTURE_SET_MAX_BYTES',
    ];
    for (const name of ruleNames) {
      expect(() => read(name), name).not.toThrow();
    }
  });
});

describe('constants table coverage', () => {
  const source = readFileSync(resolve(__dirname, '../../pipeline/constants.ts'), 'utf8');

  it('defines no UPPER_SNAKE constant outside the requirements table', () => {
    const declared = [...source.matchAll(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\b/gm)].map(
      (match) => match[1] as string,
    );
    const extra = declared.filter((name) => !TABLE_NAMES.includes(name));
    expect(extra).toEqual([]);
  });

  it('exports every constant of the requirements table', () => {
    const missing = TABLE_NAMES.filter((name) => !Object.hasOwn(exported, name));
    expect(missing).toEqual([]);
  });
});
