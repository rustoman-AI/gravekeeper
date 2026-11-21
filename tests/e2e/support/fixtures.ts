import { readFileSync } from "node:fs";
import path from "node:path";

export const FIXTURE_NAMES = [
  "request",
  "canopy",
  "zoxide",
  "psf-requests",
  "synthetic-restless",
  "synthetic-300",
  "synthetic-301",
] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];

/** The 200 body of `POST /api/scan`: `{ ok: true, ...ScanResult }`. */
export type ScanOkBody = { ok: true } & Record<string, unknown>;

const GENERATED_DIR = path.join(process.cwd(), "tests", "e2e", ".generated");
const cache = new Map<FixtureName, ScanOkBody>();

/** Loads `tests/e2e/.generated/scan-<name>.json` (cached, returns a fresh copy). */
export function loadScan(name: FixtureName): ScanOkBody {
  let body = cache.get(name);
  if (!body) {
    const file = path.join(GENERATED_DIR, `scan-${name}.json`);
    body = JSON.parse(readFileSync(file, "utf8")) as ScanOkBody;
    cache.set(name, body);
  }
  return structuredClone(body);
}

/** The raw JSON text of a generated file, for responses sent byte for byte. */
export function loadScanText(name: FixtureName): string {
  return JSON.stringify(loadScan(name));
}
