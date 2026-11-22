/**
 * Stone sprites of the Scene: four tombstone silhouettes and three overgrown
 * graves (graveyard-art Requirements 3.1, 4.7, 4.9). Shapes live in <defs> so
 * the restless sprite can reuse the stones by reference (`#shape-stone-<v>`).
 * Every symbol uses the 0 0 80 104 viewBox and a root <g> whose opacity follows
 * `--depth-bright`. Colours are design tokens only. No filter, no mask, no text.
 * Each outline differs in greyscale: arched, cross-shaped, tall spire, flat ledger stone (top face with an engraved cross, thin front edge).
 * The built-in lean of the old overgrown symbol is gone: Tilt supplies it (Requirement 3.6).
 */

const VIEW_BOX = "0 0 80 104";
const DEPTH_STYLE = { opacity: "var(--depth-bright, 1)" } as const;

const STONE = "var(--color-stone)";
const EDGE = "var(--color-bone-muted)";
const CARVE = "var(--color-night)";
const SHADOW = "var(--color-night-raised)";
const MOSS = "var(--color-moss)";
const MOSS_DEEP = "var(--color-moss-deep)";

/** Dark ground shadow under a stone (shared by every shape). */
function GroundShadow({ rx = 30 }: { rx?: number }) {
  return <ellipse cx="40" cy="98" rx={rx} ry="4" fill={CARVE} fillOpacity="0.6" />;
}

/** Small leaf at a position; `s` scales it, `r` rotates it in degrees. */
function Leaf({ x, y, r = 0, s = 1 }: { x: number; y: number; r?: number; s?: number }) {
  return (
    <path
      d="M0 0 Q4 -6 9 0 Q4 6 0 0 Z"
      fill={MOSS}
      stroke={MOSS_DEEP}
      strokeWidth="0.8"
      transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}
    />
  );
}

/** Ledger_Stone outline: top face (far edge y 70, near edge y 86) plus a thin front edge down to y 94. */
const LEDGER_OUTLINE = "M6 94 V86 L18 70 H62 L74 86 V94 Z";

/** Shared ivy-stone body (chipped shoulders), the base of the three overgrown graves. */
const IVY_STONE = "M18 96 V46 L24 30 L36 24 L52 25 L60 34 L62 46 V96 Z";
const IVY_CARVE = "M28 44 H50 M28 54 H46 M28 64 H50";

function IvyStoneBody() {
  return (
    <>
      <GroundShadow />
      <path d={IVY_STONE} fill={STONE} stroke={EDGE} strokeWidth="2" strokeLinejoin="round" />
      <path d={IVY_CARVE} stroke={CARVE} strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </>
  );
}

export function SceneSpriteStones() {
  return (
    <>
      <defs>
        {/* Rounded: arched top with a chipped right shoulder and a crack. */}
        <g id="shape-stone-rounded">
          <GroundShadow />
          <path
            d="M16 96 V44 C16 28 27 19 40 19 C48 19 54 22 58 26 L56 32 L63 37 L64 44 V96 Z"
            fill={STONE}
            stroke={EDGE}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M24 90 V46 C24 36 31 28 40 28" stroke={CARVE} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M32 50 H48 M32 58 H44 M32 66 H48" stroke={CARVE} strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M52 70 L48 78 L52 84" stroke={CARVE} strokeWidth="1.2" fill="none" />
          <path d="M10 97 H70" stroke={SHADOW} strokeWidth="3" strokeLinecap="round" />
        </g>

        {/* Cross: Celtic-ish cross with a ring, on a stepped base. */}
        <g id="shape-stone-cross">
          <GroundShadow rx={26} />
          <path
            d="M34 86 V52 H18 V40 H34 V24 H46 V40 H62 V52 H46 V86 Z"
            fill={STONE}
            stroke={EDGE}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M20 86 H60 V96 H20 Z" fill={STONE} stroke={EDGE} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="40" cy="46" r="11" fill="none" stroke={CARVE} strokeWidth="1.5" />
          <path d="M40 30 V80" stroke={CARVE} strokeWidth="1.2" strokeLinecap="round" />
          <path d="M26 91 H54" stroke={CARVE} strokeWidth="1.2" strokeLinecap="round" />
        </g>

        {/* Obelisk: tall tapering spire, pyramidion, on a plinth. */}
        <g id="shape-stone-obelisk">
          <GroundShadow rx={28} />
          <path d="M14 96 V88 H66 V96 Z" fill={STONE} stroke={EDGE} strokeWidth="2" strokeLinejoin="round" />
          <path d="M22 88 V80 H58 V88 Z" fill={STONE} stroke={EDGE} strokeWidth="2" strokeLinejoin="round" />
          <path
            d="M29 80 L33 30 L40 6 L47 30 L51 80 Z"
            fill={STONE}
            stroke={EDGE}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M33 30 H47" stroke={CARVE} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M40 38 V74 M36 50 H44 M36 62 H44" stroke={CARVE} strokeWidth="1.2" strokeLinecap="round" fill="none" />
          <path d="M44 14 L41 20" stroke={CARVE} strokeWidth="1" />
        </g>

        {/* Slab: Ledger_Stone, a flat slab lying on the ground seen at a slight angle:
            a top face with an engraved cross and a thin front edge. */}
        <g id="shape-stone-slab">
          <GroundShadow rx={36} />
          <path d={LEDGER_OUTLINE} fill={STONE} stroke={EDGE} strokeWidth="2" strokeLinejoin="round" />
          <path d="M6 86 H74" stroke={EDGE} strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M40 73 V84 M34 78 H46" stroke={CARVE} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </g>

        {/* Ivy light: a thin vine up one side, a few leaves, moss at the foot. */}
        <g id="shape-ivy-light">
          <IvyStoneBody />
          <path d="M54 94 Q58 78 52 64 Q48 54 54 42" stroke={MOSS} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <Leaf x={55} y={72} r={-30} />
          <Leaf x={52} y={58} r={150} />
          <Leaf x={54} y={46} r={-40} s={0.9} />
          <path d="M14 97 Q24 90 34 97 Z" fill={MOSS} />
        </g>

        {/* Ivy medium: vines on both sides, a moss cap on the top-left, more leaves. */}
        <g id="shape-ivy-medium">
          <IvyStoneBody />
          <path d="M24 30 L36 24 L44 25 Q36 32 30 40 Q26 44 22 46 Z" fill={MOSS} />
          <path d="M54 94 Q60 76 52 62 Q46 50 54 36" stroke={MOSS} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M24 94 Q18 80 26 70 Q30 62 24 54" stroke={MOSS} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M18 96 Q28 78 40 86 T62 80 V96 Z" fill={MOSS} />
          <Leaf x={55} y={72} r={-30} />
          <Leaf x={52} y={56} r={150} />
          <Leaf x={54} y={40} r={-40} />
          <Leaf x={25} y={68} r={200} />
          <Leaf x={25} y={56} r={-20} s={0.9} />
          <Leaf x={34} y={84} r={-60} s={0.9} />
        </g>

        {/* Ivy heavy: the stone is almost buried in moss and leaves, only the top edge shows. */}
        <g id="shape-ivy-heavy">
          <IvyStoneBody />
          <path d="M18 96 V50 Q26 40 36 46 Q46 38 62 50 V96 Z" fill={MOSS} />
          <path d="M18 62 Q28 54 40 62 T62 58" stroke={MOSS_DEEP} strokeWidth="2" fill="none" />
          <path d="M22 76 Q34 68 44 78 T62 74" stroke={MOSS_DEEP} strokeWidth="2" fill="none" />
          <path d="M26 30 Q34 36 30 46 M52 26 Q60 34 56 48" stroke={MOSS} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M12 98 Q22 84 30 98 M50 98 Q60 82 70 98" stroke={MOSS} strokeWidth="4" fill="none" strokeLinecap="round" />
          <Leaf x={27} y={36} r={-70} />
          <Leaf x={55} y={34} r={20} />
          <Leaf x={20} y={54} r={160} />
          <Leaf x={60} y={56} r={10} />
          <Leaf x={32} y={68} r={-30} />
          <Leaf x={48} y={72} r={200} />
          <Leaf x={22} y={84} r={-10} s={1.1} />
          <Leaf x={58} y={86} r={170} s={1.1} />
        </g>
      </defs>

      {/* Tombstones */}
      <symbol id="plot-tombstone-rounded" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <use href="#shape-stone-rounded" />
        </g>
      </symbol>
      <symbol id="plot-tombstone-cross" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <use href="#shape-stone-cross" />
        </g>
      </symbol>
      <symbol id="plot-tombstone-obelisk" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <use href="#shape-stone-obelisk" />
        </g>
      </symbol>
      <symbol id="plot-tombstone-slab" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <use href="#shape-stone-slab" />
        </g>
      </symbol>

      {/* Overgrown graves */}
      <symbol id="plot-overgrown-ivy-light" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <use href="#shape-ivy-light" />
        </g>
      </symbol>
      <symbol id="plot-overgrown-ivy-medium" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <use href="#shape-ivy-medium" />
        </g>
      </symbol>
      <symbol id="plot-overgrown-ivy-heavy" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <use href="#shape-ivy-heavy" />
        </g>
      </symbol>

      {/* Flat twins for the simplified form: solid fills, no detail, same outlines. */}
      <symbol id="plot-tombstone-rounded-flat" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <path d="M16 96 V44 C16 28 27 19 40 19 C48 19 54 22 58 26 L56 32 L63 37 L64 44 V96 Z" fill={STONE} />
        </g>
      </symbol>
      <symbol id="plot-tombstone-cross-flat" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <path d="M34 86 V52 H18 V40 H34 V24 H46 V40 H62 V52 H46 V86 Z M20 86 H60 V96 H20 Z" fill={STONE} />
        </g>
      </symbol>
      <symbol id="plot-tombstone-obelisk-flat" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <path d="M14 96 V88 H22 V80 H29 L33 30 L40 6 L47 30 L51 80 H58 V88 H66 V96 Z" fill={STONE} />
        </g>
      </symbol>
      <symbol id="plot-tombstone-slab-flat" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <path d={LEDGER_OUTLINE} fill={STONE} />
        </g>
      </symbol>
      <symbol id="plot-overgrown-ivy-light-flat" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <path d={IVY_STONE} fill={STONE} />
          <path d="M14 98 H34" stroke={MOSS} strokeWidth="4" fill="none" />
        </g>
      </symbol>
      <symbol id="plot-overgrown-ivy-medium-flat" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <path d={IVY_STONE} fill={STONE} />
          <path d="M18 96 Q28 78 40 86 T62 80 V96 Z" fill={MOSS} />
          <path d="M24 30 L36 24 L44 25 L22 46 Z" fill={MOSS} />
        </g>
      </symbol>
      <symbol id="plot-overgrown-ivy-heavy-flat" viewBox={VIEW_BOX}>
        <g style={DEPTH_STYLE}>
          <path d={IVY_STONE} fill={STONE} />
          <path d="M18 96 V50 Q26 40 36 46 Q46 38 62 50 V96 Z" fill={MOSS} />
        </g>
      </symbol>
    </>
  );
}
