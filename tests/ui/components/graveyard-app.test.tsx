// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraveyardAppView } from "../../../components/graveyard-app";
import type { ScanRunner } from "../../../components/hooks/use-scan";
import type { UrlHistory, UrlRouter } from "../../../components/hooks/use-url-state";
import { FEATURED_GRAVEYARDS } from "../../../view-model/constants";
import { buildUrl } from "../../../view-model/index";

afterEach(cleanup);

function fakes() {
  // A client that never settles keeps the shell in the scanning phase.
  const run = vi.fn<ScanRunner["run"]>(() => new Promise(() => {}));
  const client: ScanRunner = { run };
  const push = vi.fn();
  const replace = vi.fn();
  const router: UrlRouter = { push, replace };
  const replaceState = vi.fn();
  const history: UrlHistory = { replaceState };
  return { run, client, push, replace, router, replaceState, history };
}

async function mount(search: string) {
  const f = fakes();
  render(<GraveyardAppView router={f.router} search={search} history={f.history} client={f.client} />);
  await act(async () => {});
  return f;
}

describe("GraveyardAppView (Requirements 3.1, 3.2, 3.3, 3.7)", () => {
  it("shows the landing page and sends no request at / (3.1)", async () => {
    const f = await mount("");
    expect(screen.getByRole("heading", { level: 1, name: "Gravekeeper" })).toBeTruthy();
    expect(f.run).not.toHaveBeenCalled();
  });

  it("calls the client with { repoUrl } only for ?repo= (3.2)", async () => {
    const repo = "https://github.com/a/b";
    const f = await mount(`repo=${encodeURIComponent(repo)}`);
    expect(f.run).toHaveBeenCalledTimes(1);
    expect(f.run.mock.calls[0]?.[0]).toEqual({ repoUrl: repo });
    expect(Object.keys(f.run.mock.calls[0]?.[0] ?? {})).toEqual(["repoUrl"]);
    expect(screen.queryByRole("heading", { level: 1, name: "Gravekeeper" })).toBeNull();
  });

  it("forwards manifest values in order (3.3)", async () => {
    const repo = "https://github.com/a/b";
    const f = await mount(
      `repo=${encodeURIComponent(repo)}&manifest=${encodeURIComponent("packages/x/package.json")}&manifest=${encodeURIComponent("y/requirements.txt")}`,
    );
    expect(f.run).toHaveBeenCalledTimes(1);
    expect(f.run.mock.calls[0]?.[0]).toEqual({
      repoUrl: repo,
      manifests: ["packages/x/package.json", "y/requirements.txt"],
    });
  });

  it("pushes exactly one history entry when a featured link is clicked (3.7)", async () => {
    const f = await mount("");
    const user = userEvent.setup();
    const section = screen
      .getByRole("heading", { level: 2, name: "Featured graveyards" })
      .closest("section") as HTMLElement;
    const links = within(section).getAllByRole("link");
    await user.click(links[0] as HTMLElement);
    expect(f.push).toHaveBeenCalledTimes(1);
    expect(f.push).toHaveBeenCalledWith(buildUrl({ repo: FEATURED_GRAVEYARDS[0] as string, manifests: [], view: "scene" }));
    expect(f.replace).not.toHaveBeenCalled();
    expect(f.replaceState).not.toHaveBeenCalled();
  });

  it("pushes exactly one history entry on Dig up (3.7)", async () => {
    const f = await mount("");
    const user = userEvent.setup();
    const repo = "https://github.com/a/b";
    await user.type(screen.getByLabelText("GitHub repository URL"), repo);
    await user.click(screen.getByRole("button", { name: "Dig up" }));
    expect(f.push).toHaveBeenCalledTimes(1);
    expect(f.push).toHaveBeenCalledWith(buildUrl({ repo, manifests: [], view: "scene" }));
    expect(f.replace).not.toHaveBeenCalled();
    expect(f.replaceState).not.toHaveBeenCalled();
  });
});
