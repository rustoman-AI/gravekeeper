"use client";

import type { CSSProperties } from "react";
import type { PlotModel } from "@/view-model";

export interface SceneTooltipProps {
  id: string;
  plot: PlotModel | null;
}

/**
 * The single tooltip. Always mounted so the id stays valid; hidden when no plot is active.
 * Pointer handling (staying open while hovered) lives in the Scene's delegated handlers.
 */
export function SceneTooltip({ id, plot }: SceneTooltipProps) {
  if (plot === null) return null;
  const style = {
    "--x": `${plot.x}px`,
    "--y": `${plot.y}px`,
    "--w": `${plot.width}px`,
    "--h": `${plot.height}px`,
  } as CSSProperties;
  return (
    <div id={id} role="tooltip" className="gk-tooltip" style={style}>
      <strong>{plot.tooltip.title}</strong>
      {plot.tooltip.lines.map((line, i) => (
        <span key={i} className="gk-tooltip-line">
          {line}
        </span>
      ))}
    </div>
  );
}
