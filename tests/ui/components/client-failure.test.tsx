// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScanClient } from "../../../client/scan-client";
import { GraveyardAppView } from "../../../components/graveyard-app";
import type { UrlHistory, UrlRouter } from "../../../components/hooks/use-url-state";
import { CLIENT_FETCH_TIMEOUT_MS } from "../../../view-model/index";

afterEach(cleanup);

const repo = "https://github.com/o/r";
const initialSearch = `repo=${encodeURIComponent(repo)}`;

function setup(fetchImpl: typeof fetch) {
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const client = createScanClient({
    fetchImpl,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length - 1;
    },
    clearTimer: () => {},
  });
  const history: UrlHistory = { replaceState: vi.fn() };

  function Harness() {
    const [search, setSearch] = useState(initialSearch);
    const router = useMemo<UrlRouter>(
      () => ({
        push: (href) => setSearch(href.slice(href.indexOf("?") + 1)),
        replace: (href) => setSearch(href.slice(href.indexOf("?") + 1)),
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
  return { timers };
}

async function expectScreenAndRetry(
  fetchImpl: ReturnType<typeof vi.fn>,
  heading: string,
  sentence: string,
  afterRetryTimers: () => void,
) {
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(heading);
  expect(screen.getByText(sentence)).toBeTruthy();
  const retry = screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement;
  expect(retry.disabled).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(1);

  const user = userEvent.setup();
  await user.click(retry);
  await act(async () => {});

  expect(fetchImpl).toHaveBeenCalledTimes(2);
  const first = fetchImpl.mock.calls[0]?.[1] as RequestInit;
  const second = fetchImpl.mock.calls[1]?.[1] as RequestInit;
  expect(second.body).toBe(first.body);
  expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: heading })).toBeNull();
  afterRetryTimers();
}

describe("GraveyardAppView client failures (Requirements 13.7, 13.8, 14.1)", () => {
  it("a rejected fetch shows network-failure and Retry sends the same request", async () => {
    const fetchImpl = vi.fn<() => Promise<Response>>();
    // The second request never settles so that the scanning screen stays.
    fetchImpl.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));
    fetchImpl.mockImplementation(() => new Promise<Response>(() => {}));
    setup(fetchImpl as unknown as typeof fetch);
    await act(async () => {});
    await expectScreenAndRetry(fetchImpl, "The road is washed out", "The server could not be reached.", () => {});
  });

  it("no answer within CLIENT_FETCH_TIMEOUT_MS shows timeout and Retry sends the same request", async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    const { timers } = setup(fetchImpl as unknown as typeof fetch);
    await act(async () => {});
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(CLIENT_FETCH_TIMEOUT_MS);
    await act(async () => {
      timers[0]?.fn();
    });
    await expectScreenAndRetry(fetchImpl, "The night ran out", "The server did not answer in time.", () => {
      expect(timers).toHaveLength(2);
    });
  });

  it("a body that is not JSON shows malformed-response and Retry sends the same request", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockImplementationOnce(() => Promise.resolve(new Response("not json", { status: 200 })));
    fetchImpl.mockImplementation(() => new Promise<Response>(() => {}));
    setup(fetchImpl as unknown as typeof fetch);
    await act(async () => {});
    await expectScreenAndRetry(
      fetchImpl,
      "The records are garbled",
      "The server sent an answer that Gravekeeper could not read.",
      () => {},
    );
  });
});
