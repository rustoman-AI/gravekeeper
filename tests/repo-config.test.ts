import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const root = resolve(__dirname, "..");
const read = (f: string) => readFileSync(resolve(root, f), "utf8");

describe("repo configuration", () => {
  const ignoreLines = read(".gitignore")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  it(".gitignore lists node_modules, .next and .env*", () => {
    const norm = ignoreLines.map((l) => l.replace(/^\//, "").replace(/\/$/, ""));
    expect(norm).toContain("node_modules");
    expect(norm).toContain(".next");
    expect(norm).toContain(".env*");
  });

  it(".gitignore lists the TypeScript build info file", () => {
    expect(ignoreLines).toContain("tsconfig.tsbuildinfo");
  });

  it(".gitignore does not contain .kiro", () => {
    expect(read(".gitignore")).not.toContain(".kiro");
  });

  it("package.json pins smol-toml to an exact version", () => {
    const pkg = JSON.parse(read("package.json"));
    const version = pkg.dependencies?.["smol-toml"];
    expect(version).toBeDefined();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("tsconfig.json has strict: true", () => {
    const { config, error } = ts.parseConfigFileTextToJson(
      "tsconfig.json",
      read("tsconfig.json"),
    );
    expect(error).toBeUndefined();
    expect(config.compilerOptions.strict).toBe(true);
  });
});
