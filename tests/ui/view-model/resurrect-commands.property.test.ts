// Feature: resurrect, Property RS-P4: Commands contain only Fixed_Words and Validated_Names, and the copy text equals the lines
// Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.9, 10.10, 11.7
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Ecosystem, ManifestFormat, Scope } from '../../../core';
import { buildCommandBlocks } from '../../../view-model/resurrect-commands';
import { isCommandSafe } from '../../../view-model/resurrect-names';
import type { ManifestOrigin } from '../../../view-model/types';
import { cfg } from '../../support/fc-config';

// Independent allow-list of Fixed_Words, written here and not imported.
const FIXED_WORDS: ReadonlySet<string> = new Set([
  'npm', 'uninstall', 'install', '--save-dev', '--save-optional', '--save-peer',
  'pip', 'poetry', 'remove', 'add', 'cargo', '--dev', '--build', '--optional',
]);
const VERBS: ReadonlySet<string> = new Set(['npm', 'pip', 'poetry', 'cargo']);

const ecoOf = (f: ManifestFormat): Ecosystem => (f === 'package.json' ? 'npm' : f === 'Cargo.toml' ? 'cargo' : 'pypi');
const ALLOWED_CHARS = /^[A-Za-z0-9._\-@/ ]*$/;

const FORMATS: readonly ManifestFormat[] = ['package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml'];
const SCOPES: readonly Scope[] = ['runtime', 'dev', 'build', 'optional', 'peer'];

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
const word = fc.array(fc.constantFrom(...ALNUM), { minLength: 1, maxLength: 6 }).map((c) => c.join(''));
const validName = fc.oneof(
  word,
  fc.tuple(word, word).map(([a, b]) => `${a}-${b}`),
  fc.tuple(word, word).map(([a, b]) => `${a}_${b}`),
  fc.tuple(word, word).map(([a, b]) => `@${a}/${b}`),
  fc.tuple(word, word).map(([a, b]) => `${a}.${b}`),
  fc.tuple(fc.constantFrom('A', 'B', 'Z'), word).map(([a, b]) => a + b),
  fc.constantFrom('add', 'install', 'npm', 'pip', 'remove', 'cargo'),
);
const HOSTILE_PARTS = [' ', '"', "'", ';', '$', '`', '~', '-', '|', '&', '>', '<', '(', ')', '\\', '\n', '\t', '*', '!', '#', 'é', '日', '\u202e', '\u00a0'];
const hostileName = fc
  .tuple(fc.array(fc.constantFrom(...HOSTILE_PARTS), { minLength: 1, maxLength: 3 }), word, fc.array(fc.constantFrom(...HOSTILE_PARTS), { maxLength: 2 }))
  .map(([a, w, b]) => a.join('') + w + b.join(''));
const fixedHostile = fc.constantFrom('-rf', 'a;b', '~x', '$(x)', '', ' ', '--save-dev', 'a b', '`x`', "a'b", 'ünï', '-');
const anyName = fc.oneof({ weight: 4, arbitrary: validName }, { weight: 2, arbitrary: hostileName }, { weight: 1, arbitrary: fixedHostile });

const pathArb = fc.oneof(
  fc.tuple(word, fc.constantFrom('package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml')).map(([d, f]) => `${d}/${f}`),
  fc.constantFrom('package.json', 'a b/pyproject.toml', 'x;y/Cargo.toml'),
);
const originArb: fc.Arbitrary<ManifestOrigin> = fc.record({
  path: pathArb,
  format: fc.constantFrom(...FORMATS),
  pyprojectTool: fc.constantFrom('poetry', 'pep621', 'mixed', null),
});
const originsArb = fc.array(originArb, { maxLength: 4 });
const scopesArb = fc.array(fc.constantFrom(...SCOPES), { maxLength: 5 });

describe('RS-P4 resurrect-commands property', () => {
  it('RS-P4: every token is a Fixed_Word or a validated name, copyText equals the lines, hostile names give no block', () => {
    fc.assert(
      fc.property(originsArb, scopesArb, anyName, anyName, (origins, scopes, from, to) => {
        const blocks = buildCommandBlocks({ origins, scopes, from, to });
        const safeEcos = new Set(
          origins.map((o) => ecoOf(o.format)).filter((e) => isCommandSafe(e, from) && isCommandSafe(e, to)),
        );
        if (safeEcos.size === 0) {
          expect(blocks).toEqual([]);
          return;
        }
        // Every block must come from an origin whose ecosystem accepts both names.
        const origEcos = new Set(origins.map((o) => ecoOf(o.format)));
        expect(blocks.length).toBeGreaterThanOrEqual(origEcos.size > 0 ? 1 : 0);
        for (const block of blocks) {
          expect(block.copyText).toBe(block.lines.join('\n'));
          expect(block.lines.length).toBeGreaterThan(0);
          for (const line of block.lines) {
            expect(ALLOWED_CHARS.test(line)).toBe(true);
            expect(line).not.toMatch(/\s{2,}|^\s|\s$/);
            expect(line.includes('\n')).toBe(false);
            const tokens = line.split(' ');
            expect(VERBS.has(tokens[0]!)).toBe(true);
            for (const t of tokens) {
              expect(t.length).toBeGreaterThan(0);
              expect(FIXED_WORDS.has(t) || t === from || t === to).toBe(true);
              if (t === from || t === to) {
                // A name token is only allowed when a safe ecosystem accepts it.
                expect([...safeEcos].some((e) => isCommandSafe(e, t))).toBe(true);
              }
            }
          }
        }
      }),
      cfg(),
    );
  });

  it('RS-P4: a name that is not command-safe for any origin ecosystem yields no block', () => {
    fc.assert(
      fc.property(originsArb, scopesArb, validName, hostileName, fc.boolean(), (origins, scopes, ok, bad, badIsFrom) => {
        const input = badIsFrom ? { origins, scopes, from: bad, to: ok } : { origins, scopes, from: ok, to: bad };
        const hostileEverywhere = (['npm', 'pypi', 'cargo'] as const).every((e) => !isCommandSafe(e, bad));
        fc.pre(hostileEverywhere);
        expect(buildCommandBlocks(input)).toEqual([]);
      }),
      cfg(),
    );
  });
});
