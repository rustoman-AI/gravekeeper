// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "../../../components/landing-page";
import { FEATURED_GRAVEYARDS } from "../../../view-model/constants";

afterEach(cleanup);

// Requirement 1.7, verbatim.
const LEGEND_TEXTS = [
  "Tombstone: DEAD and buried, archived or deprecated",
  "Overgrown grave: DEAD and forgotten, no recent release or commit, may be finished or abandoned",
  "Ghost: HAUNTED, has open vulnerabilities",
  "Restless ghost: HAUNTED and buried, has open vulnerabilities and is also archived or deprecated",
  "Lantern: ALIVE, no risk signal strong enough to matter",
  "Unmarked grave: not assessed",
];

const ECOSYSTEMS = ["npm", "pypi", "cargo"];

function setup(onSubmit = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(<LandingPage onSubmit={onSubmit} />);
  return { user, onSubmit, ...utils };
}

describe("LandingPage (Requirements 1 and 2)", () => {
  it("has exactly one h1 named Gravekeeper followed by a pitch paragraph (1.1, 1.9)", () => {
    const { container } = setup();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe("Gravekeeper");
    const next = h1s[0]?.nextElementSibling;
    expect(next?.tagName).toBe("P");
    expect((next?.textContent ?? "").trim().length).toBeGreaterThan(0);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("has a labelled input and a Dig up button (1.2)", () => {
    setup();
    const input = screen.getByLabelText("GitHub repository URL");
    expect(input.tagName).toBe("INPUT");
    expect(screen.getByRole("button", { name: "Dig up" })).toBeTruthy();
  });

  it("submits on button click and on Enter with the trimmed value as typed (1.3, 1.4)", async () => {
    const { user, onSubmit } = setup();
    const input = screen.getByLabelText("GitHub repository URL");
    await user.type(input, "  https://github.com/a/b  ");
    await user.click(screen.getByRole("button", { name: "Dig up" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenLastCalledWith("https://github.com/a/b");

    await user.type(input, "{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenLastCalledWith("https://github.com/a/b");
  });

  it("passes the value without rewriting it (1.3)", async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText("GitHub repository URL"), "Not A Url & more{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("Not A Url & more");
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
  ])("shows the empty message for %s input and does not submit (1.5)", async (_name, text) => {
    const { user, onSubmit } = setup();
    const input = screen.getByLabelText("GitHub repository URL");
    if (text !== "") await user.type(input, text);
    await user.click(screen.getByRole("button", { name: "Dig up" }));

    expect(onSubmit).not.toHaveBeenCalled();
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Enter a repository URL");
    expect(status.getAttribute("aria-live")).toBe("polite");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(describedBy?.split(/\s+/)).toContain(status.id);
    expect(document.activeElement).toBe(input);
  });

  it("shows the empty message when Enter is pressed on an empty input (1.4, 1.5)", async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByLabelText("GitHub repository URL"));
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Enter a repository URL");
  });

  it("shows six legend texts exactly (1.7)", () => {
    setup();
    const legend = screen.getByRole("heading", { level: 2, name: "Legend" });
    const section = legend.closest("section") as HTMLElement;
    const items = within(section).getAllByRole("listitem");
    expect(items.map((li) => li.textContent?.trim())).toEqual(LEGEND_TEXTS);
  });

  it("links each featured graveyard in constant order with owner/repo and ecosystem (2.1 to 2.4)", () => {
    setup();
    const heading = screen.getByRole("heading", { level: 2, name: "Featured graveyards" });
    const section = heading.closest("section") as HTMLElement;
    const links = within(section).getAllByRole("link");
    expect(links).toHaveLength(FEATURED_GRAVEYARDS.length);
    FEATURED_GRAVEYARDS.forEach((url, i) => {
      const link = links[i] as HTMLElement;
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe(`/?repo=${encodeURIComponent(url)}`);
      const ownerRepo = url.replace("https://github.com/", "");
      expect(link.textContent).toContain(ownerRepo);
      expect(link.textContent).toContain(ECOSYSTEMS[i] as string);
    });
  });

  it("states that the grade is the worst single risk, not an average (1.8)", () => {
    setup();
    expect(
      screen.getByText("The grade is the worst single risk among the dependencies, not an average."),
    ).toBeTruthy();
  });

  it("orders headings h1, then h2 without skipping levels (1.9)", () => {
    setup();
    const levels = screen
      .getAllByRole("heading")
      .map((h) => ({ level: Number(h.tagName.slice(1)), text: h.textContent }));
    expect(levels).toEqual([
      { level: 1, text: "Gravekeeper" },
      { level: 2, text: "How the caretaker decides" },
      { level: 2, text: "Featured graveyards" },
      { level: 2, text: "Legend" },
    ]);
  });
});
