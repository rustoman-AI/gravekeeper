// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HowItDecides } from "../../../components/how-it-decides";
import { LandingPage } from "../../../components/landing-page";

afterEach(cleanup);

describe("HowItDecides (graveyard-art R9.3 to R9.5)", () => {
  it("has the h2 and three paragraphs of one sentence each", () => {
    const { container } = render(<HowItDecides />);
    expect(screen.getByRole("heading", { level: 2, name: "How the caretaker decides" })).toBeTruthy();
    const paragraphs = Array.from(container.querySelectorAll("p"));
    expect(paragraphs).toHaveLength(3);
    for (const p of paragraphs) {
      const text = (p.textContent ?? "").replace(/\s+/g, " ").trim();
      expect(text.match(/[.!?](\s|$)/g)).toHaveLength(1);
      expect(text.endsWith(".")).toBe(true);
    }
  });

  it("names every source, state and the unmarked graves", () => {
    const { container } = render(<HowItDecides />);
    const text = container.textContent ?? "";
    for (const word of ["deps.dev", "npm", "PyPI", "crates.io", "OSV", "GitHub", "dead", "haunted", "alive", "unmarked grave"]) {
      expect(text).toContain(word);
    }
  });

  it("links to the id of the Legend heading in LandingPage", () => {
    const { container } = render(<HowItDecides />);
    const link = screen.getByRole("link", { name: "legend" });
    const href = link.getAttribute("href");
    expect(href).toBe("#legend-heading");
    cleanup();
    const page = render(<LandingPage onSubmit={() => {}} />);
    const legend = screen.getByRole("heading", { level: 2, name: "Legend" });
    expect(`#${legend.id}`).toBe(href);
    expect(page.container.querySelector(href as string)).toBe(legend);
    expect(container).toBeTruthy();
  });
});
