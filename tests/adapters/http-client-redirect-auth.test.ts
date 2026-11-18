import { describe, expect, it } from "vitest";
import { createGithubAuthorizer } from "../../adapters/http/github-authorizer";
import { createHttpClient } from "../../adapters/http/http-client";
import {
  GITHUB_DEFAULT_API_URL,
  GITHUB_DEFAULT_GRAPHQL_URL,
  GITHUB_DEFAULT_WEB_HOST,
  MAX_RESPONSE_BYTES,
  REDIRECT_MAX_HOPS,
} from "../../pipeline/constants";
import type {
  AttemptGate,
  HttpRequest,
  RequestContext,
  SourceHeaders,
  SourceName,
  WorkUnitOutcome,
} from "../../pipeline/ports/http";
import { createFakeRuntime, runUntilSettled } from "../support/fake-runtime";
import { createScriptedFetch, type ScriptFn, type Step } from "../support/scripted-fetch";

// Requirement 15.2, 15.17, 15.19, 15.20, 15.21, 20.2, 20.3, 20.4

const TOKEN = "ghp_unit_test_token_0123456789";
const ctx: RequestContext = { signal: new AbortController().signal, deadlineAtMs: 10_000_000 };
const API = "https://api.github.com";

function setup(script: ScriptFn, token: string | null = TOKEN) {
  const runtime = createFakeRuntime(0);
  const scripted = createScriptedFetch(script, runtime);
  const names: SourceName[] = ["github", "depsdev", "osv", "npm", "cratesio", "pypi"];
  const limiters = Object.fromEntries(
    names.map((n) => [n, { concurrency: 4, minIntervalMs: 0 }]),
  ) as Record<SourceName, { concurrency: number; minIntervalMs: number }>;
  const client = createHttpClient({
    fetchImpl: scripted.fetch,
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: () => undefined },
    limiters,
    authorizer: createGithubAuthorizer(() => token, {
      apiUrl: GITHUB_DEFAULT_API_URL,
      graphqlUrl: GITHUB_DEFAULT_GRAPHQL_URL,
      webHost: GITHUB_DEFAULT_WEB_HOST,
    }),
    secrets: () => (token === null ? [] : [token]),
    userAgent: "gravekeeper-test",
  });
  const run = (req: HttpRequest): Promise<WorkUnitOutcome> =>
    runUntilSettled(client.execute(req, ctx), runtime);
  return { run, scripted };
}

function req(url: string, over: Partial<HttpRequest> = {}): HttpRequest {
  return {
    source: "github",
    method: "GET",
    url,
    headers: {},
    body: null,
    auth: "github",
    notFound: "absent",
    cache: null,
    gate: null,
    ...over,
  };
}

const ok = (text = "{}"): Step => ({
  latencyMs: 0,
  response: { status: 200, headers: [["content-type", "application/json"]], body: { kind: "text", text } },
});
const redirect = (location: string | null, status = 302): Step => ({
  latencyMs: 0,
  response: { status, headers: location === null ? [] : [["location", location]] },
});

describe("redirects", () => {
  it("follows a same-origin redirect (relative Location) and recomputes the header", async () => {
    const { run, scripted } = setup((url) =>
      url === `${API}/a` ? redirect("/b") : ok(),
    );
    const out = await run(req(`${API}/a`));
    expect(out.kind).toBe("ok");
    expect(scripted.calls.map((c) => c.url)).toEqual([`${API}/a`, `${API}/b`]);
    expect(scripted.calls.map((c) => c.headers["authorization"])).toEqual([
      `Bearer ${TOKEN}`,
      `Bearer ${TOKEN}`,
    ]);
    expect(scripted.calls.every((c) => c.redirect === "manual")).toBe(true);
  });

  it.each([
    ["different host", "https://evil.example/x"],
    ["different port", "https://api.github.com:8443/x"],
    ["different scheme", "http://api.github.com/x"],
    ["non-http scheme", "ftp://api.github.com/x"],
  ])("refuses a cross-origin redirect (%s): no request sent, no header forwarded", async (_n, loc) => {
    const { run, scripted } = setup((url) => (url === `${API}/a` ? redirect(loc, 301) : ok()));
    const out = await run(req(`${API}/a`));
    expect(out).toMatchObject({ kind: "failed", reason: "http-error", status: 301 });
    expect(scripted.calls).toHaveLength(1);
  });

  it("refuses a redirect without Location", async () => {
    const { run, scripted } = setup(() => redirect(null));
    const out = await run(req(`${API}/a`));
    expect(out).toMatchObject({ kind: "failed", reason: "http-error" });
    expect(scripted.calls).toHaveLength(1);
  });

  it("follows REDIRECT_MAX_HOPS hops", async () => {
    const { run, scripted } = setup((url) => {
      const n = Number(url.split("/r")[1] ?? "0");
      return n < REDIRECT_MAX_HOPS ? redirect(`/r${n + 1}`) : ok();
    });
    const out = await run(req(`${API}/r0`));
    expect(out.kind).toBe("ok");
    expect(scripted.calls).toHaveLength(REDIRECT_MAX_HOPS + 1);
  });

  it("refuses hop REDIRECT_MAX_HOPS + 1 without sending it", async () => {
    const { run, scripted } = setup((url) => {
      const n = Number(url.split("/r")[1] ?? "0");
      return n < REDIRECT_MAX_HOPS + 1 ? redirect(`/r${n + 1}`) : ok();
    });
    const out = await run(req(`${API}/r0`));
    expect(out).toMatchObject({ kind: "failed", reason: "http-error", attempts: 1 });
    expect(scripted.calls).toHaveLength(REDIRECT_MAX_HOPS + 1);
  });

  it("refuses a redirect for a POST", async () => {
    const { run, scripted } = setup(() => redirect("/graphql2", 307));
    const out = await run(
      req(`${API}/graphql`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }),
    );
    expect(out).toMatchObject({ kind: "failed", reason: "http-error", status: 307 });
    expect(scripted.calls).toHaveLength(1);
  });
});

describe("authorization", () => {
  it.each([
    [`${API}/repos/a/b`],
    [GITHUB_DEFAULT_GRAPHQL_URL],
  ])("sends the token to %s", async (url) => {
    const { run, scripted } = setup(() => ok());
    await run(req(url));
    expect(scripted.calls[0]!.headers["authorization"]).toBe(`Bearer ${TOKEN}`);
  });

  it.each([
    ["https://registry.npmjs.org/x"],
    ["https://pypi.org/pypi/x/1/json"],
    ["https://crates.io/api/v1/crates/x"],
    ["https://api.deps.dev/v3/systems/npm/packages/x"],
    ["https://raw.githubusercontent.com/o/r/main/package.json"],
    ["http://api.github.com/repos/a/b"],
  ])("never sends the token to %s", async (url) => {
    const { run, scripted } = setup(() => ok());
    await run(req(url));
    expect(scripted.calls[0]!.headers["authorization"]).toBeUndefined();
  });

  it("sends no header for auth 'none' or when no token is set, and ignores a request-supplied one", async () => {
    const a = setup(() => ok());
    await a.run(req(`${API}/x`, { auth: "none", headers: { Authorization: "Bearer other" } }));
    expect(a.scripted.calls[0]!.headers["authorization"]).toBeUndefined();

    const b = setup(() => ok(), null);
    await b.run(req(`${API}/x`));
    expect(b.scripted.calls[0]!.headers["authorization"]).toBeUndefined();
  });
});

describe("scrubbing, size and headers", () => {
  it("scrubs the token from body and exposed headers", async () => {
    const { run } = setup(() => ({
      latencyMs: 0,
      response: {
        status: 200,
        headers: [
          ["content-type", `text/plain; echo=${TOKEN}`],
          ["x-ratelimit-note", `Bearer ${TOKEN}`],
        ],
        body: { kind: "text", text: `a ${TOKEN} b Bearer ${TOKEN} c` },
      },
    }));
    const out = await run(req(`${API}/x`));
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.bodyText).toBe("a [redacted] b [redacted] c");
    expect(JSON.stringify(out.headers)).not.toContain(TOKEN);
    expect(out.headers["content-type"]).toBe("text/plain; echo=[redacted]");
    expect(out.headers["x-ratelimit-note"]).toBe("[redacted]");
  });

  it("scrubs headers on a failed outcome", async () => {
    const { run } = setup(() => ({
      latencyMs: 0,
      response: { status: 400, headers: [["content-type", `x ${TOKEN}`]] },
    }));
    const out = await run(req(`${API}/x`));
    expect(out).toMatchObject({ kind: "failed", reason: "http-error", status: 400 });
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });

  it("a body over MAX_RESPONSE_BYTES gives http-error without retry", async () => {
    const { run, scripted } = setup(() => ({
      latencyMs: 0,
      response: { status: 200, body: { kind: "size", size: MAX_RESPONSE_BYTES + 1 } },
    }));
    const out = await run(req(`${API}/x`));
    expect(out).toMatchObject({ kind: "failed", reason: "http-error", attempts: 1 });
    expect(scripted.calls).toHaveLength(1);
  });

  it("exposes only content-type, retry-after and x-ratelimit-* headers, lowercased", async () => {
    const { run } = setup(() => ({
      latencyMs: 0,
      response: {
        status: 200,
        headers: [
          ["Content-Type", "application/json"],
          ["Retry-After", "3"],
          ["X-RateLimit-Remaining", "42"],
          ["Set-Cookie", "a=b"],
          ["Server", "x"],
          ["X-Custom", "y"],
        ],
        body: { kind: "text", text: "{}" },
      },
    }));
    const out = await run(req(`${API}/x`));
    if (out.kind !== "ok") throw new Error("expected ok");
    expect(out.headers).toEqual({
      "content-type": "application/json",
      "retry-after": "3",
      "x-ratelimit-remaining": "42",
    });
  });
});

describe("attempt gate", () => {
  it("blocks the next attempt with budget when the gate stops allowing", async () => {
    let remaining = 100;
    const gate: AttemptGate = {
      allow: () => remaining >= 10,
      observe: (h: SourceHeaders) => {
        const v = h["x-ratelimit-remaining"];
        if (v !== undefined) remaining = Number(v);
      },
    };
    const { run, scripted } = setup(() => ({
      latencyMs: 0,
      response: { status: 503, headers: [["x-ratelimit-remaining", "5"]] },
    }));
    const out = await run(req(`${API}/x`, { gate }));
    expect(out).toMatchObject({ kind: "failed", reason: "budget", attempts: 1 });
    expect(scripted.calls).toHaveLength(1);
  });

  it("sends nothing when the gate already blocks", async () => {
    const gate: AttemptGate = { allow: () => false, observe: () => undefined };
    const { run, scripted } = setup(() => ok());
    const out = await run(req(`${API}/x`, { gate }));
    expect(out).toMatchObject({ kind: "failed", reason: "budget", attempts: 0 });
    expect(scripted.calls).toHaveLength(0);
  });
});
