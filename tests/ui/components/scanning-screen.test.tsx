// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScanningScreen } from "../../../components/scanning-screen";

afterEach(cleanup);

// Requirement 4, verbatim.
const LABELS = [
  "Reading the repository",
  "Checking the registries",
  "Consulting the vulnerability records",
  "Asking GitHub about the living",
];
const APPROXIMATION = "The stages are approximate because the sources are queried in parallel.";
const SLOW_NOTICE = "Large repositories can take up to 25 seconds.";
const START = 1_000_000;

function setup(reducedMotion = false) {
  let clock = START;
  let tick: (() => void) | undefined;
  const onCancel = vi.fn();
  const utils = render(
    <ScanningScreen
      startedAtMs={START}
      repoLabel="octo/cat"
      onCancel={onCancel}
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
  /** Advances the clock in 250 ms ticks, as the real timer would. */
  const advance = (ms: number, each?: () => void) => {
    for (let done = 0; done < ms; done += 250) {
      clock += 250;
      act(() => tick?.());
      each?.();
    }
  };
  return { ...utils, advance, onCancel };
}

function states(): string[] {
  const items = screen.getAllByRole("listitem");
  return LABELS.map((label) => {
    const li = items.find((i) => i.textContent?.includes(label));
    return li?.textContent?.replace(label, "") ?? "missing";
  });
}

describe("ScanningScreen", () => {
  it("shows the text states at 0, 2000, 6000 and 10000 ms (4.1, 4.3)", () => {
    const { advance } = setup();
    expect(states()).toEqual(["in progress", "waiting", "waiting", "waiting"]);
    advance(2000);
    expect(states()).toEqual(["done", "in progress", "waiting", "waiting"]);
    advance(4000);
    expect(states()).toEqual(["done", "done", "in progress", "waiting"]);
    advance(4000);
    expect(states()).toEqual(["done", "done", "done", "in progress"]);
  });

  it("announces once per Stage change in one polite live region (4.7)", () => {
    const { advance } = setup();
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe(LABELS[0]);
    const seen = [region.textContent];
    advance(16000, () => {
      const text = screen.getByRole("status").textContent;
      if (text !== seen[seen.length - 1]) seen.push(text);
    });
    expect(seen).toEqual(LABELS);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("shows no progressbar and no percentage (4.4)", () => {
    const { advance, container } = setup();
    for (const ms of [0, 2000, 4000, 4000, 6000]) {
      advance(ms);
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(container.textContent).not.toMatch(/%|percent/i);
    }
    expect(screen.getByText(APPROXIMATION)).toBeTruthy();
  });

  it("adds the slow notice at 15000 ms without changing Stage states (4.6)", () => {
    const { advance } = setup();
    advance(14750);
    expect(screen.queryByText(SLOW_NOTICE)).toBeNull();
    const before = states();
    advance(250);
    expect(screen.getByText(SLOW_NOTICE)).toBeTruthy();
    expect(states()).toEqual(before);
    expect(before).toEqual(["done", "done", "done", "in progress"]);
  });

  it("makes Cancel the first focusable element (4.8)", () => {
    const { container, onCancel } = setup();
    const focusable = container.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable[0]).toBe(screen.getByRole("button", { name: "Cancel" }));
    focusable[0]?.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("has no animated element under reduced motion and keeps the text states (4.10)", () => {
    const reduced = setup(true);
    // The old fog/lantern decor was replaced by the caretaker scene, which also renders under
    // reduced motion, but still (data-still="true"), so nothing animates.
    expect(
      reduced.container.querySelector(
        '.gk-scanning-fog, .gk-scanning-lantern, .gk-scanning-decor, [class*="animate"]',
      ),
    ).toBeNull();
    expect(reduced.container.querySelector(".gk-caretaker-scene")?.getAttribute("data-still")).toBe("true");
    expect(states()).toEqual(["in progress", "waiting", "waiting", "waiting"]);
    cleanup();
    const full = setup(false);
    expect(full.container.querySelector(".gk-caretaker-scene")?.getAttribute("data-still")).toBe("false");
  });
});
