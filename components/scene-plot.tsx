import { memo } from "react";
import type { CSSProperties } from "react";
import type { PlotModel } from "@/view-model";

export interface ScenePlotProps {
  plot: PlotModel;
  tabbable: boolean;
  simplified: boolean;
}

function ScenePlotImpl({ plot, tabbable, simplified }: ScenePlotProps) {
  const style: Record<string, string | number> = {
    "--x": `${plot.x}px`,
    "--y": `${plot.y}px`,
    "--w": `${plot.width}px`,
    "--h": `${plot.height}px`,
    "--phase": plot.phase,
  };
  if (plot.glow !== null) style["--glow"] = plot.glow;
  // graveyard-art Requirement 2.9: depth values are written only when they differ from 1.
  // Brightness is applied inside the sprite symbols (opacity: var(--depth-bright)); the label is not dimmed or scaled.
  if (plot.depthScale !== 1) style["--depth-scale"] = plot.depthScale;
  if (plot.depthBrightness !== 1) style["--depth-bright"] = plot.depthBrightness;
  // graveyard-art Requirement 3.7: tilt is written only when not 0.
  if (plot.tilt !== 0) style["--tilt"] = `${plot.tilt}deg`;
  return (
    <button
      type="button"
      className="gk-plot"
      data-kind={plot.kind}
      data-index={plot.index}
      tabIndex={tabbable ? 0 : -1}
      aria-label={plot.accessibleLabel}
      style={style as CSSProperties}
    >
      <svg className="gk-plot-art" aria-hidden="true" focusable="false">
        <use href={"#" + plot.symbolId + (simplified ? "-flat" : "")} />
      </svg>
      <span className="gk-plot-label">{plot.label}</span>
    </button>
  );
}

export const ScenePlot = memo(ScenePlotImpl);
