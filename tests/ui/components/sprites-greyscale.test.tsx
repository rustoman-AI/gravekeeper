// @vitest-environment jsdom
// Validates: Requirements 6.5 (art-polish): tombstone outlines differ in greyscale.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GhostDefs, GhostSymbols } from "@/components/scene-sprite-ghosts";
import { SceneSpriteStones } from "@/components/scene-sprite-stones";
import { SPRITE_VARIANTS, symbolIdOf } from "@/view-model/variants";

afterEach(cleanup);

const STONE_FILL = "var(--color-stone)";

function renderSheet(): Element {
  const { container } = render(
    <svg>
      <defs>
        <GhostDefs />
      </defs>
      <SceneSpriteStones />
      <GhostSymbols />
    </svg>,
  );
  return container;
}

/** Absolute path commands M L H V C Q Z only; control points count towards the box. */
function bbox(d: string): { w: number; h: number } {
  const tokens = d.match(/[MLHVCQZ]|-?\d+(?:\.\d+)?/g) ?? [];
  const xs: number[] = [];
  const ys: number[] = [];
  let cmd = "";
  let nums: number[] = [];
  let cx = 0;
  let cy = 0;
  const flush = () => {
    if (cmd === "H") {
      cx = nums[nums.length - 1]!;
      xs.push(cx);
    } else if (cmd === "V") {
      cy = nums[nums.length - 1]!;
      ys.push(cy);
    } else if (cmd && cmd !== "Z") {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        xs.push(nums[i]!);
        ys.push(nums[i + 1]!);
      }
      cx = nums[nums.length - 2]!;
      cy = nums[nums.length - 1]!;
    }
    nums = [];
  };
  for (const t of tokens) {
    if (/[A-Z]/.test(t)) {
      flush();
      cmd = t;
    } else nums.push(Number(t));
  }
  flush();
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

const TOMBSTONES = SPRITE_VARIANTS.tombstone;

function outlines(c: Element, flat: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of TOMBSTONES) {
    const root = flat ? `#${symbolIdOf("tombstone", v, true)}` : `#shape-stone-${v}`;
    const d = c.querySelector(`${root} path[fill="${STONE_FILL}"]`)?.getAttribute("d");
    expect(d, `${root} outline`).toBeTruthy();
    out[v] = d!;
  }
  return out;
}

describe("greyscale distinctness of sprites", () => {
  it("the four tombstone outlines (full and flat) are pairwise different", () => {
    const c = renderSheet();
    for (const flat of [false, true]) {
      const values = Object.values(outlines(c, flat));
      expect(values).toHaveLength(4);
      expect(new Set(values).size).toBe(4);
    }
  });

  it("the ledger stone aspect differs from rounded, cross and obelisk by at least 0.5", () => {
    const c = renderSheet();
    const o = outlines(c, true);
    const ratio = (v: string) => {
      const b = bbox(o[v]!);
      return b.w / b.h;
    };
    const ledger = ratio("slab");
    const report: Record<string, number> = { slab: ledger };
    for (const v of ["rounded", "cross", "obelisk"]) {
      report[v] = ratio(v);
      expect(Math.abs(ledger - ratio(v)), `${v} ${ratio(v)} vs ledger ${ledger}`).toBeGreaterThanOrEqual(0.5);
    }
    console.log("aspect ratios", JSON.stringify(report));
  });

  it("restless, plain ghost and plain tombstone symbols have pairwise different markup", () => {
    const c = renderSheet();
    const ids = [
      ...SPRITE_VARIANTS.restless.map((v) => symbolIdOf("restless", v, false)),
      symbolIdOf("ghost", "wisp", false),
      ...TOMBSTONES.map((v) => symbolIdOf("tombstone", v, false)),
    ];
    const markup = ids.map((id) => c.querySelector(`#${id}`)?.innerHTML);
    for (const m of markup) expect(m).toBeTruthy();
    expect(new Set(markup).size).toBe(ids.length);
  });
});
