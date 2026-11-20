/**
 * Shared SVG definitions for the night landscape (graveyard-art R1.1, R1.3).
 * Rendered once inside the <defs> of the hidden sprite sheet and referenced by
 * `url(#id)` from SceneBackdrop. Colours come from design tokens only. No
 * filter, no mask, no text.
 */

/** Fence tile: one iron bar with a spear tip and a barb, two rails. 12 by 40 units. */
const FENCE_TILE_W = 12;
const FENCE_TILE_H = 40;

export function SceneDefs() {
  return (
    <>
      {/* Sky: Night at the top, the brighter Sky_Low near the horizon. */}
      <linearGradient id="sky-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--color-night)" />
        <stop offset="0.55" stopColor="var(--color-night)" stopOpacity="0.85" />
        <stop offset="1" stopColor="var(--color-sky-low)" />
      </linearGradient>

      {/* Moon halo: a soft falloff from the moon colour to nothing. */}
      <radialGradient id="moon-halo-gradient" cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="var(--color-moon)" stopOpacity="0.5" />
        <stop offset="0.3" stopColor="var(--color-moon)" stopOpacity="0.22" />
        <stop offset="0.65" stopColor="var(--color-moon)" stopOpacity="0.07" />
        <stop offset="1" stopColor="var(--color-moon)" stopOpacity="0" />
      </radialGradient>

      {/* Wrought-iron fence: spear-tipped bars joined by two rails. */}
      <pattern
        id="fence-pattern"
        patternUnits="userSpaceOnUse"
        width={FENCE_TILE_W}
        height={FENCE_TILE_H}
      >
        <rect x="0" y="14" width={FENCE_TILE_W} height="2" fill="var(--color-iron)" />
        <rect x="0" y="30" width={FENCE_TILE_W} height="2" fill="var(--color-iron)" />
        <rect x="4.8" y="7" width="2.4" height="33" fill="var(--color-iron)" />
        {/* Spear finial with side barbs. */}
        <path d="M6 0 L8.6 7 H3.4 Z" fill="var(--color-iron)" />
        <path d="M3.4 8 L1.6 4.6 L4.8 6.6 Z M8.6 8 L10.4 4.6 L7.2 6.6 Z" fill="var(--color-iron)" />
        {/* Collar under the finial. */}
        <rect x="4" y="9" width="4" height="1.4" fill="var(--color-iron)" />
      </pattern>
    </>
  );
}
