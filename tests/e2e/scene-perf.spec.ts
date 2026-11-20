import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { SCENE_RENDER_BUDGET_MS } from "../../view-model";
import { loadScan, type FixtureName } from "./support/fixtures";
import { mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 8.10, 17.1, 20.8: scene render budget under CPU throttling.

// Test-owned constants (requirements table: tests).
const SCENE_PERF_CPU_THROTTLE = 4;
const SCENE_PERF_RUNS = 5;
// Graveyard art Requirements 14.1, 14.2: the 300-plot (synthetic) median must stay within
// GA_RENDER_REGRESSION_MAX_MS of the Milestone 1 median (docs/milestone-1-report.md, 65.4 ms).
const M1_SCENE_BASELINE_MS = 65.4;
const GA_RENDER_REGRESSION_MAX_MS = 15;
const M3_MEASUREMENTS_FILE = path.join(
  process.cwd(),
  "test-results",
  "m3-measurements.json",
);

const MEASUREMENTS_FILE = path.join(
  process.cwd(),
  "test-results",
  "m1-measurements.json",
);

type SceneMeasure = {
  medianMs: number;
  runs: number;
  runsMs: number[];
  throttle: number;
};

const measured: Partial<Record<"request" | "synthetic300", SceneMeasure>> = {};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function repoUrlOf(name: FixtureName): string {
  const body = loadScan(name) as { repo?: { owner?: string; repo?: string } };
  const { owner, repo } = body.repo ?? {};
  if (!owner || !repo) throw new Error(`fixture ${name} has no repo`);
  return `https://github.com/${owner}/${repo}`;
}

async function measureRuns(
  page: Page,
  fixture: FixtureName,
): Promise<SceneMeasure> {
  await page.addInitScript(() => {
    window.__GK_PERF__ = true;
  });
  await mockScan(page, respondWithFixture(fixture));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", {
    rate: SCENE_PERF_CPU_THROTTLE,
  });

  const url = `/?repo=${encodeURIComponent(repoUrlOf(fixture))}`;
  const runsMs: number[] = [];
  for (let i = 0; i < SCENE_PERF_RUNS; i += 1) {
    // A blank page between runs makes every run a fresh load with a cold scene.
    await page.goto("about:blank");
    await page.goto(url);
    await page.waitForFunction(
      () => performance.getEntriesByName("gk-scene").length > 0,
      undefined,
      { timeout: 30_000 },
    );
    const duration = await page.evaluate(
      () => performance.getEntriesByName("gk-scene")[0].duration,
    );
    runsMs.push(duration);
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await cdp.detach();
  return {
    medianMs: median(runsMs),
    runs: SCENE_PERF_RUNS,
    runsMs,
    throttle: SCENE_PERF_CPU_THROTTLE,
  };
}

/** Merges `scenePerf` into test-results/m3-measurements.json, keeping other keys. */
function writeM3ScenePerf(): void {
  let existing: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(M3_MEASUREMENTS_FILE, "utf8"));
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  } catch {
    existing = {};
  }
  existing.scenePerf = {
    baselineMs: M1_SCENE_BASELINE_MS,
    regressionMaxMs: GA_RENDER_REGRESSION_MAX_MS,
    ...measured,
  };
  mkdirSync(path.dirname(M3_MEASUREMENTS_FILE), { recursive: true });
  writeFileSync(M3_MEASUREMENTS_FILE, `${JSON.stringify(existing, null, 2)}\n`);
}

test.describe("scene render budget", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "perf",
      "render budget is measured on the dedicated perf project",
    );
  });

  test("the 300-package scene commits within the budget at the throttled CPU rate", async ({
    page,
  }) => {
    const result = await measureRuns(page, "synthetic-300");
    measured.synthetic300 = result;
    console.log(
      `scene-perf synthetic-300 runs=${JSON.stringify(result.runsMs)} median=${result.medianMs}`,
    );
    expect(
      result.medianMs,
      `median of ${SCENE_PERF_RUNS} runs at ${SCENE_PERF_CPU_THROTTLE}x CPU slowdown, runs ${JSON.stringify(result.runsMs)}`,
    ).toBeLessThanOrEqual(SCENE_RENDER_BUDGET_MS);
    expect(
      result.medianMs,
      `median ${result.medianMs} ms exceeds the Milestone 1 baseline ${M1_SCENE_BASELINE_MS} ms by more than GA_RENDER_REGRESSION_MAX_MS (${GA_RENDER_REGRESSION_MAX_MS} ms), runs ${JSON.stringify(result.runsMs)}`,
    ).toBeLessThanOrEqual(M1_SCENE_BASELINE_MS + GA_RENDER_REGRESSION_MAX_MS);
  });

  test("the 40-plot request scene is measured and recorded", async ({
    page,
  }) => {
    const result = await measureRuns(page, "request");
    measured.request = result;
    console.log(
      `scene-perf request runs=${JSON.stringify(result.runsMs)} median=${result.medianMs}`,
    );
    expect(result.runsMs).toHaveLength(SCENE_PERF_RUNS);
  });

  test.afterAll(() => {
    if (!measured.request && !measured.synthetic300) return;
    let existing: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(
        readFileSync(MEASUREMENTS_FILE, "utf8"),
      );
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      existing = {};
    }
    const previous =
      existing.sceneRender !== null && typeof existing.sceneRender === "object"
        ? (existing.sceneRender as Record<string, unknown>)
        : {};
    existing.sceneRender = { ...previous, ...measured };
    mkdirSync(path.dirname(MEASUREMENTS_FILE), { recursive: true });
    writeFileSync(MEASUREMENTS_FILE, `${JSON.stringify(existing, null, 2)}\n`);
    if (process.env.M3_REPORT === "1") writeM3ScenePerf();
  });
});
