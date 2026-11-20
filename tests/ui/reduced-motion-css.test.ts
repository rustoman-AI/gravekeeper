import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Reduced-motion style test (graveyard-ui task 21.3; R8.6, R8.7, R16.6, R17.4).
 * Parses app/globals.css with comment stripping and brace matching.
 */

interface Block {
  prelude: string;
  body: string;
}

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Splits `source` into its top-level `prelude { body }` blocks (brace matching). */
function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      if (depth === 0) {
        bodyStart = i + 1;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        blocks.push({
          prelude: source.slice(preludeStart, bodyStart - 1).trim(),
          body: source.slice(bodyStart, i),
        });
        preludeStart = i + 1;
      }
    } else if (ch === ";" && depth === 0) {
      preludeStart = i + 1; // e.g. `@import "tailwindcss";`
    }
  }
  expect(depth, "unbalanced braces in globals.css").toBe(0);
  return blocks;
}

/** Declarations (`name: value`) directly inside a rule body. */
function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of body.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    out.set(part.slice(0, idx).trim().toLowerCase(), part.slice(idx + 1).trim().toLowerCase());
  }
  return out;
}

const topLevel = parseBlocks(css);
const mediaBlocks = topLevel.filter((b) =>
  /^@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)$/i.test(b.prelude.replace(/\s+/g, " ")),
);
const isNone = (v: string | undefined) => v !== undefined && /^none(\s*!important)?$/.test(v);

describe("app/globals.css reduced motion", () => {
  it("has exactly one prefers-reduced-motion: reduce block", () => {
    expect(mediaBlocks).toHaveLength(1);
  });

  it("disables animation and transition for the scene, fog and scanning classes", () => {
    const rules = parseBlocks(mediaBlocks[0].body);
    const disabling = rules.filter((r) => {
      const d = declarations(r.body);
      return isNone(d.get("animation")) && isNone(d.get("transition"));
    });
    const selectors = disabling.flatMap((r) => r.prelude.split(",").map((s) => s.trim()));

    const required = [
      ".gk-scene",
      ".gk-scene *",
      ".gk-plot-art",
      ".gk-fog",
      ".gk-fog-b",
      ".gk-scanning",
      ".gk-caretaker",
      ".gk-stone-glow",
    ];
    for (const sel of required) {
      expect(
        selectors.some((s) => s === sel || (sel === ".gk-plot-art" && s.endsWith(".gk-plot-art"))),
        `reduced-motion block must disable animation and transition for ${sel}`,
      ).toBe(true);
    }
    // Scanning descendants (caretaker scene) are covered by `.gk-scanning *`.
    expect(selectors.includes(".gk-scanning *")).toBe(true);
  });

  it("every @keyframes rule animates only transform and opacity", () => {
    const keyframes = topLevel.filter((b) => /^@keyframes\s+/i.test(b.prelude));
    expect(keyframes.length).toBeGreaterThan(0);
    const allowed = new Set(["transform", "opacity"]);
    for (const kf of keyframes) {
      const props = new Set<string>();
      for (const step of parseBlocks(kf.body)) {
        for (const name of declarations(step.body).keys()) props.add(name);
      }
      const extra = [...props].filter((p) => !allowed.has(p));
      expect(extra, `${kf.prelude} animates disallowed properties`).toEqual([]);
    }
  });
});
