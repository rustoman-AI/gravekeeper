/**
 * Lantern and unmarked-grave sprites (graveyard-art Requirements 2.10, 2.11,
 * 4.4, 4.6, 4.7, 4.9).
 *
 * `PropsDefs` goes inside the <defs> of the sprite sheet, `PropsSymbols` next
 * to the other <symbol> elements. The `gk-lantern-light` group (glass and
 * flame) is the flicker target of the motion styles. Colours are tokens only.
 * No filter, no mask, no text.
 */

import { symbolIdOf } from "@/view-model/variants";

const VIEW_BOX = "0 0 80 104";
const DEPTH_STYLE = { opacity: "var(--depth-bright, 1)" } as const;

// Two bent post segments, then a hook arm reaching to the right.
const POST_PATH = "M30 100 L33 76 L28 52 L32 24 L52 20";
const HOOK_PATH = "M52 20 C58 20 58 28 54 28";

export function PropsDefs() {
  return (
    <>
      <radialGradient id="lantern-pool-gradient" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="var(--color-amber)" stopOpacity="0.55" />
        <stop offset="1" stopColor="var(--color-amber)" stopOpacity="0" />
      </radialGradient>

      <g id="shape-lantern-pool">
        <ellipse cx="40" cy="98" rx="36" ry="6" fill="url(#lantern-pool-gradient)" />
      </g>

      <g id="shape-lantern-body">
        <path
          d={POST_PATH}
          fill="none"
          stroke="var(--color-iron)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={POST_PATH}
          fill="none"
          stroke="var(--color-stone)"
          strokeOpacity="0.35"
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={HOOK_PATH}
          fill="none"
          stroke="var(--color-iron)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Lantern hanging from the hook: cap, glass, cage bars, base. */}
        <g data-part="lantern">
          <path d="M46 30 L54 30 L56 36 L44 36 Z" fill="var(--color-iron)" data-part="cap" />
          <path d="M47 26 L53 26 L54 30 L46 30 Z" fill="var(--color-iron)" />
          <g className="gk-lantern-light" data-part="light">
            <rect x="45" y="36" width="10" height="16" fill="var(--color-amber)" fillOpacity="0.85" data-part="glass" />
            <path
              d="M50 51 C46 47 48 44 50 40 C52 44 54 47 50 51 Z"
              fill="var(--color-bone)"
              data-part="flame"
            />
          </g>
          <path d="M45 36 L45 52 M50 36 L50 52 M55 36 L55 52" stroke="var(--color-iron)" strokeWidth="1.4" data-part="bar" />
          <path d="M43 52 L57 52 L55 56 L45 56 Z" fill="var(--color-iron)" data-part="base" />
        </g>
      </g>

      <g id="shape-lantern-body-flat">
        <path
          d={POST_PATH}
          fill="none"
          stroke="var(--color-iron)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d={HOOK_PATH} fill="none" stroke="var(--color-iron)" strokeWidth="2.5" strokeLinecap="round" />
        <g data-part="lantern">
          <path d="M46 28 L54 28 L56 36 L44 36 Z" fill="var(--color-iron)" data-part="cap" />
          <g className="gk-lantern-light" data-part="light">
            <rect x="45" y="36" width="10" height="16" fill="var(--color-amber)" data-part="glass" />
            <path d="M50 51 C46 47 48 44 50 40 C52 44 54 47 50 51 Z" fill="var(--color-bone)" data-part="flame" />
          </g>
          <path d="M45 36 L45 52 M50 36 L50 52 M55 36 L55 52" stroke="var(--color-iron)" strokeWidth="1.4" data-part="bar" />
          <path d="M43 52 L57 52 L55 56 L45 56 Z" fill="var(--color-iron)" data-part="base" />
        </g>
      </g>

      <g id="shape-unmarked-mound">
        <path
          d="M8 100 C14 88 26 82 40 82 C54 82 66 88 72 100 Z"
          fill="var(--color-stone)"
          fillOpacity="0.55"
          stroke="var(--color-bone-muted)"
          strokeOpacity="0.4"
          strokeWidth="1"
          data-part="mound"
        />
        {/* Marker: an upright plank and a short crossbar, leaning a little. */}
        <g transform="rotate(-8 40 86)" data-part="marker">
          <rect x="37.5" y="52" width="5" height="36" rx="1" fill="var(--color-bone-muted)" data-part="plank" />
          <rect x="30" y="60" width="20" height="4.5" rx="1" fill="var(--color-bone-muted)" data-part="plank" />
          <path d="M37.5 52 L40 48 L42.5 52 Z" fill="var(--color-bone-muted)" />
        </g>
      </g>

      <g id="shape-unmarked-mound-flat">
        <path d="M8 100 C14 88 26 82 40 82 C54 82 66 88 72 100 Z" fill="var(--color-stone)" data-part="mound" />
        <g transform="rotate(-8 40 86)" data-part="marker">
          <rect x="37.5" y="52" width="5" height="36" fill="var(--color-bone-muted)" data-part="plank" />
          <rect x="30" y="60" width="20" height="4.5" fill="var(--color-bone-muted)" data-part="plank" />
        </g>
      </g>
    </>
  );
}

export function PropsSymbols() {
  return (
    <>
      <symbol id={symbolIdOf("lantern", "iron", false)} viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <use href="#shape-lantern-pool" />
          <use href="#shape-lantern-body" />
        </g>
      </symbol>
      <symbol id={symbolIdOf("unmarked", "mound", false)} viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <use href="#shape-unmarked-mound" />
        </g>
      </symbol>

      {/* Flat twins: solid shapes, no gradient, no light pool. */}
      <symbol id={symbolIdOf("lantern", "iron", true)} viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <use href="#shape-lantern-body-flat" />
        </g>
      </symbol>
      <symbol id={symbolIdOf("unmarked", "mound", true)} viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <use href="#shape-unmarked-mound-flat" />
        </g>
      </symbol>
    </>
  );
}
