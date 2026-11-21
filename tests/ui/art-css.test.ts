import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FOG_OPACITY_HIGH, FOG_OPACITY_LOW } from "@/view-model/constants";
import {
  FOG_BAND_CENTER_X_PCT,
  FOG_BAND_CENTER_Y_PCT,
  FOG_BAND_RX_PCT,
  FOG_BAND_RY_PCT,
  FOG_HIGH_RX_PCT,
  fogRowOffsetPct,
} from "@/view-model/fog";

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

  // art-polish task 3.2 (R1.1, R1.2, R1.5, R1.6, R1.7, R9.7, R9.8)
  it("the Stage lead lifts the Scene by 136px below the horizon height (art-polish R1.1)", () => {
    const stage = topLevel.filter((b) => norm(b.prelude) === ".gk-stage");
    expect(stage).toHaveLength(1);
    const d = declarations(stage[0].body);
    expect(d.get("--stage-lead")).toBe("calc(var(--horizon-h) - 136px)");
    expect(d.get("padding-top")).toBe("var(--stage-lead)");
  });

  it("the Backdrop sits behind the rows with z-index -1 (art-polish R1.2)", () => {
    const rule = ruleFor(".gk-stage > .gk-backdrop");
    expect(rule?.decls.get("z-index")).toBe("-1");
  });

  /** Merged declarations of every rule whose selector list contains `selector`. */
  const merged = (selector: string) => {
    const rs = rulesWith(selector);
    expect(rs.length, `${selector} must exist`).toBeGreaterThan(0);
    const decls = new Map<string, string>();
    for (const r of rs) for (const [k, v] of r.decls) decls.set(k, v);
    return { decls, text: rs.map((r) => r.body).join("\n") };
  };

  it.each([".gk-stage::before", ".gk-stage::after"])(
    "%s is an inert full-bleed layer from 14px above the horizon (art-polish R1.5, R1.6, R9.8)",
    (selector) => {
      const { decls, text } = merged(selector);
      expect(decls.get("pointer-events")).toBe("none");
      expect(decls.get("top")).toBe("calc(var(--horizon-h) - 14px)");
      expect(text).not.toMatch(/url\(/i);
      expect(text).not.toMatch(/mask/i);
      // Colours come from tokens only (R9.7).
      expect(text).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    },
  );

  it("the ground gradient runs ground, moss, night (art-polish R1.5)", () => {
    const bg = merged(".gk-stage::before").decls.get("background") ?? "";
    expect(bg).toContain("--color-ground)");
    expect(bg).toContain("--color-ground-moss");
    expect(bg).toContain("--color-night");
  });

  it("the grass tiles use the row cell height (art-polish R1.6)", () => {
    const d = merged(".gk-stage::after").decls;
    expect(d.get("background-size")).toContain("var(--cell-h, 156px)");
    expect(d.get("background-image")).toContain("--color-grass");
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

  // art-polish task 5.2 (R4.1 to R4.4, R4.10, R9.5, R9.7)
  /** Splits on commas outside parentheses. */
  const splitTopLevel = (value: string): string[] => {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === "(") depth++;
      else if (value[i] === ")") depth--;
      else if (value[i] === "," && depth === 0) {
        parts.push(value.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(value.slice(start));
    return parts.map(norm).filter((p) => p.length > 0);
  };

  interface Band {
    rx: number;
    ry: number;
    cx: number;
    cy: number;
  }

  /** Returns the failures of one fog `background-image` value, and the parsed bands. */
  function checkFogImage(value: string): { failures: string[]; bands: Band[] } {
    const failures: string[] = [];
    const bands: Band[] = [];
    for (const part of splitTopLevel(value)) {
      if (/url\(/i.test(part)) failures.push(`url(): ${part}`);
      if (!/^radial-gradient\(/i.test(part)) {
        failures.push(`not a radial-gradient: ${part}`);
        continue;
      }
      const inner = part.slice(part.indexOf("(") + 1, part.lastIndexOf(")"));
      const args = splitTopLevel(inner);
      if (args[args.length - 1] !== "transparent 100%") {
        failures.push(`does not end in transparent 100%: ${part}`);
      }
      const m = /^ellipse ([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%$/.exec(args[0] ?? "");
      if (!m) {
        failures.push(`unparsable ellipse: ${args[0]}`);
        continue;
      }
      const [rx, ry, cx, cy] = m.slice(1).map(Number);
      bands.push({ rx, ry, cx, cy });
      // Strictly inside one half of the tile, at least 2 points from each border (R4.3).
      const inHalf = (lo: number, hi: number) => cy - ry >= lo + 2 && cy + ry <= hi - 2;
      if (!inHalf(0, 50) && !inHalf(50, 100)) failures.push(`band touches a tile border: ${part}`);
    }
    return { failures, bands };
  }

  const fogRules = rules.filter(
    (r) => r.selectors.some((s) => /\.gk-fog\b/.test(s)) && r.decls.has("background-image"),
  );
  const DRIFT_PCT = 8; // keyframes gk-fog-drift: translate3d(-8%..8%)

  it("the fog layer spans the box exactly: left 0 and right 0 (art-polish R4.5)", () => {
    const { decls } = merged(".gk-fog");
    expect(decls.get("left")).toBe("0");
    expect(decls.get("right")).toBe("0");
  });

  it("every fog background-image is feathered radial gradients only (art-polish R4.1, R4.2, R4.10)", () => {
    expect(fogRules.length).toBeGreaterThan(0);
    const layers = new Set<string>();
    for (const r of fogRules) {
      const { failures, bands } = checkFogImage(r.decls.get("background-image")!);
      expect(failures, r.selectors.join(", ")).toEqual([]);
      expect(bands).toHaveLength(2);
      for (const s of r.selectors) layers.add(s);
    }
    expect(layers.has(".gk-fog")).toBe(true);
    expect(layers.has(".gk-fog-high")).toBe(true);
    expect(layers.has(".gk-fog-b")).toBe(true);
  });

  it("the fog tile repeats on the Y axis over two rows (art-polish R4.2, R4.3)", () => {
    const { decls } = merged(".gk-fog");
    expect(decls.get("background-repeat")).toBe("repeat-y");
    const size = norm(decls.get("background-size") ?? "");
    expect(size.startsWith("100% ")).toBe(true);
    expect(size).toContain("calc(var(--cell-h, 156px) * 2)");
  });

  it("fog band centres match view-model/fog.ts and rows differ by at least 15 points (art-polish R4.3, R4.4)", () => {
    const low = checkFogImage(rulesWith(".gk-fog")[0].decls.get("background-image")!).bands;
    expect(low.map((b) => b.cx)).toEqual([...FOG_BAND_CENTER_X_PCT]);
    expect(low.map((b) => b.cy)).toEqual([...FOG_BAND_CENTER_Y_PCT]);
    for (const b of low) {
      expect(b.rx).toBe(FOG_BAND_RX_PCT);
      expect(b.ry).toBe(FOG_BAND_RY_PCT);
    }
    expect(fogRowOffsetPct(0)).toBe(low[0].cx);
    expect(fogRowOffsetPct(1)).toBe(low[1].cx);
    expect(Math.abs(low[0].cx - low[1].cx)).toBeGreaterThanOrEqual(15);

    const highRule = rulesWith(".gk-fog-high").find((r) => r.decls.has("background-image"))!;
    const high = checkFogImage(highRule.decls.get("background-image")!).bands;
    for (const b of high) expect(b.rx).toBe(FOG_HIGH_RX_PCT);
    expect(high.map((b) => b.cx)).toEqual([...FOG_BAND_CENTER_X_PCT].reverse());
    expect(Math.abs(high[0].cx - high[1].cx)).toBeGreaterThanOrEqual(15);
    // Each layer has one band in each half of the tile, and the layers never line up.
    for (const bands of [low, high]) {
      expect(bands[0].cy).toBeLessThan(50);
      expect(bands[1].cy).toBeGreaterThan(50);
    }
    for (let i = 0; i < 2; i++) expect(Math.abs(low[i].cx - high[i].cx)).toBeGreaterThanOrEqual(15);
  });

  it("each fog band plus the maximum drift stays inside 0 to 100 % horizontally (art-polish R4.5)", () => {
    for (const r of fogRules) {
      for (const b of checkFogImage(r.decls.get("background-image")!).bands) {
        expect(b.cx - b.rx - DRIFT_PCT, r.selectors.join(", ")).toBeGreaterThanOrEqual(0);
        expect(b.cx + b.rx + DRIFT_PCT, r.selectors.join(", ")).toBeLessThanOrEqual(100);
      }
    }
    const kf = keyframes.find((b) => norm(b.prelude) === "@keyframes gk-fog-drift")!;
    expect(kf.body).toMatch(/translate3d\(\s*-8%/);
    expect(kf.body).toMatch(/translate3d\(\s*8%/);
  });

  it("fog rules declare no mask or filter (art-polish R4.6, R9.5)", () => {
    for (const r of rules) {
      if (!r.selectors.some((s) => /\.gk-fog\b/.test(s))) continue;
      for (const [name, value] of r.decls) {
        if (/^(-webkit-)?(backdrop-filter|filter|mask(-[\w-]+)?)$/.test(name)) {
          expect(value, `${r.selectors.join(", ")} { ${name} }`).toBe("none");
        }
      }
    }
  });

  it("the fog check reports hard-edged samples (negative self-check)", () => {
    const url = checkFogImage("url(fog.png)");
    expect(url.failures.length).toBeGreaterThan(0);
    const linear = checkFogImage("linear-gradient(red, transparent 100%)");
    expect(linear.failures.some((f) => f.startsWith("not a radial-gradient"))).toBe(true);
    const solid = checkFogImage(
      "radial-gradient(ellipse 28% 14% at 40% 34%, var(--color-mist) 0%, var(--color-mist) 100%)",
    );
    expect(solid.failures.some((f) => f.includes("transparent 100%"))).toBe(true);
    const border = checkFogImage(
      "radial-gradient(ellipse 28% 14% at 40% 10%, var(--color-mist) 0%, transparent 100%)",
    );
    expect(border.failures.some((f) => f.includes("tile border"))).toBe(true);
    const good = checkFogImage(
      "radial-gradient(ellipse 28% 14% at 40% 34%, var(--color-mist) 0%, color-mix(in srgb, var(--color-mist) 45%, transparent) 55%, transparent 100%)",
    );
    expect(good.failures).toEqual([]);
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

  it("the headline clamp lower bound is 26px under 640px (R5.12)", () => {
    const media = topLevel.filter((b) => /^@media \(max-width: 639(\.98)?px\)$/i.test(norm(b.prelude)));
    const small = media
      .flatMap((m) => collectRules(parseBlocks(m.body), false))
      .filter((r) => r.selectors.includes(".gk-headline"));
    expect(small).toHaveLength(1);
    const value = small[0].decls.get("font-size") ?? "";
    const m = /^clamp\(\s*([\d.]+)rem\s*,[^,]+,\s*([\d.]+)rem\s*\)$/.exec(value);
    expect(m, `font-size was "${value}"`).not.toBeNull();
    expect(px(m![1])).toBe(26);
    expect(px(m![2])).toBe(56);
  });

  it("the headline clamp is 28px to 40px from 1280px with 2.2vw + 0.5rem (art-polish R5.1, R5.5)", () => {
    const media = topLevel.filter((b) => /^@media \(min-width: 1280px\)$/i.test(norm(b.prelude)));
    const wide = media
      .flatMap((m) => collectRules(parseBlocks(m.body), false))
      .filter((r) => r.selectors.includes(".gk-headline"));
    expect(wide).toHaveLength(1);
    const value = wide[0].decls.get("font-size") ?? "";
    const m = /^clamp\(\s*([\d.]+)rem\s*,\s*([^,]+),\s*([\d.]+)rem\s*\)$/.exec(value);
    expect(m, `font-size was "${value}"`).not.toBeNull();
    expect(px(m![1])).toBe(28);
    expect(norm(m![2])).toBe("2.2vw + 0.5rem");
    expect(px(m![3])).toBe(40);
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
