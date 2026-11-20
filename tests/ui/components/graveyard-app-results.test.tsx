// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraveyardAppView } from "../../../components/graveyard-app";
import type { ScanRunner } from "../../../components/hooks/use-scan";
import type { UrlHistory, UrlRouter } from "../../../components/hooks/use-url-state";
import type { ParsedScanResult } from "../../../view-model/index";
import { buildScanResult } from "../../support/ui/scan-result-builder";

afterEach(cleanup);

const CANONICAL = "https://github.com/synthetic/graveyard";
const ENTERED = "github.com/Synthetic/Graveyard";
const MANIFEST = "packages/a/package.json";
const initialSearch = `repo=${encodeURIComponent(ENTERED)}&manifest=${encodeURIComponent(MANIFEST)}`;

const searchOf = (href: string): string => {
  const i = href.indexOf("?");
  return i < 0 ? "" : href.slice(i + 1);
};

function setup(cache: "hit" | "miss" | "unknown") {
  const result = buildScanResult([{ name: "left-pad", kind: "alive" }], {
    manifestPaths: [MANIFEST],
  }) as unknown as ParsedScanResult;
  const run = vi.fn<ScanRunner["run"]>(() => Promise.resolve({ kind: "result", result, cache }));
  const client: ScanRunner = { run };
  const push = vi.fn();
  const replace = vi.fn();
  const replaceState = vi.fn<UrlHistory["replaceState"]>();
  const history: UrlHistory = { replaceState };
  const control: { setSearch: (s: string) => void } = { setSearch: () => {} };

  function Harness() {
    const [search, setSearch] = useState(initialSearch);
    control.setSearch = setSearch;
    const router = useMemo<UrlRouter>(() => ({ push, replace }), []);
    return (
      <GraveyardAppView
        router={router}
        search={search}
        history={history}
        client={client}
        now={() => Date.parse("2026-01-01T00:05:00Z")}
        scanningClock={{ reducedMotion: true, setInterval: () => 0, clearInterval: () => {} }}
      />
    );
  }

  render(<Harness />);
  return { run, push, replace, replaceState, control };
}

const urlOf = (call: readonly unknown[] | undefined): URL => new URL(String(call?.[2]), "http://localhost");

describe("GraveyardAppView results flow (Requirements 3.4, 3.10, 18.1)", () => {
  it("replaces repo with the canonical URL without a history entry or rescan, keeping manifest (3.4)", async () => {
    const f = setup("miss");
    await act(async () => {});

    expect(f.run).toHaveBeenCalledTimes(1);
    expect(f.replaceState).toHaveBeenCalledTimes(1);
    const url = urlOf(f.replaceState.mock.calls[0]);
    expect(url.searchParams.get("repo")).toBe(CANONICAL);
    expect(url.searchParams.getAll("manifest")).toEqual([MANIFEST]);
    expect(f.push).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled();

    // The query string catches up with the replaced URL: no new request.
    act(() => {
      f.control.setSearch(searchOf(`${url.pathname}${url.search}`));
    });
    await act(async () => {});
    expect(f.run).toHaveBeenCalledTimes(1);
    expect(f.push).not.toHaveBeenCalled();
  });

  it("the view toggle writes view=list in place without a request (3.10)", async () => {
    const f = setup("miss");
    await act(async () => {});
    f.replaceState.mockClear();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "List" }));

    expect(f.replaceState).toHaveBeenCalledTimes(1);
    const url = urlOf(f.replaceState.mock.calls[0]);
    expect(url.searchParams.get("view")).toBe("list");
    expect(url.searchParams.getAll("manifest")).toEqual([MANIFEST]);
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
    expect(f.run).toHaveBeenCalledTimes(1);
    expect(f.push).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled();
  });

  it.each([
    ["hit", true],
    ["miss", false],
    ["unknown", false],
  ] as const)("cache %s: caretaker's-records text present = %s (18.1)", async (cache, present) => {
    setup(cache);
    await act(async () => {});
    const matches = screen.queryAllByText(/from the caretaker's records/);
    expect(matches.length > 0).toBe(present);
  });
});
