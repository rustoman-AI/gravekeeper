import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Repo hygiene (polish-leftovers task 4.3; R3.4).
 * No Playwright spec file may start with a UTF-8 byte order mark (EF BB BF).
 */
const e2eDir = resolve(process.cwd(), "tests/e2e");
const files = readdirSync(e2eDir).filter((name) => name.endsWith(".ts"));

describe("repo hygiene", () => {
  it("finds the e2e spec files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("tests/e2e/%s has no UTF-8 BOM", (name) => {
    const bytes = readFileSync(resolve(e2eDir, name));
    const head = [...bytes.subarray(0, 3)];
    expect(head).not.toEqual([0xef, 0xbb, 0xbf]);
  });
});
