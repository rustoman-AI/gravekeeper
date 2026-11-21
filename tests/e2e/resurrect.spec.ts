import type { Locator, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expectNoA11yViolations } from "./support/a11y";
import { loadScan, type FixtureName } from "./support/fixtures";
import { mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

// resurrect Requirements 13.1, 13.7, 15.1 to 15.8.

type CuratedEntry = { ecosystem: string; from: string; to: string[] };

const CURATED: CuratedEntry[] = (
  JSON.parse(readFileSync(path.join(process.cwd(), "data", "resurrections.json"), "utf8")) as {
    entries: CuratedEntry[];
  }
).entries;

function normalize(ecosystem: string, name: string): string {
  if (ecosystem === "pypi") return name.toLowerCase().replace(/[-_.]+/g, "-");
  if (ecosystem === "cargo") return name.toLowerCase().replace(/_/g, "-");
  return name;
}

function curatedFor(ecosystem: string, name: string): CuratedEntry | undefined {
  return CURATED.find(
    (e) => e.ecosystem === ecosystem && normalize(ecosystem, e.from) === normalize(ecosystem, name),
  );
}

type FixtureHint = { kind: string; text: string };

function hintsOf(fixture: FixtureName, name: string): FixtureHint[] {
  const body = loadScan(fixture);
  const deps = body["dependencies"] as Array<{ dependency: { name: string }; hints?: FixtureHint[] }>;
  const dep = deps.find((d) => d.dependency.name === name);
  if (dep === undefined) throw new Error(`${name} missing from fixture ${fixture}`);
  return dep.hints ?? [];
}

async function openScan(page: Page, fixture: FixtureName, repo: string): Promise<void> {
  await mockScan(page, respondWithFixture(fixture));
  await page.goto("/");
  await page.getByLabel("GitHub repository URL").fill(`https://github.com/${repo}`);
  await page.getByRole("button", { name: "Dig up" }).click();
  await expect(page.locator("button.gk-plot").first()).toBeVisible();
}

async function openPackage(page: Page, name: string): Promise<Locator> {
  await page
    .locator("button.gk-plot", { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: new RegExp(name) });
  await expect(dialog).toBeVisible();
  return dialog;
}

const slotOf = (dialog: Locator): Locator => dialog.locator('[data-slot="resurrect"]');

test.describe("resurrect slot (request fixture)", () => {
  test.beforeEach(async ({ page }) => {
    await openScan(page, "request", "request/request");
  });

  test("har-validator: buried, shows the deprecation text and its label", async ({ page }) => {
    const dialog = await openPackage(page, "har-validator");
    const slot = slotOf(dialog);
    await expect(slot).toBeVisible();
    await expect(slot.getByRole("heading", { level: 3, name: "Resurrect" })).toBeVisible();
    const hints = hintsOf("request", "har-validator");
    expect(hints).toHaveLength(1);
    expect(hints[0]!.text).toContain("this library is no longer supported");
    await expect(slot.getByText("From the package's deprecation notice", { exact: true })).toBeVisible();
    await expect(slot.locator(".gk-resurrect-text").first()).toHaveText(hints[0]!.text);
    // The slot has a hint, so no fallback paragraph shows.
    await expect(slot.locator(".gk-resurrect-fallback")).toHaveCount(0);
    const entry = curatedFor("npm", "har-validator");
    if (entry === undefined) {
      await expect(slot.locator(".gk-resurrect-suggestion")).toHaveCount(0);
      await expect(slot.locator("pre")).toHaveCount(0);
    } else {
      await expect(slot.getByText("From the caretaker's list", { exact: true })).toBeVisible();
      for (const to of entry.to) {
        await expect(slot.locator(".gk-resurrect-name code", { hasText: new RegExp(`^${to}$`) })).toBeVisible();
      }
    }
    await expectNoA11yViolations(page, "resurrect-har-validator", test.info().project.name);
  });

  test("aws-sign2: forgotten paragraph, no pre, no Copy button", async ({ page }) => {
    const dialog = await openPackage(page, "aws-sign2");
    const slot = slotOf(dialog);
    await expect(slot).toBeVisible();
    if (curatedFor("npm", "aws-sign2") === undefined) {
      await expect(slot).toContainText("No notice and no recommended replacement is on record for this package.");
      await expect(slot).toContainText("It may be finished and need no change.");
      await expect(slot.locator("pre")).toHaveCount(0);
      await expect(slot.getByRole("button", { name: /^Copy commands/ })).toHaveCount(0);
      await expect(slot.getByRole("button", { name: "Copy" })).toHaveCount(0);
    }
    await expectNoA11yViolations(page, "resurrect-aws-sign2", test.info().project.name);
  });

  test("uuid: restless shows the urgent sentence first, then the buried paragraph", async ({ page }) => {
    const dialog = await openPackage(page, "uuid");
    const slot = slotOf(dialog);
    await expect(slot).toBeVisible();
    const urgent = slot.locator(".gk-resurrect-urgent");
    await expect(urgent).toHaveText(/^This package (has \d+ open vulnerabilit(y|ies)|is haunted by open vulnerabilities), so moving off it is urgent\.$/);
    expect(hintsOf("request", "uuid")).toHaveLength(0);
    expect(curatedFor("npm", "uuid")).toBeUndefined();
    const fallback = slot.locator(".gk-resurrect-fallback");
    await expect(fallback).toContainText("No notice text and no recommended replacement is on record.");
    const u = await urgent.boundingBox();
    const f = await fallback.boundingBox();
    expect(u).not.toBeNull();
    expect(f).not.toBeNull();
    expect(u!.y).toBeLessThan(f!.y);
    await expect(slot.locator("pre")).toHaveCount(0);
    await expectNoA11yViolations(page, "resurrect-uuid", test.info().project.name);
  });
});

test.describe("resurrect slot (zoxide fixture)", () => {
  test.beforeEach(async ({ page }) => {
    await openScan(page, "zoxide", "ajeetdsouza/zoxide");
  });

  test("bincode: advisory text is plain text and the cargo commands match the curated entry", async ({ page }) => {
    const dialog = await openPackage(page, "bincode");
    const slot = slotOf(dialog);
    await expect(slot).toBeVisible();
    const hints = hintsOf("zoxide", "bincode");
    expect(hints).toHaveLength(1);
    expect(hints[0]!.kind).toBe("advisory-notice");
    await expect(slot.getByText("From an advisory that marks this crate unmaintained", { exact: true })).toBeVisible();
    const text = slot.locator(".gk-resurrect-text").first();
    await expect(text).toHaveText(hints[0]!.text);
    await expect(text.locator("a")).toHaveCount(0);
    await expect(slot.getByRole("link", { name: "Read the advisory" })).toBeVisible();

    const entry = curatedFor("cargo", "bincode");
    if (entry !== undefined) {
      const pre = slot.locator("pre").first();
      await expect(pre).toBeVisible();
      const lines = ((await pre.textContent()) ?? "").split("\n");
      expect(lines[0]).toBe("cargo remove bincode");
      expect(lines[1]).toMatch(/^cargo add( --\w+)? \S+$/);
      for (const to of entry.to) {
        await expect(slot.getByRole("button", { name: `Copy commands for ${to}` })).toBeVisible();
      }
    }
    await expectNoA11yViolations(page, "resurrect-bincode", test.info().project.name);
  });

  test("keyboard: Tab reaches the Copy button and Enter copies", async ({ page, context }, info) => {
    const desktop = info.project.name === "desktop";
    if (desktop) await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const entry = curatedFor("cargo", "bincode");
    test.skip(entry === undefined, "no curated entry for bincode");
    const first = entry!.to[0]!;
    const dialog = await openPackage(page, "bincode");
    const slot = slotOf(dialog);
    const button = slot.getByRole("button", { name: `Copy commands for ${first}` });
    await expect(button).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).focus();
    let reached = false;
    for (let i = 0; i < 60 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await button.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "Tab reaches the Copy button").toBe(true);
    if (!desktop) return;
    await page.keyboard.press("Enter");
    await expect(slot.getByRole("status")).toHaveText(`Copied the commands for ${first}`);
    const shown = (await button.locator("xpath=ancestor::div[contains(@class,'gk-resurrect-block')]//pre").textContent()) ?? "";
    // The Windows clipboard returns CRLF line breaks; compare the lines.
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip.split(/\r?\n/)).toEqual(shown.split("\n"));
  });

  test("copy: the clipboard text equals the displayed lines", async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop", "clipboard permissions: desktop project only");
    const entry = curatedFor("cargo", "bincode");
    test.skip(entry === undefined, "no curated entry for bincode");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const first = entry!.to[0]!;
    const dialog = await openPackage(page, "bincode");
    const slot = slotOf(dialog);
    const button = slot.getByRole("button", { name: `Copy commands for ${first}` });
    await button.click();
    await expect(slot.getByRole("status")).toHaveText(`Copied the commands for ${first}`);
    const shown = (await button.locator("xpath=ancestor::div[contains(@class,'gk-resurrect-block')]//pre").textContent()) ?? "";
    expect(shown.startsWith("cargo remove bincode\n")).toBe(true);
    // The Windows clipboard returns CRLF line breaks; compare the lines.
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip.split(/\r?\n/)).toEqual(shown.split("\n"));
  });
});

test.describe("resurrect slot absence (synthetic-restless)", () => {
  test.beforeEach(async ({ page }) => {
    await openScan(page, "synthetic-restless", "example/synthetic-restless");
  });

  for (const [kind, name] of [
    ["lantern", "lantern-one"],
    ["ghost", "ghost-one"],
  ] as const) {
    test(`${kind}: ${name} shows no slot`, async ({ page }) => {
      await page.locator(`button.gk-plot[data-kind="${kind}"]`).first().click();
      const dialog = page.getByRole("dialog", { name: new RegExp(name) });
      await expect(dialog).toBeVisible();
      await expect(slotOf(dialog)).toHaveCount(0);
      await expect(dialog.getByRole("heading", { name: "Resurrect" })).toHaveCount(0);
      await expectNoA11yViolations(page, `resurrect-absent-${kind}`, test.info().project.name);
    });
  }

  test("restless: shows the slot", async ({ page }) => {
    await page.locator('button.gk-plot[data-kind="restless"]').first().click();
    const dialog = page.getByRole("dialog", { name: /restless-one/ });
    await expect(slotOf(dialog)).toBeVisible();
  });
});
