import type { HttpClient, HttpRequest, RequestContext } from "../../pipeline/ports/http";
import type { SourceResult } from "../../pipeline/ports/github-source";
import type { NpmSource } from "../../pipeline/ports/npm-source";
import { UPSTREAM_CACHE_TTL_SECONDS } from "../../pipeline/constants";
import { toSourceResult } from "../http/source-result";

// Requirement 12.1, 8.6, 12.7; resurrect-upgrade R1.8, R1.11, R3.2

const NPM_REGISTRY_URL = "https://registry.npmjs.org";

function npmRequest(url: string): HttpRequest {
  return {
    source: "npm",
    method: "GET",
    url,
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
}

/** EF-20. 404 is absent. Cached in L1 only (general upstream policy). */
export function createNpmSource(http: HttpClient): NpmSource {
  return {
    async getLatest(name: string, ctx: RequestContext): Promise<SourceResult> {
      const url = `${NPM_REGISTRY_URL}/${encodeURIComponent(name)}/latest`;
      return toSourceResult(await http.execute(npmRequest(url), ctx));
    },
    async getVersion(name: string, version: string, ctx: RequestContext): Promise<SourceResult> {
      const url = `${NPM_REGISTRY_URL}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
      return toSourceResult(await http.execute(npmRequest(url), ctx));
    },
  };
}
