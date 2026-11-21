// Feature: resurrect-upgrade, Property RU-P4: Strict versions are shell-safe and upgrade commands follow the fixed grammar
// Validates: Requirements 5.5, 6.3, 6.4, 6.5, 6.6, 6.8, 6.10, 6.11, 6.15
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isStrictVersion } from '../../../core';
import type { Ecosystem, ManifestFormat, Scope } from '../../../core';
import { buildUpgradeBlocks } from '../../../view-model/resurrect-commands';
import { isCommandSafe } from '../../../view-model/resurrect-names';
import type { ManifestOrigin } from '../../../view-model/types';
import { cfg } from '../../support/fc-config';

// Independent grammar, written here and not imported.
const FIXED_WORDS: ReadonlySet<string> = new Set([
  'npm', 'install', '--save-dev', '--save-optional', '--save-peer',
  'pip', 'poetry', 'add', 'cargo', '--dev', '--build', '--optional',
]);
const VERBS: ReadonlySet<string> = new Set(['npm', 'pip', 'poetry', 'cargo']);
const VERSION_ALPHABET = /^[A-Za-z0-9.-]+$/;

const ecoOf = (f: ManifestFormat): Ecosystem => (f === 'package.json' ? 'npm' : f === 'Cargo.toml' ? 'cargo' : 'pypi');
const ECOS: readonly Ecosystem[] = ['npm', 'pypi', 'cargo'];
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
  fc.constantFrom('add', 'install', 'npm', 'pip', 'cargo'),
);
const HOSTILE = [' ', '"', "'", ';', '$', '`', '!', '+', '\n', '\t', '|', '&', '>', '<', '(', ')', '\\', '*', '#', '=', '~', 'é', '日', '\u202e', '\u00a0'];
const hostileOf = fc
  .tuple(fc.array(fc.constantFrom(...HOSTILE), { minLength: 1, maxLength: 2 }), word, fc.array(fc.constantFrom(...HOSTILE), { maxLength: 2 }))
  .map(([a, w, b]) => a.join('') + w + b.join(''));
const anyName = fc.oneof({ weight: 4, arbitrary: validName }, { weight: 2, arbitrary: hostileOf }, { weight: 1, arbitrary: fc.constantFrom('', ' ', '-rf', 'a;b', '$(x)') });

const num = fc.oneof(fc.constant('0'), fc.integer({ min: 1, max: 999 }).map(String));
const strictish = fc
  .tuple(num, num, num, fc.option(fc.array(fc.constantFrom(...'abc019-'.split('')), { minLength: 1, maxLength: 4 }).map((c) => c.join('')), { nil: null }))
  .map(([a, b, c, pre]) => `${a}.${b}.${c}${pre === null ? '' : '-' + pre}`);
const anyVersion = fc.oneof(
  { weight: 4, arbitrary: strictish },
  { weight: 2, arbitrary: fc.tuple(strictish, hostileOf).map(([v, h]) => v + h) },
  { weight: 1, arbitrary: fc.string({ maxLength: 12 }) },
  { weight: 1, arbitrary: fc.constantFrom('1.2', '1.2.3+b', '', ' 1.0.0', '1.0.0\n', '1.0.0 && x', '1!2.0', '1.0.0"') },
);

const originArb: fc.Arbitrary<ManifestOrigin> = fc.record({
  path: fc.oneof(
    fc.tuple(word, fc.constantFrom('package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml')).map(([d, f]) => `${d}/${f}`),
    fc.constantFrom('package.json', 'a b/pyproject.toml', 'x;y/Cargo.toml'),
  ),
  format: fc.constantFrom(...FORMATS),
  pyprojectTool: fc.constantFrom('poetry', 'pep621', 'mixed', null),
});
const originsArb = fc.array(originArb, { maxLength: 4 });
const scopesArb = fc.array(fc.constantFrom(...SCOPES), { maxLength: 5 });

describe('RU-P4 upgrade commands property', () => {
  it('RU-P4: isStrictVersion accepts only letters, digits, dot and hyphen', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ECOS), fc.oneof(anyVersion, fc.string({ maxLength: 20 }), fc.anything()), (eco, v) => {
        if (isStrictVersion(eco, v)) {
          expect(typeof v).toBe('string');
          expect(VERSION_ALPHABET.test(v as string)).toBe(true);
        }
      }),
      cfg(),
    );
  });

  it('RU-P4: every line follows the fixed token grammar, copyText equals the lines, unsafe input gives no block', () => {
    fc.assert(
      fc.property(originsArb, scopesArb, anyName, anyVersion, (origins, scopes, name, version) => {
        const blocks = buildUpgradeBlocks({ origins, scopes, name, version });
        const okEcos = new Set(
          ECOS.filter((e) => isCommandSafe(e, name) && isStrictVersion(e, version)),
        );
        const anyOk = origins.some((o) => okEcos.has(ecoOf(o.format)));
        if (!anyOk) {
          expect(blocks).toEqual([]);
          return;
        }
        expect(blocks.length).toBeGreaterThan(0);
        const allowed = new Set([
          `${name}@${version}`,
          `"${name}==${version}"`,
          `"${name}>=${version}"`,
        ]);
        for (const block of blocks) {
          expect(block.copyText).toBe(block.lines.join('\n'));
          expect(block.lines.length).toBeGreaterThan(0);
          for (const line of block.lines) {
            expect(line.includes('\n')).toBe(false);
            expect(line).not.toMatch(/\s{2,}|^\s|\s$/);
            const tokens = line.split(' ');
            expect(VERBS.has(tokens[0]!)).toBe(true);
            for (const t of tokens) {
              expect(t.length).toBeGreaterThan(0);
              expect(FIXED_WORDS.has(t) || allowed.has(t)).toBe(true);
            }
            // The name and version never appear outside the allowed tokens.
            const [, second, ...rest] = tokens;
            expect(['install', 'add']).toContain(second);
            expect(rest.length).toBeGreaterThan(0);
            expect(allowed.has(rest[rest.length - 1]!)).toBe(true);
          }
        }
      }),
      cfg(),
    );
  });
});
