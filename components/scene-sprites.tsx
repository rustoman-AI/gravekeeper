/**
 * One hidden sprite sheet for the Scene. Every plot has a <symbol> with the id
 * `plot-<kind>-<variant>` (see `symbolIdOf`) and a `-flat` twin for the
 * simplified form. The sheet is assembled from the shared defs, the shared
 * glow gradient and the three sprite files (stones, ghosts, props).
 * Colours come from the design tokens only. No filter, no mask, no raster
 * image and no external reference.
 *
 * Glow is a radial gradient whose opacity follows the `--glow` level (1..4)
 * set on the plot button; custom properties inherit into the <use> tree.
 */

import { memo } from "react";
import { SceneDefs } from "./scene-defs";
import { GhostDefs, GhostSymbols } from "./scene-sprite-ghosts";
import { PropsDefs, PropsSymbols } from "./scene-sprite-props";
import { SceneSpriteStones } from "./scene-sprite-stones";

function SceneSpritesImpl() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        <SceneDefs />
        <radialGradient id="plot-glow-gradient" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--color-spectral)" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="var(--color-spectral)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--color-spectral)" stopOpacity="0" />
        </radialGradient>
        <GhostDefs />
        <PropsDefs />
      </defs>

      {/* Stones bring their own <defs> (shape-stone-<v>) and the stone symbols. */}
      <SceneSpriteStones />
      <GhostSymbols />
      <PropsSymbols />
    </svg>
  );
}

export const SceneSprites = memo(SceneSpritesImpl);
