import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Requirements 16.1, 16.2, 16.5
const text = readFileSync(resolve(process.cwd(), "vitest.config.mts"), "utf8");

describe("vitest.config.mts", () => {
  it("does not use the vite-tsconfig-paths plugin", () => {
    expect(text).not.toContain("vite-tsconfig-paths");
  });

  it("uses the native Vite tsconfigPaths option", () => {
    expect(text).toContain("tsconfigPaths: true");
  });
});
