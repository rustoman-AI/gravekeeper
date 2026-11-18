import type { HttpClient, HttpRequest, RequestContext } from "../../pipeline/ports/http";
import type { SourceResult } from "../../pipeline/ports/github-source";
import type { NpmSource } from "../../pipeline/ports/npm-source";
import { UPSTREAM_CACHE_TTL_SECONDS } from "../../pipeline/constants";
import { toSourceResult } from "../http/source-result";

// Requirement 12.1, 8.6, 12.7

const NPM_REGISTRY_URL = "https://registry.npmjs.org";

/**
 * Path segment for a package name. The npm registry documents `@scope%2Fname`:
 * the `@` stays, the `/` is encoded.
 */
function encodeName(name: string): string {
  return encodeURIComponent(name).replace(/^%40/, "@");
}

/** EF-20. 404 is absent. Cached in L1 only (general upstream policy). */
export function createNpmSource(http: HttpClient): NpmSource {
  return {
    async getLatest(name: string, ctx: RequestContext): Promise<SourceResult> {
      const request: HttpRequest = {
        source: "npm",
        method: "GET",
        url: `${NPM_REGISTRY_URL}/${encodeName(name)}/latest`,
        headers: { accept: "application/json" },
        body: null,
        auth: "none",
        notFound: "absent",
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
  };
}
