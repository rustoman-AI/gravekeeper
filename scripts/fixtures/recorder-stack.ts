import { createCratesIoSource } from '../../adapters/cratesio/cratesio-source';
import { createDepsDevSource } from '../../adapters/depsdev/depsdev-source';
import { createGithubSource } from '../../adapters/github/github-source';
import { MemoryCacheStore } from '../../adapters/cache/memory-cache-store';
import { CachingHttpClient } from '../../adapters/http/caching-http-client';
import { createGithubAuthorizer } from '../../adapters/http/github-authorizer';
import { createHttpClient, type LimiterConfig } from '../../adapters/http/http-client';
import { createNpmSource } from '../../adapters/npm/npm-source';
import { createOsvSource } from '../../adapters/osv/osv-source';
import { createPypiSource } from '../../adapters/pypi/pypi-source';
import { readRuntimeEnv, resolveUserAgent } from '../../adapters/runtime/env';
import { systemClock } from '../../adapters/runtime/system-clock';
import { systemRandom } from '../../adapters/runtime/system-random';
import { systemTimer } from '../../adapters/runtime/system-timer';
import { readGithubToken } from '../../adapters/runtime/token-reader';
import {
  CONCURRENCY_CRATESIO,
  CONCURRENCY_DEPSDEV,
  CONCURRENCY_GITHUB,
  CONCURRENCY_NPM,
  CONCURRENCY_OSV,
  CONCURRENCY_PYPI,
  CRATESIO_MIN_INTERVAL_MS,
  OSV_MAX_ADVISORY_DETAILS,
  SCAN_MAX_DEPENDENCIES,
  SCAN_MAX_MANIFESTS,
} from '../../pipeline/constants';
import { readGithubConfig } from '../../pipeline/config/github-config';
import { createScanCache } from '../../pipeline/scan/scan-cache';
import type { ScanDeps } from '../../pipeline/scan/types';
import type { HttpClient, GithubConfig, SourceName } from '../../pipeline/ports/http';
import type { Logger } from '../../pipeline/ports/runtime';
import { RecordingHttpClient } from './recording-http-client';

// Requirement 23.2, 20.1

/** Scan deadline of a recording scan. A real scan of a large repository can exceed the 25 s product value. */
export const RECORDING_DEADLINE_MS = 300_000;

const silentLogger: Logger = { log: () => undefined };

export function recordingConfig(): GithubConfig {
  const parsed = readGithubConfig({});
  if (!parsed.ok) throw new Error('default GitHub configuration is invalid');
  return parsed.value;
}

const limiter = (concurrency: number, minIntervalMs = 0): LimiterConfig => ({
  concurrency,
  minIntervalMs,
});

/** Sources over `CachingHttpClient(client)` with an empty in-memory cache and no L2. */
export function buildSourcesOver(
  client: HttpClient,
  config: GithubConfig,
  hasToken: boolean,
  userAgent: string,
): ScanDeps['sources'] & { readonly http: HttpClient } {
  const http = new CachingHttpClient(client, new MemoryCacheStore(systemClock));
  return {
    github: createGithubSource(http, config, hasToken),
    depsdev: createDepsDevSource(http),
    osv: createOsvSource(http),
    npm: createNpmSource(http),
    cratesio: createCratesIoSource({ http, userAgent }),
    pypi: createPypiSource(http),
    http,
  };
}

export function buildScanDeps(
  sources: ScanDeps['sources'],
  config: GithubConfig,
  clock: () => number,
): ScanDeps {
  return {
    sources,
    clock,
    timer: systemTimer,
    random: systemRandom,
    logger: silentLogger,
    scanCache: createScanCache(new MemoryCacheStore(clock)),
    config,
    limits: {
      maxManifests: SCAN_MAX_MANIFESTS,
      maxDependencies: SCAN_MAX_DEPENDENCIES,
      maxAdvisoryDetails: OSV_MAX_ADVISORY_DETAILS,
    },
    deadlineMs: RECORDING_DEADLINE_MS,
  };
}

export interface RecordingStack {
  readonly recorder: RecordingHttpClient;
  readonly sources: ScanDeps['sources'];
  readonly deps: ScanDeps;
  readonly config: GithubConfig;
}

/**
 * The production client over the real `fetch`, wrapped by `RecordingHttpClient`, under
 * `CachingHttpClient` with an empty `MemoryCacheStore`. No L2. The token is read only through
 * `readGithubToken`.
 */
export function createRecordingStack(): RecordingStack {
  const config = recordingConfig();
  const userAgent = resolveUserAgent(readRuntimeEnv());
  const base = createHttpClient({
    fetchImpl: (input, init) => fetch(input, init),
    clock: systemClock,
    timer: systemTimer,
    random: systemRandom,
    logger: silentLogger,
    limiters: {
      github: limiter(CONCURRENCY_GITHUB),
      depsdev: limiter(CONCURRENCY_DEPSDEV),
      osv: limiter(CONCURRENCY_OSV),
      npm: limiter(CONCURRENCY_NPM),
      cratesio: limiter(CONCURRENCY_CRATESIO, CRATESIO_MIN_INTERVAL_MS),
      pypi: limiter(CONCURRENCY_PYPI),
    } satisfies Record<SourceName, LimiterConfig>,
    authorizer: createGithubAuthorizer(readGithubToken, config),
    secrets: () => {
      const token = readGithubToken();
      return token === null ? [] : [token];
    },
    userAgent,
  });
  const recorder = new RecordingHttpClient(base);
  const { http: _http, ...sources } = buildSourcesOver(
    recorder,
    config,
    readGithubToken() !== null,
    userAgent,
  );
  void _http;
  return { recorder, sources, deps: buildScanDeps(sources, config, systemClock), config };
}
