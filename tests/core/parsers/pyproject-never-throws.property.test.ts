import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CONSTANTS, parseManifest } from '../../../core';
import { arbGeneratedFragment, arbHostilePyprojectText, arbTableFragment } from '../../support/arbitraries/pyproject';
import { cfg } from '../../support/fc-config';

// Feature: pyproject, Property PY-P1: Parsing never throws

const SOURCE_KINDS = ['registry', 'git', 'path'];
const LINE_BREAKING = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const QUOTED = /"([^"]*)"/g;

function fail(what: string, value: unknown): never {
  throw new Error(`${what}: ${JSON.stringify(value)}`);
}

// Plain checks in the loops: a huge generated table has thousands of entries, and `expect` per entry is slow.
function checkResult(text: string): void {
  const result = parseManifest(text, 'pyproject.toml');
  expect(Array.isArray(result.dependencies)).toBe(true);
  expect(Array.isArray(result.warnings)).toBe(true);
  for (const d of result.dependencies) {
    if (d.ecosystem !== 'pypi') fail('ecosystem', d);
    if (typeof d.name !== 'string' || d.name.length < 1) fail('name', d);
    if (typeof d.rawName !== 'string' || d.rawName.length < 1) fail('rawName', d);
    if (typeof d.versionSpec !== 'string') fail('versionSpec', d);
    if (!CONSTANTS.SCOPE_ORDER.includes(d.scope)) fail('scope', d);
    if (!SOURCE_KINDS.includes(d.sourceKind)) fail('sourceKind', d);
    if (Object.getPrototypeOf(d) !== Object.prototype) fail('prototype', d);
  }
  for (const w of result.warnings) {
    if (typeof w !== 'string') fail('warning type', w);
    if (LINE_BREAKING.test(w)) fail('warning is not one line', w);
    if (LONE_SURROGATE.test(w)) fail('warning has a lone surrogate', w);
    // Quoted fragments hold at most 60 code points.
    for (const m of w.matchAll(QUOTED)) if (Array.from(m[1]).length > 60) fail('quoted fragment too long', w);
  }
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(Object.getPrototypeOf(result.dependencies)).toBe(Array.prototype);
  expect(Object.getPrototypeOf(result.warnings)).toBe(Array.prototype);
  expect((({}) as Record<string, unknown>).polluted).toBeUndefined();
  expect((({}) as Record<string, unknown>).x).toBeUndefined();
}
describe('pyproject.toml parser properties: totality', () => {
  // Validates: Requirements 2.1, 2.2, 2.4, 2.6, 2.7
  it('PY-P1: arbitrary strings with full unicode never throw and give a well formed result', () => {
    fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 300 }), checkResult), cfg());
    fc.assert(fc.property(fc.string({ unit: 'grapheme', maxLength: 300 }), checkResult), cfg());
  });

  // Validates: Requirements 2.1, 2.2, 2.4, 2.6, 2.7
  it('PY-P1: hostile TOML-shaped texts never throw and give a well formed result', () => {
    fc.assert(fc.property(arbHostilePyprojectText, checkResult), cfg());
  });

  // Validates: Requirements 2.1, 2.2, 2.4, 2.6, 2.7
  it('PY-P1: single table fragments, fixed and generated, never throw and give a well formed result', () => {
    fc.assert(fc.property(arbTableFragment, checkResult), cfg());
    fc.assert(fc.property(arbGeneratedFragment, checkResult), cfg());
  });
});
