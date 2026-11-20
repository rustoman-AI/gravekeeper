// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GateFallback } from "../../../components/gate-fallback";
import { Hero } from "../../../components/hero";
import { LandingPage } from "../../../components/landing-page";

afterEach(cleanup);

describe("GateFallback (graveyard-art R9.8)", () => {
  it("renders the same hero markup as Hero and as the landing page", () => {
    const heroHtml = render(<Hero />).container.innerHTML;
    cleanup();
    const fallback = render(<GateFallback />).container;
    expect(fallback.querySelector("section.gk-hero")?.outerHTML).toBe(
      new DOMParser().parseFromString(heroHtml, "text/html").body.querySelector("section.gk-hero")?.outerHTML,
    );
    cleanup();
    const landing = render(<LandingPage onSubmit={() => {}} />).container;
    expect(landing.querySelector("section.gk-hero")?.outerHTML).toBe(
      new DOMParser().parseFromString(heroHtml, "text/html").body.querySelector("section.gk-hero")?.outerHTML,
    );
  });
});
