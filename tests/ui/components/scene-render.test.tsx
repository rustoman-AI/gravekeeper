// @vitest-environment jsdom
// Render and memoisation test for the scene (graveyard-ui R8.8, R8.9, R17.5).
//
// Render counter: `vi.mock` replaces `components/scene-plot` with a test-only wrapper around the REAL module. The
// wrapper keeps the real memoisation (it re-applies `memo` only when the real export is a memo component, with the
// real comparator) and counts every call of the real render function. A plot that React skips because its props are
// equal is not counted; a plot that re-renders is. If the real component stopped being memoised, the wrapper would
// not be memoised either and the "same model" assertion would fail. The components themselves are not modified.
import { render } from "@testing-library/react";
import { memo } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const counter = vi.hoisted(() => ({ renders: 0 }));

vi.mock("../../../components/scene-plot", async () => {
  const actual = await vi.importActual<typeof import("../../../components/scene-plot")>(
    "../../../components/scene-plot",
  );
  type Loose = (props: any) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const real = actual.ScenePlot as unknown as Loose & {
    type?: Loose;
    compare?: ((a: unknown, b: unknown) => boolean) | null;
  };
  const isMemo = (real as { type?: unknown }).type !== undefined;
  const impl: Loose = isMemo ? (real.type as Loose) : real;
  const Counted: Loose = (props) => {
    counter.renders += 1;
    return impl(props);
  };
  const ScenePlot = isMemo ? memo(Counted, real.compare ?? undefined) : Counted;
  return { ...actual, ScenePlot };
});

import { Scene } from "../../../components/scene";
import { SCENE_MAX_PLOTS } from "../../../view-model";
import { buildPackageRows } from "../../../view-model/package-rows";
import { parseScanResponse } from "../../../view-model/parse-response";
import { buildSceneModel } from "../../../view-model/scene";
import { symbolIdOf, variantOf } from "../../../view-model/variants";
import type { SceneModel } from "../../../view-model";
import type { ScanResult } from "../../../pipeline/scan/types";
import { result300, result301 } from "../../support/ui/scan-result-builder";

const headers = { get: (): string | null => null };

function sceneOf(result: ScanResult): SceneModel {
  const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
  if (out.kind !== "result") throw new Error("fixture did not parse");
  return buildSceneModel(buildPackageRows(out.result), 10);
}

describe("Scene render", () => {
  beforeEach(() => {
    counter.renders = 0;
  });
  afterEach(() => {
    counter.renders = 0;
  });

  it("renders 300 plots with four nodes each and no simplification", () => {
    const scene = sceneOf(result300());
    expect(scene.plots.length).toBe(SCENE_MAX_PLOTS);
    const { container } = render(<Scene scene={scene} onOpen={() => {}} skipTargetId="toggle" />);
    const root = container.querySelector(".gk-scene") as HTMLElement;
    expect(root.getAttribute("data-simplified")).toBe("false");
    const plots = root.querySelectorAll("button.gk-plot");
    expect(plots.length).toBe(300);
    for (const plot of Array.from(plots)) {
      // button, svg, use, span
      expect(1 + plot.querySelectorAll("*").length).toBe(4);
      expect(plot.querySelectorAll(":scope > svg.gk-plot-art > use").length).toBe(1);
      expect(plot.querySelectorAll(":scope > span.gk-plot-label").length).toBe(1);
    }
  });

  it("sets data-simplified at 301 plots and still renders every plot", () => {
    const scene = sceneOf(result301());
    expect(scene.plots.length).toBe(SCENE_MAX_PLOTS + 1);
    expect(scene.simplified).toBe(true);
    const { container } = render(<Scene scene={scene} onOpen={() => {}} skipTargetId="toggle" />);
    const root = container.querySelector(".gk-scene") as HTMLElement;
    expect(root.getAttribute("data-simplified")).toBe("true");
    expect(root.querySelectorAll("button.gk-plot").length).toBe(301);
    // graveyard-art GA-D7: the simplified form keeps `-flat` after the variant.
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button.gk-plot"));
    buttons.forEach((b, i) => {
      const plot = scene.plots[i];
      expect(b.querySelector("use")?.getAttribute("href")).toBe(
        "#" + symbolIdOf(plot.kind, variantOf(plot.kind, plot.key), true),
      );
      // graveyard-art Requirement 3.7: `--tilt` only when the tilt is not 0.
      expect(b.style.getPropertyValue("--tilt")).toBe(plot.tilt !== 0 ? `${plot.tilt}deg` : "");
    });
    expect(scene.plots.some((p) => p.tilt !== 0)).toBe(true);
  });

  it("does not re-render any plot when the same SceneModel object is passed again", () => {
    const scene = sceneOf(result300());
    const onOpen = () => {};
    const { rerender, container } = render(<Scene scene={scene} onOpen={onOpen} skipTargetId="toggle" />);
    expect(counter.renders).toBe(300);
    const before = container.querySelector("button.gk-plot");

    counter.renders = 0;
    rerender(<Scene scene={scene} onOpen={onOpen} skipTargetId="toggle" />);
    expect(counter.renders).toBe(0);
    expect(container.querySelector("button.gk-plot")).toBe(before);
  });
});
