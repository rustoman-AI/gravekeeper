/**
 * One static night-landscape SVG (graveyard-art R1.1, R1.3, R1.5, R1.6, R1.7).
 * Layers in paint order: sky, moon halo, moon, stars, far hill, near hill,
 * bare trees, iron fence, ground band. Gradients and the fence pattern live in
 * the sprite sheet <defs> (see SceneDefs). Colours are `var(--color-*)` tokens
 * only; no filter, no mask, no text, no title. Fully deterministic.
 */

import { memo } from "react";

export type BackdropVariant = "stage" | "hero" | "scanning";

interface VariantConfig {
  w: number;
  h: number;
  /** Size unit: every vertical measure below is in units of `u` pixels of viewBox. */
  u: number;
  moonX: number;
  moonY: number;
  /** Tree placements: template index, x as a fraction of the width, scale. */
  trees: readonly { t: number; x: number; s: number }[];
  /** Fence span as fractions of the width. */
  fence: readonly [number, number];
  /** Hero only: headstone silhouettes behind the fence (x fraction, height in viewBox units). */
  silhouettes?: readonly { kind: SilhouetteKind; x: number; hgt: number }[];
  /** Hero only: a faint path leading through the gate. */
  path?: boolean;
}

type SilhouetteKind = "rounded" | "cross-topped" | "obelisk" | "cross";

/** Silhouette outlines, base centre at 0,0, 100 units high, scaled by height / 100. */
const SILHOUETTE_PATHS: Record<SilhouetteKind, string> = {
  rounded: "M-20 0 V-70 A20 20 0 0 1 20 -70 V0 Z",
  "cross-topped": "M-18 0 V-62 H-6 V-78 H-16 V-90 H-6 V-100 H6 V-90 H16 V-78 H6 V-62 H18 V0 Z",
  obelisk: "M-16 0 V-80 L0 -100 L16 -80 V0 Z",
  cross: "M-4 0 V-62 H-26 V-74 H-4 V-100 H6 V-74 H26 V-62 H6 V0 Z",
};

// Design: viewBoxes of the three variants.
const VARIANTS: Record<BackdropVariant, VariantConfig> = {
  stage: {
    w: 1600,
    h: 240,
    u: 1,
    moonX: 0.78,
    moonY: 60,
    trees: [
      { t: 0, x: 0.05, s: 1.25 },
      { t: 1, x: 0.9, s: 1.45 },
      { t: 2, x: 0.975, s: 0.9 },
    ],
    fence: [0, 1],
  },
  hero: {
    w: 1600,
    h: 360,
    u: 1.5,
    moonX: 0.74,
    moonY: 84,
    trees: [
      { t: 0, x: 0.06, s: 1.2 },
      { t: 1, x: 0.9, s: 1.4 },
      { t: 2, x: 0.97, s: 0.9 },
    ],
    fence: [0, 1],
    silhouettes: [
      { kind: "rounded", x: 0.17, hgt: 48 },
      { kind: "cross-topped", x: 0.28, hgt: 58 },
      { kind: "obelisk", x: 0.385, hgt: 66 },
      { kind: "cross", x: 0.615, hgt: 82 },
      { kind: "rounded", x: 0.72, hgt: 44 },
      { kind: "rounded", x: 0.82, hgt: 40 },
    ],
    path: true,
  },
  scanning: {
    w: 400,
    h: 180,
    u: 0.75,
    moonX: 0.72,
    moonY: 46,
    trees: [{ t: 1, x: 0.9, s: 1.1 }],
    fence: [0, 0.62],
  },
};

export const STAR_COUNT = 24;

/** Stars: x and y as fractions of the sky area, radius 1 to 2 units, opacity. */
const STARS: readonly (readonly [fx: number, fy: number, r: number, o: number])[] = [
  [0.03, 0.1, 1.2, 0.7],
  [0.07, 0.36, 1, 0.5],
  [0.11, 0.17, 1.6, 0.85],
  [0.15, 0.5, 1, 0.4],
  [0.19, 0.08, 1, 0.55],
  [0.23, 0.31, 2, 0.9],
  [0.28, 0.14, 1.2, 0.6],
  [0.32, 0.47, 1.4, 0.45],
  [0.37, 0.05, 1.8, 0.8],
  [0.41, 0.26, 1, 0.5],
  [0.46, 0.4, 1.2, 0.65],
  [0.5, 0.12, 1, 0.4],
  [0.54, 0.3, 1.6, 0.75],
  [0.58, 0.06, 1.2, 0.55],
  [0.62, 0.45, 1, 0.45],
  [0.66, 0.18, 2, 0.9],
  [0.7, 0.04, 1, 0.5],
  [0.86, 0.1, 1.4, 0.7],
  [0.89, 0.34, 1, 0.45],
  [0.92, 0.2, 1.8, 0.85],
  [0.95, 0.48, 1.2, 0.5],
  [0.97, 0.07, 1, 0.6],
  [0.01, 0.52, 1.4, 0.4],
  [0.82, 0.5, 1, 0.35],
];

/** Hill profiles: x fraction and height above the bottom edge in units. Irregular on purpose. */
const FAR_HILL: readonly (readonly [number, number])[] = [
  [0, 98],
  [0.08, 108],
  [0.17, 93],
  [0.27, 114],
  [0.36, 99],
  [0.47, 88],
  [0.58, 106],
  [0.68, 121],
  [0.78, 102],
  [0.88, 92],
  [1, 108],
];
const NEAR_HILL: readonly (readonly [number, number])[] = [
  [0, 68],
  [0.1, 58],
  [0.22, 74],
  [0.31, 61],
  [0.45, 53],
  [0.57, 70],
  [0.7, 60],
  [0.83, 77],
  [0.93, 63],
  [1, 68],
];

/** Bare trees, drawn in local units with the base at 0,0 and growing upward (about 100 high). */
const TREES: readonly { trunk: string; limbs: string; twigs: string }[] = [
  {
    trunk: "M0 0 C-2 -18 3 -38 0 -58",
    limbs:
      "M0 -34 C-9 -42 -17 -47 -26 -60 M1 -46 C8 -56 15 -60 22 -78 M0 -58 C-3 -70 2 -82 -3 -97",
    twigs:
      "M-14 -45 L-23 -44 M-20 -53 L-19 -64 M12 -56 L21 -57 M16 -66 L12 -76 M-2 -76 L-11 -86 M0 -72 L8 -84 M-25 -60 L-33 -63",
  },
  {
    trunk: "M0 0 C3 -16 -2 -34 1 -52",
    limbs:
      "M1 -30 C12 -36 20 -46 30 -50 M-1 -40 C-10 -50 -22 -54 -30 -70 M1 -52 C0 -66 5 -78 2 -100",
    twigs:
      "M20 -42 L22 -54 M27 -48 L36 -46 M-14 -50 L-24 -50 M-22 -58 L-20 -70 M-28 -66 L-38 -68 M3 -80 L12 -90 M2 -72 L-6 -82 M30 -50 L34 -60",
  },
  {
    trunk: "M0 0 C-1 -14 1 -28 -1 -44",
    limbs: "M0 -26 C8 -32 14 -40 20 -54 M-1 -38 C-8 -46 -14 -52 -18 -66 M-1 -44 C0 -58 -2 -70 1 -84",
    twigs: "M13 -38 L22 -36 M18 -48 L12 -58 M-10 -46 L-19 -44 M-14 -57 L-24 -58 M0 -66 L8 -74 M-1 -60 L-8 -70",
  },
];

const f = (n: number): string => String(Math.round(n * 10) / 10);

/** Smooth closed hill path through the points, filled down to the bottom edge. */
function hillPath(profile: readonly (readonly [number, number])[], w: number, h: number, u: number): string {
  const pts = profile.map(([fx, up]) => [fx * w, h - up * u] as const);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${f(last[0])} ${f(last[1])} L${f(w)} ${f(h)} L0 ${f(h)} Z`;
  return d;
}

function SceneBackdropImpl({ variant }: { variant: BackdropVariant }) {
  const c = VARIANTS[variant];
  const { w, h, u } = c;
  const moonR = 20 * u;
  const mx = c.moonX * w;
  const groundTop = h - 22 * u;
  const skyH = h * 0.55;
  const fenceX = c.fence[0] * w;
  const fenceW = (c.fence[1] - c.fence[0]) * w;
  const fenceY = groundTop - 36 * u;
  const treeBaseY = h - 56 * u;

  return (
    <svg
      className="gk-backdrop"
      data-variant={variant}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      {/* Sky. */}
      <rect x="0" y="0" width={w} height={h} fill="url(#sky-gradient)" />

      {/* Moon: soft halo, disc and two faint craters. */}
      <circle cx={f(mx)} cy={f(c.moonY)} r={f(moonR * 4.5)} fill="url(#moon-halo-gradient)" />
      <circle cx={f(mx)} cy={f(c.moonY)} r={f(moonR)} fill="var(--color-moon)" />
      <circle
        className="gk-crater"
        cx={f(mx - moonR * 0.32)}
        cy={f(c.moonY - moonR * 0.2)}
        r={f(moonR * 0.22)}
        fill="var(--color-hill)"
        opacity="0.16"
      />
      <circle
        className="gk-crater"
        cx={f(mx + moonR * 0.38)}
        cy={f(c.moonY + moonR * 0.34)}
        r={f(moonR * 0.14)}
        fill="var(--color-hill)"
        opacity="0.14"
      />

      {/* Stars: a fixed table of small points of varied size. */}
      {STARS.map(([fx, fy, r, o], i) => (
        <circle
          key={i}
          className="gk-star"
          cx={f(fx * w)}
          cy={f(fy * skyH + 6)}
          r={r}
          fill="var(--color-bone)"
          opacity={o}
        />
      ))}

      {/* Far and near hills. */}
      <path d={hillPath(FAR_HILL, w, h, u)} fill="var(--color-hill)" opacity="0.6" />
      <path d={hillPath(NEAR_HILL, w, h, u)} fill="var(--color-hill)" />

      {/* Bare trees: trunk, limbs and twigs, tapering by stroke width. */}
      {c.trees.map(({ t, x, s }, i) => {
        const tree = TREES[t];
        return (
          <g
            key={i}
            className="gk-tree"
            transform={`translate(${f(x * w)} ${f(treeBaseY)}) scale(${Math.round(s * u * 100) / 100})`}
            fill="none"
            stroke="var(--color-iron)"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={tree.trunk} strokeWidth="4.5" />
            <path d={tree.limbs} strokeWidth="2.4" />
            <path d={tree.twigs} strokeWidth="1.1" />
          </g>
        );
      })}

      {/* Hero silhouettes: flat headstones and a cross behind the fence. */}
      {c.silhouettes?.map(({ kind, x, hgt }, i) => (
        <path
          key={i}
          className={kind === "cross" ? "gk-silhouette gk-cross" : "gk-silhouette"}
          d={SILHOUETTE_PATHS[kind]}
          transform={`translate(${f(x * w)} 322) scale(${hgt / 100})`}
          fill="var(--color-iron)"
        />
      ))}

      {/* Wrought-iron fence along the hill base. */}
      <g transform={`translate(${f(fenceX)} ${f(fenceY)}) scale(${u})`}>
        <rect x="0" y="0" width={f(fenceW / u)} height="40" fill="url(#fence-pattern)" />
      </g>

      {/* Ground band: joins the stage ground below. */}
      <rect x="0" y={f(groundTop)} width={w} height={f(h - groundTop)} fill="var(--color-ground)" />
      {/* Hero path: a pale track widening toward the viewer, fading out toward the horizon. */}
      {c.path ? (
        <>
          <defs>
            <linearGradient id="hero-path-gradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="var(--color-mist)" stopOpacity="0.6" />
              <stop offset="0.5" stopColor="var(--color-mist)" stopOpacity="0.32" />
              <stop offset="1" stopColor="var(--color-mist)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            className="gk-lane"
            d={`M${f(w / 2 - 190)} ${h} L${f(w / 2 + 190)} ${h} L${f(w / 2 + 14)} 236 L${f(w / 2 - 14)} 236 Z`}
            fill="url(#hero-path-gradient)"
          />
        </>
      ) : null}
    </svg>
  );
}

export const SceneBackdrop = memo(SceneBackdropImpl);
