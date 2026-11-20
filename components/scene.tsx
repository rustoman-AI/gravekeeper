"use client";

import { useCallback, useId, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, KeyboardEvent, MouseEvent } from "react";
import { nextFocus } from "@/view-model";
import type { FocusMove, SceneModel } from "@/view-model";
import { FogLayer } from "./fog-layer";
import { ScenePlot } from "./scene-plot";
import { SceneTooltip } from "./scene-tooltip";
import { SkipLink } from "./skip-link";

export interface SceneProps {
  scene: SceneModel;
  /** Called with the plot index on click, Enter or Space. */
  onOpen: (index: number) => void;
  /** Element id of the view toggle; the skip link moves focus there. */
  skipTargetId: string;
}

const MOVES: Record<string, FocusMove> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Home: "home",
  End: "end",
};

function indexOf(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("[data-index]");
  if (!el) return null;
  const n = Number(el.getAttribute("data-index"));
  return Number.isInteger(n) ? n : null;
}

export function Scene({ scene, onOpen, skipTargetId }: SceneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [focusIndex, setFocusIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState<number | null>(null);

  const count = scene.plots.length;
  const tabIndex = count === 0 ? -1 : Math.min(focusIndex, count - 1);
  const tipPlot = tipIndex !== null ? (scene.plots[tipIndex] ?? null) : null;

  const handleSkip = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      const target = document.getElementById(skipTargetId);
      if (target) {
        event.preventDefault();
        target.focus();
      }
    },
    [skipTargetId],
  );

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const i = indexOf(event.target);
    if (i !== null) {
      setFocusIndex(i);
      onOpen(i);
    }
  };

  const onMouseOver = (event: MouseEvent<HTMLDivElement>) => {
    const i = indexOf(event.target);
    if (i !== null) setTipIndex(i);
  };

  const onMouseOut = (event: MouseEvent<HTMLDivElement>) => {
    const to = event.relatedTarget;
    if (to instanceof Element && to.closest(".gk-tooltip, [data-index]")) return;
    setTipIndex(null);
  };

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const i = indexOf(event.target);
    if (i !== null) {
      setFocusIndex(i);
      setTipIndex(i);
    }
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const to = event.relatedTarget;
    if (to instanceof Element && to.closest(".gk-tooltip, [data-index]")) return;
    setTipIndex(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setTipIndex(null);
      return;
    }
    const move = MOVES[event.key];
    const current = indexOf(event.target);
    if (!move || current === null) return;
    event.preventDefault();
    const next = nextFocus(scene, current, move);
    if (next < 0) return;
    setFocusIndex(next);
    ref.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
  };

  const style = { height: scene.height, width: scene.width } as CSSProperties;

  return (
    <>
      <SkipLink href={`#${skipTargetId}`} label="Skip the graveyard scene" onClick={handleSkip} />
      {/* One delegated set of handlers; plots carry data-index only. */}
      <div
        ref={ref}
        role="group"
        aria-label="Dependency graveyard"
        className="gk-scene"
        data-simplified={scene.simplified ? "true" : "false"}
        style={style}
        onClick={onClick}
        onMouseOver={onMouseOver}
        onMouseOut={onMouseOut}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      >
        <FogLayer />
        {scene.plots.map((plot) => (
          <ScenePlot
            key={plot.key}
            plot={plot}
            tabbable={plot.index === tabIndex}
            simplified={scene.simplified}
          />
        ))}
        <SceneTooltip id={tooltipId} plot={tipPlot} />
      </div>
    </>
  );
}
