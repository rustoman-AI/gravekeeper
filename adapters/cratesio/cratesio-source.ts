import { CRATES_OWNERS_TTL_SECONDS } from "../../pipeline/constants";
import type { CratesIoSource } from "../../pipeline/ports/cratesio-source";
import type { HttpClient, HttpRequest, RequestContext } from "../../pipeline/ports/http";
import { toSourceResult } from "../http/source-result";

// Requirement 12.2, 12.7, 12.13, 15.16, 19.20

const CRATES_API = "https://crates.io/api/v1/crates";

export interface CratesIoSourceOptions {
  readonly http: HttpClient;
  /** Value of `GRAVEKEEPER_USER_AGENT`, resolved by the composition (`resolveUserAgent`). */
  readonly userAgent: string;
}

/**
 * EF-21 owners lookup. The CONCURRENCY_CRATESIO slot and the CRATESIO_MIN_INTERVAL_MS
 * spacing are applied by the HTTP client from `source: 'cratesio'`.
 */
export function createCratesIoSource(options: CratesIoSourceOptions): CratesIoSource {
  const { http, userAgent } = options;
  return {
    async getOwners(name: string, ctx: RequestContext) {
      const request: HttpRequest = {
        source: "cratesio",
        method: "GET",
        url: `${CRATES_API}/${encodeURIComponent(name)}/owners`,
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        body: null,
        auth: "none",
        notFound: "absent",
        // The URL holds the crate name, so the cache key needs no extra parts.
        cache: {
          ttlSeconds: CRATES_OWNERS_TTL_SECONDS,
          extraKey: [],
          storeWhen: "always",
          l2Kind: "crates-owners",
        },
        gate: null,
      };
      return toSourceResult(await http.execute(request, ctx));
    },
  };
}
