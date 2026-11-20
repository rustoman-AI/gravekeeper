/**
 * Ghost and restless sprites (graveyard-art Requirements 4.1, 4.2, 4.3, 4.7, 4.9).
 *
 * `GhostDefs` goes inside the <defs> of the sprite sheet, `GhostSymbols` next
 * to the other <symbol> elements. Restless plots reference the stone shapes
 * `#shape-stone-<variant>` defined by the stone sprite file. Colours are
 * tokens only. No filter, no mask.
 */

import { SPRITE_VARIANTS, symbolIdOf } from "@/view-model/variants";

const VIEW_BOX = "0 0 80 104";
const GLOW_OPACITY = "calc(var(--glow, 2) / 4)";
const DEPTH_STYLE = { opacity: "var(--depth-bright, 1)" } as const;

// Narrow head, body that thins into a long tail with two curls.
const WISP_PATH =
  "M40 6 C50 6 54 18 52 30 C50 42 58 50 56 62 C54 74 42 76 44 86 C46 94 58 94 60 88 " +
  "C58 100 38 100 38 88 C38 78 46 74 44 66 C42 56 30 52 28 42 C26 30 28 6 40 6 Z";

// Slightly uneven, drooping hollow eyes.
const EYE_LEFT = "M31 22 C31 18 38 18 38 23 C38 28 34 31 32 29 C31 27 31 25 31 22 Z";
const EYE_RIGHT = "M43 24 C43 20 49 20 49 25 C49 29 46 31 44 30 C43 28 43 26 43 24 Z";

// Tail overlaps the top of the stone; the wisp is smaller and sits above it.
const RESTLESS_PLACEMENT = "translate(24 -2) scale(0.62)";

export function GhostDefs() {
  return (
    <>
      <linearGradient id="ghost-body-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--color-spectral)" stopOpacity="0.95" />
        <stop offset="0.55" stopColor="var(--color-spectral)" stopOpacity="0.45" />
        <stop offset="1" stopColor="var(--color-spectral)" stopOpacity="0" />
      </linearGradient>
      <g id="shape-ghost-wisp">
        <path
          d={WISP_PATH}
          fill="url(#ghost-body-gradient)"
          stroke="var(--color-bone)"
          strokeOpacity="0.3"
          strokeWidth="1.2"
        />
        <path data-part="eye" d={EYE_LEFT} fill="var(--color-night)" />
        <path data-part="eye" d={EYE_RIGHT} fill="var(--color-night)" />
      </g>
      <g id="shape-ghost-wisp-flat">
        <path d={WISP_PATH} fill="var(--color-spectral)" fillOpacity="0.8" />
        <path data-part="eye" d={EYE_LEFT} fill="var(--color-night)" />
        <path data-part="eye" d={EYE_RIGHT} fill="var(--color-night)" />
      </g>
      <g id="shape-ghost-glow">
        <ellipse
          cx="40"
          cy="54"
          rx="36"
          ry="48"
          fill="url(#plot-glow-gradient)"
          style={{ opacity: GLOW_OPACITY }}
        />
      </g>
    </>
  );
}

export function GhostSymbols() {
  return (
    <>
      <symbol id={symbolIdOf("ghost", "wisp", false)} viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <use href="#shape-ghost-glow" />
          <use href="#shape-ghost-wisp" />
        </g>
      </symbol>
      {SPRITE_VARIANTS.restless.map((v) => (
        <symbol key={v} id={symbolIdOf("restless", v, false)} viewBox={VIEW_BOX}>
          <g style={DEPTH_STYLE}>
            <use href={`#shape-stone-${v}`} />
            <g transform={RESTLESS_PLACEMENT}>
              <use href="#shape-ghost-glow" />
              <use href="#shape-ghost-wisp" />
            </g>
          </g>
        </symbol>
      ))}

      {/* Flat twins: solid shapes, no gradient, no glow. */}
      <symbol id={symbolIdOf("ghost", "wisp", true)} viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <use href="#shape-ghost-wisp-flat" />
        </g>
      </symbol>
      {SPRITE_VARIANTS.restless.map((v) => (
        <symbol key={v} id={symbolIdOf("restless", v, true)} viewBox={VIEW_BOX}>
          <g style={DEPTH_STYLE}>
            <use href={`#shape-stone-${v}`} />
            <g transform={RESTLESS_PLACEMENT}>
              <use href="#shape-ghost-wisp-flat" />
            </g>
          </g>
        </symbol>
      ))}
    </>
  );
}
