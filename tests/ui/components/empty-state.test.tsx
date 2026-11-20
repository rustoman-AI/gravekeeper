// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResultsPage } from "../../../components/results-page";
import type { ParsedScanResult } from "../../../view-model/types";
import { buildScanResult, noManifestsResult } from "../../support/ui/scan-result-builder";

// graveyard-art R11.1, R11.2, R11.3, R11.4, R11.6, R11.7: one sentence when nothing could be graded.
afterEach(cleanup);

const asParsed = (r: unknown) => r as ParsedScanResult;

async function renderPage(result: ParsedScanResult) {
  const view = render(
    <ResultsPage
      result={result}
      cache="miss"
      nowMs={Date.parse("2026-01-01T00:00:00Z")}
      view="list"
      onViewChange={() => {}}
      onScanManifests={() => {}}
    />,
  );
  // The Caretaker's notes mount one frame after the first paint.
  await waitFor(() => expect(view.container.textContent).toContain("GitHub"));
  return view;
}

const FORBIDDEN = ["NO GRADE", "No dependencies could be assessed"];
const countOf = (text: string, part: string): number => text.split(part).length - 1;

function expectNoOldTexts(text: string): void {
  for (const part of FORBIDDEN) expect(text).not.toContain(part);
  // "no grade" is allowed only inside the R11.3 sentence, which ends "so there is no grade."
  expect(text.replace("so there is no grade.", "")).not.toContain("no grade");
}

describe("empty state (graveyard-art R11)", () => {
  it("no manifests: shows the one message in the empty block and nothing in the header or notes (R11.4, R11.6)", async () => {
    const result = asParsed(noManifestsResult());
    const message = result.notes.find((n) => n.code === "no-manifests")!.message;
    const { container } = await renderPage(result);
    expect(container.querySelectorAll(".gk-headline-empty")).toHaveLength(0);
    expect(container.querySelector("figure")).toBeNull();
    expect(container.querySelector('ul[aria-label="Status counts"]')).toBeNull();
    expect(countOf(container.textContent ?? "", message)).toBe(1);
    expectNoOldTexts(container.textContent ?? "");
  });

  it("manifests but 0 dependencies: shows exactly the R11.2 sentence once", async () => {
    const { container } = await renderPage(asParsed(buildScanResult([])));
    const sentences = container.querySelectorAll(".gk-headline-empty");
    expect(sentences).toHaveLength(1);
    expect(sentences[0]?.textContent).toBe("This repository declares no dependencies, so there is nothing to grade.");
    expect(container.querySelector("figure")).toBeNull();
    expect(container.textContent).not.toContain("are in the graveyard");
    expectNoOldTexts(container.textContent ?? "");
  });

  it("dependencies but 0 assessed: shows exactly the R11.3 sentence once", async () => {
    const { container } = await renderPage(
      asParsed(
        buildScanResult([
          { name: "git-a", kind: "unassessed-git" },
          { name: "git-b", kind: "unassessed-git" },
          { name: "git-c", kind: "unassessed-git" },
        ]),
      ),
    );
    const sentences = container.querySelectorAll(".gk-headline-empty");
    expect(sentences).toHaveLength(1);
    expect(sentences[0]?.textContent).toBe(
      "The caretaker could not assess any of the 3 dependencies, so there is no grade.",
    );
    expect(container.querySelector("figure")).toBeNull();
    expect(container.querySelector('ul[aria-label="Status counts"]')).toBeNull();
    expectNoOldTexts(container.textContent ?? "");
  });
});
