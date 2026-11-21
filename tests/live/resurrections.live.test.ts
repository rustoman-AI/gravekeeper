import { readFileSync } from "node:fs";
import path from "node:path";
import { describe } from "vitest";
import { liveIt } from "./live-support";

// Requirement 8.2, 8.3, 8.4, 8.5, 8.6
// Live contract test of the curated `to` names of data/resurrections.json.
// Skipped unless GRAVEKEEPER_LIVE_TESTS=1 (no request without it). Vitest runs the
// cases of a file one after the other, so at most one request is in flight (R8: at most 4).
// The GitHub token comes from the process environment only; it is never printed.
// Failure messages name the registry, the package and the failed check only.

const TIMEOUT = 60_000;
const USER_AGENT = "gravekeeper-live-contract-test (https://github.com/gravekeeper)";

type Ecosystem = "npm" | "pypi" | "cargo";

interface Target {
  readonly ecosystem: Ecosystem;
  readonly name: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTargets(): Target[] {
  const raw: unknown = JSON.parse(
    readFileSync(path.resolve("data", "resurrections.json"), "utf8"),
  );
  const entries = isRecord(raw) && Array.isArray(raw.entries) ? raw.entries : [];
  const seen = new Set<string>();
  const targets: Target[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.to)) continue;
    const eco = entry.ecosystem;
    if (eco !== "npm" && eco !== "pypi" && eco !== "cargo") continue;
    for (const name of entry.to) {
      if (typeof name !== "string") continue;
      const key = `${eco}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ ecosystem: eco, name });
    }
  }
  return targets;
}

function fail(target: Target, check: string): never {
  throw new Error(`live contract failure: ${target.ecosystem} ${target.name}: ${check}`);
}

interface Fetched {
  readonly status: number;
  readonly body: unknown;
}

async function request(
  url: string,
  init: { headers?: Record<string, string>; method?: string; body?: string } = {},
): Promise<Fetched> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    body: init.body,
    headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...init.headers },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // non-JSON body
  }
  return { status: res.status, body };
}

function member(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function githubRepo(url: unknown): { owner: string; repo: string } | null {
  if (typeof url !== "string") return null;
  const match = /github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?].*)?$/.exec(url);
  const owner = match?.[1];
  const repo = match?.[2];
  return owner !== undefined && repo !== undefined ? { owner, repo } : null;
}

/** Archived check; skipped with a note when no token is set (R8.6). */
async function checkNotArchived(target: Target, repositoryUrl: unknown): Promise<void> {
  const gh = githubRepo(repositoryUrl);
  if (gh === null) return;
  const token = process.env.GITHUB_TOKEN;
  if (token === undefined || token === "") {
    console.info(`${target.ecosystem} ${target.name}: archived check skipped, GITHUB_TOKEN not set`);
    return;
  }
  const res = await request(`https://api.github.com/repos/${gh.owner}/${gh.repo}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (res.status !== 200) fail(target, `GitHub repository lookup answered HTTP ${res.status}`);
  if (member(res.body, "archived") === true) fail(target, "GitHub repository is archived");
}

async function checkNpm(target: Target): Promise<void> {
  const res = await request(`https://registry.npmjs.org/${encodeURIComponent(target.name)}`);
  if (res.status !== 200) fail(target, `packument answered HTTP ${res.status}`);
  const latest = member(member(res.body, "dist-tags"), "latest");
  if (typeof latest !== "string") fail(target, "dist-tags.latest is missing");
  const doc = member(member(res.body, "versions"), latest);
  if (!isRecord(doc)) fail(target, "latest version document is missing");
  if (Object.prototype.hasOwnProperty.call(doc, "deprecated")) {
    fail(target, "latest version is deprecated");
  }
  const repo = member(doc, "repository") ?? member(res.body, "repository");
  await checkNotArchived(target, typeof repo === "string" ? repo : member(repo, "url"));
}

async function checkPypi(target: Target): Promise<void> {
  const res = await request(`https://pypi.org/pypi/${encodeURIComponent(target.name)}/json`);
  if (res.status !== 200) fail(target, `JSON API answered HTTP ${res.status}`);
  const info = member(res.body, "info");
  if (member(info, "yanked") !== false && member(info, "yanked") !== undefined) {
    fail(target, "latest release is yanked");
  }
  const classifiers = member(info, "classifiers");
  if (Array.isArray(classifiers) && classifiers.includes("Development Status :: 7 - Inactive")) {
    fail(target, "classifier Development Status :: 7 - Inactive");
  }
  const simple = await request(`https://pypi.org/simple/${encodeURIComponent(target.name)}/`, {
    headers: { Accept: "application/vnd.pypi.simple.v1+json" },
  });
  if (simple.status === 200) {
    const status = member(member(simple.body, "project-status"), "status");
    if (status !== undefined && status !== "active") {
      fail(target, "project-status is not active");
    }
  }
}

async function osvUnmaintained(target: Target): Promise<boolean> {
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const payload: Record<string, unknown> = {
      package: { name: target.name, ecosystem: "crates.io" },
    };
    if (pageToken !== undefined) payload.page_token = pageToken;
    const res = await request("https://api.osv.dev/v1/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status !== 200) fail(target, `OSV query answered HTTP ${res.status}`);
    const vulns = member(res.body, "vulns");
    if (Array.isArray(vulns)) {
      for (const vuln of vulns) {
        const withdrawn = member(vuln, "withdrawn");
        const informational = member(member(vuln, "database_specific"), "informational");
        if (withdrawn === undefined && informational === "unmaintained") return true;
      }
    }
    const next = member(res.body, "next_page_token");
    if (typeof next !== "string" || next === "") return false;
    pageToken = next;
  }
  return false;
}

async function checkCargo(target: Target): Promise<void> {
  const res = await request(`https://crates.io/api/v1/crates/${encodeURIComponent(target.name)}`);
  if (res.status !== 200) fail(target, `crate endpoint answered HTTP ${res.status}`);
  const versions = member(res.body, "versions");
  const hasLive =
    Array.isArray(versions) && versions.some((v) => isRecord(v) && v.yanked !== true);
  if (!hasLive) fail(target, "no non-yanked version");
  if (await osvUnmaintained(target)) fail(target, "OSV unmaintained advisory");
  await checkNotArchived(target, member(member(res.body, "crate"), "repository"));
}

const CHECKS: Record<Ecosystem, (target: Target) => Promise<void>> = {
  npm: checkNpm,
  pypi: checkPypi,
  cargo: checkCargo,
};

// Requirement 8.1, 8.2, 8.3, 8.4, 8.5
// Evidence check: one case per entry. The evidence URL is read defensively (task 9.2 adds
// it in parallel); a missing or malformed value fails that case with a clear message.

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 1024 * 1024;

interface EvidenceEntry {
  readonly ecosystem: string;
  readonly from: string;
  readonly evidence: unknown;
  readonly to: readonly string[];
}

function readEvidenceEntries(): EvidenceEntry[] {
  const raw: unknown = JSON.parse(
    readFileSync(path.resolve("data", "resurrections.json"), "utf8"),
  );
  const entries = isRecord(raw) && Array.isArray(raw.entries) ? raw.entries : [];
  const out: EvidenceEntry[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const to = Array.isArray(entry.to)
      ? entry.to.filter((n): n is string => typeof n === "string")
      : [];
    out.push({
      ecosystem: typeof entry.ecosystem === "string" ? entry.ecosystem : "unknown",
      from: typeof entry.from === "string" ? entry.from : "unknown",
      evidence: entry.evidence,
      to,
    });
  }
  return out;
}

function evidenceFail(entry: EvidenceEntry, check: string): never {
  throw new Error(`live contract failure: ${entry.ecosystem} ${entry.from}: evidence ${check}`);
}

async function readCapped(res: Response): Promise<string> {
  if (res.body === null) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = value.subarray(0, MAX_BODY_BYTES - total);
    chunks.push(take);
    total += take.length;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).toString("utf8");
}

async function checkEvidence(entry: EvidenceEntry): Promise<void> {
  if (typeof entry.evidence !== "string" || entry.evidence === "") {
    evidenceFail(entry, "field is missing in data/resurrections.json");
  }
  let url: string = entry.evidence;
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    res = await fetch(url, {
      redirect: "manual",
      headers: { Accept: "text/html,application/json;q=0.9,*/*;q=0.8", "User-Agent": USER_AGENT },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location !== null) {
      await res.body?.cancel().catch(() => undefined);
      if (hop === MAX_REDIRECTS) evidenceFail(entry, `exceeded ${MAX_REDIRECTS} redirects`);
      try {
        url = new URL(location, url).toString();
      } catch {
        evidenceFail(entry, "redirect target is not a URL");
      }
      continue;
    }
    break;
  }
  if (res === null || res.status !== 200) {
    await res?.body?.cancel().catch(() => undefined);
    evidenceFail(entry, `answered HTTP ${res?.status ?? "none"}`);
  }
  const text = (await readCapped(res)).toLowerCase();
  if (!entry.to.some((name) => text.includes(name.toLowerCase()))) {
    evidenceFail(entry, "does not mention any target name");
  }
}

describe("Curated resurrection evidence (live)", () => {
  for (const entry of readEvidenceEntries()) {
    liveIt(`${entry.ecosystem} ${entry.from} evidence names a target`, async () => {
      await checkEvidence(entry);
    }, TIMEOUT);
  }
});

describe("Curated resurrection targets (live)", () => {
  for (const target of readTargets()) {
    liveIt(`${target.ecosystem} ${target.name} is a live, maintained target`, async () => {
      await CHECKS[target.ecosystem](target);
    }, TIMEOUT);
  }
});
