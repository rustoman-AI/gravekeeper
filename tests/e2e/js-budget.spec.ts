import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page, Response } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { CLIENT_JS_BUDGET_BYTES } from "../../view-model";
import { loadScan, type FixtureName } from "./support/fixtures";
import { mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 17.2, 17.7, 20.9: measured client JavaScript budget, lazy chunks.
// Gzip is computed here (level 9, same helper as the static gate) because `next start`
// may or may not compress depending on Accept-Encoding; `response.body()` is always decoded.

const MEASUREMENTS_FILE = path.join(
  process.cwd(),
  "test-results",
  "m1-measurements.json",
);
const FEATURED: FixtureName = "request";

// Same method as scripts/check-client-js-budget.ts (that module uses import.meta, which the
// Playwright loader cannot import, so the small helpers are repeated here).
type ChunkFile = { file: string; bytes: Uint8Array };
type ChunkSize = { file: string; gzipBytes: number };

function urlToNextFile(pathname: string): string | undefined {
  const idx = pathname.indexOf("/_next/");
  const rel = idx >= 0 ? pathname.slice(idx + "/_next/".length) : undefined;
  return rel?.endsWith(".js") ? rel : undefined;
}

function sumGzipBytes(files: readonly ChunkFile[]): { total: number; chunks: ChunkSize[] } {
  const seen = new Set<string>();
  const chunks: ChunkSize[] = [];
  for (const f of files) {
    if (seen.has(f.file)) continue;
    seen.add(f.file);
    chunks.push({ file: f.file, gzipBytes: gzipSync(f.bytes, { level: 9 }).length });
  }
  return { total: chunks.reduce((s, c) => s + c.gzipBytes, 0), chunks };
}

function largestChunks(chunks: readonly ChunkSize[], count = 5): ChunkSize[] {
  return [...chunks]
    .sort((a, b) => b.gzipBytes - a.gzipBytes || a.file.localeCompare(b.file))
    .slice(0, count);
}

function budgetVerdict(total: number, budget: number) {
  return { ok: total <= budget, total, budget, margin: budget - total };
}

function budgetMessage(
  verdict: { ok: boolean; total: number; budget: number; margin: number },
  chunks: readonly ChunkSize[],
): string {
  const top = largestChunks(chunks)
    .map((c) => `  ${c.gzipBytes} B  ${c.file}`)
    .join("\n");
  const head = verdict.ok
    ? `Client JS within budget: total ${verdict.total} B gzip, CLIENT_JS_BUDGET_BYTES ${verdict.budget} B, margin ${verdict.margin} B.`
    : `Client JS over budget: total ${verdict.total} B gzip exceeds CLIENT_JS_BUDGET_BYTES ${verdict.budget} B by ${-verdict.margin} B.`;
  return `${head}\nFive largest chunks:\n${top}`;
}

function repoUrlOf(name: FixtureName): string {
  const body = loadScan(name) as { repo?: { owner?: string; repo?: string } };
  const { owner, repo } = body.repo ?? {};
  if (!owner || !repo) throw new Error(`fixture ${name} has no repo`);
  return `https://github.com/${owner}/${repo}`;
}

/** Records every JavaScript response; bodies are read lazily by `drain`. */
function recordScripts(page: Page) {
  const pending: Array<Promise<ChunkFile | undefined>> = [];
  page.on("response", (response: Response) => {
    const url = response.url();
    const file = urlToNextFile(new URL(url).pathname);
    if (!file) return;
    pending.push(
      response.body().then(
        (bytes) => ({ file, bytes }),
        () => undefined,
      ),
    );
  });
  return {
    async drain(): Promise<ChunkFile[]> {
      const done = await Promise.all(pending.splice(0));
      return done.filter((f): f is ChunkFile => f !== undefined);
    },
  };
}

test.describe("client JavaScript budget", () => {
  test.setTimeout(90_000);
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "the JavaScript budget is measured on the desktop project",
    );
  });

  test("the results Scene loads within the gzip budget and lazy chunks wait for use", async ({
    page,
  }) => {
    const scripts = recordScripts(page);
    await mockScan(page, respondWithFixture(FEATURED));
    await page.goto(`/?repo=${encodeURIComponent(repoUrlOf(FEATURED))}`);
    await expect(page.locator(".gk-scene")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await page.getByRole("dialog").count()).toBe(0);

    const initial = await scripts.drain();
    const { total, chunks } = sumGzipBytes(initial);
    const verdict = budgetVerdict(total, CLIENT_JS_BUDGET_BYTES);
    const largest = largestChunks(chunks);
    expect(chunks.length, "no JavaScript responses were recorded").toBeGreaterThan(0);

    // Merge into test-results/m1-measurements.json (read-modify-write once, keep other keys).
    let existing: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(readFileSync(MEASUREMENTS_FILE, "utf8"));
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      existing = {};
    }
    existing.clientJs = {
      gzipBytes: total,
      budget: CLIENT_JS_BUDGET_BYTES,
      margin: verdict.margin,
      files: chunks.length,
      largest: largest.map((c) => ({ file: c.file, gzipBytes: c.gzipBytes })),
    };
    mkdirSync(path.dirname(MEASUREMENTS_FILE), { recursive: true });
    writeFileSync(MEASUREMENTS_FILE, `${JSON.stringify(existing, null, 2)}\n`);

    expect(total, budgetMessage(verdict, chunks)).toBeLessThanOrEqual(
      CLIENT_JS_BUDGET_BYTES,
    );

    const initialFiles = new Set(chunks.map((c) => c.file));

    // List chunk: not requested on the Scene load, requested when List opens.
    const isNewChunk = (r: Response): boolean => {
      const file = urlToNextFile(new URL(r.url()).pathname);
      return file !== undefined && !initialFiles.has(file);
    };
    await Promise.all([
      page.waitForResponse(isNewChunk),
      page.getByRole("button", { name: "List", exact: true }).click(),
    ]);
    await expect(page.getByRole("list").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    const listChunks = (await scripts.drain())
      .map((f) => f.file)
      .filter((f) => !initialFiles.has(f));
    expect(listChunks, "opening List should request a lazy list chunk").not.toHaveLength(0);
    listChunks.forEach((f) => initialFiles.add(f));

    // Detail chunk: not requested until a plot is opened.
    await page.getByRole("button", { name: "Scene", exact: true }).click();
    await Promise.all([
      page.waitForResponse(isNewChunk),
      page.locator("button.gk-plot").first().click(),
    ]);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const detailChunks = (await scripts.drain())
      .map((f) => f.file)
      .filter((f) => !initialFiles.has(f));
    expect(
      detailChunks,
      "opening a plot should request a lazy detail chunk",
    ).not.toHaveLength(0);
  });

  // The repository picker (Requirement 17.7) does not exist until Milestone 2, so there is
  // no picker chunk to observe yet. Not asserted here rather than inventing it.
  test.skip("the picker chunk is not requested before the picker opens", () => {});
});
