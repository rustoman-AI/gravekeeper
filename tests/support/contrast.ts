// Contrast helpers for token tests. Same formula as tests/ui/tokens.test.ts (WCAG 2.x relative luminance).

export type Rgb = readonly [number, number, number];

export function parseHex(hex: string): Rgb {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
}

export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Linear interpolation in sRGB: `from` at t = 0, `to` at t = 1. */
export function interpolate(from: Rgb, to: Rgb, t: number): Rgb {
  return from.map((c, i) => c + (to[i] - c) * t) as unknown as Rgb;
}

/** `fg` at opacity `alpha` over `bg`. */
export function composite(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return interpolate(bg, fg, alpha);
}
