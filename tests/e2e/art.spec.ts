import type { Page } from "@playwright/test";
import { expectNoA11yViolations } from "./support/a11y";
import { loadScan } from "./support/fixtures";
import { mockScan, respondWithFixture, withDelay } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 1.2, 2.2, 2.4, 2.7, 3.6, 12.2, 13.6, 18.5.

const REPO_URL = "https://github.com/request/request";

function resultPath(): string {
  const { repo } = loadScan("request") as unknown as { repo: { owner: string; repo: string } };
  return `/?repo=${encodeURIComponent(`https://github.com/${repo.owner}/${repo.repo}`)}`;
}

function plotCount(): number {
  const body = loadScan("request") as unknown as {
    assessed?: { dependency: { ecosystem: string; name: string } }[];
  };
  return new Set((body.assessed ?? []).map((a) => `${a.dependency.ecosystem}:${a.dependency.name}`)).size;
}

async function openResults(page: Page): Promise<void> {
  await mockScan(page, respondWithFixture("request"));
  await page.goto(resultPath());
  await expect(page.locator(".gk-scene")).toBeVisible();
  await expect(page.locator("button.gk-plot")).toHaveCount(plotCount(), { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

interface PlotInfo {
  y: number;
  scale: number;
  tilt: number;
  box: [number, number, number, number];
}

function readPlots(page: Page): Promise<PlotInfo[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("button.gk-plot")).map((el) => {
      const num = (v: string, d: number) => {
        const n = parseFloat(v);
        return Number.isNaN(n) ? d : n;
      };
      const r = el.getBoundingClientRect();
      return {
        y: num(el.style.getPropertyValue("--y"), 0),
        scale: num(el.style.getPropertyValue("--depth-scale"), 1),
        tilt: num(el.style.getPropertyValue("--tilt"), 0),
        box: [r.x + window.scrollX, r.y + window.scrollY, r.width, r.height] as [number, number, number, number],
      };
    }),
  );
}

test.describe("art", () => {
  test("the scene stage is as wide as the viewport and has one backdrop", async ({ page }) => {
    await openResults(page);
    const stage = await page.locator(".gk-stage").boundingBox();
    const viewport = page.viewportSize();
    expect(stage).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(stage!.x).toBeCloseTo(0, 0);
    // The stage may lose a classic scrollbar's width at most.
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(stage!.width, `stage ${stage!.width} viewport ${viewport!.width} client ${clientWidth}`).toBeGreaterThanOrEqual(
      clientWidth - 1,
    );
    await expect(page.locator("svg.gk-backdrop")).toHaveCount(1);
  });

  // art-polish Requirements 1.1, 1.2: the first plots overlap the Backdrop and stand in front of it.
  test("the first plot overlaps the backdrop and the backdrop sits behind the plot", async ({ page }) => {
    await openResults(page);
    // Ghost drift animates the art box; measure the resting layout.
    await page.addStyleTag({ content: ".gk-plot-art{animation:none !important}" });
    const backdrop = await page.locator(".gk-backdrop").first().boundingBox();
    const art = await page.locator("button.gk-plot .gk-plot-art").first().boundingBox();
    expect(backdrop).not.toBeNull();
    expect(art).not.toBeNull();
    expect(art!.y, `art ${JSON.stringify(art)} backdrop ${JSON.stringify(backdrop)}`).toBeLessThan(
      backdrop!.y + backdrop!.height,
    );
    const zIndex = await page.locator(".gk-backdrop").first().evaluate((el) => getComputedStyle(el).zIndex);
    expect(zIndex).toBe("-1");
    const width = page.viewportSize()!.width;
    const padTop = await page.locator(".gk-stage").first().evaluate((el) => getComputedStyle(el).paddingTop);
    expect(padTop, `viewport width ${width}`).toBe(width >= 1000 ? "104px" : "14px");
  });

  test("two fog layers have opacity 0.25 and 0.35", async ({ page }) => {
    await openResults(page);
    const opacity = (sel: string) =>
      page.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).opacity));
    // The drift animation may be running, so read the declared opacity with animations paused.
    await page.addStyleTag({ content: ".gk-fog{animation:none !important}" });
    expect(await opacity(".gk-fog-low")).toBeCloseTo(0.25, 5);
    expect(await opacity(".gk-fog-high")).toBeCloseTo(0.35, 5);
    await expect(page.locator(".gk-scene .gk-fog")).toHaveCount(2);
  });

  test("tilt stays within 6 degrees and back-row plots are smaller than front-row plots", async ({ page }) => {
    await openResults(page);
    const plots = await readPlots(page);
    expect(plots.length).toBeGreaterThan(0);
    for (const p of plots) {
      expect(p.tilt).toBeGreaterThanOrEqual(-6);
      expect(p.tilt).toBeLessThanOrEqual(6);
    }
    const minY = Math.min(...plots.map((p) => p.y));
    const maxY = Math.max(...plots.map((p) => p.y));
    expect(maxY).toBeGreaterThan(minY);
    const back = plots.filter((p) => p.y === minY);
    const front = plots.filter((p) => p.y === maxY);
    const backScale = Math.max(...back.map((p) => p.scale));
    const frontScale = Math.min(...front.map((p) => p.scale));
    expect(backScale, `back ${backScale} front ${frontScale}`).toBeLessThan(frontScale);
  });

  test("no plot layout box changes between two loads", async ({ page }) => {
    await openResults(page);
    const first = await readPlots(page);
    await page.reload();
    await expect(page.locator("button.gk-plot")).toHaveCount(plotCount(), { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const second = await readPlots(page);
    expect(second.map((p) => p.box)).toEqual(first.map((p) => p.box));
  });

  test("results scene has no axe violations", async ({ page }) => {
    await openResults(page);
    await expectNoA11yViolations(page, "art-results-scene", test.info().project.name);
  });

  test("reduced motion: fog, ghost, lantern and caretaker have no animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const animationNames = (sel: string) =>
      page.locator(sel).evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));

    // Caretaker on the scanning screen.
    await mockScan(page, withDelay(1500, respondWithFixture("synthetic-restless")));
    await page.goto("/");
    await page.getByLabel("GitHub repository URL").fill(REPO_URL);
    await page.getByRole("button", { name: "Dig up" }).click();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    const caretaker = await animationNames(".gk-caretaker, .gk-caretaker *");
    expect(caretaker.length).toBeGreaterThan(0);
    expect(caretaker.every((n) => n === "none")).toBe(true);

    // Fog, ghost, restless and lantern on the results scene.
    await expect(page.locator(".gk-scene")).toBeVisible();
    await expect(page.locator("button.gk-plot").first()).toBeVisible();
    const fog = await animationNames(".gk-fog");
    expect(fog.length).toBe(2);
    expect(fog.every((n) => n === "none")).toBe(true);
    for (const kind of ["ghost", "lantern"]) {
      const names = await animationNames(`.gk-plot[data-kind="${kind}"] .gk-plot-art`);
      expect(names.length, `no ${kind} plot rendered`).toBeGreaterThan(0);
      expect(names.every((n) => n === "none")).toBe(true);
    }
  });
});
