import { describe, expect, it } from "vitest";
import { createGithubSource } from "../../../adapters/github/github-source";
import type {
  AttemptGate,
  GithubConfig,
  HttpClient,
  HttpRequest,
  RequestContext,
  WorkUnitOutcome,
} from "../../../pipeline/ports/http";

// Requirement 2.6, 3.1, 3.4, 3.8, 14.11, 19.4

const DOTCOM: GithubConfig = {
  apiUrl: "https://api.github.com",
  graphqlUrl: "https://api.github.com/graphql",
  webHost: "github.com",
};
const GHES: GithubConfig = {
  apiUrl: "https://ghe.example.com/api/v3",
  graphqlUrl: "https://ghe.example.com/api/graphql",
  webHost: "ghe.example.com",
};

const ctx: RequestContext = { signal: new AbortController().signal, deadlineAtMs: 123 };
const gate: AttemptGate = { allow: () => true, observe: () => undefined };
const ref = { owner: "Own", repo: "Re.po" };

const okOutcome = (bodyText: string): WorkUnitOutcome => ({
  kind: "ok",
  status: 200,
  bodyText,
  headers: { "content-type": "application/json" },
  attempts: 1,
  fromCache: false,
});

function scripted(outcome: WorkUnitOutcome = okOutcome("{}")) {
  const calls: { request: HttpRequest; context: RequestContext }[] = [];
  const client: HttpClient = {
    execute(request, context) {
      calls.push({ request, context });
      return Promise.resolve(outcome);
    },
  };
  return { client, calls };
}

describe("createGithubSource", () => {
  it("hasToken reflects the flag", () => {
    const { client } = scripted();
    expect(createGithubSource(client, DOTCOM, true).hasToken()).toBe(true);
    expect(createGithubSource(client, DOTCOM, false).hasToken()).toBe(false);
  });

  it("getRepository: GET repos URL, no cache, github auth, absent on 404", async () => {
    const { client, calls } = scripted(okOutcome('{"a":1}'));
    const result = await createGithubSource(client, DOTCOM, false).getRepository(ref, ctx, gate);
    expect(result).toMatchObject({ kind: "ok", status: 200, body: { a: 1 } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.context).toBe(ctx);
    expect(calls[0]!.request).toEqual({
      source: "github",
      method: "GET",
      url: "https://api.github.com/repos/Own/Re.po",
      headers: { Accept: "application/vnd.github+json" },
      body: null,
      auth: "github",
      notFound: "absent",
      cache: null,
      gate,
    });
  });

  it("getBranch: exact URL, not cached", async () => {
    const { client, calls } = scripted();
    await createGithubSource(client, DOTCOM, false).getBranch(ref, "main", ctx, gate);
    expect(calls[0]!.request.url).toBe("https://api.github.com/repos/Own/Re.po/branches/main");
    expect(calls[0]!.request.method).toBe("GET");
    expect(calls[0]!.request.cache).toBeNull();
    expect(calls[0]!.request.gate).toBe(gate);
  });

  it("getBranch sends '/' and '%' exactly once-encoded so the server decodes the original", async () => {
    const { client, calls } = scripted();
    const source = createGithubSource(client, DOTCOM, false);
    const branches = ["feature/x", "100%", "a%2Fb", "r/é y"];
    for (const b of branches) await source.getBranch(ref, b, ctx, gate);
    const prefix = "https://api.github.com/repos/Own/Re.po/branches/";
    calls.forEach((c, i) => {
      expect(c.request.url.startsWith(prefix)).toBe(true);
      expect(decodeURIComponent(c.request.url.slice(prefix.length))).toBe(branches[i]);
    });
    expect(calls[0]!.request.url).toBe(`${prefix}feature%2Fx`);
    expect(calls[1]!.request.url).toBe(`${prefix}100%25`);
    expect(calls[2]!.request.url).toBe(`${prefix}a%252Fb`);
  });

  it("getTree: recursive URL with cache keyed by nothing extra (sha is in the URL)", async () => {
    const { client, calls } = scripted();
    await createGithubSource(client, DOTCOM, false).getTree(ref, "abc123", ctx, gate);
    const r = calls[0]!.request;
    expect(r.method).toBe("GET");
    expect(r.url).toBe("https://api.github.com/repos/Own/Re.po/git/trees/abc123?recursive=1");
    expect(r.headers).toEqual({ Accept: "application/vnd.github+json" });
    expect(r.auth).toBe("github");
    expect(r.notFound).toBe("absent");
    expect(r.gate).toBe(gate);
    expect(r.cache).toEqual({
      ttlSeconds: 3600,
      extraKey: [],
      storeWhen: "always",
      l2Kind: null,
    });
  });

  it("getManifestText on github.com uses the raw host, no gate, no token, 404 failed", async () => {
    const { client, calls } = scripted(okOutcome("name = 1"));
    const result = await createGithubSource(client, DOTCOM, true).getManifestText(
      ref,
      "sha1",
      "sub dir/package.json",
      "blobsha",
      ctx,
      gate,
    );
    expect(result).toMatchObject({ kind: "ok", body: "name = 1" });
    expect(calls[0]!.request).toEqual({
      source: "github",
      method: "GET",
      url: "https://raw.githubusercontent.com/Own/Re.po/sha1/sub%20dir/package.json",
      headers: { Accept: "text/plain" },
      body: null,
      auth: "none",
      notFound: "failed",
      cache: { ttlSeconds: 3600, extraKey: ["sha1", "sub dir/package.json"], storeWhen: "always", l2Kind: null },
      gate: null,
    });
  });

  it("getManifestText on GHES uses the blobs endpoint with gate and token", async () => {
    const { client, calls } = scripted(okOutcome("raw"));
    await createGithubSource(client, GHES, true).getManifestText(
      ref,
      "sha1",
      "a/b.toml",
      "blobsha",
      ctx,
      gate,
    );
    expect(calls[0]!.request).toEqual({
      source: "github",
      method: "GET",
      url: "https://ghe.example.com/api/v3/repos/Own/Re.po/git/blobs/blobsha",
      headers: { Accept: "application/vnd.github.raw+json" },
      body: null,
      auth: "github",
      notFound: "failed",
      cache: { ttlSeconds: 3600, extraKey: ["sha1", "a/b.toml"], storeWhen: "always", l2Kind: null },
      gate,
    });
  });

  it("getManifestText on GHES without a tree entry sha sends nothing", async () => {
    const { client, calls } = scripted();
    const result = await createGithubSource(client, GHES, true).getManifestText(
      ref,
      "sha1",
      "a/b.toml",
      null,
      ctx,
      gate,
    );
    expect(calls).toHaveLength(0);
    expect(result).toEqual({ kind: "failed", reason: "http-error", status: null, headers: null });
  });

  it("queryRepositories: POST graphql with fixed body key order and GraphQL cache policy", async () => {
    const { client, calls } = scripted(okOutcome('{"data":{}}'));
    const variables = { a: "1", b: "2" };
    await createGithubSource(client, GHES, true).queryRepositories("query { x }", variables, ctx, gate);
    expect(calls[0]!.request).toEqual({
      source: "github",
      method: "POST",
      url: "https://ghe.example.com/api/graphql",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: '{"query":"query { x }","variables":{"a":"1","b":"2"}}',
      auth: "github",
      notFound: "absent",
      cache: {
        ttlSeconds: 3600,
        extraKey: [],
        storeWhen: "graphql-no-foreign-errors",
        l2Kind: null,
      },
      gate,
    });
  });

  it("passes failed and absent outcomes through", async () => {
    const failed = scripted({
      kind: "failed",
      reason: "rate-limited",
      status: 403,
      headers: { "retry-after": "5" },
      attempts: 3,
    });
    expect(await createGithubSource(failed.client, DOTCOM, false).getRepository(ref, ctx, gate)).toEqual({
      kind: "failed",
      reason: "rate-limited",
      status: 403,
      headers: { "retry-after": "5" },
    });
    const absent = scripted({ kind: "absent", status: 404, headers: {}, attempts: 1, fromCache: false });
    expect(await createGithubSource(absent.client, DOTCOM, false).getBranch(ref, "x", ctx, gate)).toEqual({
      kind: "absent",
      headers: {},
      fromCache: false,
    });
  });
});
