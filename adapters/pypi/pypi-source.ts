import type { HttpClient, HttpRequest, RequestContext } from "../../pipeline/ports/http";
import type { SourceResult } from "../../pipeline/ports/github-source";
import type { PypiSource } from "../../pipeline/ports/pypi-source";
import { UPSTREAM_CACHE_TTL_SECONDS } from "../../pipeline/constants";
import { toSourceResult } from "../http/source-result";

// Requirement 12.5, 12.7

const PYPI_URL = "https://pypi.org/pypi";

/**
 * EF-22. Per-version document `/pypi/{name}/{version}/json`. 404 is absent. Cached in L1 only
 * (general upstream policy). `name` arrives already PEP 503 normalized from the manifest parser.
 */
export function createPypiSource(http: HttpClient): PypiSource {
  return {
    async getProject(name: string, version: string, ctx: RequestContext): Promise<SourceResult> {
      const request: HttpRequest = {
        source: "pypi",
        method: "GET",
        url: `${PYPI_URL}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`,
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
