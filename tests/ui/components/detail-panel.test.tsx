// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailPanel } from "../../../components/detail-panel";
import { buildDetailModel } from "../../../view-model/detail";
import { buildPackageRows } from "../../../view-model/package-rows";
import { parseScanResponse } from "../../../view-model/parse-response";
import type { DetailModel, ParsedScanResult } from "../../../view-model/types";
import { buildScanResult, noteOf } from "../../support/ui/scan-result-builder";
import type { ResultOptions, RowSpec } from "../../support/ui/scan-result-builder";

// R10.1, R10.3, R10.4, R10.6, R10.10, R10.11, R10.12.
afterEach(cleanup);

function modelOf(specs: readonly RowSpec[], name: string, options: ResultOptions = {}): DetailModel {
  const outcome = parseScanResponse(200, { get: () => null }, JSON.parse(JSON.stringify(buildScanResult(specs, options))));
  if (outcome.kind !== "result") throw new Error("scan result did not parse");
  const parsed: ParsedScanResult = outcome.result;
  const rows = buildPackageRows(parsed);
  const row = rows.find((r) => r.name === name);
  if (row === undefined) throw new Error(`no row ${name}`);
  const model = buildDetailModel(parsed, rows, row.key);
  if (model === null) throw new Error("no model");
  return model;
}

const FACT_NAMES = [
  "daysSinceLastRelease",
  "daysSinceLastCommit",
  "archived",
  "deprecated",
  "openVulnerabilityCount",
  "maxSeverity",
  "maintainerCount",
];

const FACT_LABELS = [
  "Days since last release",
  "Days since last commit",
  "Archived",
  "Deprecated",
  "Open vulnerabilities",
  "Highest severity",
  "Maintainers",
];

function Harness({ model, onClosed }: { model: DetailModel; onClosed?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      {open ? (
        <DetailPanel
          model={model}
          onClose={() => {
            setOpen(false);
            onClosed?.();
          }}
        />
      ) : null}
    </div>
  );
}

function renderPanel(model: DetailModel) {
  const onClose = vi.fn();
  render(<DetailPanel model={model} onClose={onClose} />);
  return { onClose, dialog: screen.getByRole("dialog") };
}

describe("DetailPanel focus and dialog behaviour (R10.1)", () => {
  const model = modelOf([{ name: "alpha", kind: "alive" }], "alpha");

  it("is a modal dialog labelled by the package name", () => {
    const { dialog } = renderPanel(model);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("dialog", { name: model.title })).toBe(dialog);
    expect(dialog.parentElement?.parentElement).toBe(document.body);
  });

  it("moves focus into the dialog, keeps Tab inside, closes on Escape and returns focus to the opener", async () => {
    const user = userEvent.setup();
    const onClosed = vi.fn();
    render(<Harness model={model} onClosed={onClosed} />);
    const opener = screen.getByRole("button", { name: "opener" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);

    const count = dialog.querySelectorAll("a[href], button").length;
    for (let i = 0; i < count * 2 + 2; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < count + 1; i += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    await user.keyboard("{Escape}");
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes on the Close button and returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(<Harness model={model} />);
    const opener = screen.getByRole("button", { name: "opener" });
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("DetailPanel content", () => {
  it("shows 'unknown' for each Unknown_Value and lists all seven fact labels with the field name as title (R10.4, R10.15)", () => {
    const model = modelOf([{ name: "mystery", kind: "unknown-facts" }], "mystery");
    const { dialog } = renderPanel(model);
    const terms = within(dialog)
      .getAllByRole("term")
      .map((t) => t.textContent);
    expect(terms).toEqual(FACT_LABELS);
    const titles = within(dialog)
      .getAllByRole("term")
      .map((t) => t.getAttribute("title"));
    expect(titles).toEqual(FACT_NAMES);
    const defs = within(dialog).getAllByRole("definition");
    expect(defs).toHaveLength(7);
    for (const d of defs) expect(d.textContent).toBe("unknown");
  });

  it("shows known fact values as days, yes/no and numbers (R10.4)", () => {
    const model = modelOf([{ name: "fine", kind: "alive" }], "fine");
    const { dialog } = renderPanel(model);
    const defs = within(dialog)
      .getAllByRole("definition")
      .map((d) => d.textContent);
    expect(defs).toEqual(["10 days", "5 days", "no", "no", "0", "none (no open vulnerabilities)", "3"]);
  });

  it("shows the four version lines (R10.6)", () => {
    const specs: RowSpec[] = [
      { name: "basis-pinned", kind: "alive", versionBasis: "pinned" },
      { name: "basis-resolved", kind: "alive", versionBasis: "resolved" },
      { name: "basis-default", kind: "alive", versionBasis: "default" },
      { name: "basis-null", kind: "alive", versionBasis: null },
    ];
    const expected: Record<string, string> = {
      "basis-pinned": "1.0.0 (pinned)",
      "basis-resolved": "1.0.0 (resolved from range)",
      "basis-default": "1.0.0 (latest)",
      "basis-null": "not looked up",
    };
    for (const [name, line] of Object.entries(expected)) {
      const { dialog } = renderPanel(modelOf(specs, name));
      expect(within(dialog).getByText(line)).toBeTruthy();
      expect(within(dialog).getByText("Declared as ^1.0.0")).toBeTruthy();
      cleanup();
    }
  });

  it("shows every reason message verbatim with exactly one 'main reason' (R10.3)", () => {
    const model = modelOf([{ name: "twice-cursed", kind: "restless-both" }], "twice-cursed");
    expect(model.reasons.length).toBeGreaterThan(1);
    const { dialog } = renderPanel(model);
    for (const r of model.reasons) {
      expect(within(dialog).getByText(r.message)).toBeTruthy();
      expect(within(dialog).getByText(`(rule ${r.ruleId})`)).toBeTruthy();
    }
    expect(within(dialog).getAllByText(/main reason/)).toHaveLength(1);
  });

  it("shows the registry link and the unverified source repository link with rel and host (R10.10, R10.11)", () => {
    const model = modelOf(
      [{ name: "linked", kind: "alive" }],
      "linked",
      {
        notes: [
          noteOf("source-repo-unverified", { ecosystem: "npm", name: "linked", sourceRepo: "github.com/some-org/some-repo" }),
        ],
      },
    );
    const { dialog } = renderPanel(model);
    const registry = within(dialog).getByRole("link", { name: "registry page" });
    expect(registry.getAttribute("href")).toBe("https://www.npmjs.com/package/linked");
    const source = within(dialog).getByRole("link", { name: "source repository (unverified)" });
    expect(source.getAttribute("href")).toBe("https://github.com/some-org/some-repo");
    for (const a of [registry, source]) {
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      expect(a.getAttribute("target")).toBe("_blank");
    }
    expect(within(dialog).getByText("(www.npmjs.com)")).toBeTruthy();
    expect(within(dialog).getByText("(github.com)")).toBeTruthy();
  });

  it("builds no link when a value fails its pattern (R10.12)", () => {
    const model = modelOf(
      [{ name: "hostile", kind: "alive" }],
      "hostile",
      {
        notes: [
          noteOf("source-repo-unverified", {
            ecosystem: "npm",
            name: "hostile",
            sourceRepo: "evil.example/x/y\"><script>",
          }),
        ],
      },
    );
    const { dialog } = renderPanel(model);
    expect(within(dialog).queryByRole("link", { name: "source repository (unverified)" })).toBeNull();
    expect(dialog.querySelector("a[href*='evil']")).toBeNull();

    const badName = modelOf([{ name: "bad name!", kind: "alive" }], "bad name!");
    cleanup();
    const second = renderPanel(badName);
    expect(within(second.dialog).queryByRole("link")).toBeNull();
  });

  it("shows the Resurrect_Slot only for buried and forgotten packages (R10.13, R12.1)", () => {
    const specs: RowSpec[] = [
      { name: "dead-one", kind: "buried" },
      { name: "forgotten-one", kind: "forgotten" },
      { name: "haunted-one", kind: "haunted" },
      { name: "restless-one", kind: "restless-both" },
      { name: "alive-one", kind: "alive" },
      { name: "mystery-one", kind: "unknown-facts" },
    ];
    const shown = new Set(["dead-one", "forgotten-one"]);
    for (const s of specs) {
      const { dialog } = renderPanel(modelOf(specs, s.name));
      const slot = dialog.querySelector('[data-slot="resurrect"]');
      if (shown.has(s.name)) {
        expect(slot).not.toBeNull();
        expect(slot?.getAttribute("data-placeholder")).toBe("true");
        expect(within(dialog).getByRole("heading", { level: 3, name: "Resurrect" })).toBeTruthy();
        expect(within(dialog).getByText("Coming soon: suggest a maintained alternative and a manifest patch")).toBeTruthy();
        const button = within(dialog).getByRole("button", { name: "Resurrect" });
        expect(button.hasAttribute("disabled")).toBe(true);
        expect(button.getAttribute("aria-disabled")).toBe("true");
        const descId = button.getAttribute("aria-describedby") ?? "";
        expect(document.getElementById(descId)?.textContent?.trim()).toBe("Not available yet");
      } else {
        expect(slot).toBeNull();
        expect(within(dialog).queryByText(/resurrect/i)).toBeNull();
      }
      cleanup();
    }
  });
});
