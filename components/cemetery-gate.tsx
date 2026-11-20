/**
 * Original cemetery gate (graveyard-art R9.1, R9.7): two stone pillars with caps
 * and ball finials, an arched wrought-iron double gate with spear finials,
 * scrollwork and a central seam. Tokens only; no filter, no mask, no text,
 * no title. Decorative, so `aria-hidden`. Pure and deterministic, so it is
 * Server Component-safe.
 */

const f = (n: number): string => String(Math.round(n * 10) / 10);

const CENTER = 120;
const ARCH_LEFT = 50;
const ARCH_RIGHT = 190;
const ARCH_START_Y = 112;
const ARCH_CONTROL_Y = 20;

/** Y of the arch (quadratic curve) above the horizontal position x. */
function archY(x: number): number {
  const t = (x - ARCH_LEFT) / (ARCH_RIGHT - ARCH_LEFT);
  return ARCH_START_Y - 2 * (ARCH_START_Y - ARCH_CONTROL_Y) * t * (1 - t);
}

/** Bar positions: five per leaf, the double gate meets at the centre seam. */
const BAR_XS: readonly number[] = [6, 18, 30, 42, 54].flatMap((d) => [CENTER - d, CENTER + d]).sort((a, b) => a - b);

const STONE_COURSES: readonly number[] = [92, 114, 136, 158, 180];

export function CemeteryGate() {
  return (
    <svg
      className="gk-cemetery-gate"
      viewBox="0 0 240 200"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      {/* Iron: arch band, crest, bars, rails (decorative silhouette with a pale edge). */}
      {[0, 1].map((pass) => (
        <g
          key={pass}
          transform={pass === 0 ? undefined : "translate(-1.2 0)"}
          fill="none"
          stroke={pass === 0 ? "var(--color-iron)" : "var(--color-mist)"}
          strokeOpacity={pass === 0 ? 1 : 0.35}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={pass === 0 ? 4 : 1}
        >
          {/* Arch band with an inner echo. */}
          <path d={`M${ARCH_LEFT} ${ARCH_START_Y} Q${CENTER} ${ARCH_CONTROL_Y} ${ARCH_RIGHT} ${ARCH_START_Y}`} />
          <path
            d={`M${ARCH_LEFT + 8} ${ARCH_START_Y + 8} Q${CENTER} ${ARCH_CONTROL_Y + 16} ${ARCH_RIGHT - 8} ${ARCH_START_Y + 8}`}
          />
          {/* Rails. */}
          <path d="M56 150 H184 M56 184 H184" />
          {/* Bars up to the arch. */}
          {BAR_XS.map((x) => (
            <path key={x} d={`M${x} ${f(archY(x) + 10)} V200`} />
          ))}
          {/* Scrollwork in the left leaf, mirrored into the right leaf. */}
          {[false, true].map((mirror) => (
            <g key={String(mirror)} transform={mirror ? `translate(${CENTER * 2} 0) scale(-1 1)` : undefined}>
              <path d="M60 182 C60 160 86 160 86 172 C86 181 75 181 75 173" />
              <path d="M112 152 C106 170 94 166 94 178" />
              <path d="M64 152 C70 140 82 140 84 130" />
            </g>
          ))}
          {/* Seam ring. */}
          <circle cx={CENTER} cy="168" r="6" />
          {/* Crest above the arch. */}
          <path d={`M${CENTER} ${f(archY(CENTER) - 2)} V${f(archY(CENTER) - 12)}`} />
        </g>
      ))}

      {/* Spear finials on every bar and the central crest. */}
      <g fill="var(--color-iron)" stroke="var(--color-mist)" strokeOpacity="0.35" strokeWidth="0.8">
        {BAR_XS.map((x) => {
          const top = archY(x) + 10;
          return <polygon key={x} points={`${f(x - 4)},${f(top + 6)} ${f(x)},${f(top - 12)} ${f(x + 4)},${f(top + 6)}`} />;
        })}
        <polygon
          points={`${CENTER - 5},${f(archY(CENTER) - 8)} ${CENTER},${f(archY(CENTER) - 26)} ${CENTER + 5},${f(archY(CENTER) - 8)}`}
        />
      </g>

      {/* Stone pillars: shaft, shaded side, courses, cap, pyramid and ball. */}
      {[10, 190].map((x) => (
        <g key={x}>
          <rect x={x} y="70" width="40" height="130" fill="var(--color-stone)" fillOpacity="0.7" />
          <rect x={x + 26} y="70" width="14" height="130" fill="var(--color-plaque)" fillOpacity="0.55" />
          {STONE_COURSES.map((y) => (
            <path key={y} d={`M${x} ${y} H${x + 40}`} stroke="var(--color-plaque)" strokeWidth="1.5" />
          ))}
          <rect x={x - 6} y="56" width="52" height="14" fill="var(--color-stone)" />
          <rect x={x - 6} y="66" width="52" height="4" fill="var(--color-plaque)" fillOpacity="0.6" />
          <polygon points={`${x - 2},56 ${x + 42},56 ${x + 20},38`} fill="var(--color-stone)" fillOpacity="0.85" />
          <circle cx={x + 20} cy="33" r="5" fill="var(--color-stone)" />
        </g>
      ))}
    </svg>
  );
}
