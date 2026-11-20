import { loadScan, type FixtureName } from "./support/fixtures";
import { mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 17.3, 17.6, 20.7: cumulative layout shift of the rendered results.

// Test-owned constant (requirements table: tests).
const RESULTS_CLS_MAX = 0.01;

type ShiftRecord = { value: number; startTime: number; sources: string[] };

declare global {
  interface Window {
    __gkShifts?: ShiftRecord[];
  }
}

const FIXTURES: readonly FixtureName[] = [
  "request",
  "canopy",
  "zoxide",
  "synthetic-300",
];

function repoUrlOf(name: FixtureName): string {
  const body = loadScan(name) as { repo?: { owner?: string; repo?: string } };
  const { owner, repo } = body.repo ?? {};
  if (!owner || !repo) throw new Error(`fixture ${name} has no repo`);
  return `https://github.com/${owner}/${repo}`;
}

function rowCountOf(name: FixtureName): number {
  // One plot per package: the same package in several scopes shares a plot.
  const body = loadScan(name) as {
    assessed?: { dependency: { ecosystem: string; name: string } }[];
  };
  return new Set(
    (body.assessed ?? []).map(
      (a) => `${a.dependency.ecosystem}:${a.dependency.name}`,
    ),
  ).size;
}

test.describe("results layout shift", () => {
  test.setTimeout(90_000);

  for (const fixture of FIXTURES) {
    test(`${fixture} results shift at most RESULTS_CLS_MAX`, async ({
      page,
    }, testInfo) => {
      await page.addInitScript(() => {
        window.__gkShifts = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
              sources?: { node: Node | null }[];
            };
            if (shift.hadRecentInput) continue;
            window.__gkShifts?.push({
              value: shift.value,
              startTime: shift.startTime,
              sources: (shift.sources ?? []).map((s) => {
                const n = s.node;
                if (!n) return "(removed node)";
                if (n.nodeType !== 1) return n.nodeName;
                const el = n as Element;
                return `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").trim().replace(/\s+/g, ".")}`;
              }),
            });
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      await mockScan(page, respondWithFixture(fixture));
      await page.goto(`/?repo=${encodeURIComponent(repoUrlOf(fixture))}`);

      // Windowed bands fill in after a timer; wait until every plot is mounted.
      const rows = rowCountOf(fixture);
      expect(rows).toBeGreaterThan(0);
      await expect(page.locator("button.gk-plot")).toHaveCount(rows, {
        timeout: 60_000,
      });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve()),
            ),
          ),
      );
      await page.waitForTimeout(500);

      const shifts = await page.evaluate(() => window.__gkShifts ?? []);
      const total = shifts.reduce((sum, s) => sum + s.value, 0);
      console.log(
        `layout-shift ${fixture} [${testInfo.project.name}] cls=${total} entries=${shifts.length}`,
      );
      expect(
        total,
        `CLS ${total} for ${fixture}; shifts: ${JSON.stringify(shifts)}`,
      ).toBeLessThanOrEqual(RESULTS_CLS_MAX);
    });
  }
});
