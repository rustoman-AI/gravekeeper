// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResultsPage } from "../../../components/results-page";
import { Scene } from "../../../components/scene";
import { SceneStage } from "../../../components/scene-stage";
import { buildPackageRows } from "../../../view-model/package-rows";
import { buildSceneModel } from "../../../view-model/scene";
import type { ParsedScanResult } from "../../../view-model/types";
import { buildScanResult, noManifestsResult } from "../../support/ui/scan-result-builder";

// graveyard-art R1.2, R1.8, R2.9, R14.4.
afterEach(cleanup);

const asParsed = (r: unknown) => r as ParsedScanResult;

function page(result: ParsedScanResult, view: "scene" | "list") {
  return render(
    <ResultsPage
      result={result}
      cache="miss"
      nowMs={Date.parse("2026-01-01T00:00:00Z")}
      view={view}
      onViewChange={() => {}}
      onScanManifests={() => {}}
    />,
  );
}

const alive = () =>
  asParsed(
    buildScanResult([
      { name: "alpha-alive", kind: "alive" },
      { name: "beta-ghost", kind: "ghost" },
      { name: "gamma-buried", kind: "buried" },
    ]),
  );

describe("SceneStage", () => {
  it("contains exactly one backdrop svg and its children", () => {
    const { container } = render(
      <SceneStage>
        <p>inside</p>
      </SceneStage>,
    );
    expect(container.querySelectorAll(".gk-stage")).toHaveLength(1);
    expect(container.querySelectorAll("svg.gk-backdrop")).toHaveLength(1);
    expect(container.querySelector(".gk-stage-inner")?.textContent).toBe("inside");
  });
});

describe("ResultsPage stage", () => {
  it("renders a stage in the scene view", () => {
    const { container } = page(alive(), "scene");
    expect(container.querySelectorAll(".gk-stage")).toHaveLength(1);
    expect(container.querySelectorAll("svg.gk-backdrop")).toHaveLength(1);
    expect(container.querySelectorAll(".gk-stage button.gk-plot")).toHaveLength(3);
  });

  it("renders no stage in the list view", () => {
    const { container } = page(alive(), "list");
    expect(container.querySelector(".gk-stage")).toBeNull();
    expect(container.querySelector("svg.gk-backdrop")).toBeNull();
  });

  it("renders no stage for the empty graveyard", () => {
    const { container } = page(asParsed(noManifestsResult()), "scene");
    expect(container.querySelector(".gk-stage")).toBeNull();
    expect(container.querySelector("svg.gk-backdrop")).toBeNull();
  });
});

describe("Plot with depth", () => {
  it("keeps four elements per plot and does not dim the label", () => {
    const rows = buildPackageRows(alive());
    const scene = buildSceneModel(rows, 1);
    const { container } = render(<Scene scene={scene} onOpen={() => {}} skipTargetId="toggle" />);
    const plots = Array.from(container.querySelectorAll<HTMLButtonElement>("button.gk-plot"));
    expect(plots).toHaveLength(3);
    for (const plot of plots) {
      // button, svg, use, span; the optional svg > title is not counted
      expect(1 + plot.querySelectorAll("*:not(svg > title)").length).toBe(4);
      expect(plot.querySelectorAll(":scope > svg.gk-plot-art > use")).toHaveLength(1);
      const label = plot.querySelector<HTMLElement>(":scope > span.gk-plot-label");
      expect(label).not.toBeNull();
      expect(label?.style.opacity).toBe("");
      expect(label?.getAttribute("style") ?? "").not.toMatch(/opacity|--depth/);
    }
  });

  it("adds exactly one svg > title as the first svg child for a label that may truncate", () => {
    const longName = "karma-phantomjs-launcher-extra-long-hyphenated-package-name-for-truncation";
    const rows = buildPackageRows(asParsed(buildScanResult([{ name: longName, kind: "alive" }])));
    const scene = buildSceneModel(rows, 1);
    const { container } = render(<Scene scene={scene} onOpen={() => {}} skipTargetId="toggle" />);
    const plot = container.querySelector<HTMLButtonElement>("button.gk-plot");
    expect(plot).not.toBeNull();
    const titles = plot!.querySelectorAll("svg > title");
    expect(titles).toHaveLength(1);
    expect(plot!.querySelector("svg")?.firstElementChild).toBe(titles[0]);
    expect(titles[0].textContent).toBe(scene.plots[0].label);
    expect(1 + plot!.querySelectorAll("*:not(svg > title)").length).toBe(4);
    expect(plot!.querySelectorAll("*")).toHaveLength(4);
  });

  it("writes depth values on the plot only when they differ from 1", () => {
    const scene = buildSceneModel(buildPackageRows(alive()), 1);
    const { container } = render(<Scene scene={scene} onOpen={() => {}} skipTargetId="toggle" />);
    const plots = Array.from(container.querySelectorAll<HTMLButtonElement>("button.gk-plot"));
    plots.forEach((p, i) => {
      const m = scene.plots[i];
      expect(p.style.getPropertyValue("--depth-scale")).toBe(m.depthScale === 1 ? "" : String(m.depthScale));
      expect(p.style.getPropertyValue("--depth-bright")).toBe(
        m.depthBrightness === 1 ? "" : String(m.depthBrightness),
      );
    });
    // three rows in one column: the back row is smaller than the front row
    expect(scene.plots[0].depthScale).toBeLessThan(1);
    expect(scene.plots[2].depthScale).toBe(1);
  });
});
