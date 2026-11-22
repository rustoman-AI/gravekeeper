/**
 * Restless plot arrangement (polish-leftovers Requirement 1). The stone is
 * drawn at full size; a smaller ghost rises beside it to the upper right.
 * Numbers are in the 0 0 80 104 symbol space. Pure: no JSX, no browser API.
 */

export type RestlessVariant = "rounded" | "cross" | "obelisk" | "slab";

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Requirement 1.1: extent of `#shape-ghost-wisp` before scaling.
export const GHOST_BASE_BOX = {
  top: 6,
  bottom: 100,
  left: 26,
  right: 60,
  eyeBottom: 31,
  centreX: 43,
} as const;

// Requirement 1.4: 0.70 times the former scale.
export const RESTLESS_GHOST_SCALE = 0.595;

// Requirement 1.4: the former wisp scale, the reference for the 70% ratio.
export const RESTLESS_GHOST_REFERENCE_SCALE = 0.85;

// Requirement 1.5: x the wisp centre is moved to (right of the stone's carved column).
export const RESTLESS_GHOST_CENTRE_X = 62;

// Requirement 1.1: how far the wisp tail dips into the stone top.
export const RESTLESS_RISE_OVERLAP = 8;

// Requirement 1.5: the symbol extends at most this far above its box.
export const RESTLESS_MAX_OVERFLOW_PX = 14;

// Requirement 1.5: wisp box overlap with the stone box, as a share of the stone box area.
export const RESTLESS_MAX_OVERLAP = 0.25;

// y of each stone top in its own shape.
export const STONE_TOPS: Readonly<Record<RestlessVariant, number>> = {
  rounded: 19,
  cross: 24,
  obelisk: 6,
  slab: 70,
};

// Extent of each full-size stone in its own shape.
export const STONE_BOXES: Readonly<Record<RestlessVariant, Box>> = {
  rounded: { left: 16, right: 64, top: 19, bottom: 98 },
  cross: { left: 18, right: 62, top: 24, bottom: 96 },
  obelisk: { left: 14, right: 66, top: 6, bottom: 96 },
  slab: { left: 6, right: 74, top: 70, bottom: 94 },
};

// Right edge of the carved central column of the stones.
const CENTRAL_COLUMN_RIGHT = 46;

function num(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

function ghostHeight(): number {
  return (GHOST_BASE_BOX.bottom - GHOST_BASE_BOX.top) * RESTLESS_GHOST_SCALE;
}

function ghostTopOf(variant: string): number {
  const top = STONE_TOPS[variant as RestlessVariant];
  return Math.max(-RESTLESS_MAX_OVERFLOW_PX, top + RESTLESS_RISE_OVERLAP - ghostHeight());
}

function area(b: Box): number {
  return Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
}

function intersection(a: Box, b: Box): Box {
  return {
    left: Math.max(a.left, b.left),
    right: Math.min(a.right, b.right),
    top: Math.max(a.top, b.top),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

/**
 * Requirements 1.1, 1.4, 1.5: transform of the wisp. Maps `centreX` to
 * `RESTLESS_GHOST_CENTRE_X` and the wisp top to the variant's ghost top.
 */
export function restlessGhostTransform(variant: string): string {
  const s = RESTLESS_GHOST_SCALE;
  const tx = RESTLESS_GHOST_CENTRE_X - GHOST_BASE_BOX.centreX * s;
  const ty = ghostTopOf(variant) - GHOST_BASE_BOX.top * s;
  return `translate(${num(tx)} ${num(ty)}) scale(${num(s)})`;
}

/** Requirements 1.1, 1.4, 1.5: transformed numbers of a restless variant. */
export function restlessGeometry(variant: string): {
  ghostBox: Box;
  stoneBox: Box;
  eyeBottom: number;
  overlapRatio: number;
  centralColumnClear: boolean;
} {
  const s = RESTLESS_GHOST_SCALE;
  const stoneBox = STONE_BOXES[variant as RestlessVariant];
  const top = ghostTopOf(variant);
  const ghostBox: Box = {
    left: RESTLESS_GHOST_CENTRE_X + (GHOST_BASE_BOX.left - GHOST_BASE_BOX.centreX) * s,
    right: RESTLESS_GHOST_CENTRE_X + (GHOST_BASE_BOX.right - GHOST_BASE_BOX.centreX) * s,
    top,
    bottom: top + ghostHeight(),
  };
  const eyeBottom = top + (GHOST_BASE_BOX.eyeBottom - GHOST_BASE_BOX.top) * s;
  const overlapRatio = area(intersection(ghostBox, stoneBox)) / area(stoneBox);
  return {
    ghostBox,
    stoneBox,
    eyeBottom,
    overlapRatio,
    centralColumnClear: ghostBox.left > CENTRAL_COLUMN_RIGHT,
  };
}
