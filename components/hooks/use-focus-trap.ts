'use client';
import { useEffect, useRef, type RefObject } from 'react';

export interface UseFocusTrapOptions {
  /** Called when Escape is pressed while the trap is active. */
  onEscape: () => void;
  /** Element that gets focus on close. Defaults to the element focused when the trap activated. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * Modal behaviour for a custom dialog (design D5): moves focus into `containerRef` on mount, traps Tab,
 * closes on Escape, sets `inert` on every other top-level child of `<body>`, and on unmount restores
 * `inert` and returns focus to the opener.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { onEscape, returnFocusTo }: UseFocusTrapOptions,
): void {
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const opener =
      returnFocusTo?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    let top: HTMLElement = container;
    while (top.parentElement !== null && top.parentElement !== document.body) top = top.parentElement;
    const inerted: Element[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child === top || child.hasAttribute('inert')) continue;
      child.setAttribute('inert', '');
      inerted.push(child);
    }

    if (!container.contains(document.activeElement)) container.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusablesIn(container);
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === container || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      for (const el of inerted) el.removeAttribute('inert');
      if (opener !== null && opener.isConnected) opener.focus();
    };
  }, [containerRef, returnFocusTo]);
}
