'use client';

import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Width in px of the referenced element. Measured in a layout effect so the first paint already uses the
 * real width. Returns `fallback` (default 0) on the server and where `ResizeObserver` is absent.
 */
export function useContainerWidth(ref: RefObject<HTMLElement | null>, fallback = 0): number {
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
