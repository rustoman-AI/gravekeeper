/**
 * Scanning scene (graveyard-art R10.1, R10.4, R10.6): night strip, a path, four stones and the
 * caretaker's lantern. Purely presentational: the lit stones and lantern position come from the
 * `CaretakerSceneModel`; the component reads no clock. Hidden from assistive technology; the text
 * stage list stays the accessible source of truth. Colours are `var(--color-*)` tokens only.
 * Transitions (lantern `transform`, glow `opacity`) are declared in globals.css.
 */

import type { CSSProperties } from "react";
import type { CaretakerSceneModel } from "@/view-model/caretaker-scene";
import { FogLayer } from "./fog-layer";
import { SceneBackdrop } from "./scene-backdrop";

const STONE_Y = 128;

export function CaretakerScene({ model, still }: { model: CaretakerSceneModel; still: boolean }) {
  return (
    <div className="gk-caretaker-scene" aria-hidden="true" data-still={still}>
      <SceneBackdrop variant="scanning" />
      <svg viewBox="0 0 400 180" preserveAspectRatio="xMidYMax slice" focusable="false">
        {/* Path winding past the stones. */}
        <path
          className="gk-path"
          d="M0 164 C60 150 100 160 150 150 C210 138 250 156 300 146 C340 138 370 144 400 138"
          fill="none"
          stroke="var(--color-iron)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {model.stones.map((s) => (
          <g key={s.index} className="gk-stone" data-lit={s.lit} transform={`translate(${s.x} ${STONE_Y})`}>
            <ellipse
              className="gk-stone-glow"
              cx="0"
              cy="-14"
              rx="22"
              ry="26"
              fill="var(--color-amber)"
              opacity={s.lit ? 0.45 : 0}
            />
            <path
              d="M-12 22 V-6 C-12 -22 12 -22 12 -6 V22 Z"
              fill="var(--color-stone)"
              stroke="var(--color-iron)"
              strokeWidth="2"
            />
          </g>
        ))}
        {/* Lantern: x moves with a CSS transition on transform (see globals.css). */}
        <g
          className="gk-caretaker"
          style={{ "--lantern-x": model.lanternX } as CSSProperties}
        >
          <circle cx="0" cy="146" r="14" fill="var(--color-amber)" opacity="0.3" />
          <path d="M0 126 V132" stroke="var(--color-iron)" strokeWidth="2" strokeLinecap="round" />
          <rect x="-4" y="132" width="8" height="12" rx="2" fill="var(--color-amber)" />
        </g>
      </svg>
      <FogLayer />
    </div>
  );
}
