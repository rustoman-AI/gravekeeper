import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect } from "./test";

export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export type A11yScreenResult = {
  screen: string;
  project: string;
  url: string;
  violationCount: number;
  ruleIds: string[];
};

const OUT_DIR = path.join(process.cwd(), "test-results", "a11y");

function slug(text: string): string {
  return text.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "screen";
}

/**
 * Runs axe-core (WCAG 2.2 A and AA tags) on the page, records the result in
 * `test-results/a11y/<project>__<screen>.json` and fails on any violation.
 * Violations print as `rule id: node target`.
 */
export async function expectNoA11yViolations(
  page: Page,
  screenName: string,
  projectName = "default",
): Promise<A11yScreenResult> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const record: A11yScreenResult = {
    screen: screenName,
    project: projectName,
    url: page.url(),
    violationCount: results.violations.length,
    ruleIds: results.violations.map((v) => v.id),
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, `${slug(projectName)}__${slug(screenName)}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
  );

  const lines: string[] = [];
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      lines.push(`${violation.id}: ${node.target.join(" ")}`);
    }
  }
  if (lines.length > 0) {
    console.log(`axe violations on "${screenName}" (${page.url()}):\n${lines.join("\n")}`);
  }
  expect(lines, `axe violations on "${screenName}"`).toEqual([]);
  return record;
}
