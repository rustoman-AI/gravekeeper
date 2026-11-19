import { describe, expect, it } from "vitest";
import { CachingHttpClient } from "../../adapters/http/caching-http-client";
import { createHttpClient } from "../../adapters/http/http-client";
import { MemoryCacheStore } from "../../adapters/cache/memory-cache-store";
import type {
  CachePolicy,
  HttpClient,
  HttpRequest,
  RequestContext,
  SourceName,
  WorkUnitOutcome,
} from "../../pipeline/ports/http";
import type { JsonValue } from "../../pipeline/ports/cache";
import { GithubBudget } from "../../pipeline/scan/github-budget";
import { requestKey } from "../../pipeline/ports/request-key";
import { createFakeRuntime, runUntilSettled } from "../support/fake-runtime";
import { createScriptedFetch, scriptFromSteps } from "../support/scripted-fetch";

// Requirements 19.2, 19.3, 19.14, 19.17, 19.27

const ctx = (): RequestContext => ({ signal: new AbortController().signal, deadlineAtMs: 10_000_000 });

const policy = (overrides: Partial<CachePolicy> = {}): CachePolicy => ({
  ttlSeconds: 60,
  extraKey: [],
  storeWhen: "always",
  l2Kind: null,
  ...overrides,
});

function request(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    source: "npm",
    method: "GET",
    url: "https://registry.npmjs.org/a",
    headers: {},
    body: null,
    auth: "none",
    notFound: "absent",
    cache: policy(),
    gate: null,
    ...overrides,
  };
}

const ok = (bodyText: string, status = 200): WorkUnitOutcome => ({
  kind: "ok",
  status,
  bodyText,
  headers: {},
  attempts: 1,
  fromCache: false,
});
const absent: WorkUnitOutcome = { kind: "absent", status: 404, headers: {}, attempts: 1, fromCache: false };

function setup(outcome: WorkUnitOutcome) {
  const calls: HttpRequest[] = [];
  const inner: HttpClient = {
    execute: (req) => {
      calls.push(req);
      return Promise.resolve(outcome);
    },
  };
  const store = new MemoryCacheStore(() => 0);
  return { client: new CachingHttpClient(inner, store), store, calls };
}

describe("caching http client", () => {
  it("a hit sends no request and returns fromCache ok", async () => {
    const { client, calls } = setup(ok('{"a":1}'));
    await client.execute(request(), ctx());
    const second = await client.execute(request(), ctx());
    expect(calls).toHaveLength(1);
    expect(second).toEqual({
      kind: "ok",
      status: 200,
      bodyText: '{"a":1}',
      headers: {},
      attempts: 0,
      fromCache: true,
    });
  });

  it("a hit leaves the GitHub budget unchanged and sends no fetch", async () => {
    const runtime = createFakeRuntime(0, [0.5]);
    const scripted = createScriptedFetch(
      scriptFromSteps([
        {
          latencyMs: 0,
          response: {
            status: 200,
            headers: [["x-ratelimit-remaining", "4000"]],
            body: { kind: "text" as const, text: "{}" },
          },
        },
      ]),
      runtime,
    );
    const names: SourceName[] = ["github", "depsdev", "osv", "npm", "cratesio", "pypi"];
    const limiters = Object.fromEntries(names.map((n) => [n, { concurrency: 4, minIntervalMs: 0 }])) as Record<
      SourceName,
      { concurrency: number; minIntervalMs: number }
    >;
    const real = createHttpClient({
      fetchImpl: scripted.fetch,
      clock: runtime.clock,
      timer: runtime.timer,
      random: runtime.random,
      logger: { log: () => undefined },
      limiters,
      authorizer: () => null,
      secrets: () => [],
      userAgent: "gravekeeper-test",
    });
    const client = new CachingHttpClient(real, new MemoryCacheStore(runtime.clock));
    const budget = new GithubBudget();
    const req = request({ source: "github", url: "https://api.github.com/x", gate: budget });
    await runUntilSettled(client.execute(req, ctx()), runtime);
    expect(budget.remaining).toBe(4000);
    expect(scripted.calls).toHaveLength(1);

    const second = await runUntilSettled(client.execute(req, ctx()), runtime);
    expect(second).toMatchObject({ kind: "ok", fromCache: true });
    expect(scripted.calls).toHaveLength(1);
    expect(budget.remaining).toBe(4000);
  });

  it("never stores failed outcomes", async () => {
    const failed: WorkUnitOutcome = {
      kind: "failed",
      reason: "http-error",
      status: 500,
      headers: null,
      attempts: 3,
    };
    const { client, calls } = setup(failed);
    await client.execute(request(), ctx());
    await client.execute(request(), ctx());
    expect(calls).toHaveLength(2);
  });

  it("never stores a 429 or other non-2xx ok outcome", async () => {
    const { client, calls } = setup(ok("slow down", 429));
    await client.execute(request(), ctx());
    await client.execute(request(), ctx());
    expect(calls).toHaveLength(2);
  });

  it("never stores a GraphQL body with a foreign error type, stores NOT_FOUND only", async () => {
    const gql = policy({ storeWhen: "graphql-no-foreign-errors" });
    const foreign = setup(ok('{"errors":[{"type":"RATE_LIMITED"}]}'));
    await foreign.client.execute(request({ cache: gql }), ctx());
    await foreign.client.execute(request({ cache: gql }), ctx());
    expect(foreign.calls).toHaveLength(2);

    const notFound = setup(ok('{"data":null,"errors":[{"type":"NOT_FOUND"}]}'));
    await notFound.client.execute(request({ cache: gql }), ctx());
    await notFound.client.execute(request({ cache: gql }), ctx());
    expect(notFound.calls).toHaveLength(1);
  });

  it("a request without a cache policy is passed through and never stored", async () => {
    const { client, calls } = setup(ok("x"));
    await client.execute(request({ cache: null }), ctx());
    await client.execute(request({ cache: null }), ctx());
    expect(calls).toHaveLength(2);
  });

  it("stores the deps.dev 404 marker and reads it back as absent", async () => {
    const { client, store, calls } = setup(absent);
    const req = request({ source: "depsdev", cache: policy({ l2Kind: "depsdev-advisory" }) });
    await client.execute(req, ctx());
    const entry = await store.get(requestKey(req));
    expect(entry?.value).toEqual({ status: 404, bodyText: "" });
    const second = await client.execute(req, ctx());
    expect(second).toEqual({ kind: "absent", status: 404, headers: {}, attempts: 0, fromCache: true });
    expect(calls).toHaveLength(1);
  });

  it("does not store an OSV detail 404", async () => {
    const { client, store, calls } = setup(absent);
    const req = request({ source: "osv", cache: policy({ l2Kind: "osv-advisory" }) });
    await client.execute(req, ctx());
    expect(await store.get(requestKey(req))).toBeNull();
    await client.execute(req, ctx());
    expect(calls).toHaveLength(2);
  });

  it("keys do not change with headers or token", async () => {
    const { client, calls } = setup(ok("{}"));
    await client.execute(request({ headers: { accept: "a" } }), ctx());
    await client.execute(request({ headers: { accept: "b", "x-token": "secret" }, auth: "github" }), ctx());
    expect(calls).toHaveLength(1);
  });

  it("returns the compact text on later reads", async () => {
    const full = JSON.stringify({ cvss3Score: 7.5, description: "long text", other: [1, 2, 3] });
    const { client, store } = setup(ok(full));
    const req = request({ source: "depsdev", cache: policy({ l2Kind: "depsdev-advisory" }) });
    await client.execute(req, ctx());
    const entry = await store.get(requestKey(req));
    expect(entry?.value).toEqual({ status: 200, bodyText: '{"cvss3Score":7.5}' });
    const second = await client.execute(req, ctx());
    expect(second).toMatchObject({ kind: "ok", bodyText: '{"cvss3Score":7.5}', fromCache: true });
  });

  it("treats an invalid stored value as a miss", async () => {
    const { client, store, calls } = setup(ok("fresh"));
    const req = request();
    const key = requestKey(req);
    const invalid: JsonValue[] = [null, "text", 5, [], {}, { status: "200", bodyText: "x" }, { status: 200 }, { status: 500, bodyText: "x" }];
    for (const bad of invalid) {
      await store.set(key, bad, 60);
      const out = await client.execute(req, ctx());
      expect(out).toMatchObject({ kind: "ok", bodyText: "fresh", fromCache: false });
    }
    expect(calls).toHaveLength(8);
  });
});
