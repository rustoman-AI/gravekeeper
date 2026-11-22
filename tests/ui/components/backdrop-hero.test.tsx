// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SceneBackdrop, type BackdropVariant } from "@/components/scene-backdrop";

afterEach(cleanup);

function renderVariant(variant: BackdropVariant): Element {
  return render(<SceneBackdrop variant={variant} />).container;
}

describe("SceneBackdrop hero landscape", () => {
  it("draws six iron silhouettes, one of them the tall cross, based at y 322", () => {
    const c = renderVariant("hero");
    const sil = [...c.querySelectorAll("path.gk-silhouette")];
    expect(sil).toHaveLength(6);
    expect(c.querySelectorAll("path.gk-cross")).toHaveLength(1);
    expect(c.querySelector("path.gk-cross")?.classList.contains("gk-silhouette")).toBe(true);
    for (const s of sil) {
      expect(s.getAttribute("fill")).toBe("var(--color-iron)");
      expect(s.getAttribute("transform")).toMatch(/^translate\([\d.]+ 322\)/);
    }
  });

  it("draws one mist-gradient lane from the bottom edge up to y 236, centred on x 800", () => {
    const c = renderVariant("hero");
    const lanes = c.querySelectorAll("path.gk-lane");
    expect(lanes).toHaveLength(1);
    const lane = lanes[0];
    expect(lane.getAttribute("fill")).toBe("url(#hero-path-gradient)");
    expect(c.querySelector("linearGradient#hero-path-gradient")).not.toBeNull();
    const nums = (lane.getAttribute("d") ?? "").match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBe(236);
    expect(Math.max(...ys)).toBe(360);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBe(800);
  });

  it("keeps two silhouettes just outside the gate posts for the mobile crop", () => {
    const xs = [...renderVariant("hero").querySelectorAll("path.gk-silhouette")].map(
      (s) => Number(/translate\(([\d.]+)/.exec(s.getAttribute("transform") ?? "")![1]) / 1600,
    );
    expect(xs.some((x) => x >= 0.38 && x <= 0.4)).toBe(true);
    expect(xs.some((x) => x >= 0.6 && x <= 0.62)).toBe(true);
  });

  it.each(["stage", "scanning"] as const)("%s renders no silhouettes or lane", (variant) => {
    const c = renderVariant(variant);
    expect(c.querySelector(".gk-silhouette, .gk-cross, .gk-lane")).toBeNull();
  });

  it("paints silhouettes after the trees and before the fence, and the lane after the ground", () => {
    const svg = renderVariant("hero").querySelector("svg")!;
    const kids = [...svg.children];
    const idx = (el: Element | null) => kids.indexOf(el as Element);
    const lastTree = Math.max(...[...svg.querySelectorAll(":scope > .gk-tree")].map(idx));
    const sil = [...svg.querySelectorAll(":scope > .gk-silhouette")].map(idx);
    const fence = idx(svg.querySelector('rect[fill="url(#fence-pattern)"]')!.parentElement);
    expect(fence).toBeGreaterThan(-1);
    expect(Math.min(...sil)).toBeGreaterThan(lastTree);
    expect(Math.max(...sil)).toBeLessThan(fence);
    expect(idx(svg.querySelector(".gk-lane"))).toBeGreaterThan(Math.max(...sil));
  });

  it("stays decorative, static and token-coloured", () => {
    const c = renderVariant("hero");
    const svg = c.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(c.querySelector("animate, animateTransform, animateMotion, set, filter, mask, title, text")).toBeNull();
    for (const el of c.querySelectorAll(".gk-silhouette, .gk-cross, .gk-lane")) {
      expect(el.getAttribute("style")).toBeNull();
      expect(el.getAttribute("filter")).toBeNull();
      expect(el.getAttribute("mask")).toBeNull();
    }
    expect(c.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });
});
