import type { Page } from "@playwright/test";
import { buildNotesModel, parseScanResponse } from "../../view-model";
import { expectNoA11yViolations } from "./support/a11y";
import { loadScan, type FixtureName, type ScanOkBody } from "./support/fixtures";
import { mockScan, respondWithFixture, type ScanHandler } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 11, 20.2.

const RECORDED: readonly FixtureName[] = ["request", "canopy", "zoxide", "synthetic-restless"];

type Json = Record<string, unknown>;

function parsedOf(body: ScanOkBody) {
  const outcome = parseScanResponse(200, { get: () => null }, body);
  if (outcome.kind !== "result") throw new Error("body did not parse as a result");
  return outcome.result;
}

function repoUrlOf(body: ScanOkBody): string {
  const { repo } = parsedOf(body);
  return `https://github.com/${repo.owner}/${repo.repo}`;
}

function resultPath(body: ScanOkBody): string {
  return `/?repo=${encodeURIComponent(repoUrlOf(body))}`;
}

function ok(body: ScanOkBody): ScanHandler {
  return (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
}

function noteOf(code: string, message: string): Json {
  return { code, message, details: {} };
}

function emptyBody(notes: Json[], candidates: Json[]): ScanOkBody {
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

async function openResult(page: Page, body: ScanOkBody): Promise<void> {
  await page.goto(resultPath(body));
  await expect(page.getByRole("heading", { name: "The caretaker's notes" })).toBeVisible();
}

test.describe("caretaker's notes for recorded fixtures", () => {
  for (const name of RECORDED) {
    test(`${name}: shows sources and note groups`, async ({ page }) => {
      const body = loadScan(name);
      const model = buildNotesModel(parsedOf(body));
      await mockScan(page, respondWithFixture(name));
      await openResult(page, body);

      const notes = page.getByRole("region", { name: "The caretaker's notes" });
      for (const source of model.sources) {
        await expect(notes.getByText(`${source.label}: ${source.status}`, { exact: false }).first()).toBeVisible();
      }
      expect(model.sources.map((s) => s.label)).toEqual([
        "GitHub",
        "deps.dev",
        "OSV",
        "npm registry",
        "crates.io",
        "PyPI",
      ]);
      for (const section of model.sections) {
        for (const group of section.groups) {
          const el = page.locator(`#note-group-${group.code}`);
          await expect(el.getByRole("heading", { name: `${group.heading} (${group.count})` })).toBeVisible();
          await expect(el.getByText(group.messages[0] ?? "", { exact: true }).first()).toBeVisible();
        }
      }
      await expectNoA11yViolations(page, `notes-${name}`, test.info().project.name);
    });
  }
});

test.describe("degraded result", () => {
  function degradedBody(): ScanOkBody {
    const body = loadScan("request");
    body["sources"] = { ...(body["sources"] as Json), github: "partial", osv: "failed" };
    body["capped"] = {
      limit: 300,
      total: 41,
      skipped: [{ ecosystem: "npm", name: "skipped-one" }],
    };
    const notes = body["notes"] as Json[];
    notes.push(
      noteOf("source-partial", "GitHub answered only in part, so some repository facts are unknown."),
      noteOf("source-failed", "OSV did not answer, so advisories are unknown."),
      noteOf("dependency-cap-exceeded", "Only 300 packages were assessed; 1 was skipped."),
    );
    return body;
  }

  test("shows alerts, linked notes and the cap banner", async ({ page }) => {
    const body = degradedBody();
    await mockScan(page, ok(body));
    await openResult(page, body);

    const alerts = [
      { text: "GitHub: partial, some facts that depend on it are unknown", code: "source-partial" },
      { text: "OSV: failed, some facts that depend on it are unknown", code: "source-failed" },
    ];
    for (const { text, code } of alerts) {
      const link = page.getByRole("link", { name: text });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", `#note-group-${code}`);
      await expect(page.locator(`#note-group-${code}`)).toBeVisible();
    }
    await expect(page.getByText("GitHub: partial", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("OSV: failed", { exact: false }).first()).toBeVisible();

    const banner = page.getByRole("status").filter({ hasText: "Skipped dependencies" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Only 300 packages were assessed; 1 was skipped.");
    await expect(banner).toContainText("Skipped dependencies: 1");

    await expectNoA11yViolations(page, "notes-degraded", test.info().project.name);
  });
});

test.describe("note groups", () => {
  test("Show all reveals the rest of a group of more than 5 notes", async ({ page }) => {
    const body = loadScan("request");
    body["notes"] = Array.from({ length: 12 }, (_, i) =>
      noteOf("source-repo-unverified", `Package ${String(i)} links to a repository that is not verified.`),
    );
    await mockScan(page, ok(body));
    await openResult(page, body);

    const group = page.locator("#note-group-source-repo-unverified");
    await expect(group.getByRole("heading", { name: /\(12\)$/ })).toBeVisible();
    await expect(group.getByRole("listitem")).toHaveCount(5);
    await group.getByRole("button", { name: "Show all 12" }).click();
    await expect(group.getByRole("listitem")).toHaveCount(12);
    await expect(group.getByRole("button", { name: "Show all 12" })).toHaveCount(0);
    await expect(group.getByRole("heading", { name: /\(12\)$/ })).toBeVisible();
  });
});

test.describe("empty graveyard", () => {
  test("shows the no-manifests message and no scene", async ({ page }) => {
    const message = "No package.json, requirements.txt or Cargo.toml was found in this repository.";
    const body = emptyBody([noteOf("no-manifests", message)], []);
    await mockScan(page, ok(body));
    await openResult(page, body);

    await expect(page.getByText(message, { exact: true }).first()).toBeVisible();
    await expect(page.locator("button.gk-plot")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "List", exact: true })).toHaveCount(0);
    await expectNoA11yViolations(page, "empty-graveyard", test.info().project.name);
  });
});

test.describe("manifest picker", () => {
  const CANDIDATES = [
    { path: "packages/a/package.json", format: "package.json", depth: 2, sizeBytes: 1200 },
    { path: "packages/b/package.json", format: "package.json", depth: 2, sizeBytes: 800 },
    { path: "services/c/requirements.txt", format: "requirements.txt", depth: 2, sizeBytes: 300 },
  ];

  test("selects two candidates and rescans them", async ({ page }) => {
    const pickerBody = emptyBody(
      [
        noteOf(
          "no-root-manifest",
          "No manifest was found at the repository root. Choose one of the manifests found in subfolders.",
        ),
      ],
      CANDIDATES,
    );
    const handler: ScanHandler = (route, request) => {
      const sent = JSON.parse(request.postData() ?? "{}") as { manifests?: string[] };
      if (sent.manifests !== undefined && sent.manifests.length > 0) {
        return ok(loadScan("request"))(route, request);
      }
      return ok(pickerBody)(route, request);
    };
    const seen = await mockScan(page, handler);
    await openResult(page, pickerBody);

    const scanButton = page.getByRole("button", { name: "Scan selected manifests" });
    await expect(scanButton).toBeDisabled();
    await expect(page.getByText("package.json, 1.2 kB")).toBeVisible();
    await expect(page.getByText("requirements.txt, 300 bytes")).toBeVisible();
    await expectNoA11yViolations(page, "picker", test.info().project.name);

    await page.getByLabel("packages/a/package.json").check();
    await page.getByLabel("services/c/requirements.txt").check();
    await expect(scanButton).toBeEnabled();
    await scanButton.click();

    await expect(page.locator("button.gk-plot").first()).toBeVisible();
    const url = new URL(page.url());
    expect(url.searchParams.getAll("manifest")).toEqual([
      "packages/a/package.json",
      "services/c/requirements.txt",
    ]);
    const last = seen[seen.length - 1] as { manifests?: string[] };
    expect(last.manifests).toEqual(["packages/a/package.json", "services/c/requirements.txt"]);
  });

  test("sits under the empty graveyard, above the notes, in the first viewport, without layout shift", async ({ page }) => {
    const body = emptyBody(
      [noteOf("no-root-manifest", "No manifest was found at the repository root. Choose one of the manifests found in subfolders.")],
      CANDIDATES,
    );
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!s.hadRecentInput) w.__cls += s.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await mockScan(page, ok(body));
    await openResult(page, body);

    const fieldset = page.getByRole("group", { name: /Choose manifests to scan/ });
    await expect(fieldset).toBeVisible();
    await expect(fieldset).toBeInViewport();
    const picker = await fieldset.boundingBox();
    const notes = await page.getByRole("heading", { name: "The caretaker's notes" }).boundingBox();
    expect(picker).not.toBeNull();
    expect(notes).not.toBeNull();
    expect(picker!.y).toBeLessThan(notes!.y);
    await expect(page.getByRole("group", { name: /Choose manifests to scan/ })).toHaveCount(1);
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls).toBeLessThanOrEqual(0.01);
  });
});