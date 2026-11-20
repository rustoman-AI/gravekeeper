// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraveyardAppView } from "../../../components/graveyard-app";
import type { ScanRunner } from "../../../components/hooks/use-scan";
import type { UrlHistory, UrlRouter } from "../../../components/hooks/use-url-state";
import { buildUrl } from "../../../view-model/index";

afterEach(cleanup);

interface Recorded {
  readonly repoUrl: string;
  readonly signal: AbortSignal;
}

function searchOf(href: string): string {
  const i = href.indexOf("?");
  return i < 0 ? "" : href.slice(i + 1);
}

const repoA = "https://github.com/a/a";
const repoB = "https://github.com/b/b";
const queryOf = (repo: string) => `repo=${encodeURIComponent(repo)}`;

function setup(initialSearch: string) {
  const requests: Recorded[] = [];
  const run = vi.fn<ScanRunner["run"]>((request, signal) => {
    requests.push({ repoUrl: request.repoUrl, signal });
    return new Promise(() => {}); // never settles: the shell stays in the scanning phase
  });
  const client: ScanRunner = { run };
  const push = vi.fn();
  const replace = vi.fn();
  const history: UrlHistory = { replaceState: vi.fn() };
  const control: { setSearch: (s: string) => void } = { setSearch: () => {} };

  function Harness() {
    const [search, setSearch] = useState(initialSearch);
    control.setSearch = setSearch;
    const router = useMemo<UrlRouter>(
      () => ({
        push: (href) => {
          push(href);
          setSearch(searchOf(href));
        },
        replace: (href) => {
          replace(href);
          setSearch(searchOf(href));
        },
      }),
      [],
    );
    return (
      <GraveyardAppView
        router={router}
        search={search}
        history={history}
        client={client}
        scanningClock={{ reducedMotion: true, setInterval: () => 0, clearInterval: () => {} }}
      />
    );
  }

  render(<Harness />);
  return { requests, run, push, replace, control };
}

describe("GraveyardAppView cancel and Back (Requirements 3.8, 4.9)", () => {
  it("Cancel aborts the request, returns to /, keeps the value and focuses the input (3.8)", async () => {
    const f = setup(queryOf(repoA));
    await act(async () => {});
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]?.signal.aborted).toBe(false);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await act(async () => {});

    expect(f.requests[0]?.signal.aborted).toBe(true);
    expect(f.replace).toHaveBeenCalledTimes(1);
    expect(f.replace).toHaveBeenCalledWith("/");
    expect(f.push).not.toHaveBeenCalled();
    expect(f.requests).toHaveLength(1);

    const input = screen.getByLabelText("GitHub repository URL") as HTMLInputElement;
    expect(input.value).toBe(repoA);
    expect(document.activeElement).toBe(input);
  });

  it("Back during a scan aborts it and scans the earlier URL (4.9)", async () => {
    const f = setup(queryOf(repoA));
    await act(async () => {});
    expect(f.requests.map((r) => r.repoUrl)).toEqual([repoA]);

    // Navigate to B while A is in flight (a new history entry).
    act(() => {
      f.control.setSearch(searchOf(buildUrl({ repo: repoB, manifests: [], view: "scene" })));
    });
    await act(async () => {});
    expect(f.requests.map((r) => r.repoUrl)).toEqual([repoA, repoB]);
    expect(f.requests[0]?.signal.aborted).toBe(true);
    expect(f.requests[1]?.signal.aborted).toBe(false);

    // Back: popstate restores A's query.
    act(() => {
      f.control.setSearch(queryOf(repoA));
    });
    await act(async () => {});

    expect(f.requests[1]?.signal.aborted).toBe(true);
    expect(f.requests.map((r) => r.repoUrl)).toEqual([repoA, repoB, repoA]);
    expect(f.requests[2]?.signal.aborted).toBe(false);
  });
});
