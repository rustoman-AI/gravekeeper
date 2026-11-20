// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdvisoryGroups } from "../../../components/advisory-groups";
import { DetailPanel } from "../../../components/detail-panel";
import { buildAdvisoryGroups } from "../../../view-model/advisory-groups";
import { buildDetailModel } from "../../../view-model/detail";
import { buildPackageRows } from "../../../view-model/package-rows";
import type { ParsedAdvisory, ParsedScanResult } from "../../../view-model/types";
import { buildScanResult } from "../../support/ui/scan-result-builder";

afterEach(cleanup);

const adv = (id: string, exclusion: ParsedAdvisory["exclusion"], over: Partial<ParsedAdvisory> = {}): ParsedAdvisory => ({
  id,
  aliases: [],
  severity: "HIGH",
  url: `https://osv.dev/vulnerability/${id}`,
  exclusion,
  ...over,
});

function renderGroups(advisories: readonly ParsedAdvisory[], open: number | null, noteIds: ReadonlySet<string> = new Set()) {
  return render(<AdvisoryGroups groups={buildAdvisoryGroups(advisories, open, noteIds)} idPrefix="t" />);
}

const group = (name: string): HTMLElement => screen.getByRole("region", { name });

describe("AdvisoryGroups", () => {
  const mixed = [
    adv("GHSA-count-1", "counted", { aliases: ["CVE-2024-0001"] }),
    adv("GHSA-count-2", "counted"),
    adv("GHSA-info-1", "informational"),
    adv("GHSA-wd-1", "withdrawn"),
  ];

  it("shows three labelled groups with their own '<k> listed' text", () => {
    renderGroups(mixed, 2);
    expect(screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual([
      "Counted as open",
      "Informational, not counted",
      "Withdrawn, not counted",
    ]);
    expect(within(group("Counted as open")).getByText(/2 listed/)).toBeTruthy();
    expect(within(group("Informational, not counted")).getByText("1 listed")).toBeTruthy();
    expect(within(group("Withdrawn, not counted")).getByText("1 listed")).toBeTruthy();
  });

  it("states '<n> counted' and the alias sentence in the counted group only", () => {
    renderGroups(mixed, 2);
    const counted = group("Counted as open");
    expect(within(counted).getByText("2 listed, 2 counted")).toBeTruthy();
    expect(within(counted).getByText("Advisories that are aliases of each other count once")).toBeTruthy();
    expect(within(counted).getByText(/CVE-2024-0001/)).toBeTruthy();
    expect(within(group("Informational, not counted")).queryByText(/\d+ counted/)).toBeNull();
  });

  it("says informational and withdrawn entries are not part of the open vulnerabilities", () => {
    renderGroups(mixed, 2);
    expect(within(group("Informational, not counted")).getByText("not part of the 2 open vulnerabilities")).toBeTruthy();
    expect(within(group("Withdrawn, not counted")).getByText("not part of the 2 open vulnerabilities")).toBeTruthy();
  });

  it("shows 'Not classified' with the withdrawn sentence for entries without an excluded value", () => {
    renderGroups([adv("GHSA-old-1", "unknown"), adv("GHSA-old-2", "unknown")], 1);
    const g = group("Not classified");
    expect(within(g).getByText("2 listed")).toBeTruthy();
    expect(
      within(g).getByText("This scan result does not say which of these advisories are withdrawn"),
    ).toBeTruthy();
  });

  it("moves an unclassified id named by the informational note into the informational group", () => {
    renderGroups([adv("GHSA-old-1", "unknown"), adv("GHSA-old-2", "unknown")], 1, new Set(["GHSA-old-1"]));
    expect(within(group("Informational, not counted")).getByText("GHSA-old-1")).toBeTruthy();
    expect(within(group("Not classified")).getByText("GHSA-old-2")).toBeTruthy();
  });

  it("links each advisory id to its validated osv.dev url", () => {
    renderGroups(mixed, 2);
    const link = screen.getByRole("link", { name: "GHSA-info-1" });
    expect(link.getAttribute("href")).toBe("https://osv.dev/vulnerability/GHSA-info-1");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it.each(["javascript:alert(1)", "https://evil.example/vulnerability/GHSA-x"])(
    "renders the id as text, without a link, for the hostile url %s",
    (url) => {
      renderGroups([adv("GHSA-evil", "counted", { url })], 1);
      expect(screen.getByText("GHSA-evil")).toBeTruthy();
      expect(screen.queryByRole("link")).toBeNull();
      expect(document.querySelector("a")).toBeNull();
    },
  );
});

describe("advisory empty-list sentence in the DetailPanel", () => {
  function panelFor(advisories: ReadonlyArray<never>, kind: "haunted") {
    const parsed = buildScanResult([{ name: "lonely", kind, advisories }]) as unknown as ParsedScanResult;
    const rows = buildPackageRows(parsed);
    const model = buildDetailModel(parsed, rows, rows[0]!.key);
    if (model === null) throw new Error("no detail model");
    render(<DetailPanel model={model} onClose={() => undefined} />);
  }

  it("shows 'No advisory list is available for this version' and no advisory link when open vulnerabilities exist but the list is empty", () => {
    panelFor([], "haunted");
    expect(screen.getByText("No advisory list is available for this version")).toBeTruthy();
    expect(document.querySelector('a[href*="osv.dev"]')).toBeNull();
    expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(1);
  });
});
