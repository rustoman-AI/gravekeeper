import { describe, expect, it } from "vitest";
import { createNpmSource } from "../../../adapters/npm/npm-source";
import { UPSTREAM_CACHE_TTL_SECONDS } from "../../../pipeline/constants";
import type {
  HttpClient,
  HttpRequest,
  RequestContext,
  WorkUnitOutcome,
} from "../../../pipeline/ports/http";

// Requirement 12.1, 8.6, 12.7

const ctx: RequestContext = { signal: new AbortController().signal, deadlineAtMs: 123 };

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

describe("createNpmSource.getLatest", () => {
  it("plain name: exact request, L1-only cache policy, no auth, no gate", async () => {
    const { client, calls } = scripted(okOutcome('{"version":"1.2.3"}'));
    const result = await createNpmSource(client).getLatest("left-pad", ctx);
    expect(result).toMatchObject({ kind: "ok", status: 200, body: { version: "1.2.3" } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.context).toBe(ctx);
    expect(calls[0]!.request).toEqual({
      source: "npm",
      method: "GET",
      url: "https://registry.npmjs.org/left-pad/latest",
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

  it("scoped name: encodeURIComponent on the whole name", async () => {
    const { client, calls } = scripted();
    await createNpmSource(client).getLatest("@babel/core", ctx);
    expect(calls[0]!.request.url).toBe("https://registry.npmjs.org/%40babel%2Fcore/latest");
  });

  it("requests treat 404 as absent", async () => {
    const { client, calls } = scripted();
    await createNpmSource(client).getLatest("nope", ctx);
    expect(calls[0]!.request.notFound).toBe("absent");
  });

  it("maps an absent outcome to an absent result", async () => {
    const { client } = scripted({
      kind: "absent",
      status: 404,
      attempts: 1,
      fromCache: false,
    } as WorkUnitOutcome);
    const result = await createNpmSource(client).getLatest("nope", ctx);
    expect(result.kind).toBe("absent");
  });
});
