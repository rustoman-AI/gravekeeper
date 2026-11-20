// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      Clicked {count} times
    </button>
  );
}

describe("jsdom component smoke test", () => {
  it("renders a component, finds it by role and drives it with user-event", async () => {
    const user = userEvent.setup();
    render(<Counter />);

    const button = screen.getByRole("button", { name: "Clicked 0 times" });
    await user.click(button);
    expect(screen.getByRole("button", { name: "Clicked 1 times" })).toBe(button);

    button.focus();
    await user.keyboard("{Enter}");
    expect(button.textContent).toBe("Clicked 2 times");
  });

  // Design RK6: is HTMLDialogElement.showModal implemented by the installed jsdom?
  // Finding (jsdom 31.0.1): HTMLDialogElement exists but showModal is NOT implemented
  // (typeof is "undefined"). D5's custom role="dialog" modal is therefore required, and
  // detail panel tests must not rely on a native <dialog>.
  // This is asserted so that a jsdom upgrade that changes the answer is noticed.
  it("records that HTMLDialogElement.prototype.showModal is absent (RK6)", () => {
    expect(typeof HTMLDialogElement).toBe("function");
    expect(typeof HTMLDialogElement.prototype.showModal).toBe("undefined");
  });
});
