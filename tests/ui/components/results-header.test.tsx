// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CacheNote } from "../../../components/cache-note";
import { GradePlaque } from "../../../components/grade-plaque";
import { ResultsHeader } from "../../../components/results-header";
import { ViewToggle } from "../../../components/view-toggle";
import { buildHeaderModel } from "../../../view-model/header";
import { buildPackageRows } from "../../../view-model/package-rows";
import type { ParsedScanResult } from "../../../view-model/types";
import { buildScanResult } from "../../support/ui/scan-result-builder";
import type { PlotCase, ResultOptions, RowSpec } from "../../support/ui/scan-result-builder";

afterEach(cleanup);

const specsOf = (counts: Partial<Record<PlotCase, number>>): RowSpec[] =>
  Object.entries(counts).flatMap(([kind, n]) =>
    Array.from({ length: n }, (_, i) => ({ name: `${kind}-${i}`, kind: kind as PlotCase })),
  );

function parsedOf(counts: Partial<Record<PlotCase, number>>, options?: ResultOptions): ParsedScanResult {
  return buildScanResult(specsOf(counts), options) as unknown as ParsedScanResult;
}

function headerOf(parsed: ParsedScanResult) {
  return buildHeaderModel(parsed, buildPackageRows(parsed));
}

const AS_OF = "2026-01-01T00:00:00Z";
const NOW = Date.parse(AS_OF) + 3 * 3_600_000;

function renderHeader(parsed: ParsedScanResult, cache: "hit" | "miss" | "unknown" = "miss") {
  return render(<ResultsHeader header={headerOf(parsed)} cache={cache} nowMs={NOW} />);
}

describe("headline (Requirement 5.2 examples)", () => {
  const cases: [Partial<Record<PlotCase, number>>, string][] = [
    [
      { buried: 26, haunted: 5, alive: 9 },
      "31 of 40 dependencies are in the graveyard: 26 buried, 5 haunted.",
    ],
    [{ haunted: 1, alive: 5 }, "1 of 6 dependencies are in the graveyard: 1 haunted."],
    [
      { buried: 2, forgotten: 3, haunted: 4, alive: 11 },
      "9 of 20 dependencies are in the graveyard: 2 buried, 3 forgotten, 4 haunted.",
    ],
    [{ alive: 6 }, "0 of 6 dependencies are in the graveyard."],
  ];
  it.each(cases)("shows the exact text for %j", (counts, text) => {
    renderHeader(parsedOf(counts));
    expect(screen.getByText(text)).toBeTruthy();
  });
});

describe("status counts (Requirement 5.3)", () => {
  it("shows each count with its text label and the buried and forgotten split", () => {
    renderHeader(parsedOf({ buried: 2, forgotten: 3, haunted: 4, alive: 5, "unassessed-git": 1 }));
    expect(screen.getByText("5 dead (2 buried, 3 forgotten)")).toBeTruthy();
    expect(screen.getByText("4 haunted")).toBeTruthy();
    expect(screen.getByText("5 alive")).toBeTruthy();
    expect(screen.getByText("1 unassessed")).toBeTruthy();
  });
});

describe("nothing assessed (Requirement 5.4)", () => {
  it("shows the sentence and 'no grade' instead of the headline", () => {
    const { container } = renderHeader(parsedOf({}));
    expect(screen.getByText("No dependencies could be assessed")).toBeTruthy();
    expect(screen.getByText("no grade", { selector: "strong" })).toBeTruthy();
    expect(container.textContent).not.toContain("are in the graveyard");
  });
});

describe("grade line (Requirements 5.5, 5.6)", () => {
  it("shows the label, letter and explanation built from the summary", () => {
    const parsed = parsedOf({ buried: 1, alive: 2 });
    renderHeader(parsed);
    const { summary } = parsed;
    const caption = screen.getByText("worst single risk");
    expect(caption.tagName).toBe("FIGCAPTION");
    const figure = caption.closest("figure") as HTMLElement;
    const letter = figure.querySelector("strong") as HTMLElement;
    expect(letter.textContent).toBe(summary.grade);
    expect(figure.contains(letter)).toBe(true);
    expect(figure.textContent).toBe(`${summary.grade}worst single risk`);
    expect(
      screen.getByText(
        `Graded on the riskiest package, ${summary.maxScorePackage?.name} (score ${summary.maxScore}), not on the average (${summary.averageScore})`,
      ),
    ).toBeTruthy();
  });

  it("keeps the scale disclosure closed by default, with grades A to F", () => {
    const { container } = renderHeader(parsedOf({ alive: 2 }));
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    for (const letter of ["A", "B", "C", "D", "F"]) {
      expect(details.textContent).toContain(`${letter}:`);
    }
  });
});

describe("entries sentence (Requirement 5.7)", () => {
  it("is shown when entries exceed unique packages", () => {
    const rows: RowSpec[] = [
      { name: "dup", kind: "alive" },
      { name: "dup", kind: "alive" },
      { name: "other", kind: "alive" },
    ];
    const parsed = buildScanResult(rows, {
      manifestPaths: ["package.json", "packages/a/package.json"],
    }) as unknown as ParsedScanResult;
    renderHeader(parsed);
    const text = `${parsed.dependencies.length} dependency entries across 2 manifests, ${parsed.summary.total} unique packages`;
    expect(parsed.dependencies.length).toBeGreaterThan(parsed.summary.total);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it("is absent otherwise", () => {
    const { container } = renderHeader(parsedOf({ alive: 3 }));
    expect(container.textContent).not.toContain("dependency entries across");
  });
});

describe("repository facts (Requirements 5.1, 5.8)", () => {
  it("renders a time element with the ISO value and the short SHA with the full SHA", () => {
    const { container } = renderHeader(parsedOf({ alive: 1 }));
    const time = container.querySelector("time") as HTMLTimeElement;
    expect(time.getAttribute("datetime")).toBe(AS_OF);
    expect(time.textContent).toBe("2026-01-01 00:00 UTC");
    expect(container.querySelector("abbr")?.getAttribute("title")).toBe("a".repeat(40));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("synthetic/graveyard");
  });

  it("shows '(not the default branch)' only for a non-default branch", () => {
    const base = parsedOf({ alive: 1 });
    const { container, unmount } = renderHeader(base);
    expect(container.textContent).not.toContain("(not the default branch)");
    unmount();
    const other = { ...base, repo: { ...base.repo, branch: "dev" } } as ParsedScanResult;
    const second = renderHeader(other);
    expect(second.container.textContent).toContain("branch dev (not the default branch)");
  });
});

describe("cache note (Requirement 3.10)", () => {
  it("adds the caretaker's records wording only for a hit", () => {
    const parsed = parsedOf({ alive: 1 });
    const { container, unmount } = renderHeader(parsed, "hit");
    expect(container.textContent).toContain("scanned 3 hours ago, from the caretaker's records");
    unmount();
    for (const cache of ["miss", "unknown"] as const) {
      const r = renderHeader(parsed, cache);
      expect(r.container.textContent).toContain("scanned 3 hours ago");
      expect(r.container.textContent).not.toContain("caretaker's records");
      r.unmount();
    }
  });

  it("renders standalone", () => {
    const { container } = render(<CacheNote cache="hit" asOfIso={AS_OF} nowMs={NOW} />);
    expect(container.textContent).toBe("scanned 3 hours ago, from the caretaker's records");
  });
});

describe("view toggle (Requirement 18.1)", () => {
  it("reflects the view in aria-pressed", () => {
    const { unmount } = render(<ViewToggle view="scene" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Scene" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("false");
    unmount();
    render(<ViewToggle view="list" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Scene" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onChange with the other view", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ViewToggle view="scene" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(onChange).toHaveBeenCalledWith("list");
  });
});

describe("grade plaque component (Requirements 5.2, 5.8)", () => {
  it("renders the letter and caption in one figure, then the explanation and the closed scale", () => {
    const parsed = parsedOf({ buried: 1, alive: 2 });
    const header = headerOf(parsed);
    const { container } = render(<GradePlaque grade={header.grade} />);
    const figure = container.querySelector("figure") as HTMLElement;
    expect(figure.querySelector("strong")?.textContent).toBe(header.grade.letter);
    expect(figure.querySelector("figcaption")?.textContent).toBe("worst single risk");
    expect(figure.nextElementSibling?.textContent).toBe(header.grade.explanation);
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(figure.contains(details)).toBe(false);
    for (const entry of header.grade.scale) {
      expect(details.textContent).toContain(`${entry.letter}: ${entry.range}`);
    }
  });

  it("shows 'no grade' as the letter when nothing was assessed", () => {
    const header = headerOf(parsedOf({}));
    const { container } = render(<GradePlaque grade={header.grade} />);
    expect(container.querySelector("figure strong")?.textContent).toBe("no grade");
  });
});
