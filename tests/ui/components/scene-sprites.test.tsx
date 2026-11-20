// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SceneSprites } from "../../../components/scene-sprites";

const KINDS = ["tombstone", "overgrown", "ghost", "restless", "lantern", "unmarked"];
const COLOUR_PROPS = ["fill", "stroke", "stop-color", "color"];
const ALLOWED = [/^var\(--color-[a-z0-9-]+\)$/, /^url\(#[\w-]+\)$/, /^none$/, /^currentColor$/i, /^transparent$/];

function sheet() {
  const { container } = render(<SceneSprites />);
  return container.querySelector("svg") as SVGSVGElement;
}

describe("SceneSprites", () => {
  it("defines the six symbols and their -flat variants", () => {
    const svg = sheet();
    for (const kind of KINDS) {
      for (const id of [`plot-${kind}`, `plot-${kind}-flat`]) {
        const el = svg.querySelector(`[id="${id}"]`);
        expect(el, id).not.toBeNull();
        expect(el?.tagName.toLowerCase()).toBe("symbol");
      }
    }
  });

  it("is hidden from assistive technology", () => {
    expect(sheet().getAttribute("aria-hidden")).toBe("true");
  });

  it("contains no filter or image element", () => {
    const svg = sheet();
    expect(svg.querySelectorAll("filter, image, feImage").length).toBe(0);
  });

  it("only references local ids that exist in the sheet", () => {
    const svg = sheet();
    const refs = Array.from(svg.querySelectorAll("*")).flatMap((el) =>
      ["href", "xlink:href"].flatMap((name) => {
        const v = el.getAttribute(name);
        return v === null ? [] : [v];
      }),
    );
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.startsWith("#"), ref).toBe(true);
      expect(svg.querySelector(`[id="${ref.slice(1)}"]`), ref).not.toBeNull();
    }
  });

  it("declares shared defs", () => {
    const svg = sheet();
    for (const id of ["plot-glow-gradient", "shape-tombstone", "shape-ghost", "shape-glow"]) {
      expect(svg.querySelector(`[id="${id}"]`), id).not.toBeNull();
    }
  });

  it("uses no literal colours in attributes or inline styles", () => {
    const svg = sheet();
    const values: string[] = [];
    for (const el of Array.from(svg.querySelectorAll("*"))) {
      for (const prop of COLOUR_PROPS) {
        const v = el.getAttribute(prop);
        if (v !== null) values.push(v.trim());
      }
      const style = el.getAttribute("style") ?? "";
      for (const decl of style.split(";")) {
        const idx = decl.indexOf(":");
        if (idx < 0) continue;
        const prop = decl.slice(0, idx).trim().toLowerCase();
        if (COLOUR_PROPS.includes(prop)) values.push(decl.slice(idx + 1).trim());
      }
    }
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(ALLOWED.some((re) => re.test(v)), v).toBe(true);
    }
  });
});
