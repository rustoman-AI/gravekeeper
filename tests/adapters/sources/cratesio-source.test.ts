import { describe, expect, it } from "vitest";
import { createCratesIoSource } from "../../../adapters/cratesio/cratesio-source";
import { CRATES_OWNERS_TTL_SECONDS } from "../../../pipeline/constants";
import type {
  HttpClient,
  HttpRequest,
  RequestContext,
  WorkUnitOutcome,
} from "../../../pipeline/ports/http";

// Requirement 12.2, 12.7, 12.13, 19.20

const ctx: RequestContext = { signal: new AbortController().signal, deadlineAtMs: 123 };
const UA = "gravekeeper-test (https://example.com/contact)";

const okOutcome = (bodyText: string): WorkUnitOutcome => ({
  kind: "ok",
  status: 200,
  bodyText,
  headers: {},
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

describe("createCratesIoSource.getOwners", () => {
  it("sends one GET to the owners URL with the adapter's User-Agent and cache policy", async () => {
    const { client, calls } = scripted(okOutcome('{"users":[]}'));
    const result = await createCratesIoSource({ http: client, userAgent: UA }).getOwners(
      "serde",
      ctx,
    );
    expect(result).toMatchObject({ kind: "ok", status: 200, body: { users: [] } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.context).toBe(ctx);
    expect(calls[0]!.request).toEqual({
      source: "cratesio",
      method: "GET",
      url: "https://crates.io/api/v1/crates/serde/owners",
      headers: { "User-Agent": UA, Accept: "application/json" },
      body: null,
      auth: "none",
      notFound: "absent",
      cache: {
        ttlSeconds: CRATES_OWNERS_TTL_SECONDS,
        extraKey: [],
        storeWhen: "always",
        l2Kind: "crates-owners",
      },
      gate: null,
    });
  });

  it("uses the owners TTL of 604800 seconds", async () => {
    const { client, calls } = scripted();
    await createCratesIoSource({ http: client, userAgent: UA }).getOwners("a", ctx);
    expect(calls[0]!.request.cache?.ttlSeconds).toBe(604800);
  });

  it("encodes the crate name as one path segment", async () => {
    const { client, calls } = scripted();
    await createCratesIoSource({ http: client, userAgent: UA }).getOwners("a/b?c", ctx);
    expect(calls[0]!.request.url).toBe("https://crates.io/api/v1/crates/a%2Fb%3Fc/owners");
  });

  it("maps a 404 outcome to absent", async () => {
    const { client } = scripted({
      kind: "absent",
      status: 404,
      headers: {},
      attempts: 1,
      fromCache: true,
    } as WorkUnitOutcome);
    const result = await createCratesIoSource({ http: client, userAgent: UA }).getOwners(
      "nope",
      ctx,
    );
    expect(result).toEqual({ kind: "absent", headers: {}, fromCache: true });
  });

  it("maps a failed outcome to failed", async () => {
    const { client } = scripted({
      kind: "failed",
      reason: "http-error",
      status: 500,
      headers: {},
      attempts: 3,
    } as WorkUnitOutcome);
    const result = await createCratesIoSource({ http: client, userAgent: UA }).getOwners("x", ctx);
    expect(result).toMatchObject({ kind: "failed", status: 500 });
  });
});
