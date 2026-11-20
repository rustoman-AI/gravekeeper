// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailPanel } from "../../../components/detail-panel";
import { ResurrectSlot } from "../../../components/resurrect-slot";
import { buildDetailModel } from "../../../view-model/detail";
import { buildPackageRows } from "../../../view-model/package-rows";
import { parseScanResponse } from "../../../view-model/parse-response";
import type { DetailModel, PlotKind } from "../../../view-model/types";
import { buildScanResult, type PlotCase } from "../../support/ui/scan-result-builder";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Texts from requirements.md Requirement 12, criteria 1 and 2.
const HEADING = "Resurrect";
const COMING_SOON = "Coming soon: suggest a maintained alternative and a manifest patch";
const DESCRIPTION = "Not available yet";

const KIND_CASES: readonly (readonly [PlotKind, PlotCase, boolean])[] = [
  ["tombstone", "buried", true],
  ["overgrown", "forgotten", true],
  ["ghost", "ghost", false],
  ["restless", "restless-archived", false],
  ["lantern", "alive", false],
  ["unmarked", "unassessed-git", false],
];

function detailOf(kind: PlotCase): DetailModel {
  const body = JSON.parse(
    JSON.stringify(buildScanResult([{ name: "pkg-under-test", kind }])),
  ) as unknown;
  const outcome = parseScanResponse(200, { get: () => null }, body);
  if (outcome.kind !== "result") throw new Error("fixture did not parse");
  const rows = buildPackageRows(outcome.result);
  const detail = buildDetailModel(outcome.result, rows, rows[0]!.key);
  if (detail === null) throw new Error("no detail");
  return detail;
}

function renderPanel(kind: PlotCase) {
  render(<DetailPanel model={detailOf(kind)} onClose={() => {}} />);
}

const slotOf = () => document.querySelector('[data-slot="resurrect"]');

describe("Resurrect_Slot visibility in the Detail_Panel (Requirements 10.13, 12.1, 12.3)", () => {
  it.each(KIND_CASES)("%s (%s): slot shown is %s", (_kind, plot, shown) => {
    renderPanel(plot);
    if (shown) {
      const slot = slotOf();
      expect(slot).not.toBeNull();
      expect(within(slot as HTMLElement).getByRole("heading", { name: HEADING })).toBeTruthy();
      expect(screen.getByText(COMING_SOON)).toBeTruthy();
    } else {
      expect(slotOf()).toBeNull();
      expect(screen.queryByText(COMING_SOON)).toBeNull();
      expect(screen.queryByRole("button", { name: HEADING })).toBeNull();
    }
  });

  it("builds the six kinds the table expects", () => {
    expect(KIND_CASES.map(([k]) => k)).toEqual([
      "tombstone",
      "overgrown",
      "ghost",
      "restless",
      "lantern",
      "unmarked",
    ]);
  });
});

describe("Resurrect_Slot markup (Requirement 12.2)", () => {
  it("is marked as a placeholder and carries the package key and name", () => {
    const model = detailOf("buried");
    render(<DetailPanel model={model} onClose={() => {}} />);
    const slot = slotOf() as HTMLElement;
    expect(slot.getAttribute("data-slot")).toBe("resurrect");
    expect(slot.getAttribute("data-placeholder")).toBe("true");
    expect(slot.getAttribute("data-package-key")).toBe(model.key);
    expect(slot.getAttribute("data-display-name")).toBe(model.title);
  });

  it("has a disabled button with aria-disabled and the accessible description", () => {
    render(<ResurrectSlot packageKey="npm:left-pad" displayName="left-pad" />);
    const button = screen.getByRole("button", { name: HEADING }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("type")).toBe("button");
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy as string)?.textContent?.trim()).toBe(DESCRIPTION);
    expect(screen.getByRole("button", { description: DESCRIPTION })).toBe(button);
  });
});

describe("Resurrect_Slot sends no request (Requirement 12.3)", () => {
  it("makes no fetch call on click or keyboard activation", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<ResurrectSlot packageKey="npm:left-pad" displayName="left-pad" />);
    const button = screen.getByRole("button", { name: HEADING });
    const user = userEvent.setup();

    await user.click(button);
    fireEvent.click(button);
    button.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyUp(button, { key: " " });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("makes no fetch call when rendered in the Detail_Panel", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderPanel("forgotten");
    fireEvent.click(within(slotOf() as HTMLElement).getByRole("button"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Resurrect_Slot names no alternative package (Requirement 12.3)", () => {
  it("contains exactly the spec texts and nothing else", () => {
    renderPanel("buried");
    const slot = slotOf() as HTMLElement;
    const texts = Array.from(slot.children).map((c) => (c.textContent ?? "").trim());
    expect(texts).toEqual([HEADING, COMING_SOON, HEADING, DESCRIPTION]);
    expect(slot.children).toHaveLength(4);
  });

  it("does not echo the package name in its visible text", () => {
    render(<ResurrectSlot packageKey="npm:left-pad" displayName="left-pad" />);
    expect(slotOf()?.textContent).not.toContain("left-pad");
  });
});
