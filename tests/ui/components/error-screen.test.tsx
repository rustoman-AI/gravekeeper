// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorScreen } from "../../../components/error-screen";
import { buildErrorModel } from "../../../view-model";
import { RETRY_FALLBACK_COOLDOWN_SECONDS } from "../../../view-model/constants";
import type { ErrorInput } from "../../../view-model/types";

afterEach(cleanup);

const REPO = "https://github.com/o/r";
const ARRIVED = 1_000_000;
const BACK = "Back to the gate";

type Body = Extract<ErrorInput, { kind: "api" }>["error"];

function model(status: number, error: Record<string, unknown>, retryAfterSeconds: number | null = null) {
  return buildErrorModel({
    kind: "api",
    status,
    error: error as unknown as Body,
    retryAfterSeconds,
    submittedValue: REPO,
    repoValue: REPO,
    selectedManifests: [],
  } as ErrorInput);
}

function setup(errorModel: ReturnType<typeof model>, initialRepoValue = REPO) {
  let clock = ARRIVED;
  let tick: (() => void) | undefined;
  const onAction = vi.fn();
  const utils = render(
    <ErrorScreen
      model={errorModel}
      arrivedAtMs={ARRIVED}
      onAction={onAction}
      initialRepoValue={initialRepoValue}
      clock={{
        now: () => clock,
        setInterval: (fn) => {
          tick = fn;
          return 1;
        },
        clearInterval: () => {
          tick = undefined;
        },
      }}
    />,
  );
  /** Advances the clock one second at a time, as the real timer would. */
  const advance = (seconds: number) => {
    for (let i = 0; i < seconds; i += 1) {
      clock += 1000;
      act(() => tick?.());
    }
  };
  return { ...utils, advance, onAction };
}

const upstream = { code: "upstream-unavailable", message: "GitHub is unreachable right now.", details: { source: "github" } };

// Headings and actions from Requirement 13, criterion 2.
const CASES: ReadonlyArray<{
  status: number;
  body: Record<string, unknown>;
  heading: string;
  buttons: string[];
}> = [
  {
    status: 400,
    body: { code: "invalid-url", message: "The host must be github.com.", details: { part: "host" } },
    heading: "That is not a grave we can find",
    buttons: ["Dig up"],
  },
  {
    status: 404,
    body: { code: "repo-not-found", message: "No repository o/r was found." },
    heading: "No such graveyard",
    buttons: ["Edit the URL"],
  },
  {
    status: 404,
    body: { code: "branch-not-found", message: "Branch dev was not found.", details: { branch: "dev" } },
    heading: "That branch has no graves",
    buttons: ["Scan the default branch", "Edit the URL"],
  },
  {
    status: 422,
    body: {
      code: "too-many-manifests",
      message: "Found more than 5 manifests.",
      details: { limit: 5, candidates: ["a/package.json", "b/package.json"] },
    },
    heading: "Too many plots at once",
    buttons: ["Scan selected manifests", "Scan the repository root"],
  },
  {
    status: 404,
    body: {
      code: "manifest-not-found",
      message: "No manifest at x/package.json.",
      details: { path: "x/package.json", candidates: ["a/package.json"] },
    },
    heading: "That manifest is not here",
    buttons: ["Scan selected manifests", "Scan the repository root"],
  },
  {
    status: 503,
    body: upstream,
    heading: "The gates are shut for now",
    buttons: ["Try again"],
  },
  {
    status: 504,
    body: { code: "deadline-exceeded", message: "The scan took too long." },
    heading: "The night ran out",
    buttons: ["Try again"],
  },
  {
    status: 500,
    body: { code: "internal-error", message: "Something broke inside." },
    heading: "The gravedigger tripped",
    buttons: ["Try again"],
  },
  {
    status: 400,
    body: { code: "invalid-request", message: "The body was not JSON.", details: { reason: "bad-json" } },
    heading: "The request was not understood",
    buttons: ["Try again"],
  },
];

describe("ErrorScreen per error code (13.1, 13.2, 13.3, 13.10, 13.11, 13.12)", () => {
  it.each(CASES)("$body.code: heading, message, code, status, actions", ({ status, body, heading, buttons }) => {
    setup(model(status, body, status === 503 ? 30 : null));

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe(heading);
    expect(document.activeElement).toBe(h1);

    const message = screen.getByText(body.message as string);
    expect(message.textContent).toBe(body.message);

    expect(screen.getByText(`Error code: ${body.code as string}`)).toBeTruthy();
    expect(screen.getByText(new RegExp(`HTTP status: ${String(status)}`))).toBeTruthy();

    for (const label of buttons) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: BACK }).getAttribute("href")).toBe("/");
  });

  it("shows the hints of repo-not-found and invalid-request", () => {
    setup(model(404, { code: "repo-not-found", message: "m" }));
    expect(screen.getByText("The repository must exist and be public")).toBeTruthy();
    cleanup();
    setup(model(400, { code: "invalid-request", message: "m", details: { reason: "x" } }));
    expect(screen.getByText("This is a fault in Gravekeeper, not in your URL")).toBeTruthy();
  });

  it("shows the manifest picker only when candidates exist (13.15, 13.16)", () => {
    setup(
      model(422, { code: "too-many-manifests", message: "m", details: { limit: 5, candidates: ["a/package.json"] } }),
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    cleanup();
    setup(model(422, { code: "too-many-manifests", message: "m", details: { limit: 5, candidates: [] } }));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Scan selected manifests" })).toBeNull();
    expect(screen.getByRole("button", { name: "Scan the repository root" })).toBeTruthy();
  });

  it("shows the client failures with an enabled Retry and Back to the gate (13.8)", () => {
    setup(buildErrorModel({ kind: "client", failure: "network-failure", submittedValue: REPO }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("The road is washed out");
    expect(screen.getByText("The server could not be reached.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("link", { name: BACK })).toBeTruthy();
  });
});

describe("ErrorScreen retry countdown (13.4 to 13.7)", () => {
  it("503 with Retry-After disables Retry until the end and announces it once", () => {
    const { advance, onAction } = setup(model(503, upstream, 3));
    const retry = () => screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement;
    const live = () => document.querySelector('[aria-live="polite"][role="status"]:not(#repo-url-message)');

    expect(retry().disabled).toBe(true);
    expect(screen.getByText("You can try again in 3 seconds")).toBeTruthy();
    expect(live()?.textContent).toBe("");

    advance(2);
    expect(retry().disabled).toBe(true);
    expect(screen.getByText("You can try again in 1 second")).toBeTruthy();
    expect(live()?.textContent).toBe("");

    advance(1);
    expect(retry().disabled).toBe(false);
    expect(screen.queryByText(/You can try again in/)).toBeNull();
    expect(screen.getAllByText("You can try again now")).toHaveLength(1);
    expect(live()?.textContent).toBe("You can try again now");

    advance(5);
    expect(screen.getAllByText("You can try again now")).toHaveLength(1);

    act(() => retry().click());
    expect(onAction).toHaveBeenCalledWith("retry");
  });

  it.each([
    ["502 without Retry-After", 502, upstream],
    ["504 deadline-exceeded", 504, { code: "deadline-exceeded", message: "m" }],
    ["500 internal-error", 500, { code: "internal-error", message: "m" }],
  ])("%s enables Retry after the fallback cooldown", (_name, status, body) => {
    const { advance } = setup(model(status, body));
    const retry = () => screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement;
    expect(retry().disabled).toBe(true);
    advance(RETRY_FALLBACK_COOLDOWN_SECONDS - 1);
    expect(retry().disabled).toBe(true);
    advance(1);
    expect(retry().disabled).toBe(false);
  });
});

describe("ErrorScreen invalid-url part (13.2)", () => {
  it.each(["url", "host", "path", "owner", "repository", "branch"])("names the failing part %s in text", (part) => {
    setup(model(400, { code: "invalid-url", message: "Bad URL.", details: { part } }));
    const el = screen.getByText(`The part that failed: ${part}`);
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(el.id);
  });

  it("shows no part line for other codes", () => {
    setup(model(404, { code: "repo-not-found", message: "m" }));
    expect(screen.queryByText(/The part that failed/)).toBeNull();
  });
});

describe("ErrorScreen invalid-url (13.9)", () => {
  it("leaves the input editable, prefilled, and described by the error text", () => {
    const message = "The host must be github.com.";
    setup(model(400, { code: "invalid-url", message, details: { part: "host" } }), "https://example.com/o/r");
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("https://example.com/o/r");
    expect(input.readOnly).toBe(false);
    expect(input.disabled).toBe(false);

    const describedBy = input.getAttribute("aria-describedby")?.split(" ") ?? [];
    const target = describedBy.map((id) => document.getElementById(id)).find((el) => el?.textContent === message);
    expect(target).toBeTruthy();
  });
});
