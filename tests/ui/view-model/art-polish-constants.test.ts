// art-polish task 1.1: constants of the fog and restless-art modules.
// Requirements 4.4, 4.9, 7.1, 7.3; polish-leftovers Requirements 1.1, 1.4, 1.5
import { describe, expect, it } from "vitest";
import {
  FOG_BAND_CENTER_X_PCT,
  FOG_BAND_CENTER_Y_PCT,
  FOG_BAND_RX_PCT,
  FOG_BAND_RY_PCT,
  FOG_HIGH_RX_PCT,
  fogRowOffsetPct,
  GHOST_BASE_BOX,
  RESTLESS_GHOST_CENTRE_X,
  RESTLESS_GHOST_REFERENCE_SCALE,
  RESTLESS_GHOST_SCALE,
  RESTLESS_MAX_OVERFLOW_PX,
  RESTLESS_MAX_OVERLAP,
  RESTLESS_RISE_OVERLAP,
  restlessGeometry,
  restlessGhostTransform,
  STONE_BOXES,
  STONE_TOPS,
} from "@/view-model";

describe("fog constants", () => {
  it("has the design values", () => {
    expect(FOG_BAND_CENTER_X_PCT).toEqual([40, 60]);
    expect(FOG_BAND_CENTER_Y_PCT).toEqual([34, 84]);
    expect(FOG_BAND_RX_PCT).toBe(28);
    expect(FOG_BAND_RY_PCT).toBe(14);
    expect(FOG_HIGH_RX_PCT).toBe(24);
  });

  it("alternates the row offset", () => {
    expect(fogRowOffsetPct(0)).toBe(40);
    expect(fogRowOffsetPct(1)).toBe(60);
    expect(fogRowOffsetPct(2)).toBe(40);
  });
});

describe("restless art constants", () => {
  it("has the design values", () => {
    expect(RESTLESS_GHOST_SCALE).toBe(0.595);
    expect(RESTLESS_GHOST_REFERENCE_SCALE).toBe(0.85);
    expect(RESTLESS_GHOST_CENTRE_X).toBe(62);
    expect(RESTLESS_RISE_OVERLAP).toBe(8);
    expect(RESTLESS_MAX_OVERFLOW_PX).toBe(14);
    expect(RESTLESS_MAX_OVERLAP).toBe(0.25);
    expect(GHOST_BASE_BOX).toEqual({ top: 6, bottom: 100, left: 26, right: 60, eyeBottom: 31, centreX: 43 });
    expect(STONE_TOPS).toEqual({ rounded: 19, cross: 24, obelisk: 6, slab: 70 });
  });

  it("builds the per-variant ghost transform", () => {
    expect(restlessGhostTransform("rounded")).toBe("translate(36.415 -17.57) scale(0.595)");
    expect(restlessGhostTransform("slab")).toBe("translate(36.415 18.5) scale(0.595)");
  });

  it("computes the geometry of each variant", () => {
    const expectedTops = { rounded: -14, cross: -14, obelisk: -14, slab: 22.07 } as const;
    for (const v of ["rounded", "cross", "obelisk", "slab"] as const) {
      const g = restlessGeometry(v);
      expect(g.ghostBox.top).toBeCloseTo(expectedTops[v], 6);
      expect(g.ghostBox.bottom - g.ghostBox.top).toBeCloseTo(55.93, 6);
      expect(g.ghostBox.left).toBeCloseTo(51.885, 6);
      expect(g.ghostBox.right).toBeCloseTo(72.115, 6);
      expect(g.eyeBottom - g.ghostBox.top).toBeCloseTo(14.875, 6);
      expect(g.stoneBox).toEqual(STONE_BOXES[v]);
      expect(g.eyeBottom).toBeLessThan(g.stoneBox.top);
      expect(g.overlapRatio).toBeLessThanOrEqual(RESTLESS_MAX_OVERLAP);
      expect(g.centralColumnClear).toBe(true);
    }
  });
});