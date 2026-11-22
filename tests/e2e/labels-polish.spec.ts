import type { Page } from "@playwright/test";
import { loadScan } from "./support/fixtures";
import { mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

// polish-leftovers Requirements 2.2, 2.3, 2.4, 2.6, 2.10: grave labels never show an ellipsis, wrap after hyphens,
// and carry the full name in the SVG <title> whenever the text is cut.

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
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScan(page, respondWithFixture("request"));
  await page.goto(resultPath());
  await expect(page.locator(".gk-scene")).toBeVisible();
  await expect(page.locator("button.gk-plot")).toHaveCount(plotCount(), { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

interface LabelInfo {
  name: string;
  ariaLabel: string;
  title: string | null;
  textOverflow: string;
  lineClamp: string;
  display: string;
  fontSize: number;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  lines: number;
  firstLine: string;
}

async function collect(page: Page): Promise<LabelInfo[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll<HTMLElement>("button.gk-plot")).map((btn) => {
      const label = btn.querySelector<HTMLElement>(".gk-plot-label")!;
      const cs = getComputedStyle(label);
      const text = label.firstChild as Text;
      const name = label.textContent ?? "";
      // One client rect per line fragment; group by rounded top to count lines.
      const range = document.createRange();
      range.selectNodeContents(text);
      const rects = Array.from(range.getClientRects());
      const tops = Array.from(new Set(rects.map((r) => Math.round(r.top))));
      // Text of the first line: find the largest offset whose rect top is still the first line's top.
      let firstLine = "";
      if (tops.length > 0) {
        const r = document.createRange();
        for (let i = 1; i <= name.length; i++) {
          r.setStart(text, 0);
          r.setEnd(text, i);
          const last = Array.from(r.getClientRects()).pop();
          if (!last || Math.round(last.top) !== tops[0]) break;
          firstLine = name.slice(0, i);
        }
      }
      return {
        name,
        ariaLabel: btn.getAttribute("aria-label") ?? "",
        title: btn.querySelector("svg > title")?.textContent ?? null,
        textOverflow: cs.textOverflow,
        lineClamp: cs.getPropertyValue("-webkit-line-clamp"),
        display: cs.display,
        fontSize: parseFloat(cs.fontSize),
        scrollWidth: label.scrollWidth,
        clientWidth: label.clientWidth,
        scrollHeight: label.scrollHeight,
        clientHeight: label.clientHeight,
        lines: tops.length,
        firstLine,
      };
    });
  });
}

test.describe("grave labels", () => {
  test("no ellipsis, readable size, clean wrapping and full names for cut labels", async ({ page }) => {
    await openResults(page);
    await page.addStyleTag({ content: ".gk-plot-art{animation:none !important}" });
    const labels = await collect(page);
    expect(labels.length).toBe(plotCount());

    for (const l of labels) {
      expect(l.textOverflow, `${l.name} text-overflow`).not.toBe("ellipsis");
      expect(l.lineClamp === "none" || l.lineClamp === "" || l.lineClamp === "normal", `${l.name} line-clamp ${l.lineClamp}`).toBe(true);
      expect(l.display, `${l.name} display`).not.toMatch(/box/);
      expect(l.fontSize, `${l.name} font size`).toBeGreaterThanOrEqual(11);
      expect(l.scrollWidth, `${l.name} horizontal overflow (scrollWidth ${l.scrollWidth} > clientWidth ${l.clientWidth})`).toBeLessThanOrEqual(l.clientWidth);
    }

    const cut = labels.filter((l) => l.scrollHeight > l.clientHeight || l.scrollWidth > l.clientWidth);
    const missing = cut.filter((l) => l.title !== l.name);
    expect(
      missing.map((l) => ({ name: l.name, width: l.clientWidth, scrollHeight: l.scrollHeight, clientHeight: l.clientHeight, title: l.title })),
      "labels cut in the browser without a full-name svg > title (LABEL_CHAR_WIDTH_PX too low)",
    ).toEqual([]);
  });

  test("browserify-istanbul wraps to two lines after the hyphen and is fully visible", async ({ page }) => {
    await openResults(page);
    const l = (await collect(page)).find((x) => x.name === "browserify-istanbul");
    expect(l, "browserify-istanbul must be in the request fixture").toBeDefined();
    expect(l!.lines, JSON.stringify(l)).toBe(2);
    expect(l!.firstLine, JSON.stringify(l)).toBe("browserify-");
    expect(l!.scrollHeight, JSON.stringify(l)).toBeLessThanOrEqual(l!.clientHeight);
    expect(l!.scrollWidth, JSON.stringify(l)).toBeLessThanOrEqual(l!.clientWidth);
  });

  test("karma-phantomjs-launcher keeps its full name in the accessible name and svg title", async ({ page }) => {
    await openResults(page);
    const name = "karma-phantomjs-launcher";
    const l = (await collect(page)).find((x) => x.name === name);
    expect(l, "karma-phantomjs-launcher must be in the request fixture").toBeDefined();
    expect(l!.ariaLabel).toContain(name);
    expect(l!.title).toBe(name);
    const button = page.locator("button.gk-plot", { has: page.locator(".gk-plot-label", { hasText: name }) }).first();
    await expect(button).toHaveAccessibleName(new RegExp(name));
  });
});
