// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Scene } from "../../../components/scene";
import { buildPackageRows } from "../../../view-model/package-rows";
import { buildSceneModel } from "../../../view-model/scene";
import { symbolIdOf, variantOf } from "../../../view-model/variants";
import type { ParsedScanResult, PlotKind, SceneModel } from "../../../view-model/types";
import { buildScanResult } from "../../support/ui/scan-result-builder";
import type { RowSpec } from "../../support/ui/scan-result-builder";

// R8.4, R8.8, R9.1 to R9.6, R9.8, R7.6.
const SPECS: readonly RowSpec[] = [
  { name: "alpha-alive", kind: "alive" },
  { name: "beta-ghost", kind: "ghost" },
  { name: "gamma-restless", kind: "restless-archived" },
  { name: "delta-buried", kind: "buried" },
  { name: "epsilon-forgotten", kind: "forgotten" },
  { name: "zeta-unmarked", kind: "unassessed-git" },
  { name: "eta-alive", kind: "alive" },
];

const WORDS: Record<PlotKind, string> = {
  lantern: "alive",
  ghost: "haunted",
  restless: "haunted, buried",
  tombstone: "dead, buried",
  overgrown: "dead, forgotten",
  unmarked: "not assessed",
};

const COLUMNS = 3;

function sceneOf(): SceneModel {
  const parsed = buildScanResult(SPECS) as unknown as ParsedScanResult;
  return buildSceneModel(buildPackageRows(parsed), COLUMNS);
}

function setup() {
  const scene = sceneOf();
  const onOpen = vi.fn();
  const user = userEvent.setup();
  render(
    <>
      <button id="toggle" type="button">
        toggle
      </button>
      <Scene scene={scene} onOpen={onOpen} skipTargetId="toggle" />
    </>,
  );
  const plots = () => Array.from(document.querySelectorAll<HTMLButtonElement>("button.gk-plot"));
  return { scene, onOpen, user, plots };
}

afterEach(cleanup);

const focusPlot = (el: HTMLElement) => act(() => el.focus());

describe("Scene", () => {
  it("has seven plots in a single tab stop", () => {
    const { plots } = setup();
    expect(plots()).toHaveLength(7);
    expect(plots().filter((p) => p.tabIndex === 0)).toHaveLength(1);
  });

  it("moves focus by row and column with the arrow keys, Home and End", async () => {
    const { plots, user } = setup();
    const at = (i: number) => expect(document.activeElement).toBe(plots()[i]);
    focusPlot(plots()[0]);
    at(0);
    await user.keyboard("{ArrowRight}");
    at(1);
    await user.keyboard("{ArrowDown}");
    at(4);
    await user.keyboard("{ArrowLeft}");
    at(3);
    await user.keyboard("{ArrowUp}");
    at(0);
    await user.keyboard("{End}");
    at(2);
    await user.keyboard("{ArrowDown}");
    at(5);
    await user.keyboard("{Home}");
    at(3);
    await user.keyboard("{ArrowDown}");
    at(6);
    await user.keyboard("{End}");
    at(6);
    await user.keyboard("{ArrowRight}");
    at(6);
  });

  it("keeps a single tab stop that follows focus", async () => {
    const { plots, user } = setup();
    focusPlot(plots()[0]);
    await user.keyboard("{ArrowRight}");
    expect(plots().filter((p) => p.tabIndex === 0)).toEqual([plots()[1]]);
  });

  it("calls onOpen on Enter, Space and click", async () => {
    const { plots, user, onOpen } = setup();
    focusPlot(plots()[2]);
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenLastCalledWith(2);
    await user.keyboard(" ");
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenLastCalledWith(2);
    await user.click(plots()[4]);
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(onOpen).toHaveBeenLastCalledWith(4);
  });

  it("shows no tooltip until a plot is active", () => {
    setup();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows the tooltip with name, ecosystem, status word, score and epitaph on hover", async () => {
    const { scene, plots, user } = setup();
    const plot = scene.plots[3];
    await user.hover(plots()[3]);
    const tip = screen.getByRole("tooltip");
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    expect(within(tip).getByText(plot.tooltip.title)).toBeTruthy();
    const [ecosystem, word, score, epitaph] = plot.tooltip.lines;
    expect(ecosystem).toBe("npm");
    expect(word).toBe(WORDS[plot.kind]);
    expect(score).toMatch(/^score: /);
    expect(epitaph.length).toBeGreaterThan(0);
    for (const line of plot.tooltip.lines) expect(tip.textContent).toContain(line);
  });

  it("shows the tooltip on focus", () => {
    const { scene, plots } = setup();
    focusPlot(plots()[1]);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain(scene.plots[1].tooltip.title);
    for (const line of scene.plots[1].tooltip.lines) expect(tip.textContent).toContain(line);
  });

  it("keeps the tooltip while the pointer moves onto it and hides it when the pointer leaves", async () => {
    const { plots, user } = setup();
    await user.hover(plots()[0]);
    const tip = screen.getByRole("tooltip");
    fireEvent.mouseOut(plots()[0], { relatedTarget: tip });
    fireEvent.mouseOver(tip);
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    fireEvent.mouseOut(tip, { relatedTarget: document.body });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("hides the tooltip on Escape and keeps focus", async () => {
    const { plots, user } = setup();
    focusPlot(plots()[2]);
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(document.activeElement).toBe(plots()[2]);
  });

  it("gives every plot an accessible name", () => {
    const { scene, plots } = setup();
    plots().forEach((p, i) => {
      const name = p.getAttribute("aria-label") ?? "";
      expect(name.length).toBeGreaterThan(0);
      expect(name).toBe(scene.plots[i].accessibleLabel);
    });
  });

  it("renders the matching symbol for each of the six kinds", () => {
    const { scene, plots } = setup();
    const kinds = new Set<string>();
    plots().forEach((p, i) => {
      const kind = scene.plots[i].kind;
      kinds.add(kind);
      expect(p.getAttribute("data-kind")).toBe(kind);
      // graveyard-art GA-D7: the href carries the variant, `#plot-<kind>-<variant>`.
      const plot = scene.plots[i];
      expect(p.querySelector("use")?.getAttribute("href")).toBe(
        "#" + symbolIdOf(kind, variantOf(kind, plot.key), false),
      );
      // graveyard-art Requirement 3.7: `--tilt` is written only when the tilt is not 0.
      expect(p.style.getPropertyValue("--tilt")).toBe(plot.tilt !== 0 ? `${plot.tilt}deg` : "");
    });
    expect(Array.from(kinds).sort()).toEqual(Object.keys(WORDS).sort());
  });

  it("names a restless plot with the status word 'haunted, buried'", () => {
    const { plots } = setup();
    const restless = plots().find((p) => p.getAttribute("data-kind") === "restless");
    expect(restless).toBeDefined();
    expect(restless?.getAttribute("aria-label")).toContain("haunted, buried");
  });
});
