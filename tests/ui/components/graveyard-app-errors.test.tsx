// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraveyardAppView } from "../../../components/graveyard-app";
import type { ScanRunner } from "../../../components/hooks/use-scan";
import type { UrlHistory, UrlRouter } from "../../../components/hooks/use-url-state";

afterEach(cleanup);

type Outcome = Awaited<ReturnType<ScanRunner["run"]>>;
type ErrorBody = Extract<Outcome, { kind: "error" }>["error"];

function searchOf(href: string): string {
  const i = href.indexOf("?");
  return i < 0 ? "" : href.slice(i + 1);
}

const repo = "https://github.com/o/r";
const queryOf = (value: string) => `repo=${encodeURIComponent(value)}`;

function apiError(status: number, error: Record<string, unknown>, retryAfterSeconds: number | null = null): Outcome {
  return { kind: "error", status, error: error as unknown as ErrorBody, retryAfterSeconds };
}

/** `outcomes` answers the requests in order; later requests never settle. */
function setup(initialSearch: string, outcomes: Outcome[]) {
  const requests: Array<{ repoUrl: string; manifests?: readonly string[] }> = [];
  const run = vi.fn<ScanRunner["run"]>((request) => {
    requests.push({ repoUrl: request.repoUrl, manifests: request.manifests });
    const next = outcomes[requests.length - 1];
    return next === undefined ? new Promise(() => {}) : Promise.resolve(next);
  });
  const client: ScanRunner = { run };
  const push = vi.fn();
  const replace = vi.fn();
  const history: UrlHistory = { replaceState: vi.fn() };

  function Harness() {
    const [search, setSearch] = useState(initialSearch);
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
  return { requests, run, push, replace };
}

describe("GraveyardAppView error screens (Requirement 13)", () => {
  it("503: Retry is disabled until the cooldown, then sends the same request and shows scanning", async () => {
    const f = setup(queryOf(repo), [
      apiError(503, { code: "upstream-unavailable", message: "GitHub is unreachable.", details: { source: "github" } }, 1),
    ]);
    await act(async () => {});

    const retry = () => screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement;
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("The gates are shut for now");
    expect(retry().disabled).toBe(true);

    await waitFor(() => {
      expect(retry().disabled).toBe(false);
    }, { timeout: 4000 });

    const user = userEvent.setup();
    await user.click(retry());
    await act(async () => {});

    expect(f.requests).toHaveLength(2);
    expect(f.requests[1]).toEqual(f.requests[0]);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "The gates are shut for now" })).toBeNull();
  });

  it("branch-not-found: Scan the default branch pushes the default-branch URL once", async () => {
    const f = setup(queryOf(`${repo}/tree/dev`), [
      apiError(404, { code: "branch-not-found", message: "Branch dev was not found.", details: { branch: "dev" } }),
    ]);
    await act(async () => {});

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Scan the default branch" }));
    await act(async () => {});

    expect(f.push).toHaveBeenCalledTimes(1);
    expect(f.push).toHaveBeenCalledWith(`/?${queryOf(repo)}`);
  });

  it("too-many-manifests: selecting a candidate and Scan selected manifests pushes repo and manifest", async () => {
    const f = setup(queryOf(repo), [
      apiError(422, {
        code: "too-many-manifests",
        message: "Found more than 5 manifests.",
        details: { limit: 5, candidates: ["a/package.json", "b/package.json"] },
      }),
    ]);
    await act(async () => {});

    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "b/package.json" }));
    await user.click(screen.getByRole("button", { name: "Scan selected manifests" }));
    await act(async () => {});

    expect(f.push).toHaveBeenCalledTimes(1);
    const href = f.push.mock.calls[0]?.[0] as string;
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(href.startsWith("/?")).toBe(true);
    expect(params.get("repo")).toBe(repo);
    expect(params.getAll("manifest")).toEqual(["b/package.json"]);
    expect(f.requests.at(-1)?.manifests).toEqual(["b/package.json"]);
  });

  it("invalid-url: editing the input and Dig up pushes the new repository", async () => {
    const f = setup(queryOf("https://example.com/o/r"), [
      apiError(400, { code: "invalid-url", message: "The host must be github.com.", details: { part: "host" } }),
    ]);
    await act(async () => {});

    expect(screen.getByText("The part that failed: host")).toBeTruthy();
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, repo);
    await user.click(screen.getByRole("button", { name: "Dig up" }));
    await act(async () => {});

    expect(f.push).toHaveBeenCalledTimes(1);
    expect(f.push).toHaveBeenCalledWith(`/?${queryOf(repo)}`);
    expect(f.requests.at(-1)?.repoUrl).toBe(repo);
  });

  it("Back to the gate is a link to /", async () => {
    setup(queryOf(repo), [apiError(404, { code: "repo-not-found", message: "No repository o/r was found." })]);
    await act(async () => {});
    expect(screen.getByRole("link", { name: "Back to the gate" }).getAttribute("href")).toBe("/");
  });
});
