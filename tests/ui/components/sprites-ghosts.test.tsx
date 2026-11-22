// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GhostDefs, GhostSymbols } from "@/components/scene-sprite-ghosts";
import { restlessGhostTransform } from "@/view-model/restless-art";
import { SPRITE_VARIANTS, symbolIdOf } from "@/view-model/variants";

afterEach(cleanup);

function renderSheet(): Element {
  const { container } = render(
    <svg>
      <defs>
        <GhostDefs />
      </defs>
      <GhostSymbols />
    </svg>,
  );
  return container;
}

describe("ghost sprites", () => {
  it("draws a wisp with two eyes, no mouth, and the body gradient", () => {
    const c = renderSheet();
    const wisp = c.querySelector("#shape-ghost-wisp")!;
    expect(wisp.querySelectorAll("ellipse")).toHaveLength(0);
    expect(wisp.querySelectorAll('[data-part="eye"]')).toHaveLength(2);
    expect(wisp.querySelector("path")!.getAttribute("fill")).toBe("url(#ghost-body-gradient)");
    expect(c.querySelector("linearGradient#ghost-body-gradient, #ghost-body-gradient")).not.toBeNull();
    expect(c.querySelector("#shape-ghost-glow ellipse")!.getAttribute("style")).toContain("--glow");
  });

  it("restless symbols draw the stone first, then the wisp, with the helper transform", () => {
    const c = renderSheet();
    for (const v of SPRITE_VARIANTS.restless) {
      for (const flat of [false, true]) {
        const sym = c.querySelector(`#${symbolIdOf("restless", v, flat)}`)!;
        expect(sym.getAttribute("overflow")).toBe("visible");
        const groups = Array.from(sym.querySelectorAll(":scope > g > g"));
        expect(groups).toHaveLength(2);
        const [stone, wisp] = groups;
        expect(stone!.querySelector(`use[href="#shape-stone-${v}"]`)).not.toBeNull();
        expect(stone!.hasAttribute("transform")).toBe(false);
        expect(wisp!.getAttribute("transform")).toBe(restlessGhostTransform(v));
        expect(wisp!.querySelector(`use[href="#shape-ghost-wisp-restless${flat ? "-flat" : ""}"]`)).not.toBeNull();
        expect(sym.querySelector('use[href="#shape-ghost-glow"]')).toBeNull();
        expect(stone!.compareDocumentPosition(wisp!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    }
  });

  it("restless and haunted sprites render different markup and tints", () => {
    const c = renderSheet();
    const haunted = c.querySelector(`#${symbolIdOf("ghost", "wisp", false)}`)!.innerHTML;
    expect(haunted).toContain("shape-ghost-glow");
    expect(haunted).toContain("#shape-ghost-wisp");
    expect(haunted).not.toContain("shape-stone-");
    // The tint lives in the referenced shapes: compare the colour tokens each symbol resolves to.
    const tintOf = (ids: string[]) => ids.map((id) => c.querySelector(`#${id}`)!.innerHTML).join("");
    const hauntedTint = tintOf(["ghost-body-gradient", "shape-ghost-wisp", "shape-ghost-wisp-flat"]);
    const restlessTint = tintOf([
      "ghost-body-gradient-restless",
      "shape-ghost-wisp-restless",
      "shape-ghost-wisp-restless-flat",
    ]);
    expect(hauntedTint).toContain("--color-spectral");
    expect(hauntedTint).not.toContain("--color-wraith");
    expect(restlessTint).toContain("--color-wraith");
    expect(restlessTint).not.toContain("--color-spectral");
    for (const v of SPRITE_VARIANTS.restless) {
      for (const flat of [false, true]) {
        const html = c.querySelector(`#${symbolIdOf("restless", v, flat)}`)!.innerHTML;
        expect(html).not.toBe(c.querySelector(`#${symbolIdOf("ghost", "wisp", flat)}`)!.innerHTML);
        expect(html).toContain(`shape-stone-${v}`);
        expect(html).not.toContain("shape-ghost-glow");
        expect(html).not.toContain(`href="#shape-ghost-wisp${flat ? "-flat" : ""}"`);
      }
    }
  });

  it("the reduced-motion block stills the restless plot art", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const media = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    const block = media.slice(0, media.indexOf("\n}\n"));
    expect(block).toContain(".gk-plot[data-kind] .gk-plot-art");
    expect(block).toMatch(/animation:\s*none/);
    expect(css.indexOf('.gk-plot[data-kind="restless"] .gk-plot-art')).toBeLessThan(
      css.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
  });
  it("every symbol has the depth root and flat twins have no gradient or glow", () => {
    const c = renderSheet();
    const ids = [
      symbolIdOf("ghost", "wisp", false),
      symbolIdOf("ghost", "wisp", true),
      ...SPRITE_VARIANTS.restless.flatMap((v) => [
        symbolIdOf("restless", v, false),
        symbolIdOf("restless", v, true),
      ]),
    ];
    for (const id of ids) {
      const sym = c.querySelector(`#${id}`)!;
      expect(sym.querySelector(":scope > g")!.getAttribute("style")).toContain("--depth-bright");
    }
    for (const id of ids.filter((i) => i.endsWith("-flat"))) {
      const html = c.querySelector(`#${id}`)!.innerHTML;
      expect(html).not.toContain("gradient");
      expect(html).not.toContain("shape-ghost-glow");
    }
    expect(c.querySelector("#shape-ghost-wisp-flat")!.innerHTML).not.toContain("url(");
  });

  it("uses no filter or mask", () => {
    const html = renderSheet().innerHTML;
    expect(html).not.toMatch(/<(filter|mask)/i);
  });
});
