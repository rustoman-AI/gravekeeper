import { ADVISORY_CACHE_TTL_SECONDS, OSV_BATCH_SIZE, UPSTREAM_CACHE_TTL_SECONDS } from "../../pipeline/constants";
import type { HttpClient, HttpRequest } from "../../pipeline/ports/http";
import type { SourceResult } from "../../pipeline/ports/github-source";
import type { OsvQuery, OsvSource } from "../../pipeline/ports/osv-source";
import { toSourceResult } from "../http/source-result";

// Requirement 9.1, 9.4, 9.9, 17.6, 19.17, 19.18, 19.20 (EF-5, EF-6)

const OSV_BASE_URL = "https://api.osv.dev";

/** Builds the OSV adapter on top of the shared HTTP client. */
export function createOsvSource(http: HttpClient): OsvSource {
  return {
    async queryBatch(queries, ctx): Promise<SourceResult> {
      // The Pipeline batches; the slice keeps the request within OSV_BATCH_SIZE
      // even if a caller does not (a length mismatch is then failed by the Mapper).
      const request: HttpRequest = {
        source: "osv",
        method: "POST",
        url: `${OSV_BASE_URL}/v1/querybatch`,
        headers: { "content-type": "application/json" },
        body: serializeBatch(queries.slice(0, OSV_BATCH_SIZE)),
        auth: "none",
        notFound: "failed",
        cache: {
          ttlSeconds: UPSTREAM_CACHE_TTL_SECONDS,
          extraKey: [],
          storeWhen: "always",
          l2Kind: null,
        },
        gate: null,
      };
      return toSourceResult(await http.execute(request, ctx));
    },

    async getVulnerability(id, ctx): Promise<SourceResult> {
      const request: HttpRequest = {
        source: "osv",
        method: "GET",
        url: `${OSV_BASE_URL}/v1/vulns/${encodeURIComponent(id)}`,
        headers: {},
        body: null,
        auth: "none",
        notFound: "failed",
        cache: {
          ttlSeconds: ADVISORY_CACHE_TTL_SECONDS,
          extraKey: [],
          storeWhen: "always",
          l2Kind: "osv-advisory",
        },
        gate: null,
      };
      return toSourceResult(await http.execute(request, ctx));
    },
  };
}

/** `{"queries":[{"package":{"name","ecosystem"},"version"}]}`, keys in this fixed order. */
function serializeBatch(queries: readonly OsvQuery[]): string {
  return JSON.stringify({
    queries: queries.map((q) => ({
      package: { name: q.name, ecosystem: q.ecosystem },
      version: q.version,
    })),
  });
}
