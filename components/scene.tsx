"use client";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
} from "react";
import { nextFocus, PLOT_CELL_HEIGHT_PX, SCENE_PADDING_PX } from "@/view-model";
import type { FocusMove, PlotModel, SceneModel } from "@/view-model";
import { FogLayer } from "./fog-layer";
import { ScenePlot } from "./scene-plot";
import { measureSceneCommit } from "./scene-perf";
import { SceneTooltip } from "./scene-tooltip";
import { SkipLink } from "./skip-link";

export interface SceneProps {
  scene: SceneModel;
  /** Called with the plot index on click, Enter or Space. */
  onOpen: (index: number) => void;
  /** Element id of the view toggle; the skip link moves focus there. */
  skipTargetId: string;
}

// Room under a cell for the epitaph label, which sits below the plot box.
const BAND_LABEL_ROOM_PX = 32;

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

// Rows from the top that render at once; later rows render when they come near the viewport.
const INITIAL_OPEN_ROWS = 4;
const WINDOW_MARGIN = "300px 0px";
// Bands that never come near the viewport still mount after the first frames, one row every
// FILL_STEP_MS, so the scene holds every plot (Requirement 8.9) without delaying the first commit.
const FILL_DELAY_MS = 400;
const FILL_STEP_MS = 40;

interface SceneBandProps {
  row: number;
  plots: readonly PlotModel[];
  tabIndex: number;
  simplified: boolean;
}

/**
 * One row of plots (render budget contingency b). Its plots mount when the band nears the
 * viewport and stay mounted. The band holding the tab stop always mounts, so keyboard focus
 * has a target. Without IntersectionObserver every band mounts.
 */
const SceneBand = memo(function SceneBand({
  row,
  plots,
  tabIndex,
  simplified,
}: SceneBandProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(
    () =>
      row < INITIAL_OPEN_ROWS || typeof IntersectionObserver === "undefined",
  );
  const bandTop = SCENE_PADDING_PX + row * PLOT_CELL_HEIGHT_PX;
  const holdsTabStop = plots.some((plot) => plot.index === tabIndex);
  const open = near || holdsTabStop;

  useEffect(() => {
    if (open) return;
    const timer = setTimeout(
      () => setNear(true),
      FILL_DELAY_MS + Math.max(0, row - INITIAL_OPEN_ROWS) * FILL_STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [open, row]);

  useEffect(() => {
    const el = ref.current;
    if (open || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: WINDOW_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  return (
    <div
      ref={ref}
      className="gk-scene-band"
      style={
        {
          top: bandTop,
          height: PLOT_CELL_HEIGHT_PX + BAND_LABEL_ROOM_PX,
          "--band-y": `${bandTop}px`,
        } as CSSProperties
      }
    >
      {open
        ? plots.map((plot) => (
            <ScenePlot
              key={plot.key}
              plot={plot}
              tabbable={plot.index === tabIndex}
              simplified={simplified}
            />
          ))
        : null}
    </div>
  );
});

export function Scene({ scene, onOpen, skipTargetId }: SceneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [focusIndex, setFocusIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState<number | null>(null);

  // Inert unless window.__GK_PERF__ is true; a new scene model measures again.
  useLayoutEffect(() => {
    measureSceneCommit();
  }, [scene]);

  // Row bands (render budget contingency a): offscreen bands are skipped with content-visibility.
  const bands = useMemo(() => {
    const out: { row: number; plots: PlotModel[] }[] = [];
    for (const plot of scene.plots) {
      const last = out[out.length - 1];
      if (last && last.row === plot.row) last.plots.push(plot);
      else out.push({ row: plot.row, plots: [plot] });
    }
    return out;
  }, [scene]);

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
    if (to instanceof Element && to.closest(".gk-tooltip, [data-index]"))
      return;
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
    if (to instanceof Element && to.closest(".gk-tooltip, [data-index]"))
      return;
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
      <SkipLink
        href={`#${skipTargetId}`}
        label="Skip the graveyard scene"
        onClick={handleSkip}
      />
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
        {bands.map((band) => (
          <SceneBand
            key={band.row}
            row={band.row}
            plots={band.plots}
            tabIndex={tabIndex}
            simplified={scene.simplified}
          />
        ))}
        <SceneTooltip id={tooltipId} plot={tipPlot} />
      </div>
    </>
  );
}
