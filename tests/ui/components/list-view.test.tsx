// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListView } from "../../../components/list-view";
import { buildPackageRows } from "../../../view-model/package-rows";
import { buildSceneModel } from "../../../view-model/scene";
import type { ParsedScanResult } from "../../../view-model/types";
import { buildScanResult, manyRows } from "../../support/ui/scan-result-builder";
import type { RowSpec } from "../../support/ui/scan-result-builder";

// R18.2, R18.3, R18.4, R18.6, R18.7, R18.8.
const SPECS: readonly RowSpec[] = [
  { name: "delta-buried", kind: "buried", ecosystem: "cargo" },
  { name: "alpha-alive", kind: "alive" },
  { name: "gamma-ghost", kind: "ghost", ecosystem: "pypi" },
  { name: "beta-forgotten", kind: "forgotten" },
  { name: "epsilon-git", kind: "unassessed-git" },
  { name: "zeta-alive", kind: "alive", ecosystem: "cargo" },
];

const HEADERS = ["Package", "Ecosystem", "Status", "Score", "Main reason", "Scopes", "Checked version"];

function rowsOf(specs: readonly RowSpec[]) {
  return buildPackageRows(buildScanResult(specs) as unknown as ParsedScanResult);
}

function setup(specs: readonly RowSpec[] = SPECS) {
  const rows = rowsOf(specs);
  const onOpen = vi.fn();
  const user = userEvent.setup();
  render(<ListView rows={rows} onOpen={onOpen} />);
  return { rows, onOpen, user };
}

const bodyRows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>("tbody tr"));
const cellTexts = (col: number) =>
  bodyRows().map((tr) => within(tr).getAllByRole("cell")[col].textContent ?? "");
const header = (label: string) => screen.getByRole("columnheader", { name: label });
const sortButton = (label: string) => within(header(label)).getByRole("button", { name: label });
const codePointCompare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

afterEach(cleanup);

describe("ListView", () => {
  it("has a caption and the seven column headers with scope=col", () => {
    const { rows } = setup();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(document.querySelector("caption")?.textContent).toBe(`Dependencies, ${rows.length} unique packages`);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(HEADERS);
    for (const h of headers) {
      expect(h.getAttribute("scope")).toBe("col");
      expect(h.getAttribute("aria-sort")).toBe("none");
    }
  });

  it("renders one row per package in scene order (same keys as the scene)", () => {
    // The table exposes no key in the DOM; compare name and ecosystem with the scene plots, whose keys map to rows.
    const { rows } = setup();
    const plots = buildSceneModel(rows, 3).plots;
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(bodyRows()).toHaveLength(plots.length);
    expect(cellTexts(0)).toEqual(plots.map((p) => byKey.get(p.key)!.displayName));
    expect(cellTexts(1)).toEqual(plots.map((p) => byKey.get(p.key)!.ecosystem));
  });

  it("sorts each text column ascending on first click and flips on the second", async () => {
    const { rows, user } = setup();
    const columns: Array<[string, number, (r: (typeof rows)[number]) => string]> = [
      ["Package", 0, (r) => r.displayName],
      ["Ecosystem", 1, (r) => r.ecosystem],
      ["Main reason", 4, (r) => r.epitaphShort],
    ];
    for (const [label, col, get] of columns) {
      await user.click(sortButton(label));
      expect(header(label).getAttribute("aria-sort")).toBe("ascending");
      const asc = cellTexts(col);
      const keys = rows.map(get).sort(codePointCompare);
      // Empty reasons render as "unknown", so only the raw order is compared for that column.
      const shown = (v: string) => (v === "" ? "unknown" : v);
      expect(asc).toEqual(keys.map(shown));
      await user.click(sortButton(label));
      expect(header(label).getAttribute("aria-sort")).toBe("descending");
      expect(cellTexts(col)).toEqual([...keys].reverse().map(shown));
    }
  });

  it("sorts by name ascending then descending", async () => {
    const { rows, user } = setup();
    const names = rows.map((r) => r.displayName).sort(codePointCompare);
    await user.click(sortButton("Package"));
    expect(cellTexts(0)).toEqual(names);
    await user.click(sortButton("Package"));
    expect(cellTexts(0)).toEqual([...names].reverse());
  });

  it("sorts by status grouping dead and haunted before alive before unassessed", async () => {
    const { user } = setup();
    await user.click(sortButton("Status"));
    expect(header("Status").getAttribute("aria-sort")).toBe("ascending");
    const words = cellTexts(2);
    expect(words[words.length - 1]).toBe("not assessed");
    expect(words.indexOf("alive")).toBeGreaterThan(words.findIndex((w) => w.startsWith("dead")));
    await user.click(sortButton("Status"));
    expect(header("Status").getAttribute("aria-sort")).toBe("descending");
    expect(cellTexts(2)[0]).toBe("not assessed");
  });

  it("sorts by score with unassessed rows last in both directions", async () => {
    const { rows, user } = setup();
    const scores = rows.filter((r) => r.score !== null).map((r) => r.score as number);
    await user.click(sortButton("Score"));
    expect(header("Score").getAttribute("aria-sort")).toBe("ascending");
    let texts = cellTexts(3);
    expect(texts.slice(0, scores.length)).toEqual([...scores].sort((a, b) => a - b).map(String));
    expect(texts.slice(scores.length).every((t) => t === "not assessed")).toBe(true);
    await user.click(sortButton("Score"));
    expect(header("Score").getAttribute("aria-sort")).toBe("descending");
    texts = cellTexts(3);
    expect(texts.slice(0, scores.length)).toEqual([...scores].sort((a, b) => b - a).map(String));
    expect(texts.slice(scores.length).every((t) => t === "not assessed")).toBe(true);
  });

  it("sorts by scopes and by checked version, unknown versions last", async () => {
    const { user } = setup();
    await user.click(sortButton("Scopes"));
    expect(header("Scopes").getAttribute("aria-sort")).toBe("ascending");
    const scopes = cellTexts(5);
    expect(scopes).toEqual([...scopes].sort(codePointCompare));
    await user.click(sortButton("Checked version"));
    expect(header("Checked version").getAttribute("aria-sort")).toBe("ascending");
    expect(cellTexts(6).at(-1)).toBe("unknown");
    await user.click(sortButton("Checked version"));
    expect(header("Checked version").getAttribute("aria-sort")).toBe("descending");
    expect(cellTexts(6).at(-1)).toBe("unknown");
  });

  it("marks only the sorted column and restarts ascending on another column", async () => {
    const { user } = setup();
    await user.click(sortButton("Package"));
    await user.click(sortButton("Package"));
    expect(header("Package").getAttribute("aria-sort")).toBe("descending");
    await user.click(sortButton("Ecosystem"));
    expect(header("Ecosystem").getAttribute("aria-sort")).toBe("ascending");
    expect(header("Package").getAttribute("aria-sort")).toBe("none");
    const others = screen.getAllByRole("columnheader").filter((h) => h.textContent !== "Ecosystem");
    expect(others.every((h) => h.getAttribute("aria-sort") === "none")).toBe(true);
  });

  it('shows "not assessed" for score and "unknown" for missing version', () => {
    const { rows } = setup();
    const i = rows.findIndex((r) => r.displayName === "epsilon-git");
    const cells = within(bodyRows()[i]).getAllByRole("cell");
    expect(cells[3].textContent).toBe("not assessed");
    expect(cells[6].textContent).toBe("unknown");
  });

  it('shows "unknown" for an empty reason and scopes, from rows with no text', () => {
    const rows = rowsOf(SPECS).map((r) => ({ ...r, epitaphShort: "", scopes: [] }));
    render(<ListView rows={rows} onOpen={() => undefined} />);
    expect(cellTexts(4).every((t) => t === "unknown")).toBe(true);
    expect(cellTexts(5).every((t) => t === "unknown")).toBe(true);
  });

  it("calls onOpen with the row key when the name is activated", async () => {
    const { rows, onOpen, user } = setup();
    const target = rows[2];
    await user.click(screen.getByRole("button", { name: target.displayName }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(target.key);
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("renders 300 rows without pagination", () => {
    setup(manyRows(300));
    expect(bodyRows()).toHaveLength(300);
    expect(document.querySelector("caption")?.textContent).toBe("Dependencies, 300 unique packages");
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
