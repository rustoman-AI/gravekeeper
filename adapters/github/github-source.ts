import { GITHUB_DEFAULT_WEB_HOST, GITHUB_RAW_HOST, UPSTREAM_CACHE_TTL_SECONDS } from "../../pipeline/constants";
import type { GithubSource, RepoCoordinates } from "../../pipeline/ports/github-source";
import type {
  AttemptGate,
  CachePolicy,
  GithubConfig,
  HttpClient,
  HttpRequest,
  RequestContext,
} from "../../pipeline/ports/http";
import { toSourceResult, toTextResult } from "../http/source-result";

// Requirement 2.6, 3.1, 3.4, 3.8, 11.1, 14.3, 14.11, 19.2, 19.4

const enc = encodeURIComponent;

const JSON_HEADERS: Readonly<Record<string, string>> = { Accept: "application/vnd.github+json" };
// Asks the GHES blobs endpoint for the raw bytes instead of the base64 JSON envelope.
const RAW_BLOB_HEADERS: Readonly<Record<string, string>> = {
  Accept: "application/vnd.github.raw+json",
};
const TEXT_HEADERS: Readonly<Record<string, string>> = { Accept: "text/plain" };
const GRAPHQL_HEADERS: Readonly<Record<string, string>> = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

const cachePolicy = (
  extraKey: readonly string[],
  storeWhen: CachePolicy["storeWhen"],
): CachePolicy => ({
  ttlSeconds: UPSTREAM_CACHE_TTL_SECONDS,
  extraKey,
  storeWhen,
  l2Kind: null,
});

const encodePath = (path: string): string => path.split("/").map(enc).join("/");

export function createGithubSource(
  client: HttpClient,
  config: GithubConfig,
  tokenPresent: boolean,
): GithubSource {
  const repoUrl = (ref: RepoCoordinates): string =>
    `${config.apiUrl}/repos/${enc(ref.owner)}/${enc(ref.repo)}`;

  const rest = (
    url: string,
    cache: CachePolicy | null,
    gate: AttemptGate,
    ctx: RequestContext,
  ) => {
    const request: HttpRequest = {
      source: "github",
      method: "GET",
      url,
      headers: JSON_HEADERS,
      body: null,
      auth: "github",
      notFound: "absent",
      cache,
      gate,
    };
    return client.execute(request, ctx).then(toSourceResult);
  };

  return {
    hasToken: () => tokenPresent,

    getRepository: (ref, ctx, gate) => rest(repoUrl(ref), null, gate, ctx),

    getBranch: (ref, branch, ctx, gate) =>
      rest(`${repoUrl(ref)}/branches/${enc(branch)}`, null, gate, ctx),

    getTree: (ref, commitSha, ctx, gate) =>
      rest(
        `${repoUrl(ref)}/git/trees/${enc(commitSha)}?recursive=1`,
        cachePolicy([], "always"),
        gate,
        ctx,
      ),

    async getManifestText(ref, commitSha, path, treeEntrySha, ctx, gate) {
      const cache = cachePolicy([commitSha, path], "always");
      if (config.webHost === GITHUB_DEFAULT_WEB_HOST) {
        // Raw host: no gate, no token (Requirement 14.11, 20.3).
        const request: HttpRequest = {
          source: "github",
          method: "GET",
          url: `https://${GITHUB_RAW_HOST}/${enc(ref.owner)}/${enc(ref.repo)}/${enc(commitSha)}/${encodePath(path)}`,
          headers: TEXT_HEADERS,
          body: null,
          auth: "none",
          notFound: "failed",
          cache,
          gate: null,
        };
        return toTextResult(await client.execute(request, ctx));
      }
      if (treeEntrySha === null) {
        // No blob sha to request: nothing is sent.
        return { kind: "failed", reason: "http-error", status: null, headers: null };
      }
      const request: HttpRequest = {
        source: "github",
        method: "GET",
        url: `${repoUrl(ref)}/git/blobs/${enc(treeEntrySha)}`,
        headers: RAW_BLOB_HEADERS,
        body: null,
        auth: "github",
        notFound: "failed",
        cache,
        gate,
      };
      return toTextResult(await client.execute(request, ctx));
    },

    queryRepositories: (query, variables, ctx, gate) => {
      const request: HttpRequest = {
        source: "github",
        method: "POST",
        url: config.graphqlUrl,
        headers: GRAPHQL_HEADERS,
        body: JSON.stringify({ query, variables }),
        auth: "github",
        notFound: "absent",
        cache: cachePolicy([], "graphql-no-foreign-errors"),
        gate,
      };
      return client.execute(request, ctx).then(toSourceResult);
    },
  };
}
