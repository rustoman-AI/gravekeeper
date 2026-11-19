import { getCache } from '@vercel/functions';
import {
  CONCURRENCY_CRATESIO,
  CONCURRENCY_DEPSDEV,
  CONCURRENCY_GITHUB,
  CONCURRENCY_NPM,
  CONCURRENCY_OSV,
  CONCURRENCY_PYPI,
  CRATESIO_MIN_INTERVAL_MS,
} from '../pipeline/constants';
import type { CacheStore } from '../pipeline/ports/cache';
import type { GithubConfig, SourceName } from '../pipeline/ports/http';
import type {
  Clock,
  Logger,
  RandomSource,
  Timer,
} from '../pipeline/ports/runtime';
import type { CratesIoSource } from '../pipeline/ports/cratesio-source';
import type { DepsDevSource } from '../pipeline/ports/depsdev-source';
import type { GithubSource } from '../pipeline/ports/github-source';
import type { NpmSource } from '../pipeline/ports/npm-source';
import type { OsvSource } from '../pipeline/ports/osv-source';
import type { PypiSource } from '../pipeline/ports/pypi-source';
import type { Deferrer } from '../pipeline/ports/runtime';
import { MemoryCacheStore } from './cache/memory-cache-store';
import { RuntimeCacheStore } from './cache/runtime-cache-store';
import { TieredCacheStore } from './cache/tiered-cache-store';
import { createCratesIoSource } from './cratesio/cratesio-source';
import { createDepsDevSource } from './depsdev/depsdev-source';
import { createGithubSource } from './github/github-source';
import { CachingHttpClient } from './http/caching-http-client';
import { createGithubAuthorizer } from './http/github-authorizer';
import { createHttpClient, type LimiterConfig } from './http/http-client';
import { createNpmSource } from './npm/npm-source';
import { createOsvSource } from './osv/osv-source';
import { createPypiSource } from './pypi/pypi-source';
import { consoleLogger } from './runtime/console-logger';
import { isL2Enabled, resolveUserAgent, type RuntimeEnv } from './runtime/env';
import { systemClock } from './runtime/system-clock';
import { systemRandom } from './runtime/system-random';
import { systemTimer } from './runtime/system-timer';
import { readGithubToken } from './runtime/token-reader';

// Requirements 19.19, 20.1, 22.5, 22.9, 22.17

const UPSTREAM_L1_KEY = Symbol.for('gravekeeper.l1.upstream-cache');
const SCAN_L1_KEY = Symbol.for('gravekeeper.l1.scan-cache');

type L1Holder = { [key: symbol]: MemoryCacheStore | undefined };

/** One MemoryCacheStore per key for the life of the function instance (survives across requests). */
function l1Singleton(key: symbol): MemoryCacheStore {
  const holder = globalThis as unknown as L1Holder;
  let store = holder[key];
  if (store === undefined) {
    store = new MemoryCacheStore(systemClock);
    holder[key] = store;
  }
  return store;
}

const limiter = (concurrency: number, minIntervalMs = 0): LimiterConfig => ({
  concurrency,
  minIntervalMs,
});

/**
 * Production dependencies, built from port types only. Field names and types match `ApiDeps`;
 * the route replaces `scanStore` with `scanCache: createScanCache(scanStore)`.
 */
export interface ProductionDeps {
  readonly sources: {
    readonly github: GithubSource;
    readonly depsdev: DepsDevSource;
    readonly osv: OsvSource;
    readonly npm: NpmSource;
    readonly cratesio: CratesIoSource;
    readonly pypi: PypiSource;
  };
  readonly clock: Clock;
  readonly timer: Timer;
  readonly random: RandomSource;
  readonly logger: Logger;
  /** The tiered Scan_Cache store. */
  readonly scanStore: CacheStore;
  readonly readEnv: () => {
    readonly GITHUB_API_URL?: string | undefined;
    readonly GITHUB_GRAPHQL_URL?: string | undefined;
  };
}

/**
 * Builds the production dependencies of `handleScanRequest`. `config` is the validated GitHub
 * configuration the route resolved from `env`. The GitHub token is read through `readGithubToken`
 * only, on each authorized request, and is never stored in the returned value.
 */
export function createProductionDeps(
  env: RuntimeEnv,
  deferrer: Deferrer,
  config: GithubConfig,
): ProductionDeps {
  const clock = systemClock;
  const timer = systemTimer;
  const random = systemRandom;
  const logger = consoleLogger;
  const userAgent = resolveUserAgent(env);

  const limiters: Record<SourceName, LimiterConfig> = {
    github: limiter(CONCURRENCY_GITHUB),
    depsdev: limiter(CONCURRENCY_DEPSDEV),
    osv: limiter(CONCURRENCY_OSV),
    npm: limiter(CONCURRENCY_NPM),
    cratesio: limiter(CONCURRENCY_CRATESIO, CRATESIO_MIN_INTERVAL_MS),
    pypi: limiter(CONCURRENCY_PYPI),
  };

  const httpClient = createHttpClient({
    fetchImpl: (input, init) => fetch(input, init),
    clock,
    timer,
    random,
    logger,
    limiters,
    authorizer: createGithubAuthorizer(readGithubToken, config),
    secrets: () => {
      const token = readGithubToken();
      return token === null ? [] : [token];
    },
    userAgent,
  });

  const l2: CacheStore | null = isL2Enabled(env)
    ? new RuntimeCacheStore({ getCache: () => getCache(), timer, clock, logger })
    : null;

  const upstreamStore = new TieredCacheStore({ l1: l1Singleton(UPSTREAM_L1_KEY), l2, deferrer });
  const scanStore = new TieredCacheStore({ l1: l1Singleton(SCAN_L1_KEY), l2, deferrer });

  const http = new CachingHttpClient(httpClient, upstreamStore);

  return {
    sources: {
      github: createGithubSource(http, config, readGithubToken() !== null),
      depsdev: createDepsDevSource(http),
      osv: createOsvSource(http),
      npm: createNpmSource(http),
      cratesio: createCratesIoSource({ http, userAgent }),
      pypi: createPypiSource(http),
    },
    clock,
    timer,
    random,
    logger,
    scanStore,
    readEnv: () => ({
      GITHUB_API_URL: env.GITHUB_API_URL,
      GITHUB_GRAPHQL_URL: env.GITHUB_GRAPHQL_URL,
    }),
  };
}
