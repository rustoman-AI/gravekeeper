/**
 * Restless plot arrangement (art-polish Requirement 7). Numbers are in the
 * 0 0 80 104 symbol space. Pure: no JSX, no browser API.
 */

// Requirement 7.3: the stone shrinks to half size about its foot.
export const RESTLESS_STONE_SCALE = 0.5;

// Requirement 7.3: the point of the stone that stays on the ground.
export const RESTLESS_STONE_FOOT: readonly [number, number] = [40, 98];

// Requirement 7.1: extent of `#shape-ghost-wisp` before scaling.
export const GHOST_BASE_BOX = { top: 6, bottom: 100, eyeBottom: 31, centreX: 43 } as const;

// Requirement 7.1: the wisp is at least 0.85 of a plain ghost.
export const RESTLESS_GHOST_SCALE = 0.85;

// Requirement 7.4: y of the wisp top, above the symbol box.
export const RESTLESS_GHOST_TOP = -10;

// Requirement 7.4: the symbol extends at most this far above its box.
export const RESTLESS_MAX_OVERFLOW_PX = 14;

// Requirement 7.3: wisp box overlap with the stone, as a share of stone height.
export const RESTLESS_MAX_OVERLAP = 0.4;

// Requirement 7.3: y of each stone top in its own shape (before scaling).
export const STONE_TOPS: Readonly<Record<"rounded" | "cross" | "obelisk" | "slab", number>> = {
  rounded: 19,
  cross: 24,
  obelisk: 6,
  slab: 70,
};

function num(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

/** Requirement 7.3: transform of the stone, scaled about its foot. */
export function restlessStoneTransform(): string {
  const [fx, fy] = RESTLESS_STONE_FOOT;
  return `translate(${num(fx)} ${num(fy)}) scale(${num(RESTLESS_STONE_SCALE)}) translate(${num(-fx)} ${num(-fy)})`;
}

/**
 * Requirements 7.1, 7.3: transform of the wisp. Maps `centreX` to the stone
 * foot x and the wisp top to `RESTLESS_GHOST_TOP`.
 */
export function restlessGhostTransform(): string {
  const tx = RESTLESS_STONE_FOOT[0] - GHOST_BASE_BOX.centreX * RESTLESS_GHOST_SCALE;
  const ty = RESTLESS_GHOST_TOP - GHOST_BASE_BOX.top * RESTLESS_GHOST_SCALE;
  return `translate(${num(tx)} ${num(ty)}) scale(${num(RESTLESS_GHOST_SCALE)})`;
}

/** Requirements 7.1, 7.3: transformed numbers of a restless variant. */
export function restlessGeometry(variant: string): {
  stoneTop: number;
  stoneHeight: number;
  ghostTop: number;
  ghostBottom: number;
  eyeBottom: number;
  overlapRatio: number;
} {
  const top = STONE_TOPS[variant as keyof typeof STONE_TOPS];
  const footY = RESTLESS_STONE_FOOT[1];
  const stoneTop = footY - (footY - top) * RESTLESS_STONE_SCALE;
  const stoneHeight = footY - stoneTop;
  const ghostTop = RESTLESS_GHOST_TOP;
  const ghostBottom = ghostTop + (GHOST_BASE_BOX.bottom - GHOST_BASE_BOX.top) * RESTLESS_GHOST_SCALE;
  const eyeBottom = ghostTop + (GHOST_BASE_BOX.eyeBottom - GHOST_BASE_BOX.top) * RESTLESS_GHOST_SCALE;
  const overlapRatio = Math.max(0, ghostBottom - stoneTop) / stoneHeight;
  return { stoneTop, stoneHeight, ghostTop, ghostBottom, eyeBottom, overlapRatio };
}
