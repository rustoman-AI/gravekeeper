import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Label style test (polish-leftovers task 3.7; R2.1, R2.10).
 * Parses app/globals.css with comments stripped and brace matching.
 */

interface Block {
  prelude: string;
  body: string;
}

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      if (depth === 0) bodyStart = i + 1;
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
      preludeStart = i + 1;
    }
  }
  expect(depth, "unbalanced braces in globals.css").toBe(0);
  return blocks;
}

function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of body.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    out.set(part.slice(0, idx).trim().toLowerCase(), part.slice(idx + 1).trim().toLowerCase());
  }
  return out;
}

interface Rule {
  selectors: string[];
  decls: Map<string, string>;
  body: string;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Flattens style rules, descending into @media, @layer and @supports. */
function collectRules(blocks: Block[], out: Rule[] = []): Rule[] {
  for (const b of blocks) {
    const prelude = norm(b.prelude);
    if (/^@(media|layer|supports)\b/i.test(prelude)) {
      collectRules(parseBlocks(b.body), out);
    } else if (!prelude.startsWith("@")) {
      out.push({
        selectors: prelude.split(",").map((s) => norm(s)),
        decls: declarations(b.body),
        body: b.body,
      });
    }
  }
  return out;
}

const rules = collectRules(parseBlocks(css));
const isLabelSelector = (s: string) => /\.gk-plot-label\b/.test(s);
const labelRules = rules.filter((r) => r.selectors.some(isLabelSelector));

/** Merged declarations of every rule that targets exactly `.gk-plot-label`. */
const base = new Map<string, string>();
for (const r of labelRules) {
  if (r.selectors.includes(".gk-plot-label")) for (const [k, v] of r.decls) base.set(k, v);
}

describe("app/globals.css .gk-plot-label", () => {
  it("has a base rule", () => {
    expect(base.size).toBeGreaterThan(0);
  });

  it("uses no line-clamp, -webkit-box or ellipsis in any label rule (R2.1)", () => {
    expect(labelRules.length).toBeGreaterThan(0);
    for (const r of labelRules) {
      const where = r.selectors.join(", ");
      expect(r.body, where).not.toMatch(/line-clamp/i);
      expect(r.body, where).not.toMatch(/-webkit-box/i);
      expect(r.body, where).not.toMatch(/ellipsis/i);
      expect(r.decls.get("text-overflow") ?? "clip", where).toBe("clip");
    }
  });

  it("clips overflowing text instead of truncating with an ellipsis (R2.1)", () => {
    expect(base.get("text-overflow")).toBe("clip");
    expect(base.get("overflow")).toBe("hidden");
    expect(base.get("display")).toBe("block");
    expect(base.get("height")).toBe("var(--label-band-h, 28px)");
    expect(base.get("white-space")).toBe("normal");
    expect(base.get("overflow-wrap")).toBe("anywhere");
    expect(base.get("word-break")).toBe("normal");
  });

  it("has a font size of at least 11px in every label rule (R2.10)", () => {
    const sizes = labelRules.filter((r) => r.decls.has("font-size"));
    expect(sizes.length).toBeGreaterThan(0);
    for (const r of sizes) {
      const value = r.decls.get("font-size")!;
      // Plain length, or var(--name, <length>) whose fallback is the length.
      const m = /^(?:var\(\s*--[\w-]+\s*,\s*)?([\d.]+)px\s*\)?$/.exec(value);
      expect(m, `font-size was "${value}"`).not.toBeNull();
      expect(Number(m![1]), r.selectors.join(", ")).toBeGreaterThanOrEqual(11);
    }
    expect(base.get("font-size")).toBe("var(--label-font, 12px)");
  });
});
