import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FOG_OPACITY_HIGH, FOG_OPACITY_LOW } from "@/view-model/constants";

/**
 * Art style test (graveyard-art task 18.1; R1.4, R2.2, R2.3, R5.1, R12.1, R12.4, R12.5, R13.7).
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
  /** Raw declaration text (before the first nested rule is not needed: rules here are flat). */
  body: string;
  inReducedMotion: boolean;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const REDUCED = /^@media \(prefers-reduced-motion: reduce\)$/i;

/** Flattens style rules, descending into @media and @layer (not @keyframes / @theme). */
function collectRules(blocks: Block[], reduced: boolean, out: Rule[] = []): Rule[] {
  for (const b of blocks) {
    const prelude = norm(b.prelude);
    if (/^@(media|layer|supports)\b/i.test(prelude)) {
      collectRules(parseBlocks(b.body), reduced || REDUCED.test(prelude), out);
    } else if (!prelude.startsWith("@")) {
      out.push({
        selectors: prelude.split(",").map((s) => norm(s)),
        decls: declarations(b.body),
        body: b.body,
        inReducedMotion: reduced,
      });
    }
  }
  return out;
}

const topLevel = parseBlocks(css);
const rules = collectRules(topLevel, false);
const keyframes = topLevel.filter((b) => /^@keyframes\s+/i.test(b.prelude));

function keyframeProps(name: string): Set<string> {
  const kf = keyframes.find((b) => norm(b.prelude) === `@keyframes ${name}`);
  expect(kf, `@keyframes ${name} must exist`).toBeDefined();
  const props = new Set<string>();
  for (const step of parseBlocks(kf!.body)) {
    for (const n of declarations(step.body).keys()) props.add(n);
  }
  return props;
}

function ruleFor(selector: string, inMedia?: boolean): Rule | undefined {
  return rules.find(
    (r) => r.selectors.includes(selector) && (inMedia === undefined || true) && !r.inReducedMotion,
  );
}

/** Rules whose selector list contains `selector`, in source order (media rules included). */
function rulesWith(selector: string): Rule[] {
  return rules.filter((r) => r.selectors.includes(selector));
}

const px = (rem: string) => Number.parseFloat(rem) * 16;

describe("app/globals.css art style", () => {
  it("horizon height is 240px, and 150px below the 640px breakpoint (R1.4)", () => {
    const stage = topLevel.filter((b) => norm(b.prelude) === ".gk-stage");
    expect(stage).toHaveLength(1);
    expect(declarations(stage[0].body).get("--horizon-h")).toBe("240px");

    const media = topLevel.filter((b) => /^@media \(max-width: 639(\.98)?px\)$/i.test(norm(b.prelude)));
    const small = media
      .flatMap((m) => collectRules(parseBlocks(m.body), false))
      .filter((r) => r.selectors.includes(".gk-stage"));
    expect(small).toHaveLength(1);
    expect(small[0].decls.get("--horizon-h")).toBe("150px");
  });

  it("fog opacities equal FOG_OPACITY_LOW and FOG_OPACITY_HIGH (R2.2)", () => {
    const low = rulesWith(".gk-fog-low").find((r) => r.decls.has("opacity"));
    const high = rulesWith(".gk-fog-high").find((r) => r.decls.has("opacity"));
    const b = rulesWith(".gk-fog-b").find((r) => r.decls.has("opacity"));
    expect(Number(low?.decls.get("opacity"))).toBe(FOG_OPACITY_LOW);
    expect(Number(high?.decls.get("opacity"))).toBe(FOG_OPACITY_HIGH);
    expect(Number(b?.decls.get("opacity"))).toBe(FOG_OPACITY_HIGH);
  });

  it("keyframes used by the fog declare only transform (R2.3)", () => {
    const names = new Set<string>();
    for (const r of rules) {
      if (!r.selectors.some((s) => /\.gk-fog\b/.test(s))) continue;
      const anim = r.decls.get("animation");
      if (!anim || anim === "none") continue;
      const m = /gk-[\w-]+/.exec(anim);
      if (m) names.add(m[0]);
    }
    expect(names.size).toBeGreaterThan(0);
    for (const name of names) {
      expect([...keyframeProps(name)], `${name} animates`).toEqual(["transform"]);
    }
  });

  it("gk-lantern-flicker declares only opacity (R12.4)", () => {
    expect([...keyframeProps("gk-lantern-flicker")]).toEqual(["opacity"]);
  });

  it("rotate and scale are set on .gk-plot-art (R12.1)", () => {
    const art = ruleFor(".gk-plot-art");
    expect(art?.decls.has("rotate")).toBe(true);
    expect(art?.decls.has("scale")).toBe(true);
  });

  it("the headline clamp bounds are 32px and 56px (R5.1)", () => {
    const rule = ruleFor(".gk-headline");
    const value = rule?.decls.get("font-size") ?? "";
    const m = /^clamp\(\s*([\d.]+)rem\s*,[^,]+,\s*([\d.]+)rem\s*\)$/.exec(value);
    expect(m, `font-size was "${value}"`).not.toBeNull();
    expect(px(m![1])).toBe(32);
    expect(px(m![2])).toBe(56);
  });

  it("declares no filter, backdrop-filter or mask (R12.5)", () => {
    // `filter: none` only switches a filter off (simplified mode), so it is not a filter effect.
    const offenders: string[] = [];
    for (const r of rules) {
      for (const [name, value] of r.decls) {
        if (/^(-webkit-)?(backdrop-filter|filter|mask(-[\w-]+)?)$/.test(name) && value !== "none") {
          offenders.push(`${r.selectors.join(", ")} { ${name}: ${value} }`);
        }
      }
    }
    expect(offenders).toEqual([]);
    expect(css).not.toMatch(/\bmask(-[\w-]+)?\s*:/i);
    expect(css).not.toMatch(/\bbackdrop-filter\s*:/i);
  });

  it("no decorative token is used for text colour (R13.7)", () => {
    const decorative = /var\(\s*--color-(moon|hill|iron|mist)\s*\)/;
    const offenders: string[] = [];
    for (const r of rules) {
      for (const [name, value] of r.decls) {
        if ((name === "color" || name.startsWith("text-")) && decorative.test(value)) {
          offenders.push(`${r.selectors.join(", ")} { ${name}: ${value} }`);
        }
      }
      for (const s of r.selectors) {
        if (/\.text-(moon|hill|iron|mist)\b/.test(s)) offenders.push(s);
      }
    }
    expect(offenders).toEqual([]);
    expect(css).not.toMatch(/\btext-(moon|hill|iron|mist)\b/);
  });

  it("every animation or transition selector is in the reduced-motion block (R12.4)", () => {
    const reduced = rules.filter((r) => r.inReducedMotion);
    expect(reduced.length).toBeGreaterThan(0);
    const coveredSelectors = reduced.flatMap((r) => r.selectors);

    // Last class of the final compound selector, ignoring attribute selectors.
    const lastClass = (sel: string): string | undefined => {
      const last = sel.split(/\s+/).pop() ?? "";
      const classes = last.replace(/\[[^\]]*\]/g, "").match(/\.[\w-]+/g);
      return classes?.[classes.length - 1];
    };
    const coveredClasses = new Set(
      coveredSelectors.filter((s) => !s.endsWith("*")).map((s) => lastClass(s)),
    );
    const wildcardRoots = new Set(
      coveredSelectors.filter((s) => s.endsWith(" *")).map((s) => s.slice(0, -2)),
    );

    const uncovered: string[] = [];
    for (const r of rules) {
      if (r.inReducedMotion) continue;
      for (const prop of ["animation", "transition"]) {
        const value = r.decls.get(prop);
        if (value === undefined || /^none\b/.test(value)) continue;
        for (const sel of r.selectors) {
          const cls = lastClass(sel);
          const direct = cls !== undefined && coveredClasses.has(cls);
          const viaWildcard = [...wildcardRoots].some((root) => sel.startsWith(`${root} `));
          if (!direct && !viaWildcard) uncovered.push(`${sel} (${prop})`);
        }
      }
    }
    expect(uncovered).toEqual([]);
  });
});
