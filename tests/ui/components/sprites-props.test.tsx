// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PropsDefs, PropsSymbols } from "@/components/scene-sprite-props";
import { symbolIdOf } from "@/view-model/variants";

afterEach(cleanup);

function renderSheet(): Element {
  const { container } = render(
    <svg>
      <defs>
        <PropsDefs />
      </defs>
      <PropsSymbols />
    </svg>,
  );
  return container;
}

const IDS = [
  symbolIdOf("lantern", "iron", false),
  symbolIdOf("lantern", "iron", true),
  symbolIdOf("unmarked", "mound", false),
  symbolIdOf("unmarked", "mound", true),
];

describe("lantern and unmarked sprites", () => {
  it("defines all four symbols with the depth root", () => {
    const c = renderSheet();
    for (const id of IDS) {
      const sym = c.querySelector(`#${id}`)!;
      expect(sym.getAttribute("viewBox")).toBe("0 0 80 104");
      expect(sym.querySelector(":scope > g")!.getAttribute("style")).toContain("--depth-bright");
    }
  });

  it("draws the light pool only in the non-flat lantern", () => {
    const c = renderSheet();
    expect(c.querySelector("#lantern-pool-gradient")).not.toBeNull();
    expect(c.querySelector("#shape-lantern-pool ellipse")!.getAttribute("fill")).toBe(
      "url(#lantern-pool-gradient)",
    );
    expect(c.querySelector(`#${IDS[0]} use[href="#shape-lantern-pool"]`)).not.toBeNull();
    const flat = c.querySelector(`#${IDS[1]}`)!;
    expect(flat.innerHTML).not.toContain("pool");
    expect(c.querySelector("#shape-lantern-body-flat")!.innerHTML).not.toContain("gradient");
  });

  it("lantern has cap, bars, glass, flame and a flicker group", () => {
    const c = renderSheet();
    for (const id of ["shape-lantern-body", "shape-lantern-body-flat"]) {
      const g = c.querySelector(`#${id}`)!;
      expect(g.querySelector('[data-part="cap"]')).not.toBeNull();
      expect(g.querySelector('[data-part="bar"]')).not.toBeNull();
      expect(g.querySelector(".gk-lantern-light")!.querySelector('[data-part="glass"]')).not.toBeNull();
      expect(g.querySelector(".gk-lantern-light")!.querySelector('[data-part="flame"]')).not.toBeNull();
    }
  });

  it("unmarked grave has a mound and a marker of two planks", () => {
    const c = renderSheet();
    for (const id of ["shape-unmarked-mound", "shape-unmarked-mound-flat"]) {
      const g = c.querySelector(`#${id}`)!;
      expect(g.querySelector('[data-part="mound"]')).not.toBeNull();
      expect(g.querySelectorAll('[data-part="marker"] [data-part="plank"]')).toHaveLength(2);
    }
  });

  it("symbols have distinct markup and use no filter, mask, text or colour literal", () => {
    const c = renderSheet();
    const markup = IDS.map((id) => c.querySelector(`#${id}`)!.innerHTML);
    expect(new Set(markup).size).toBe(IDS.length);
    const html = c.innerHTML;
    expect(html).not.toMatch(/<(filter|mask|text)/i);
    expect(html).not.toMatch(/(fill|stroke|stop-color)="#/i);
  });
});
