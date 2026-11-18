import { toSourceResult } from '../http/source-result';
import { ADVISORY_CACHE_TTL_SECONDS, DEPSDEV_BATCH_SIZE, UPSTREAM_CACHE_TTL_SECONDS } from '../../pipeline/constants';
import type { CachePolicy, HttpClient, HttpRequest, RequestContext } from '../../pipeline/ports/http';
import type { SourceResult } from '../../pipeline/ports/github-source';
import type { DepsDevSource, DepsDevSystem, VersionRequest } from '../../pipeline/ports/depsdev-source';

// Requirements 8.1, 8.8, 9.20, 9.21, 9.23, 19.17, 19.18, 19.20

const API_BASE = 'https://api.deps.dev';
const JSON_HEADERS: Readonly<Record<string, string>> = { accept: 'application/json' };
const POST_HEADERS: Readonly<Record<string, string>> = {
  accept: 'application/json',
  'content-type': 'application/json',
};

const UPSTREAM_POLICY: CachePolicy = {
  ttlSeconds: UPSTREAM_CACHE_TTL_SECONDS,
  extraKey: [],
  storeWhen: 'always',
  l2Kind: null,
};

const ADVISORY_POLICY: CachePolicy = {
  ttlSeconds: ADVISORY_CACHE_TTL_SECONDS,
  extraKey: [],
  storeWhen: 'always',
  l2Kind: 'depsdev-advisory',
};

/** deps.dev system name in the versionbatch body (EF-3). */
function upperSystem(system: DepsDevSystem): string {
  return system.toUpperCase();
}

function packagePath(system: DepsDevSystem, name: string): string {
  // Scoped-name encoding is Not verified (EF-1); encodeURIComponent per design.
  return `${API_BASE}/v3/systems/${system}/packages/${encodeURIComponent(name)}`;
}

/** Creates the deps.dev source on top of the HttpClient interface. */
export function createDepsDevSource(client: HttpClient): DepsDevSource {
  async function run(request: HttpRequest, ctx: RequestContext): Promise<SourceResult> {
    return toSourceResult(await client.execute(request, ctx));
  }

  return {
    getPackage(system, name, ctx) {
      return run(
        {
          source: 'depsdev',
          method: 'GET',
          url: packagePath(system, name),
          headers: JSON_HEADERS,
          body: null,
          auth: 'none',
          notFound: 'absent',
          cache: UPSTREAM_POLICY,
          gate: null,
        },
        ctx,
      );
    },

    getVersion(system, name, version, ctx) {
      return run(
        {
          source: 'depsdev',
          method: 'GET',
          url: `${packagePath(system, name)}/versions/${encodeURIComponent(version)}`,
          headers: JSON_HEADERS,
          body: null,
          auth: 'none',
          // A missing version is not an "absent" answer (EF-2); the caller falls back or notes it.
          notFound: 'failed',
          cache: UPSTREAM_POLICY,
          gate: null,
        },
        ctx,
      );
    },

    async getVersionBatch(requests: readonly VersionRequest[], ctx) {
      if (requests.length > DEPSDEV_BATCH_SIZE) {
        // The caller batches; an oversized batch is a programming error, reported as a failed unit.
        return { kind: 'failed', reason: 'http-error', status: null, headers: null };
      }
      const body = JSON.stringify({
        requests: requests.map((r) => ({
          versionKey: { system: upperSystem(r.system), name: r.name, version: r.version },
        })),
      });
      return run(
        {
          source: 'depsdev',
          method: 'POST',
          url: `${API_BASE}/v3alpha/versionbatch`,
          headers: POST_HEADERS,
          body,
          auth: 'none',
          notFound: 'failed',
          cache: UPSTREAM_POLICY,
          gate: null,
        },
        ctx,
      );
    },

    getAdvisory(id, ctx) {
      return run(
        {
          source: 'depsdev',
          method: 'GET',
          url: `${API_BASE}/v3/advisories/${encodeURIComponent(id)}`,
          headers: JSON_HEADERS,
          body: null,
          auth: 'none',
          notFound: 'absent',
          cache: ADVISORY_POLICY,
          gate: null,
        },
        ctx,
      );
    },
  };
}
