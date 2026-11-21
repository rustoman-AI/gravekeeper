// Feature: art-polish, Property AP-P4: Plot labels stay readable on the whole ground
// Validates: Requirements 3.2, 3.3, 3.4
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FOG_OPACITY_HIGH } from "../../view-model/constants";
import { cfg } from "../support/fc-config";
import { composite, contrastRatio, interpolate, parseHex, type Rgb } from "../support/contrast";

const MIN = 4.5;
const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

function token(name: string): Rgb {
  const line = css.split(/\r?\n/).find((l) => l.trim().startsWith(`--color-${name}:`));
  const m = line === undefined ? null : /:\s*(#[0-9a-fA-F]{6})\b/.exec(line);
  if (m === null) throw new Error(`Token --color-${name} missing or without hex value in app/globals.css`);
  return parseHex(m[1]);
}

const bone = token("bone");
const boneMuted = token("bone-muted");
const mist = token("mist");
const night = token("night");
const moss = token("ground-moss");
const grass = token("grass");

// Stops of the .gk-stage::before gradient: ground, moss, 55% moss over night, night.
const STOPS: Rgb[] = [token("ground"), moss, interpolate(night, moss, 0.55), night];

function groundAt(t: number): Rgb {
  const scaled = Math.min(t, 1) * (STOPS.length - 1);
  const i = Math.min(Math.floor(scaled), STOPS.length - 2);
  return interpolate(STOPS[i], STOPS[i + 1], scaled - i);
}

const tArb = fc.double({ min: 0, max: 1, noNaN: true });
const aArb = fc.double({ min: 0, max: FOG_OPACITY_HIGH, noNaN: true });

describe("AP-P4 ground contrast", () => {
  it("AP-P4 bone and bone-muted stay at least 4.5 on the ground gradient under any fog", () => {
    fc.assert(
      fc.property(tArb, aArb, (t, a) => {
        const bg = composite(mist, groundAt(t), a);
        expect(contrastRatio(bone, bg)).toBeGreaterThanOrEqual(MIN);
        expect(contrastRatio(boneMuted, bg)).toBeGreaterThanOrEqual(MIN);
      }),
      cfg(),
    );
  });

  it("AP-P4 bone and bone-muted stay at least 4.5 on the grass colour under any fog", () => {
    fc.assert(
      fc.property(aArb, (a) => {
        const bg = composite(mist, grass, a);
        expect(contrastRatio(bone, bg)).toBeGreaterThanOrEqual(MIN);
        expect(contrastRatio(boneMuted, bg)).toBeGreaterThanOrEqual(MIN);
      }),
      cfg(),
    );
  });
});
