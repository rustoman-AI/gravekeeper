import { parseScanResponse } from "../../../view-model";
import { loadScan, type ScanOkBody } from "./fixtures";
import type { ScanHandler } from "./mock-scan";

// Builders for synthetic scan bodies (degraded, empty, picker), shared by the screenshot spec.

type Json = Record<string, unknown>;

export function repoUrlOf(body: ScanOkBody): string {
  const outcome = parseScanResponse(200, { get: () => null }, body);
  if (outcome.kind !== "result") throw new Error("body did not parse as a result");
  const { repo } = outcome.result;
  return `https://github.com/${repo.owner}/${repo.repo}`;
}

export function resultPath(body: ScanOkBody, view?: "list"): string {
  const base = `/?repo=${encodeURIComponent(repoUrlOf(body))}`;
  return view ? `${base}&view=${view}` : base;
}

export function okHandler(body: ScanOkBody): ScanHandler {
  return (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
}

export function noteOf(code: string, message: string): Json {
  return { code, message, details: {} };
}

export function emptyBody(notes: Json[], candidates: Json[]): ScanOkBody {
  const body = loadScan("request");
  body["manifests"] = [];
  body["dependencies"] = [];
  body["assessed"] = [];
  body["notes"] = notes;
  body["discovery"] = { candidates, truncatedTree: false, depthLimited: false, countLimited: false };
  body["capped"] = { limit: 300, total: 0, skipped: [] };
  body["summary"] = {
    total: 0,
    assessed: 0,
    unassessed: 0,
    counts: { ALIVE: 0, HAUNTED: 0, DEAD: 0 },
    averageScore: null,
    maxScore: null,
    maxScorePackage: null,
    grade: null,
    worst: [],
    unassessedItems: [],
  };
  return body;
}

export function degradedBody(): ScanOkBody {
  const body = loadScan("request");
  body["sources"] = { ...(body["sources"] as Json), github: "partial", osv: "failed" };
  body["capped"] = { limit: 300, total: 41, skipped: [{ ecosystem: "npm", name: "skipped-one" }] };
  (body["notes"] as Json[]).push(
    noteOf("source-partial", "GitHub answered only in part, so some repository facts are unknown."),
    noteOf("source-failed", "OSV did not answer, so advisories are unknown."),
    noteOf("dependency-cap-exceeded", "Only 300 packages were assessed; 1 was skipped."),
  );
  return body;
}

export const NO_MANIFESTS_MESSAGE =
  "No package.json, requirements.txt or Cargo.toml was found in this repository.";

export const PICKER_CANDIDATES = [
  { path: "packages/a/package.json", format: "package.json", depth: 2, sizeBytes: 1200 },
  { path: "packages/b/package.json", format: "package.json", depth: 2, sizeBytes: 800 },
  { path: "services/c/requirements.txt", format: "requirements.txt", depth: 2, sizeBytes: 300 },
];

export function pickerBody(): ScanOkBody {
  return emptyBody(
    [
      noteOf(
        "no-root-manifest",
        "No manifest was found at the repository root. Choose one of the manifests found in subfolders.",
      ),
    ],
    PICKER_CANDIDATES,
  );
}
