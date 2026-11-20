// @vitest-environment jsdom
// Requirements 10.2, 10.3, 10.4, 10.5, 10.7, 10.8.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScanningScreen } from "../../../components/scanning-screen";
import { SCAN_STONE_X } from "../../../view-model/constants";

afterEach(cleanup);

const LABELS = [
  "Reading the repository",
  "Checking the registries",
  "Consulting the vulnerability records",
  "Asking GitHub about the living",
];
const START = 1_000_000;

function setup(reducedMotion = false) {
  let clock = START;
  let tick: (() => void) | undefined;
  const utils = render(
    <ScanningScreen
      startedAtMs={START}
      onCancel={vi.fn()}
      now={() => clock}
      setInterval={(fn) => {
        tick = fn;
        return 1;
      }}
      clearInterval={() => {
        tick = undefined;
      }}
      reducedMotion={reducedMotion}
    />,
  );
  const advance = (ms: number) => {
    for (let done = 0; done < ms; done += 250) {
      clock += 250;
      act(() => tick?.());
    }
  };
  return { ...utils, advance };
}

const scene = (c: HTMLElement) => c.querySelector<HTMLElement>(".gk-caretaker-scene")!;
const lit = (c: HTMLElement) => scene(c).querySelectorAll('.gk-stone[data-lit="true"]').length;
const lanternX = (c: HTMLElement) =>
  Number(c.querySelector<HTMLElement>(".gk-caretaker")!.style.getPropertyValue("--lantern-x"));

describe("CaretakerScene on the scanning screen", () => {
  it("is aria-hidden and has four stones (10.2)", () => {
    const { container } = setup();
    expect(scene(container).getAttribute("aria-hidden")).toBe("true");
    expect(scene(container).querySelectorAll(".gk-stone")).toHaveLength(4);
  });

  it("lights stones and moves the lantern with the stages at 0, 2000, 6000, 10000 ms (10.3)", () => {
    const { container, advance } = setup();
    const steps: [number, number][] = [[0, 1], [2000, 2], [4000, 3], [4000, 4]];
    steps.forEach(([ms, count], i) => {
      advance(ms);
      expect(lit(container)).toBe(count);
      expect(lanternX(container)).toBe(SCAN_STONE_X[i]);
    });
  });

  it("shows four lit stones and data-still under reduced motion (10.4)", () => {
    const { container } = setup(true);
    expect(scene(container).getAttribute("data-still")).toBe("true");
    expect(lit(container)).toBe(4);
    expect(lanternX(container)).toBe(SCAN_STONE_X[3]);
  });

  it("keeps the stage list text and one status region unchanged (10.5)", () => {
    setup();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    LABELS.forEach((label, i) => expect(items[i]?.textContent).toContain(label));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe(LABELS[0]);
  });

  it("shows no percentage and no numeric progress (10.7)", () => {
    const { container, advance } = setup();
    for (const ms of [0, 2000, 4000, 4000, 6000]) {
      advance(ms);
      // The existing slow notice says "25 seconds" (Requirement 4.6), so digits are checked
      // outside it: the scene itself and the stage list carry none.
      expect(container.textContent).not.toMatch(/%|percent/i);
      expect(scene(container).textContent).not.toMatch(/\d/);
      for (const li of screen.getAllByRole("listitem")) expect(li.textContent).not.toMatch(/\d/);
      expect(screen.queryByRole("progressbar")).toBeNull();
    }
  });

  it("keeps Cancel as the first focusable element (10.8)", () => {
    const { container } = setup();
    const focusable = container.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable[0]).toBe(screen.getByRole("button", { name: "Cancel" }));
  });
});
