import { describe, expect, it } from "vitest";
import { createOsvSource } from "../../../adapters/osv/osv-source";
import {
  ADVISORY_CACHE_TTL_SECONDS,
  OSV_BATCH_SIZE,
  UPSTREAM_CACHE_TTL_SECONDS,
} from "../../../pipeline/constants";
import type {
  HttpClient,
  HttpRequest,
  RequestContext,
  WorkUnitOutcome,
} from "../../../pipeline/ports/http";
import type { OsvQuery } from "../../../pipeline/ports/osv-source";

// Requirement 9.1, 9.4, 9.9, 17.6, 19.17, 19.20

const ctx: RequestContext = { signal: new AbortController().signal, deadlineAtMs: 123 };

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

describe("createOsvSource", () => {
  it("queryBatch: POST querybatch with fixed key order and ecosystem names", async () => {
    const { client, calls } = scripted(okOutcome('{"results":[]}'));
    const queries: OsvQuery[] = [
      { name: "left-pad", ecosystem: "npm", version: "1.0.0" },
      { name: "requests", ecosystem: "PyPI", version: "2.0.0" },
      { name: "serde", ecosystem: "crates.io", version: "1.0.1" },
    ];
    const result = await createOsvSource(client).queryBatch(queries, ctx);
    expect(result).toMatchObject({ kind: "ok", status: 200, body: { results: [] } });
    expect(calls).toHaveLength(1);
    const { request } = calls[0]!;
    expect(calls[0]!.context).toBe(ctx);
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://api.osv.dev/v1/querybatch");
    expect(request.auth).toBe("none");
    expect(request.gate).toBeNull();
    expect(request.body).toBe(
      '{"queries":[' +
        '{"package":{"name":"left-pad","ecosystem":"npm"},"version":"1.0.0"},' +
        '{"package":{"name":"requests","ecosystem":"PyPI"},"version":"2.0.0"},' +
        '{"package":{"name":"serde","ecosystem":"crates.io"},"version":"1.0.1"}]}',
    );
  });

  it("queryBatch cache policy: upstream TTL, always stored, no L2 kind", async () => {
    const { client, calls } = scripted();
    await createOsvSource(client).queryBatch([], ctx);
    expect(calls[0]!.request.cache).toEqual({
      ttlSeconds: UPSTREAM_CACHE_TTL_SECONDS,
      extraKey: [],
      storeWhen: "always",
      l2Kind: null,
    });
    expect(calls[0]!.request.notFound).toBe("failed");
  });

  it("queryBatch accepts exactly OSV_BATCH_SIZE queries", async () => {
    const { client, calls } = scripted();
    const queries = Array.from({ length: OSV_BATCH_SIZE }, (_, i) => ({
      name: `p${i}`,
      ecosystem: "npm" as const,
      version: "1.0.0",
    }));
    await createOsvSource(client).queryBatch(queries, ctx);
    expect(calls).toHaveLength(1);
  });

  it("queryBatch with more than OSV_BATCH_SIZE queries sends nothing and fails", async () => {
    const { client, calls } = scripted();
    const queries = Array.from({ length: OSV_BATCH_SIZE + 1 }, (_, i) => ({
      name: `p${i}`,
      ecosystem: "npm" as const,
      version: "1.0.0",
    }));
    const result = await createOsvSource(client).queryBatch(queries, ctx);
    expect(result).toEqual({ kind: "failed", reason: "http-error", status: null, headers: null });
    expect(calls).toHaveLength(0);
  });

  it("getVulnerability: GET vulns URL (id encoded), advisory cache with osv-advisory L2", async () => {
    const { client, calls } = scripted(okOutcome('{"id":"GHSA-x"}'));
    const result = await createOsvSource(client).getVulnerability("GHSA/x y", ctx);
    expect(result).toMatchObject({ kind: "ok", body: { id: "GHSA-x" } });
    const { request } = calls[0]!;
    expect(request.method).toBe("GET");
    expect(request.url).toBe("https://api.osv.dev/v1/vulns/GHSA%2Fx%20y");
    expect(request.body).toBeNull();
    expect(request.auth).toBe("none");
    expect(request.cache).toEqual({
      ttlSeconds: ADVISORY_CACHE_TTL_SECONDS,
      extraKey: [],
      storeWhen: "always",
      l2Kind: "osv-advisory",
    });
  });

  it("getVulnerability: requests 404 as failed and passes a failed 404 through", async () => {
    const { client, calls } = scripted({
      kind: "failed",
      reason: "http-error",
      status: 404,
      headers: null,
      attempts: 1,
    });
    const result = await createOsvSource(client).getVulnerability("GHSA-none", ctx);
    expect(calls[0]!.request.notFound).toBe("failed");
    expect(result).toEqual({ kind: "failed", reason: "http-error", status: 404, headers: null });
  });
});
