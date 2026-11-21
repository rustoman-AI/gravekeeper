// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResurrectSlot } from "../../../components/resurrect-slot";
import type { ResurrectBlock, ResurrectModel } from "../../../view-model/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const BINCODE =
  "Due to a doxxing and harassment incident, the maintainers ceased development. See [wincode](https://crates.io/crates/wincode).";

function block(to: string, lines: string[]): ResurrectBlock {
  return {
    heading: null,
    lead: null,
    lines,
    note: null,
    copyLabel: `Copy commands for ${to}`,
    copyText: lines.join("\n"),
  };
}

function modelOf(over: Partial<ResurrectModel> = {}): ResurrectModel {
  return {
    heading: "Resurrect",
    urgent: null,
    hints: [],
    suggestions: [
      {
        label: "From the caretaker's list",
        why: "The maintainers deprecated it.",
        source: { href: "https://example.org/notice", label: "Read the source" },
        alternatives: [
          {
            name: "got",
            blocks: [
              {
                ...block("got", ["npm uninstall request", "npm install got"]),
                lead: [
                  { kind: "text", text: "Replace " },
                  { kind: "code", text: "request" },
                ],
                note: "A note.",
              },
            ],
          },
        ],
      },
    ],
    fallback: null,
    ...over,
  };
}

const slot = () => document.querySelector('[data-slot="resurrect"]') as HTMLElement;

describe("ResurrectSlot markup (Requirements 9.12, 12.1)", () => {
  it("has a level 3 heading, data-slot, and no placeholder remnants", () => {
    render(<ResurrectSlot model={modelOf()} />);
    const h = screen.getByRole("heading", { level: 3, name: "Resurrect" });
    expect(slot().getAttribute("aria-labelledby")).toBe(h.id);
    expect(slot().hasAttribute("data-placeholder")).toBe(false);
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.queryByText(/not available yet/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Resurrect" })).toBeNull();
    expect(slot().querySelector("button[disabled]")).toBeNull();
  });

  it.each([
    BINCODE,
    '<a href="https://evil.example">x</a>',
    "javascript:alert(1)",
  ])("renders hint text as one text node without links: %s", (text) => {
    render(
      <ResurrectSlot
        model={modelOf({
          suggestions: [],
          hints: [{ label: "Upstream says", text, link: null }],
        })}
      />,
    );
    const p = screen.getByText(text);
    expect(p.childNodes).toHaveLength(1);
    expect(p.childNodes[0]?.nodeType).toBe(Node.TEXT_NODE);
    expect(p.querySelector("a")).toBeNull();
    expect(slot().querySelector("a")).toBeNull();
  });

  it("renders names in code elements and commands in pre > code", () => {
    render(<ResurrectSlot model={modelOf()} />);
    expect(screen.getAllByText("got").some((e) => e.tagName === "CODE")).toBe(true);
    expect(screen.getByText("request").tagName).toBe("CODE");
    const code = slot().querySelector("pre > code") as HTMLElement;
    expect(code.textContent).toBe("npm uninstall request\nnpm install got");
    expect(screen.getByText("A note.")).toBeTruthy();
  });

  it("renders links through ExternalLink", () => {
    render(
      <ResurrectSlot
        model={modelOf({
          hints: [
            {
              label: "Upstream says",
              text: "t",
              link: { href: "https://osv.dev/vulnerability/X", label: "Read the advisory" },
            },
          ],
          fallback: {
            kind: "buried",
            paragraph: "p",
            links: [{ href: "https://www.npmjs.com/package/x", label: "registry page" }],
          },
        })}
      />,
    );
    const links = Array.from(slot().querySelectorAll("a"));
    expect(links).toHaveLength(3);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(screen.getByText("Read the advisory").closest("a")?.getAttribute("href")).toBe(
      "https://osv.dev/vulnerability/X",
    );
  });

  it("renders the urgent paragraph before the hints", () => {
    render(
      <ResurrectSlot
        model={modelOf({
          urgent: "Move off it now.",
          hints: [{ label: "L", text: "T", link: null }],
        })}
      />,
    );
    const text = slot().textContent ?? "";
    expect(text.indexOf("Move off it now.")).toBeLessThan(text.indexOf("T"));
  });

  it("renders no command block for an Alternative without blocks", () => {
    render(
      <ResurrectSlot
        model={modelOf({
          suggestions: [
            {
              label: "From the caretaker's list",
              why: "w",
              source: { href: "https://example.org/", label: "s" },
              alternatives: [{ name: "bad name", blocks: [] }],
            },
          ],
        })}
      />,
    );
    expect(slot().querySelector("pre")).toBeNull();
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
  });
});

describe("Copy (Requirements 11.1 to 11.6, 11.8)", () => {
  it("has an empty role=status element before any copy", () => {
    render(<ResurrectSlot model={modelOf()} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    expect(screen.getByRole("button", { name: "Copy commands for got" })).toBeTruthy();
  });

  it("copies the joined lines, reports success, keeps focus, and resets after 3000 ms", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<ResurrectSlot model={modelOf()} />);
    const button = screen.getByRole("button", { name: "Copy commands for got" });
    button.focus();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(writeText).toHaveBeenCalledWith("npm uninstall request\nnpm install got");
    expect(screen.getByRole("status").textContent).toBe("Copied the commands for got");
    expect(document.activeElement).toBe(button);
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.getByRole("status").textContent).not.toBe("");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("status").textContent).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports failure for a rejecting clipboard", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<ResurrectSlot model={modelOf()} />);
    const button = screen.getByRole("button", { name: "Copy commands for got" });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Copying failed. Select the commands and copy them by hand.",
    );
    expect(document.activeElement === button || document.activeElement === document.body).toBe(true);
  });

  it("reports failure when the clipboard is missing", async () => {
    vi.stubGlobal("navigator", {});
    render(<ResurrectSlot model={modelOf()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy commands for got" }));
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Copying failed. Select the commands and copy them by hand.",
    );
  });

  it("clears the timer on unmount", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const { unmount } = render(<ResurrectSlot model={modelOf()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy commands for got" }));
    });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
