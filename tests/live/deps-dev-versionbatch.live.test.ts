import { describe, expect } from "vitest";
import { formatLiveFailure, findRow, liveRowIt } from "./live-support";

// Requirement 23.17, 8.8, 8.9, 23.15
// Live contract test for EF-3 (POST /v3alpha/versionbatch). Skipped unless
// GRAVEKEEPER_LIVE_TESTS=1. One request, one pinned version per ecosystem taken
// from the fixture repositories' ecosystems (npm: request/request, PyPI:
// revmic/canopy, Cargo: ajeetdsouza/zoxide). Failures name only row, source, path.

const URL = "https://api.deps.dev/v3alpha/versionbatch";
const TIMEOUT = 30_000;

interface Key {
  system: string;
  name: string;
  version: string;
}

// npm: the package published from request/request; PyPI: `Flask==0.10.1` from
// revmic/canopy requirements.txt; Cargo: `clap = "4.3.0"` from zoxide Cargo.toml.
const KEYS: readonly Key[] = [
  { system: "NPM", name: "request", version: "2.88.2" },
  { system: "PYPI", name: "flask", version: "0.10.1" },
  { system: "CARGO", name: "clap", version: "4.3.0" },
];

const sameKey = (a: Key, b: Key): boolean =>
  a.system === b.system && a.name === b.name && a.version === b.version;

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function readKey(entry: unknown): Key | undefined {
  const vk = asRecord(asRecord(asRecord(entry)?.request)?.versionKey);
  if (vk === undefined) return undefined;
  const { system, name, version } = vk;
  if (typeof system !== "string" || typeof name !== "string" || typeof version !== "string") {
    return undefined;
  }
  return { system, name, version };
}

describe("deps.dev versionbatch live contract (EF-3)", () => {
  liveRowIt(
    "EF-3",
    "POST /v3alpha/versionbatch",
    async () => {
      const row = findRow("EF-3");
      const fail = (path: string): never => {
        throw new Error(formatLiveFailure(row, path));
      };

      const res = await fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "gravekeeper-live-contract-tests" },
        body: JSON.stringify({ requests: KEYS.map((versionKey) => ({ versionKey })) }),
      });
      if (!res.ok) throw new Error(`live request failed with HTTP ${res.status}`);
      const body = asRecord((await res.json()) as unknown);
      const responses = body?.responses;
      if (!Array.isArray(responses)) return fail("responses[]");

      for (const entry of responses) {
        if (readKey(entry) === undefined) fail("responses[].request.versionKey");
        if (asRecord(asRecord(entry)?.version) === undefined) fail("responses[].version");
      }

      // every response entry matches a request, every request has an entry
      const returned = responses.map((e) => readKey(e) as Key);
      for (const r of returned) {
        if (!KEYS.some((k) => sameKey(k, r))) fail("responses[].request.versionKey");
      }
      for (const k of KEYS) {
        if (!returned.some((r) => sameKey(k, r))) fail("responses[].request.versionKey");
      }
      expect(returned).toHaveLength(KEYS.length);
    },
    TIMEOUT,
  );
});
