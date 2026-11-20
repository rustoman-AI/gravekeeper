// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Hero } from "../../../components/hero";

afterEach(cleanup);

describe("Hero (graveyard-art R9.1, R9.8)", () => {
  it("has exactly one h1 named Gravekeeper", () => {
    const { container } = render(<Hero />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Gravekeeper");
  });

  it("renders one backdrop and an aria-hidden gate", () => {
    const { container } = render(<Hero />);
    expect(container.querySelectorAll("svg.gk-backdrop")).toHaveLength(1);
    const gate = Array.from(container.querySelectorAll("svg")).filter(
      (s) => !s.classList.contains("gk-backdrop"),
    );
    expect(gate.length).toBeGreaterThanOrEqual(1);
    expect(gate[0]?.getAttribute("aria-hidden")).toBe("true");
  });
});
