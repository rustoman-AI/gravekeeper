/**
 * One hidden sprite sheet for the Scene. Each plot kind is a <symbol> with a
 * viewBox of 80 by 104, plus a `-flat` variant (solid shapes, no gradient) for
 * the simplified form. Colours come from the design tokens only. No filter,
 * no mask, no raster image and no external reference.
 *
 * Glow is a radial gradient whose opacity follows the `--glow` level (1..4)
 * set on the plot button; custom properties inherit into the <use> tree.
 */

const GLOW_OPACITY = "calc(var(--glow, 2) / 4)";

const VIEW_BOX = "0 0 80 104";

export function SceneSprites() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        <radialGradient id="plot-glow-gradient" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--color-spectral)" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="var(--color-spectral)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--color-spectral)" stopOpacity="0" />
        </radialGradient>

        {/* Shared sub-shapes, drawn once. */}
        <g id="shape-tombstone">
          <path
            d="M18 96 V40 A22 22 0 0 1 62 40 V96 Z"
            fill="var(--color-stone)"
            stroke="var(--color-bone-muted)"
            strokeWidth="2"
          />
          <path d="M40 30 V56 M31 40 H49" stroke="var(--color-night)" strokeWidth="3" fill="none" />
          <path d="M10 98 H70" stroke="var(--color-night-raised)" strokeWidth="4" fill="none" />
        </g>
        <g id="shape-ghost">
          <path
            d="M14 90 V40 A26 26 0 0 1 66 40 V90 L58 82 L50 90 L42 82 L34 90 L26 82 Z"
            fill="var(--color-spectral)"
            fillOpacity="0.85"
            stroke="var(--color-bone)"
            strokeWidth="2"
          />
          <circle cx="30" cy="42" r="4" fill="var(--color-night)" />
          <circle cx="50" cy="42" r="4" fill="var(--color-night)" />
          <ellipse cx="40" cy="56" rx="4" ry="5" fill="var(--color-night)" />
        </g>
        <g id="shape-glow">
          <ellipse cx="40" cy="56" rx="40" ry="48" fill="url(#plot-glow-gradient)" style={{ opacity: GLOW_OPACITY }} />
        </g>
      </defs>

      {/* Tombstone: grey arched stone with a cross and a base line. */}
      <symbol id="plot-tombstone" viewBox={VIEW_BOX}>
        <use href="#shape-tombstone" />
      </symbol>

      {/* Overgrown: leaning stone, no inscription, ivy and moss. */}
      <symbol id="plot-overgrown" viewBox={VIEW_BOX}>
        <g transform="rotate(-9 40 96)">
          <path
            d="M18 96 V44 L26 26 L54 24 L62 44 V96 Z"
            fill="var(--color-stone)"
            stroke="var(--color-bone-muted)"
            strokeWidth="2"
          />
          <path d="M18 80 Q30 70 40 82 T62 78 V96 H18 Z" fill="var(--color-moss)" />
          <path
            d="M54 24 Q60 40 50 52 Q44 62 52 74"
            stroke="var(--color-moss)"
            strokeWidth="3"
            fill="none"
          />
          <path d="M50 44 l8 -4 l-2 8 Z M46 62 l-8 -3 l4 7 Z" fill="var(--color-moss)" />
        </g>
        <path d="M8 98 H72" stroke="var(--color-moss)" strokeWidth="4" fill="none" />
      </symbol>

      {/* Ghost: glowing, floating, wavy-hemmed figure with no stone. */}
      <symbol id="plot-ghost" viewBox={VIEW_BOX}>
        <use href="#shape-glow" />
        <use href="#shape-ghost" />
      </symbol>

      {/* Restless: the tombstone with a smaller ghost drifting over its upper right. */}
      <symbol id="plot-restless" viewBox={VIEW_BOX}>
        <use href="#shape-tombstone" />
        <g transform="translate(24 0) scale(0.6)">
          <use href="#shape-glow" />
          <use href="#shape-ghost" />
        </g>
      </symbol>

      {/* Lantern: lit amber lamp on a post, with a handle and flame. */}
      <symbol id="plot-lantern" viewBox={VIEW_BOX}>
        <path d="M40 98 V52" stroke="var(--color-stone)" strokeWidth="4" fill="none" />
        <path d="M30 98 H50" stroke="var(--color-stone)" strokeWidth="4" fill="none" />
        <path d="M30 16 A10 10 0 0 1 50 16" stroke="var(--color-bone-muted)" strokeWidth="3" fill="none" />
        <path d="M26 30 L34 18 H46 L54 30 Z" fill="var(--color-stone)" />
        <rect x="28" y="30" width="24" height="26" rx="3" fill="var(--color-amber)" stroke="var(--color-bone)" strokeWidth="2" />
        <path d="M40 34 Q47 43 40 52 Q33 43 40 34 Z" fill="var(--color-bone)" />
        <path d="M24 56 H56" stroke="var(--color-stone)" strokeWidth="4" fill="none" />
      </symbol>

      {/* Unmarked: bare mound of earth with a small gap in the ground line. */}
      <symbol id="plot-unmarked" viewBox={VIEW_BOX}>
        <path
          d="M6 96 Q10 66 40 64 Q70 66 74 96 Z"
          fill="var(--color-night-raised)"
          stroke="var(--color-bone-muted)"
          strokeWidth="2"
          strokeDasharray="6 3"
        />
        <path d="M30 80 H50" stroke="var(--color-bone-muted)" strokeWidth="2" fill="none" />
      </symbol>

      {/* Flat variants: solid shapes, no gradient, for the simplified form. */}
      <symbol id="plot-tombstone-flat" viewBox={VIEW_BOX}>
        <path d="M18 96 V40 A22 22 0 0 1 62 40 V96 Z" fill="var(--color-stone)" />
      </symbol>
      <symbol id="plot-overgrown-flat" viewBox={VIEW_BOX}>
        <path d="M18 96 V44 L26 26 L54 24 L62 44 V96 Z" fill="var(--color-stone)" transform="rotate(-9 40 96)" />
        <path d="M10 98 H70" stroke="var(--color-moss)" strokeWidth="6" fill="none" />
      </symbol>
      <symbol id="plot-ghost-flat" viewBox={VIEW_BOX}>
        <path
          d="M14 90 V40 A26 26 0 0 1 66 40 V90 L58 82 L50 90 L42 82 L34 90 L26 82 Z"
          fill="var(--color-spectral)"
        />
      </symbol>
      <symbol id="plot-restless-flat" viewBox={VIEW_BOX}>
        <path d="M18 96 V40 A22 22 0 0 1 62 40 V96 Z" fill="var(--color-stone)" />
        <path
          d="M14 90 V40 A26 26 0 0 1 66 40 V90 L58 82 L50 90 L42 82 L34 90 L26 82 Z"
          fill="var(--color-spectral)"
          transform="translate(24 0) scale(0.6)"
        />
      </symbol>
      <symbol id="plot-lantern-flat" viewBox={VIEW_BOX}>
        <path d="M40 98 V56" stroke="var(--color-stone)" strokeWidth="4" fill="none" />
        <rect x="28" y="22" width="24" height="34" rx="3" fill="var(--color-amber)" />
      </symbol>
      <symbol id="plot-unmarked-flat" viewBox={VIEW_BOX}>
        <path d="M6 96 Q10 66 40 64 Q70 66 74 96 Z" fill="var(--color-night-raised)" stroke="var(--color-bone-muted)" strokeWidth="2" />
      </symbol>
    </svg>
  );
}
