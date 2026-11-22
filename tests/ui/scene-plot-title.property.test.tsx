// @vitest-environment jsdom
// Feature: polish-leftovers, Property 4: The full name is in the graphic's title exactly when the label may be cut
// Validates: Requirements 2.5, 2.6, 2.7
import { cleanup, render } from "@testing-library/react";
import * as fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { ScenePlot } from "../../components/scene-plot";
import { mayTruncateLabel } from "../../view-model/label-fit";
import type { PlotModel } from "../../view-model/types";
import { cfg } from "../support/fc-config";

afterEach(cleanup);

function plotOf(name: string, width: number): PlotModel {
  return {
    key: `npm:${name}`,
    index: 0,
    row: 0,
    col: 0,
    kind: "lantern",
    graveType: null,
    glow: null,
    label: name,
    accessibleLabel: `${name}, npm, alive, maintained`,
    tooltip: { title: name, lines: [] },
    x: 0,
    y: 0,
    width,
    height: 100,
    phase: 0,
    depthScale: 1,
    depthBrightness: 1,
    variant: "a",
    symbolId: "plot-lantern-a",
    tilt: 0,
  } as unknown as PlotModel;
}

function renderPlot(name: string, width: number) {
  const { container } = render(<ScenePlot plot={plotOf(name, width)} tabbable simplified={false} />);
  const button = container.querySelector("button.gk-plot") as HTMLButtonElement;
  const svg = button.querySelector("svg") as SVGSVGElement;
  return { button, svg, title: svg.querySelector(":scope > title") };
}

const NAME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-_.@/".split("");
const nameArb = fc
  .array(fc.constantFrom(...NAME_CHARS), { minLength: 1, maxLength: 60 })
  .map((c) => c.join(""));
const widthArb = fc.integer({ min: 20, max: 200 });

describe("Property 4: title holds the full name exactly when the label may be cut", () => {
  it("svg > title equals the name iff mayTruncateLabel; aria-label starts with the name", () => {
    fc.assert(
      fc.property(nameArb, widthArb, (name, width) => {
        const { button, svg, title } = renderPlot(name, width);
        if (mayTruncateLabel(name, width)) {
          expect(title).not.toBeNull();
          expect(title?.textContent).toBe(name);
          expect(svg.firstElementChild).toBe(title);
        } else {
          expect(title).toBeNull();
        }
        expect(button.getAttribute("aria-label")?.startsWith(name)).toBe(true);
        expect(svg.getAttribute("aria-hidden")).toBe("true");
        cleanup();
      }),
      cfg(),
    );
  });
});

describe("scene plot title examples", () => {
  it("karma-phantomjs-launcher has a title with the full name and an accessible name containing it", () => {
    const name = "karma-phantomjs-launcher";
    const { button, title } = renderPlot(name, 80);
    expect(title?.textContent).toBe(name);
    expect(button.getAttribute("aria-label")?.startsWith(name)).toBe(true);
  });

  it("a short name has no title", () => {
    const { title } = renderPlot("uuid", 80);
    expect(title).toBeNull();
  });
});
