/**
 * Fog band geometry (art-polish Requirement 4). Pure constants shared with
 * `app/globals.css`; `tests/ui/art-css.test.ts` ties the CSS to these numbers.
 */

// Requirement 4.4: horizontal band centre (% of the layer width) for the even
// and the odd row of the low layer. The two differ by at least 15 points.
export const FOG_BAND_CENTER_X_PCT: readonly [number, number] = [40, 60];

// Requirement 4.3: vertical band centre (% of the two-row tile). Each lies
// strictly inside its own half of the tile.
export const FOG_BAND_CENTER_Y_PCT: readonly [number, number] = [34, 84];

// Requirements 4.1, 4.2: horizontal radius of a band (% of the layer width).
export const FOG_BAND_RX_PCT = 28;

// Requirements 4.1, 4.3: vertical radius of a band (% of the two-row tile).
export const FOG_BAND_RY_PCT = 14;

// Requirement 4.4: horizontal radius of a band of the high layer.
export const FOG_HIGH_RX_PCT = 24;

/**
 * Requirements 4.4, 4.9: horizontal band centre of the low layer for a row.
 * Total over non-negative integers; rows `r` and `r + 2` give the same value.
 */
export function fogRowOffsetPct(row: number): number {
  return FOG_BAND_CENTER_X_PCT[row % 2];
}
