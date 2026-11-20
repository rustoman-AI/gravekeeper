// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryCacheStore } from "../../../adapters/cache/memory-cache-store";
import { CachingHttpClient } from "../../../adapters/http/caching-http-client";
import { createCratesIoSource } from "../../../adapters/cratesio/cratesio-source";
import { createDepsDevSource } from "../../../adapters/depsdev/depsdev-source";
import { createGithubSource } from "../../../adapters/github/github-source";
import { createNpmSource } from "../../../adapters/npm/npm-source";
import { createOsvSource } from "../../../adapters/osv/osv-source";
import { createPypiSource } from "../../../adapters/pypi/pypi-source";
import { GraveyardAppView } from "../../../components/graveyard-app";
import type { ScanRunner } from "../../../components/hooks/use-scan";
import type { UrlHistory, UrlRouter } from "../../../components/hooks/use-url-state";
import {
  GITHUB_DEFAULT_WEB_HOST,
  OSV_MAX_ADVISORY_DETAILS,
  SCAN_MAX_DEPENDENCIES,
  SCAN_MAX_MANIFESTS,
} from "../../../pipeline/constants";
import { readGithubConfig } from "../../../pipeline/config/github-config";
import { createScanCache } from "../../../pipeline/scan/scan-cache";
import { runScan } from "../../../pipeline/scan/run-scan";
import type { ScanDeps } from "../../../pipeline/scan/types";
import { buildHeaderModel } from "../../../view-model/header";
import { buildPackageRows } from "../../../view-model/package-rows";
import { parseScanResponse } from "../../../view-model/parse-response";
import type { PackageRow, ParsedScanResult } from "../../../view-model/types";
import { createFakeRuntime } from "../../support/fake-runtime";
import { FixtureHttpClient } from "../../support/fixture-http-client";
import { buildScanResult } from "../../support/ui/scan-result-builder";

// Requirements 3.2, 5.2, 9.5, 10.1, 18.1, 19.3: landing, submit, scanning, results, list, detail panel.
afterEach(cleanup);

const FIXTURES = join(__dirname, "..", "..", "fixtures");

const CASES = [
  { name: "request__request", owner: "request", repo: "request" },
  { name: "revmic__canopy", owner: "revmic", repo: "canopy" },
  { name: "ajeetdsouza__zoxide", owner: "ajeetdsouza", repo: "zoxide" },
] as const;

async function replayToParsed(name: string, owner: string, repo: string): Promise<ParsedScanResult> {
  const dir = join(FIXTURES, name);
  const meta = JSON.parse(readFileSync(join(dir, "metadata.json"), "utf8")) as { asOf: string };
  const parsedConfig = readGithubConfig({});
  if (!parsedConfig.ok) throw new Error("default GitHub configuration is invalid");
  const config = parsedConfig.value;
  const startedAtMs = Date.parse(meta.asOf);
  const runtime = createFakeRuntime(startedAtMs);
  const fixture = new FixtureHttpClient(dir);
  const http = new CachingHttpClient(fixture, new MemoryCacheStore(runtime.clock));
  const deps: ScanDeps = {
    sources: {
      github: createGithubSource(http, config, true),
      depsdev: createDepsDevSource(http),
      osv: createOsvSource(http),
      npm: createNpmSource(http),
      cratesio: createCratesIoSource({ http, userAgent: "gravekeeper-fixture-replay" }),
      pypi: createPypiSource(http),
    },
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: () => undefined },
    scanCache: createScanCache(new MemoryCacheStore(runtime.clock)),
    config,
    limits: {
      maxManifests: SCAN_MAX_MANIFESTS,
      maxDependencies: SCAN_MAX_DEPENDENCIES,
      maxAdvisoryDetails: OSV_MAX_ADVISORY_DETAILS,
    },
    deadlineMs: 300_000,
  };
  const outcome = await runScan(
    {
      repo: { host: GITHUB_DEFAULT_WEB_HOST, owner, repo, branch: null },
      manifests: [],
      asOf: meta.asOf,
      startedAtMs,
    },
    deps,
  );
  fixture.assertNoMisses();
  if (!outcome.ok) throw new Error(`scan failed: ${JSON.stringify(outcome.error)}`);
  const wire: unknown = JSON.parse(JSON.stringify({ ...outcome.value.result, ok: true }));
  return parseOrThrow(wire);
}

function parseOrThrow(wire: unknown): ParsedScanResult {
  const parsed = parseScanResponse(200, { get: () => null }, wire);
  if (parsed.kind !== "result") throw new Error(`response did not parse: ${parsed.kind}`);
  return parsed.result;
}

const searchOf = (href: string): string => {
  const i = href.indexOf("?");
  return i < 0 ? "" : href.slice(i + 1);
};

/** The harness of graveyard-app-scanning.test.tsx: a fake router that feeds `search` state. The client settles on demand. */
function setup(result: ParsedScanResult) {
  let settle: () => void = () => {};
  const run = vi.fn<ScanRunner["run"]>(
    () =>
      new Promise((resolve) => {
        settle = () => resolve({ kind: "result", result, cache: "miss" });
      }),
  );
  const client: ScanRunner = { run };
  const history: UrlHistory = { replaceState: vi.fn() };

  function Harness() {
    const [search, setSearch] = useState("");
    const router = useMemo<UrlRouter>(
      () => ({
        push: (href) => setSearch(searchOf(href)),
        replace: (href) => setSearch(searchOf(href)),
      }),
      [],
    );
    return (
      <GraveyardAppView
        router={router}
        search={search}
        history={history}
        client={client}
        now={() => Date.parse("2026-01-01T00:05:00Z")}
        scanningClock={{ reducedMotion: true, setInterval: () => 0, clearInterval: () => {} }}
      />
    );
  }

  render(<Harness />);
  return { run, settle: () => settle() };
}

/** Landing, submit, scanning, results. */
async function reachResults(result: ParsedScanResult, repoUrl: string) {
  const f = setup(result);
  const user = userEvent.setup();
  expect(screen.getByLabelText("GitHub repository URL")).toBeTruthy();
  await user.type(screen.getByLabelText("GitHub repository URL"), repoUrl);
  await user.click(screen.getByRole("button", { name: "Dig up" }));
  await screen.findByText("The caretaker is scanning");
  expect(f.run).toHaveBeenCalledTimes(1);
  expect(f.run.mock.calls[0]?.[0].repoUrl).toBe(repoUrl);
  await act(async () => {
    f.settle();
  });
  await screen.findByRole("button", { name: "Scene" });
  return { user };
}

const headlineParagraph = (text: string): HTMLElement => screen.getByText(text, { selector: "p" });

function rowOf(rows: readonly PackageRow[], pick: (r: PackageRow) => boolean, what: string): PackageRow {
  const row = rows.find(pick);
  if (row === undefined) throw new Error(`no ${what} row`);
  return row;
}

const parsedByName = new Map<string, ParsedScanResult>();

beforeAll(async () => {
  for (const c of CASES) parsedByName.set(c.name, await replayToParsed(c.name, c.owner, c.repo));
}, 120_000);

const fixtureOf = (name: string): ParsedScanResult => {
  const r = parsedByName.get(name);
  if (r === undefined) throw new Error(`fixture ${name} not replayed`);
  return r;
};

describe("graveyard end-to-end component flow", () => {
  for (const c of CASES) {
    it(`${c.name}: landing, scanning, results with the header model headline (3.2, 5.2)`, async () => {
      const parsed = fixtureOf(c.name);
      const expected = buildHeaderModel(parsed, buildPackageRows(parsed)).headline?.text;
      expect(expected).toBeDefined();

      await reachResults(parsed, `https://github.com/${c.owner}/${c.repo}`);

      expect(headlineParagraph(expected as string)).toBeTruthy();
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(`${c.owner}/${c.repo}`);
    });
  }

  it("request__request headline reads 31 of 40, 6 buried, 20 forgotten, 5 haunted (5.2)", async () => {
    const parsed = fixtureOf("request__request");
    await reachResults(parsed, "https://github.com/request/request");
    expect(
      headlineParagraph("31 of 40 dependencies are in the graveyard: 6 buried, 20 forgotten, 5 haunted."),
    ).toBeTruthy();
  });

  it("switches to the list view and keeps the headline (18.1)", async () => {
    const parsed = fixtureOf("request__request");
    const expected = buildHeaderModel(parsed, buildPackageRows(parsed)).headline?.text as string;
    const { user } = await reachResults(parsed, "https://github.com/request/request");

    await user.click(screen.getByRole("button", { name: "List" }));
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
    expect(headlineParagraph(expected)).toBeTruthy();
  });

  it("opens and closes a tombstone, a forgotten grave and a ghost from the scene (9.5, 10.1)", async () => {
    const parsed = fixtureOf("request__request");
    const rows = buildPackageRows(parsed);
    const picks = [
      rowOf(rows, (r) => r.kind === "tombstone", "tombstone"),
      rowOf(rows, (r) => r.kind === "overgrown" && r.graveType === "forgotten", "forgotten grave"),
      rowOf(rows, (r) => r.kind === "ghost", "ghost"),
    ];
    const { user } = await reachResults(parsed, "https://github.com/request/request");

    for (const row of picks) {
      const plot = screen.getByRole("button", { name: row.accessibleLabel });
      await user.click(plot);
      const dialog = await screen.findByRole("dialog");
      expect(dialog.getAttribute("aria-labelledby")).not.toBeNull();
      expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(row.name);
      expect(dialog.textContent).toContain(row.statusWord);

      await user.click(screen.getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.activeElement).toBe(plot);

      // Escape closes it as well.
      await user.click(plot);
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.activeElement).toBe(plot);
    }
  });

  it("opens a package from the list view and returns focus to its button on close (10.1, 18.1)", async () => {
    const parsed = fixtureOf("request__request");
    const rows = buildPackageRows(parsed);
    const ghost = rowOf(rows, (r) => r.kind === "ghost", "ghost");
    const { user } = await reachResults(parsed, "https://github.com/request/request");

    await user.click(screen.getByRole("button", { name: "List" }));
    await screen.findByRole("table");
    const opener = screen.getByRole("button", { name: ghost.name });
    await user.click(opener);
    await screen.findByRole("dialog");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(ghost.name);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it("opens a restless ghost from a synthetic result (9.5, 10.1)", async () => {
    const parsed = parseOrThrow(JSON.parse(JSON.stringify(buildScanResult([
      { name: "restless-a", kind: "restless-archived" },
      { name: "alive-one", kind: "alive" },
    ]))));
    const rows = buildPackageRows(parsed);
    const restless = rowOf(rows, (r) => r.kind === "restless", "restless ghost");
    const expected = buildHeaderModel(parsed, rows).headline?.text as string;
    const { user } = await reachResults(parsed, "https://github.com/synthetic/graveyard");

    expect(headlineParagraph(expected)).toBeTruthy();
    const plot = screen.getByRole("button", { name: restless.accessibleLabel });
    await user.click(plot);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("haunted, buried");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(plot);
  });
});
