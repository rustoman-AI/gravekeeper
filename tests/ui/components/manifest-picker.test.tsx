// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaretakersNotes } from "../../../components/caretakers-notes";
import { ManifestPicker } from "../../../components/manifest-picker";
import { buildNotesModel, parseScanResponse, parseUrlState, SCAN_MAX_MANIFESTS } from "../../../view-model";
import type { ParsedScanResult } from "../../../view-model";
import { buildScanResult, manyRows, noteOf } from "../../support/ui/scan-result-builder";

afterEach(cleanup);

const REPO = "https://github.com/synthetic/graveyard";
const paths = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ path: `packages/p${i}/package.json` }));
const scanButton = () => screen.getByRole("button", { name: "Scan selected manifests" });

describe("ManifestPicker (Requirement 11.11)", () => {
  it("shows format and a human size per candidate, and works with paths only", () => {
    render(
      <ManifestPicker
        candidates={[
          { path: "a/package.json", format: "package.json", sizeBytes: 97 },
          { path: "b/Cargo.toml", format: "Cargo.toml", sizeBytes: 1234 },
          { path: "c/requirements.txt" },
        ]}
        repoValue={REPO}
        onScan={vi.fn()}
      />,
    );
    expect(screen.getByText("package.json, 97 bytes")).toBeTruthy();
    expect(screen.getByText("Cargo.toml, 1.2 kB")).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("disables the scan button while nothing is checked", () => {
    render(<ManifestPicker candidates={paths(3)} repoValue={REPO} onScan={vi.fn()} />);
    expect((scanButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("pushes a URL whose parsed state holds the selected manifests", async () => {
    const onScan = vi.fn<(url: string) => void>();
    render(<ManifestPicker candidates={paths(3)} repoValue={REPO} onScan={onScan} />);
    await userEvent.click(screen.getByLabelText("packages/p2/package.json"));
    await userEvent.click(screen.getByLabelText("packages/p0/package.json"));
    expect((scanButton() as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(scanButton());

    expect(onScan).toHaveBeenCalledTimes(1);
    const url = onScan.mock.calls[0]![0];
    expect(url.startsWith("/?repo=")).toBe(true);
    const state = parseUrlState(url.slice(url.indexOf("?")));
    expect(state.repo).toBe(REPO);
    expect([...state.manifests].sort()).toEqual(["packages/p0/package.json", "packages/p2/package.json"]);
  });

  it(`disables unchecked boxes at the limit of ${SCAN_MAX_MANIFESTS} and shows "limit reached"`, async () => {
    render(<ManifestPicker candidates={paths(SCAN_MAX_MANIFESTS + 2)} repoValue={REPO} onScan={vi.fn()} />);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    for (const box of boxes.slice(0, SCAN_MAX_MANIFESTS)) await userEvent.click(box);
    expect(boxes.slice(0, SCAN_MAX_MANIFESTS).every((b) => b.checked && !b.disabled)).toBe(true);
    expect(boxes.slice(SCAN_MAX_MANIFESTS).every((b) => !b.checked && b.disabled)).toBe(true);
    expect(screen.getAllByText("limit reached")).toHaveLength(2);

    await userEvent.click(boxes[0]!);
    expect(boxes.slice(SCAN_MAX_MANIFESTS).some((b) => b.disabled)).toBe(false);
    expect(screen.queryByText("limit reached")).toBeNull();
  });
});

describe("picker inside CaretakersNotes (Requirement 11.11)", () => {
  function modelWithNoRoot() {
    const result = buildScanResult(manyRows(2), {
      manifestPaths: paths(3).map((c) => c.path),
      notes: [noteOf("no-root-manifest")],
    });
    const outcome = parseScanResponse(200, new Headers(), JSON.parse(JSON.stringify(result)));
    if (outcome.kind !== "result") throw new Error("fixture did not parse");
    return buildNotesModel(outcome.result as ParsedScanResult);
  }

  it("shows the picker and pushes the selected manifest", async () => {
    const onScan = vi.fn<(url: string) => void>();
    render(<CaretakersNotes model={modelWithNoRoot()} repoValue={REPO} onScan={onScan} />);
    expect(await screen.findAllByText("package.json, 100 bytes")).toHaveLength(3);
    const box = await screen.findByLabelText("packages/p1/package.json");
    await userEvent.click(box);
    await userEvent.click(await screen.findByRole("button", { name: "Scan selected manifests" }));
    const url = onScan.mock.calls[0]![0];
    expect(parseUrlState(url.slice(url.indexOf("?"))).manifests).toEqual(["packages/p1/package.json"]);
  });

  it("shows no picker without the no-root-manifest note", () => {
    const result = buildScanResult(manyRows(2));
    const outcome = parseScanResponse(200, new Headers(), JSON.parse(JSON.stringify(result)));
    if (outcome.kind !== "result") throw new Error("fixture did not parse");
    const model = buildNotesModel(outcome.result as ParsedScanResult);
    render(<CaretakersNotes model={model} repoValue={REPO} onScan={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Scan selected manifests" })).toBeNull();
  });
});
