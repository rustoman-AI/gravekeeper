// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SceneSpriteStones } from "@/components/scene-sprite-stones";
import { SPRITE_VARIANTS, symbolIdOf } from "@/view-model/variants";

afterEach(cleanup);

const STONE_IDS = [
  ...SPRITE_VARIANTS.tombstone.map((v) => symbolIdOf("tombstone", v, false)),
  ...SPRITE_VARIANTS.overgrown.map((v) => symbolIdOf("overgrown", v, false)),
];
const FLAT_IDS = [
  ...SPRITE_VARIANTS.tombstone.map((v) => symbolIdOf("tombstone", v, true)),
  ...SPRITE_VARIANTS.overgrown.map((v) => symbolIdOf("overgrown", v, true)),
];

function renderSheet() {
  return render(
    <svg>
      <SceneSpriteStones />
    </svg>,
  ).container;
}

describe("SceneSpriteStones", () => {
  it("defines every stone symbol and its flat twin on the 80 by 104 viewBox", () => {
    const c = renderSheet();
    for (const id of [...STONE_IDS, ...FLAT_IDS]) {
      const symbol = c.querySelector(`symbol[id="${id}"]`);
      expect(symbol, id).not.toBeNull();
      expect(symbol!.getAttribute("viewBox")).toBe("0 0 80 104");
    }
    expect(c.querySelectorAll("symbol")).toHaveLength(STONE_IDS.length * 2);
  });

  it("defines the shared shapes", () => {
    const c = renderSheet();
    for (const v of SPRITE_VARIANTS.tombstone) expect(c.querySelector(`#shape-stone-${v}`)).not.toBeNull();
    for (const v of ["light", "medium", "heavy"]) expect(c.querySelector(`#shape-ivy-${v}`)).not.toBeNull();
  });

  it("wraps every symbol in a root group that follows --depth-bright", () => {
    const c = renderSheet();
    for (const symbol of c.querySelectorAll("symbol")) {
      const root = symbol.firstElementChild!;
      expect(root.tagName.toLowerCase()).toBe("g");
      expect(symbol.children).toHaveLength(1);
      expect(root.getAttribute("style") ?? "").toContain("var(--depth-bright, 1)");
    }
  });

  it("gives every symbol different markup", () => {
    const c = renderSheet();
    const markup = [...c.querySelectorAll("symbol")].map((s) => s.innerHTML);
    expect(new Set(markup).size).toBe(markup.length);
    const shapes = [...c.querySelectorAll("defs > g")].map((s) => s.innerHTML);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("uses tokens only and no filter, mask, text or colour literal", () => {
    const c = renderSheet();
    expect(c.querySelector("filter, mask, text, image")).toBeNull();
    expect(c.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    for (const el of c.querySelectorAll("[fill], [stroke]")) {
      for (const attr of ["fill", "stroke"]) {
        const value = el.getAttribute(attr);
        if (value && value !== "none") expect(value).toMatch(/^var\(--color-[a-z-]+\)$/);
      }
    }
  });

  it("has no built-in rotation in the overgrown graves", () => {
    const c = renderSheet();
    expect(c.querySelector("[id^='shape-ivy'] [transform*='rotate(-9']")).toBeNull();
  });

  it("increases ivy coverage from light to heavy", () => {
    const c = renderSheet();
    const leaves = (v: string) => c.querySelectorAll(`#shape-ivy-${v} path[transform]`).length;
    expect(leaves("light")).toBeLessThan(leaves("medium"));
    expect(leaves("medium")).toBeLessThan(leaves("heavy"));
  });

  it("draws the slab as a ledger stone with an engraved night cross", () => {
    const c = renderSheet();
    const carved = [...c.querySelectorAll("#shape-stone-slab path")].filter(
      (p) => p.getAttribute("stroke") === "var(--color-night)",
    );
    expect(carved).toHaveLength(1);
    const d = carved[0].getAttribute("d")!;
    expect(d).toMatch(/V\d+/);
    expect(d).toMatch(/H\d+/);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(c.querySelector("#shape-stone-slab path[d*='Q']")).toBeNull();
  });
});