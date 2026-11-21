// art-polish task 1.1: constants of the fog and restless-art modules.
// Requirements 4.4, 4.9, 7.1, 7.3
import { describe, expect, it } from "vitest";
import {
  FOG_BAND_CENTER_X_PCT,
  FOG_BAND_CENTER_Y_PCT,
  FOG_BAND_RX_PCT,
  FOG_BAND_RY_PCT,
  FOG_HIGH_RX_PCT,
  fogRowOffsetPct,
  GHOST_BASE_BOX,
  RESTLESS_GHOST_SCALE,
  RESTLESS_GHOST_TOP,
  RESTLESS_MAX_OVERFLOW_PX,
  RESTLESS_MAX_OVERLAP,
  RESTLESS_STONE_SCALE,
  restlessGeometry,
  restlessGhostTransform,
  restlessStoneTransform,
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
    expect(RESTLESS_STONE_SCALE).toBe(0.5);
    expect(RESTLESS_GHOST_SCALE).toBe(0.85);
    expect(RESTLESS_GHOST_TOP).toBe(-10);
    expect(RESTLESS_MAX_OVERFLOW_PX).toBe(14);
    expect(RESTLESS_MAX_OVERLAP).toBe(0.4);
    expect(GHOST_BASE_BOX).toEqual({ top: 6, bottom: 100, eyeBottom: 31, centreX: 43 });
    expect(STONE_TOPS).toEqual({ rounded: 19, cross: 24, obelisk: 6, slab: 62 });
  });

  it("builds the transforms", () => {
    expect(restlessStoneTransform()).toBe("translate(40 98) scale(0.5) translate(-40 -98)");
    expect(restlessGhostTransform()).toBe("translate(3.45 -15.1) scale(0.85)");
  });

  it("computes the geometry of each variant", () => {
    const expectedTops = { rounded: 58.5, cross: 61, obelisk: 52, slab: 80 } as const;
    for (const v of ["rounded", "cross", "obelisk", "slab"] as const) {
      const g = restlessGeometry(v);
      expect(g.stoneTop).toBeCloseTo(expectedTops[v], 6);
      expect(g.ghostTop).toBe(-10);
      expect(g.ghostBottom).toBeCloseTo(70, 0);
      expect(g.eyeBottom).toBeCloseTo(11.25, 6);
      expect(g.eyeBottom).toBeLessThan(g.stoneTop);
      expect(g.overlapRatio).toBeLessThanOrEqual(0.4);
    }
    expect(restlessGeometry("slab").overlapRatio).toBe(0);
  });
});
