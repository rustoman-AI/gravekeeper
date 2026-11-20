// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { SkipLink } from "../../../components/skip-link";

function Shell() {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main">content</main>
      <SiteFooter />
    </>
  );
}

describe("site shell", () => {
  it("renders banner, main and contentinfo landmarks", () => {
    render(<Shell />);
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("main").id).toBe("main");
    expect(screen.getByRole("contentinfo")).toBeTruthy();
  });

  it("renders a skip link targeting #main before the header", () => {
    const { container } = render(<Shell />);
    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(skip.getAttribute("href")).toBe("#main");
    expect(container.firstElementChild).toBe(skip);
  });

  it("renders the wordmark as a link to / and not as a heading", () => {
    render(<Shell />);
    const wordmark = screen.getByRole("link", { name: "Gravekeeper" });
    expect(wordmark.getAttribute("href")).toBe("/");
    expect(screen.getByRole("banner").contains(wordmark)).toBe(true);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("includes the font licence text in the footer", () => {
    render(<Shell />);
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain(
      "Fonts: SIL Open Font License 1.1, see docs/font-licences.md",
    );
  });
});
