import { describe, expect, it } from "vitest";
import { createHttpClient } from "../../../adapters/http/http-client";
import { createPypiSource } from "../../../adapters/pypi/pypi-source";
import { MAX_RESPONSE_BYTES, UPSTREAM_CACHE_TTL_SECONDS } from "../../../pipeline/constants";
import type {
  HttpClient,
  HttpRequest,
  RequestContext,
  SourceName,
  WorkUnitOutcome,
} from "../../../pipeline/ports/http";
import { createFakeRuntime, runUntilSettled } from "../../support/fake-runtime";
import { createScriptedFetch, scriptFromSteps, type Step } from "../../support/scripted-fetch";

// Requirement 12.5, 12.7, 15.2

const ctx: RequestContext = { signal: new AbortController().signal, deadlineAtMs: 10_000_000 };

function recording(outcome: WorkUnitOutcome) {
  const calls: { request: HttpRequest; context: RequestContext }[] = [];
  const client: HttpClient = {
    execute(request, context) {
      calls.push({ request, context });
      return Promise.resolve(outcome);
    },
  };
  return { client, calls };
}

function realClient(step: Step) {
  const runtime = createFakeRuntime(0);
  const scripted = createScriptedFetch(scriptFromSteps([step]), runtime);
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
    authorizer: () => null,
    secrets: () => [],
    userAgent: "gravekeeper-test",
  });
  return { client, runtime, scripted };
}

describe("createPypiSource.getProject", () => {
  it("requests the per-version URL with the normalized name, L1-only cache, no auth", async () => {
    const { client, calls } = recording({
      kind: "ok",
      status: 200,
      bodyText: '{"info":{"version":"2.31.0"}}',
      headers: {},
      attempts: 1,
      fromCache: false,
    });
    const result = await createPypiSource(client).getProject("typing-extensions", "4.9.0", ctx);
    expect(result).toMatchObject({ kind: "ok", status: 200, body: { info: { version: "2.31.0" } } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.context).toBe(ctx);
    expect(calls[0]!.request).toEqual({
      source: "pypi",
      method: "GET",
      url: "https://pypi.org/pypi/typing-extensions/4.9.0/json",
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
    });
  });

  it("maps an absent outcome to an absent result", async () => {
    const { client } = recording({ kind: "absent", status: 404, attempts: 1, fromCache: false } as WorkUnitOutcome);
    const result = await createPypiSource(client).getProject("nope", "1.0", ctx);
    expect(result.kind).toBe("absent");
  });

  it("a real client turns a 404 response into absent", async () => {
    const { client, runtime, scripted } = realClient({ latencyMs: 0, response: { status: 404 } });
    const result = await runUntilSettled(createPypiSource(client).getProject("nope", "1.0", ctx), runtime);
    expect(result.kind).toBe("absent");
    expect(scripted.calls[0]!.url).toBe("https://pypi.org/pypi/nope/1.0/json");
  });

  it("a body over MAX_RESPONSE_BYTES surfaces as failed http-error through the client", async () => {
    const { client, runtime } = realClient({
      latencyMs: 0,
      response: {
        status: 200,
        headers: [["content-type", "application/json"]],
        body: { kind: "size", size: MAX_RESPONSE_BYTES + 1 },
      },
    });
    const result = await runUntilSettled(createPypiSource(client).getProject("big", "1.0", ctx), runtime);
    expect(result).toMatchObject({ kind: "failed", reason: "http-error" });
  });
});
