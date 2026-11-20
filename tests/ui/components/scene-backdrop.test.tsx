// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NightLandscape } from "@/components/night-landscape";
import { SceneBackdrop, STAR_COUNT, type BackdropVariant } from "@/components/scene-backdrop";
import { SceneSprites } from "@/components/scene-sprites";

afterEach(cleanup);

const VIEW_BOXES: Record<BackdropVariant, string> = {
  stage: "0 0 1600 240",
  hero: "0 0 1600 360",
  scanning: "0 0 400 180",
};

describe("SceneBackdrop", () => {
  it("renders one decorative svg", () => {
    const { container } = render(<SceneBackdrop variant="stage" />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(1);
    expect(svgs[0].getAttribute("aria-hidden")).toBe("true");
    expect(svgs[0].getAttribute("focusable")).toBe("false");
    expect(svgs[0].getAttribute("class")).toBe("gk-backdrop");
  });

  it("draws 24 stars", () => {
    const { container } = render(<SceneBackdrop variant="stage" />);
    expect(STAR_COUNT).toBe(24);
    expect(container.querySelectorAll("circle.gk-star")).toHaveLength(24);
  });

  it("uses no filter, mask, text or title element and no colour literal", () => {
    const { container } = render(<SceneBackdrop variant="hero" />);
    expect(container.querySelector("filter, mask, text, title")).toBeNull();
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });

  it("is deterministic", () => {
    const a = render(<SceneBackdrop variant="stage" />).container.innerHTML;
    cleanup();
    const b = render(<SceneBackdrop variant="stage" />).container.innerHTML;
    expect(a).toBe(b);
  });

  it.each(Object.entries(VIEW_BOXES))("variant %s has viewBox %s", (variant, box) => {
    const { container } = render(<SceneBackdrop variant={variant as BackdropVariant} />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe(box);
  });

  it("references gradients and the fence pattern that the sprite sheet defines", () => {
    const sheet = render(<SceneSprites />).container;
    for (const id of ["sky-gradient", "moon-halo-gradient", "fence-pattern"]) {
      expect(sheet.querySelector(`#${id}`)).not.toBeNull();
    }
    const { container } = render(<SceneBackdrop variant="stage" />);
    expect(container.innerHTML).toContain("url(#fence-pattern)");
  });
});

describe("NightLandscape", () => {
  it("renders the backdrop and two fog layers", () => {
    const { container } = render(<NightLandscape variant="scanning" />);
    expect(container.querySelectorAll("svg.gk-backdrop")).toHaveLength(1);
    expect(container.querySelectorAll(".gk-fog")).toHaveLength(2);
  });
});
