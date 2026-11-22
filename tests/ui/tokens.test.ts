import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOG_OPACITY_HIGH } from "../../view-model/constants";
import { contrastRatio, luminance as relLuminance, parseHex } from "../support/contrast";

// Thresholds are owned by tests (graveyard-ui requirements.md, constants table).
const TEXT_CONTRAST_MIN = 4.5; // WCAG 2.2 SC 1.4.3, R16.2
const NONTEXT_CONTRAST_MIN = 3; // WCAG 2.2 SC 1.4.11, R16.2

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

function tokenLine(name: string): string {
  const line = css.split(/\r?\n/).find((l) => l.trim().startsWith(`--color-${name}:`));
  if (line === undefined) throw new Error(`Token --color-${name} is not declared in app/globals.css`);
  return line;
}

function tokenHex(name: string): string {
  const m = /:\s*(#[0-9a-fA-F]{6})\b/.exec(tokenLine(name));
  if (m === null) throw new Error(`Token --color-${name} has no 6-digit hex value`);
  return m[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const TEXT_TOKENS = ["bone", "bone-muted", "amber", "spectral", "stone", "moss"];
const NONTEXT_TOKENS = ["focus"];
const BACKGROUNDS = ["night", "night-raised"];

describe("contrast function", () => {
  it("returns 21 for black on white and 1 for identical colours", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#123456", "#123456")).toBeCloseTo(1, 5);
  });
});

describe("design token contrast (R15.2, R16.2)", () => {
  for (const bg of BACKGROUNDS) {
    for (const fg of TEXT_TOKENS) {
      it(`${fg} on ${bg} is at least ${TEXT_CONTRAST_MIN}`, () => {
        expect(contrast(tokenHex(fg), tokenHex(bg))).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
      });
    }
    for (const fg of NONTEXT_TOKENS) {
      it(`${fg} on ${bg} is at least ${NONTEXT_CONTRAST_MIN}`, () => {
        expect(contrast(tokenHex(fg), tokenHex(bg))).toBeGreaterThanOrEqual(NONTEXT_CONTRAST_MIN);
      });
    }
  }

  it("fails when a token is missing", () => {
    expect(() => tokenHex("no-such-token")).toThrow(/not declared/);
  });

  it("declares --color-moss-deep as decorative only", () => {
    expect(tokenLine("moss-deep")).toMatch(/DECORATIVE ONLY/);
  });
});

// graveyard-art R13.1 to R13.4, R9.7
const ART_TOKENS = ["sky-low", "moon", "ground", "hill", "iron", "mist", "plaque"];
const ART_DECORATIVE = ["moon", "hill", "iron", "mist"];
const ART_BACKGROUNDS = ["sky-low", "ground", "plaque"];

function hexToRgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function composite(fg: string, bg: string, alpha: number): string {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  const out = f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)));
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

describe("graveyard-art landscape tokens (R13)", () => {
  for (const name of ART_TOKENS) {
    it(`${name} exists with a 6-digit hex value`, () => {
      expect(tokenHex(name)).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  }
  for (const name of ART_DECORATIVE) {
    it(`${name} is marked DECORATIVE ONLY`, () => {
      expect(tokenLine(name)).toMatch(/DECORATIVE ONLY/);
    });
  }
  for (const bg of ART_BACKGROUNDS) {
    for (const fg of TEXT_TOKENS) {
      it(`${fg} on ${bg} is at least ${TEXT_CONTRAST_MIN}`, () => {
        expect(contrast(tokenHex(fg), tokenHex(bg))).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
      });
    }
    for (const fg of NONTEXT_TOKENS) {
      it(`${fg} on ${bg} is at least ${NONTEXT_CONTRAST_MIN}`, () => {
        expect(contrast(tokenHex(fg), tokenHex(bg))).toBeGreaterThanOrEqual(NONTEXT_CONTRAST_MIN);
      });
    }
  }
  it("bone on mist at FOG_OPACITY_HIGH over night is at least 4.5", () => {
    const fog = composite(tokenHex("mist"), tokenHex("night"), FOG_OPACITY_HIGH);
    expect(contrast(tokenHex("bone"), fog)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
  });
});

// art-polish R3.1, R3.2, R3.3, R3.5: ground tokens that labels sit on.
const GROUND_TOKENS = ["ground-moss", "grass"];
const GROUND_STOPS = ["ground", "ground-moss", "grass", "night"];
const LABEL_TOKENS = ["bone", "bone-muted"];

describe("art-polish ground tokens (R3)", () => {
  for (const name of GROUND_TOKENS) {
    it(`${name} exists with a 6-digit hex value and is not decorative only`, () => {
      expect(tokenHex(name)).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(tokenLine(name)).not.toMatch(/DECORATIVE ONLY/);
    });
  }
  for (const bg of GROUND_STOPS) {
    for (const fg of LABEL_TOKENS) {
      it(`${fg} on ${bg} is at least ${TEXT_CONTRAST_MIN}`, () => {
        expect(contrast(tokenHex(fg), tokenHex(bg))).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
      });
    }
  }
  const byLuminance = [...GROUND_STOPS].sort((a, b) => luminance(tokenHex(a)) - luminance(tokenHex(b)));
  for (const [label, bg] of [
    ["darkest", byLuminance[0]],
    ["lightest", byLuminance[byLuminance.length - 1]],
  ] as const) {
    for (const fg of LABEL_TOKENS) {
      it(`${fg} on mist at FOG_OPACITY_HIGH over the ${label} ground stop (${bg}) is at least 4.5`, () => {
        const fog = composite(tokenHex("mist"), tokenHex(bg), FOG_OPACITY_HIGH);
        expect(contrast(tokenHex(fg), fog)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
      });
    }
  }
});

// Feature: polish-leftovers, Property 2: Restless tint is distinct and visible
// Validates: Requirements 1.6, 1.8
const WRAITH_BACKGROUNDS = ["night", "night-raised", "ground", "ground-moss", "grass", "sky-low"];
const WRAITH_HUE_DIFF_MIN_DEG = 90;
const WRAITH_LUMINANCE_DIFF_MIN = 0.1;

function hueDegrees(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe("polish-leftovers wraith token (Property 2)", () => {
  it("exists with a 6-digit hex value and is not decorative only", () => {
    expect(tokenHex("wraith")).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(tokenLine("wraith")).not.toMatch(/DECORATIVE ONLY/);
  });
  for (const bg of WRAITH_BACKGROUNDS) {
    it(`wraith on ${bg} is at least ${NONTEXT_CONTRAST_MIN}`, () => {
      expect(contrastRatio(parseHex(tokenHex("wraith")), parseHex(tokenHex(bg)))).toBeGreaterThanOrEqual(
        NONTEXT_CONTRAST_MIN,
      );
    });
  }
  it(`hue differs from spectral by at least ${WRAITH_HUE_DIFF_MIN_DEG} degrees`, () => {
    const raw = Math.abs(hueDegrees(tokenHex("wraith")) - hueDegrees(tokenHex("spectral")));
    expect(Math.min(raw, 360 - raw)).toBeGreaterThanOrEqual(WRAITH_HUE_DIFF_MIN_DEG);
  });
  it(`relative luminance differs from spectral by at least ${WRAITH_LUMINANCE_DIFF_MIN}`, () => {
    const diff = Math.abs(relLuminance(parseHex(tokenHex("wraith"))) - relLuminance(parseHex(tokenHex("spectral"))));
    expect(diff).toBeGreaterThanOrEqual(WRAITH_LUMINANCE_DIFF_MIN);
  });
});
