import { describe, expect, it } from "vitest";
import { createNpmSource } from "../../adapters/npm/npm-source";
import { UPSTREAM_CACHE_TTL_SECONDS } from "../../pipeline/constants";
import type {
  HttpClient,
  HttpRequest,
  RequestContext,
  WorkUnitOutcome,
} from "../../pipeline/ports/http";

// resurrect-upgrade Requirements 1.8, 1.11, 3.2

const ctx: RequestContext = { signal: new AbortController().signal, deadlineAtMs: 123 };

function scripted(outcome: WorkUnitOutcome) {
  const calls: { request: HttpRequest; context: RequestContext }[] = [];
  const client: HttpClient = {
    execute(request, context) {
      calls.push({ request, context });
      return Promise.resolve(outcome);
    },
  };
  return { client, calls };
}

const okOutcome: WorkUnitOutcome = {
  kind: "ok",
  status: 200,
  bodyText: '{"version":"1.3.0"}',
  headers: { "content-type": "application/json" },
  attempts: 1,
  fromCache: false,
};

describe("createNpmSource.getVersion", () => {
  it("plain name: exact request with the L1-only cache policy", async () => {
    const { client, calls } = scripted(okOutcome);
    const result = await createNpmSource(client).getVersion("left-pad", "1.3.0", ctx);
    expect(result).toMatchObject({ kind: "ok", status: 200, body: { version: "1.3.0" } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.context).toBe(ctx);
    expect(calls[0]!.request).toEqual({
      source: "npm",
      method: "GET",
      url: "https://registry.npmjs.org/left-pad/1.3.0",
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

  it("scoped name with a pre-release version: both parts are encoded", async () => {
    const { client, calls } = scripted(okOutcome);
    await createNpmSource(client).getVersion("@babel/core", "7.0.0-beta.1+build", ctx);
    expect(calls[0]!.request.url).toBe(
      "https://registry.npmjs.org/%40babel%2Fcore/7.0.0-beta.1%2Bbuild",
    );
  });

  it("maps a 404 to an absent result", async () => {
    const { client, calls } = scripted({
      kind: "absent",
      status: 404,
      attempts: 1,
      fromCache: false,
    } as WorkUnitOutcome);
    const result = await createNpmSource(client).getVersion("nope", "1.0.0", ctx);
    expect(calls[0]!.request.notFound).toBe("absent");
    expect(result.kind).toBe("absent");
  });
});
