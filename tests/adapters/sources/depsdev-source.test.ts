import { describe, expect, it } from "vitest";
import { createDepsDevSource } from "../../../adapters/depsdev/depsdev-source";
import { DEPSDEV_BATCH_SIZE } from "../../../pipeline/constants";
import type { VersionRequest } from "../../../pipeline/ports/depsdev-source";
import type {
  HttpClient,
  HttpRequest,
  RequestContext,
  WorkUnitOutcome,
} from "../../../pipeline/ports/http";

// Requirement 8.8, 9.20, 9.21, 19.17, 19.18, 19.20

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

const upstreamCache = { ttlSeconds: 3600, extraKey: [], storeWhen: "always", l2Kind: null };

describe("createDepsDevSource", () => {
  it("getPackage: GET package URL, absent on 404, upstream cache, no gate/auth", async () => {
    const { client, calls } = scripted(okOutcome('{"a":1}'));
    const result = await createDepsDevSource(client).getPackage("npm", "left-pad", ctx);
    expect(result).toMatchObject({ kind: "ok", status: 200, body: { a: 1 } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.context).toBe(ctx);
    expect(calls[0]!.request).toEqual({
      source: "depsdev",
      method: "GET",
      url: "https://api.deps.dev/v3/systems/npm/packages/left-pad",
      headers: { accept: "application/json" },
      body: null,
      auth: "none",
      notFound: "absent",
      cache: upstreamCache,
      gate: null,
    });
  });

  it("encodes scoped package names and keeps the lowercase system in the path", async () => {
    const { client, calls } = scripted();
    const source = createDepsDevSource(client);
    await source.getPackage("npm", "@scope/pkg", ctx);
    await source.getPackage("pypi", "a b%c", ctx);
    expect(calls[0]!.request.url).toBe("https://api.deps.dev/v3/systems/npm/packages/%40scope%2Fpkg");
    expect(calls[1]!.request.url).toBe("https://api.deps.dev/v3/systems/pypi/packages/a%20b%25c");
  });

  it("getVersion: encoded name and version, 404 is failed, upstream cache", async () => {
    const { client, calls } = scripted();
    await createDepsDevSource(client).getVersion("cargo", "@s/p", "1.0.0+b/1", ctx);
    const r = calls[0]!.request;
    expect(r.method).toBe("GET");
    expect(r.url).toBe(
      "https://api.deps.dev/v3/systems/cargo/packages/%40s%2Fp/versions/1.0.0%2Bb%2F1",
    );
    expect(r.notFound).toBe("failed");
    expect(r.body).toBeNull();
    expect(r.cache).toEqual(upstreamCache);
    expect(r.gate).toBeNull();
  });

  it("getVersionBatch: POST with uppercase system and JSON body, 404 failed", async () => {
    const { client, calls } = scripted();
    const reqs: VersionRequest[] = [
      { system: "npm", name: "@s/p", version: "1.0.0" },
      { system: "pypi", name: "requests", version: "2.0" },
      { system: "cargo", name: "serde", version: "1.0.1" },
    ];
    await createDepsDevSource(client).getVersionBatch(reqs, ctx);
    const r = calls[0]!.request;
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://api.deps.dev/v3alpha/versionbatch");
    expect(r.headers).toEqual({ accept: "application/json", "content-type": "application/json" });
    expect(r.notFound).toBe("failed");
    expect(r.auth).toBe("none");
    expect(r.cache).toEqual(upstreamCache);
    expect(JSON.parse(r.body as string)).toEqual({
      requests: [
        { versionKey: { system: "NPM", name: "@s/p", version: "1.0.0" } },
        { versionKey: { system: "PYPI", name: "requests", version: "2.0" } },
        { versionKey: { system: "CARGO", name: "serde", version: "1.0.1" } },
      ],
    });
  });

  it("getVersionBatch accepts exactly DEPSDEV_BATCH_SIZE requests", async () => {
    const { client, calls } = scripted();
    const reqs = Array.from({ length: DEPSDEV_BATCH_SIZE }, (_, i) => ({
      system: "npm" as const,
      name: `p${i}`,
      version: "1.0.0",
    }));
    await createDepsDevSource(client).getVersionBatch(reqs, ctx);
    expect(calls).toHaveLength(1);
  });

  it("getVersionBatch over the size limit fails with http-error and sends nothing", async () => {
    const { client, calls } = scripted();
    const reqs = Array.from({ length: DEPSDEV_BATCH_SIZE + 1 }, (_, i) => ({
      system: "npm" as const,
      name: `p${i}`,
      version: "1.0.0",
    }));
    const result = await createDepsDevSource(client).getVersionBatch(reqs, ctx);
    expect(result).toEqual({ kind: "failed", reason: "http-error", status: null, headers: null });
    expect(calls).toHaveLength(0);
  });

  it("getAdvisory: encoded id, absent on 404, advisory cache with L2 kind", async () => {
    const { client, calls } = scripted();
    await createDepsDevSource(client).getAdvisory("GHSA-a/b c", ctx);
    const r = calls[0]!.request;
    expect(r.method).toBe("GET");
    expect(r.url).toBe("https://api.deps.dev/v3/advisories/GHSA-a%2Fb%20c");
    expect(r.notFound).toBe("absent");
    expect(r.body).toBeNull();
    expect(r.cache).toEqual({
      ttlSeconds: 86400,
      extraKey: [],
      storeWhen: "always",
      l2Kind: "depsdev-advisory",
    });
  });

  it("maps a non-JSON 2xx body to unparsable and failed outcomes through", async () => {
    const bad = scripted(okOutcome("<html>"));
    expect(await createDepsDevSource(bad.client).getAdvisory("x", ctx)).toMatchObject({
      kind: "unparsable",
    });
    const failed = scripted({
      kind: "failed",
      reason: "http-error",
      status: 500,
      headers: null,
      attempts: 3,
    } as WorkUnitOutcome);
    expect(await createDepsDevSource(failed.client).getPackage("npm", "x", ctx)).toMatchObject({
      kind: "failed",
      reason: "http-error",
      status: 500,
    });
  });
});
