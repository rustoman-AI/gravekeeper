// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapBanner } from "../../../components/cap-banner";
import { CaretakersNotes } from "../../../components/caretakers-notes";
import { EmptyGraveyard } from "../../../components/empty-graveyard";
import { NoteGroupSection } from "../../../components/note-group-section";
import { SourceStatusList } from "../../../components/source-status-list";
import { buildNotesModel, parseScanResponse } from "../../../view-model";
import type { NotesModel, ParsedScanResult } from "../../../view-model";
import { buildScanResult, manyRows } from "../../support/ui/scan-result-builder";
import type { ResultOptions } from "../../support/ui/scan-result-builder";

afterEach(cleanup);

/** Builds a Notes_Model through the real response parser. `edit` changes the JSON before parsing. */
function modelOf(options: ResultOptions = {}, edit?: (body: Record<string, unknown>) => void): NotesModel {
  const body = JSON.parse(JSON.stringify(buildScanResult(manyRows(3), options))) as Record<string, unknown>;
  edit?.(body);
  const outcome = parseScanResponse(200, new Headers(), body);
  if (outcome.kind !== "result") throw new Error("fixture did not parse");
  return buildNotesModel(outcome.result as ParsedScanResult);
}

const note = (code: string, message: string) => ({ code, message });

describe("source status list (Requirement 11.2, 11.3)", () => {
  it("shows the six sources in order with status word and symbol", () => {
    const model = modelOf({ sources: { osv: "partial", github: "failed" } });
    render(<SourceStatusList sources={model.sources} groupCodes={[]} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(6);
    const names = ["GitHub", "deps.dev", "OSV", "npm registry", "crates.io", "PyPI"];
    names.forEach((n, i) => {
      expect(items[i]?.textContent).toContain(`${n}:`);
    });
    expect(items[0]?.textContent).toContain("failed");
    expect(items[1]?.textContent).toContain("ok");
    expect(items[2]?.textContent).toContain("partial");
    const symbols = model.sources.map((s) => s.symbol);
    expect(new Set(symbols).size).toBe(3);
    symbols.forEach((sym, i) => {
      expect(items[i]?.textContent).toContain(sym);
    });
  });

  it("shows the alert line for partial and failed sources only", () => {
    const model = modelOf({ sources: { osv: "partial", github: "failed" } });
    render(<SourceStatusList sources={model.sources} groupCodes={[]} />);
    expect(screen.getByText("GitHub: failed, some facts that depend on it are unknown")).toBeTruthy();
    expect(screen.getByText("OSV: partial, some facts that depend on it are unknown")).toBeTruthy();
    expect(screen.queryAllByText(/some facts that depend on it are unknown/)).toHaveLength(2);
  });

  it("links the alert to the matching note group when it exists", () => {
    const model = modelOf({ sources: { osv: "partial" } });
    render(<SourceStatusList sources={model.sources} groupCodes={["source-partial"]} />);
    const link = screen.getByRole("link", { name: /OSV: partial/ });
    expect(link.getAttribute("href")).toBe("#note-group-source-partial");
  });
});

describe("note groups (Requirement 11.4, 11.5, 11.6)", () => {
  const manyNotes = Array.from({ length: 40 }, (_, i) => note("package-not-found", `Missing record number ${i}.`));

  it("shows the first note's plain message without a click", () => {
    const model = modelOf({}, (b) => {
      b["notes"] = [note("package-not-found", "First plain message."), note("pin-not-found", "Pin message.")];
    });
    render(<CaretakersNotes model={model} repoValue="https://github.com/a/b" onScan={vi.fn()} />);
    expect(screen.getByText("First plain message.")).toBeTruthy();
    expect(screen.getByText("Pin message.")).toBeTruthy();
  });

  it("shows 5 of 40, reveals the rest with 'Show all 40', and keeps the full count in the heading", async () => {
    const model = modelOf({}, (b) => {
      b["notes"] = manyNotes;
    });
    const group = model.sections.flatMap((s) => s.groups)[0]!;
    render(<NoteGroupSection group={group} />);
    const heading = screen.getByRole("heading", { level: 4 });
    expect(heading.textContent).toContain("(40)");
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Missing record number 0.")).toBeTruthy();
    expect(screen.queryByText("Missing record number 39.")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Show all 40" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(40);
    expect(screen.getByText("Missing record number 39.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4 }).textContent).toContain("(40)");
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("has no 'Show all' button for a group of 5 or fewer", () => {
    const model = modelOf({}, (b) => {
      b["notes"] = manyNotes.slice(0, 5);
    });
    render(<NoteGroupSection group={model.sections[0]!.groups[0]!} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("cap banner (Requirement 11.9)", () => {
  it("shows the dependency-cap-exceeded message and the skipped count", () => {
    const model = modelOf(
      {
        skipped: [
          { ecosystem: "npm", name: "a" },
          { ecosystem: "pypi", name: "b" },
        ],
      },
      (b) => {
        b["notes"] = [note("dependency-cap-exceeded", "Only 3 of 5 dependencies were assessed.")];
      },
    );
    expect(model.capBanner?.skippedCount).toBe(2);
    render(<CapBanner banner={model.capBanner!} />);
    expect(screen.getByText("Only 3 of 5 dependencies were assessed.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/\b2\b/);
  });

  it("is not rendered inside the notes (ResultsPage places it under the header)", () => {
    const model = modelOf({ skipped: [{ ecosystem: "npm", name: "a" }] }, (b) => {
      b["notes"] = [note("dependency-cap-exceeded", "Only 3 of 5 dependencies were assessed.")];
    });
    render(<CaretakersNotes model={model} repoValue="r" onScan={vi.fn()} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("empty graveyard (Requirement 11.10)", () => {
  it("shows the plain message of the no-manifests note", () => {
    const model = modelOf({}, (b) => {
      b["manifests"] = [];
      b["notes"] = [note("no-manifests", "No manifests were found here.")];
    });
    render(<EmptyGraveyard message={model.empty!.message} />);
    expect(screen.getByText("No manifests were found here.")).toBeTruthy();
  });
});

