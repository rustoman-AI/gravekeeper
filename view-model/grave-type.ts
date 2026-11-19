import type { Classification } from '../core';
import type { GraveType, PlotKind, StatusWord } from './types';

function hasBurialReason(c: Classification): boolean {
  return c.reasons.some((r) => r.ruleId === '8.1' || r.ruleId === '8.2');
}

// Requirements 7.15, 7.16: only DEAD has a grave type; 8.3 alone is forgotten.
export function graveTypeOf(c: Classification | null): GraveType | null {
  if (c === null || c.status !== 'DEAD') return null;
  return hasBurialReason(c) ? 'buried' : 'forgotten';
}

// Requirement 7.20: a HAUNTED classification with 8.1 or 8.2 is restless; 8.3 alone stays a ghost.
export function plotKindOf(c: Classification | null): PlotKind {
  if (c === null) return 'unmarked';
  if (c.status === 'ALIVE') return 'lantern';
  if (c.status === 'HAUNTED') return hasBurialReason(c) ? 'restless' : 'ghost';
  return graveTypeOf(c) === 'buried' ? 'tombstone' : 'overgrown';
}

const STATUS_WORDS: Readonly<Record<PlotKind, StatusWord>> = {
  tombstone: 'dead, buried',
  overgrown: 'dead, forgotten',
  ghost: 'haunted',
  restless: 'haunted, buried',
  lantern: 'alive',
  unmarked: 'not assessed',
};

// Requirement 7.6: one word per kind.
export function statusWordOf(kind: PlotKind): StatusWord {
  return STATUS_WORDS[kind];
}
