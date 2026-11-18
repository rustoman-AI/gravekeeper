import { describe, expect, it } from "vitest";
import { createHttpClient } from "../../adapters/http/http-client";
import type { HttpRequest, RequestContext, SourceName, WorkUnitOutcome } from "../../pipeline/ports/http";
import { createFakeRuntime, runUntilSettled } from "../support/fake-runtime";
import { createScriptedFetch, scriptFromSteps, type ScriptFn, type Step } from "../support/scripted-fetch";

// Requirement 15.1, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.16, 16.5, 16.8, 16.9

const URL_A = "https://registry.npmjs.org/a";
const URL_B = "https://registry.npmjs.org/b";
const FAR = 10_000_000;

function request(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    source: "npm",
    method: "GET",
    url: URL_A,
    headers: {},
    body: null,
    auth: "none",
    notFound: "absent",
    cache: null,
    gate: null,
    ...overrides,
  };
}

function setup(script: ScriptFn, concurrency = 4) {
  const runtime = createFakeRuntime(0, [0.5]);
  const scripted = createScriptedFetch(script, runtime);
  const names: SourceName[] = ["github", "depsdev", "osv", "npm", "cratesio", "pypi"];
  const limiters = Object.fromEntries(names.map((n) => [n, { concurrency, minIntervalMs: 0 }])) as Record<
    SourceName,
    { concurrency: number; minIntervalMs: number }
  >;
  const client = createHttpClient({
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
  return { client, runtime, scripted };
}

function steps(...list: Step[]) {
  return setup(scriptFromSteps(list));
}

const respond = (status: number, headers: [string, string][] = [], text?: string): Step => ({
  latencyMs: 0,
  response: {
    status,
    headers,
    ...(text === undefined ? {} : { body: { kind: "text" as const, text } }),
  },
});

const ctx = (deadlineAtMs = FAR, signal = new AbortController().signal): RequestContext => ({
  signal,
  deadlineAtMs,
});

function failedOf(outcome: WorkUnitOutcome) {
  if (outcome.kind !== "failed") throw new Error(`expected failed, got ${outcome.kind}`);
  return outcome;
}

describe("http client status table", () => {
  it("2xx is ok with the body, attempts 1 and fromCache false", async () => {
    const { client, runtime, scripted } = steps(respond(200, [["content-type", "application/json"]], '{"a":1}'));
    const out = await runUntilSettled(client.execute(request(), ctx()), runtime);
    expect(out).toEqual({
      kind: "ok",
      status: 200,
      bodyText: '{"a":1}',
      headers: { "content-type": "application/json" },
      attempts: 1,
      fromCache: false,
    });
    expect(scripted.calls).toHaveLength(1);
  });

  it("404 with notFound absent is absent", async () => {
    const { client, runtime } = steps(respond(404));
    const out = await runUntilSettled(client.execute(request(), ctx()), runtime);
    expect(out).toMatchObject({ kind: "absent", status: 404, attempts: 1, fromCache: false });
  });

  it("404 with notFound failed is failed http-error without retry", async () => {
    const { client, runtime, scripted } = steps(respond(404));
    const out = failedOf(await runUntilSettled(client.execute(request({ notFound: "failed" }), ctx()), runtime));
    expect(out).toMatchObject({ reason: "http-error", status: 404, attempts: 1 });
    expect(scripted.calls).toHaveLength(1);
  });

  it("other 4xx is failed http-error with one attempt", async () => {
    const { client, runtime, scripted } = steps(respond(400));
    const out = failedOf(await runUntilSettled(client.execute(request(), ctx()), runtime));
    expect(out).toMatchObject({ reason: "http-error", status: 400, attempts: 1 });
    expect(scripted.calls).toHaveLength(1);
  });

  it("429 is retried and then succeeds, with backoff 250 + 0.2*250*r", async () => {
    const { client, runtime, scripted } = steps(respond(429), respond(200, [], "ok"));
    const out = await runUntilSettled(client.execute(request(), ctx()), runtime);
    expect(out).toMatchObject({ kind: "ok", attempts: 2, fromCache: false });
    expect(scripted.calls.map((c) => c.sentAtMs)).toEqual([0, 275]);
  });

  it("persistent 429 ends rate-limited after 3 attempts", async () => {
    const { client, runtime, scripted } = steps(respond(429));
    const out = failedOf(await runUntilSettled(client.execute(request(), ctx()), runtime));
    expect(out).toMatchObject({ reason: "rate-limited", status: 429, attempts: 3 });
    expect(scripted.calls).toHaveLength(3);
  });

  it("5xx retries 3 times with doubling backoff, then http-error", async () => {
    const { client, runtime, scripted } = steps(respond(503));
    const out = failedOf(await runUntilSettled(client.execute(request(), ctx()), runtime));
    expect(out).toMatchObject({ reason: "http-error", status: 503, attempts: 3 });
    // waits: 250 + 25 = 275, then 500 + 50 = 550
    expect(scripted.calls.map((c) => c.sentAtMs)).toEqual([0, 275, 825]);
  });

  it("a network error is retried and ends as network", async () => {
    const { client, runtime, scripted } = steps({ latencyMs: 0, response: "network-error" });
    const out = failedOf(await runUntilSettled(client.execute(request(), ctx()), runtime));
    expect(out).toMatchObject({ reason: "network", status: null, attempts: 3 });
    expect(scripted.calls).toHaveLength(3);
  });
});

describe("http client Retry-After", () => {
  it("honours Retry-After seconds instead of the backoff", async () => {
    const { client, runtime, scripted } = steps(respond(429, [["retry-after", "2"]]), respond(200, [], "x"));
    const out = await runUntilSettled(client.execute(request(), ctx()), runtime);
    expect(out).toMatchObject({ kind: "ok", attempts: 2 });
    expect(scripted.calls.map((c) => c.sentAtMs)).toEqual([0, 2000]);
  });

  it("a Retry-After above the cap fails rate-limited without waiting", async () => {
    const { client, runtime, scripted } = steps(respond(429, [["retry-after", "6"]]), respond(200));
    const out = failedOf(await runUntilSettled(client.execute(request(), ctx()), runtime));
    expect(out).toMatchObject({ reason: "rate-limited", status: 429, attempts: 1 });
    expect(scripted.calls).toHaveLength(1);
  });

  it("an HTTP-date Retry-After is ignored and the backoff is used", async () => {
    const { client, runtime, scripted } = steps(
      respond(429, [["retry-after", "Wed, 21 Oct 2015 07:28:00 GMT"]]),
      respond(200),
    );
    await runUntilSettled(client.execute(request(), ctx()), runtime);
    expect(scripted.calls.map((c) => c.sentAtMs)).toEqual([0, 275]);
  });
});

describe("http client timeouts", () => {
  it("per-attempt timeout is 8000 ms and the total budget truncates the last attempt", async () => {
    const { client, runtime, scripted } = steps({ latencyMs: "never", response: "network-error" });
    const out = failedOf(await runUntilSettled(client.execute(request(), ctx()), runtime));
    expect(out).toMatchObject({ reason: "timeout", status: null, attempts: 3 });
    expect(scripted.calls.map((c) => c.sentAtMs)).toEqual([0, 8275, 16825]);
    expect(scripted.calls.map((c) => c.abortedAtMs)).toEqual([8000, 16275, 20000]);
  });

  it("a wait that would cross the 20 s total budget fails with the last reason", async () => {
    // Attempt 1 times out at 8000; the 429 Retry-After of 5 s pushes past 20 s on attempt 3.
    const script: ScriptFn = (_u, i) =>
      i === 0
        ? { latencyMs: "never", response: "network-error" }
        : i === 1
          ? { latencyMs: 7000, response: { status: 429, headers: [["retry-after", "5"]] } }
          : { latencyMs: 0, response: { status: 429, headers: [["retry-after", "5"]] } };
    const { client, runtime, scripted } = setup(script);
    const out = failedOf(await runUntilSettled(client.execute(request(), ctx()), runtime));
    // 8000 + 275 = 8275 start, response at 15275, 15275 + 5000 > 20000
    expect(out).toMatchObject({ reason: "rate-limited", attempts: 2 });
    expect(scripted.calls).toHaveLength(2);
  });
});

describe("http client scan deadline", () => {
  it("aborts an in-flight attempt when the deadline signal fires", async () => {
    const { client, runtime, scripted } = steps({ latencyMs: "never", response: "network-error" });
    const ac = new AbortController();
    runtime.timer.setTimeout(() => ac.abort(), 3000);
    const out = failedOf(await runUntilSettled(client.execute(request(), ctx(FAR, ac.signal)), runtime));
    expect(out).toMatchObject({ reason: "deadline", status: null, attempts: 1 });
    expect(scripted.calls[0]!.abortedAtMs).toBe(3000);
  });

  it("fails deadline without sending when the signal is already aborted", async () => {
    const { client, runtime, scripted } = steps(respond(200));
    const ac = new AbortController();
    ac.abort();
    const out = failedOf(await runUntilSettled(client.execute(request(), ctx(FAR, ac.signal)), runtime));
    expect(out).toMatchObject({ reason: "deadline", attempts: 0, status: null, headers: null });
    expect(scripted.calls).toHaveLength(0);
  });

  it("fails deadline when the retry wait would cross the deadline", async () => {
    const { client, runtime, scripted } = steps(respond(500), respond(200));
    const out = failedOf(await runUntilSettled(client.execute(request(), ctx(100)), runtime));
    expect(out).toMatchObject({ reason: "deadline", status: 500, attempts: 1 });
    expect(scripted.calls).toHaveLength(1);
  });

  it("aborts a retry wait in progress", async () => {
    const { client, runtime, scripted } = steps(respond(500), respond(200));
    const ac = new AbortController();
    runtime.timer.setTimeout(() => ac.abort(), 100);
    const out = failedOf(await runUntilSettled(client.execute(request(), ctx(FAR, ac.signal)), runtime));
    expect(out).toMatchObject({ reason: "deadline", status: 500, attempts: 1 });
    expect(scripted.calls).toHaveLength(1);
  });

  it("aborts a wait for a concurrency slot without sending", async () => {
    const script: ScriptFn = (url) =>
      url === URL_A ? { latencyMs: 5000, response: { status: 200 } } : { latencyMs: 0, response: { status: 200 } };
    const { client, runtime, scripted } = setup(script, 1);
    const ac = new AbortController();
    runtime.timer.setTimeout(() => ac.abort(), 100);
    const first = client.execute(request({ url: URL_A }), ctx());
    const second = client.execute(request({ url: URL_B }), ctx(FAR, ac.signal));
    const [a, b] = await runUntilSettled(Promise.all([first, second]), runtime);
    expect(a).toMatchObject({ kind: "ok", attempts: 1 });
    expect(b).toMatchObject({ kind: "failed", reason: "deadline", attempts: 0, status: null });
    expect(scripted.calls.map((c) => c.url)).toEqual([URL_A]);
  });
});
