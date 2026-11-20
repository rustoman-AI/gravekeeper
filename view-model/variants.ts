import { OVERGROWN_VARIANTS, TILT_MAX_DEG, TOMBSTONE_VARIANTS } from './constants';
import { hashKey } from './hash';
import type { PlotKind } from './types';

// graveyard-art Requirement 3.1, 3.3, 3.4, 4.7: the single table of sprite variants per kind.
// Restless plots share the tombstone variants (Requirement 3.8).
export const SPRITE_VARIANTS: Readonly<Record<PlotKind, readonly string[]>> = {
  tombstone: TOMBSTONE_VARIANTS,
  restless: TOMBSTONE_VARIANTS,
  overgrown: OVERGROWN_VARIANTS,
  ghost: ['wisp'],
  lantern: ['iron'],
  unmarked: ['mound'],
};

// graveyard-art Requirement 3.6: only stones lean.
export const STONE_KINDS: ReadonlySet<PlotKind> = new Set<PlotKind>([
  'tombstone',
  'overgrown',
  'restless',
]);

// graveyard-art Requirement 3.2, 3.8: the variant depends on the kind and the key only.
// A restless plot and a tombstone with one key get the same variant.
export function variantOf(kind: PlotKind, key: string): string {
  const list = SPRITE_VARIANTS[kind];
  return list[hashKey('variant:' + key) % list.length];
}

// graveyard-art Requirement 3.6, 3.8: integer degrees in [-TILT_MAX_DEG, TILT_MAX_DEG] for stones, else 0.
export function tiltOf(kind: PlotKind, key: string): number {
  if (!STONE_KINDS.has(kind)) return 0;
  const span = 2 * TILT_MAX_DEG + 1;
  return (hashKey('tilt:' + key) % span) - TILT_MAX_DEG;
}

// graveyard-art Requirement 4.7: symbol id, `-flat` in the Simplified_Form.
export function symbolIdOf(kind: PlotKind, variant: string, flat: boolean): string {
  return `plot-${kind}-${variant}${flat ? '-flat' : ''}`;
}
