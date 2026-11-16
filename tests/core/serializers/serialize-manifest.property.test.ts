import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseManifest, serializeManifest } from '../../../core';
import type { ManifestFormat, SerializableDependency } from '../../../core';
import { arbDependencyList, arbDuplicatedList, arbPermutationOf } from '../../support/arbitraries/dependencies';
import { arbAnyCargoText } from '../../support/arbitraries/cargo';
import { arbAnyPackageJsonText } from '../../support/arbitraries/package-json';
import { MIXED_CASE_NAMES, arbAnyRequirementsText } from '../../support/arbitraries/requirements';
import { cfg } from '../../support/fc-config';
import { dependencySet, oracleNormalize, project, projectionKey, restrict } from '../../support/oracles/manifest-model';

const FORMATS: readonly ManifestFormat[] = ['package.json', 'requirements.txt', 'Cargo.toml'];

const FIXTURE_FILES: Readonly<Record<ManifestFormat, string>> = {
  'package.json': 'sample-package.json',
  'requirements.txt': 'sample-requirements.txt',
  'Cargo.toml': 'sample-Cargo.toml',
};

function fixtureText(format: ManifestFormat): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/${FIXTURE_FILES[format]}`, import.meta.url)), 'utf8');
}

/** The fixture as a serializer input list (parsed by the production parser, rawName kept). */
function fixtureList(format: ManifestFormat): SerializableDependency[] {
  return [...parseManifest(fixtureText(format), format).dependencies];
}

/** Sorted projection keys, compared as arrays so a count mismatch is visible in the diff. */
const keys = (deps: readonly SerializableDependency[]): string[] => deps.map(projectionKey).sort();

/** Serialize, parse, and compare with restrict(); the property body of Property 9. */
function checkRoundTrip(list: readonly SerializableDependency[], format: ManifestFormat): void {
  const serialized = serializeManifest(list, format);
  expect(serialized.ok).toBe(true);
  if (!serialized.ok) return;
  const parsed = parseManifest(serialized.value, format);
  expect(parsed.warnings).toEqual([]);
  const expected = restrict(list, format).map(project);
  const actual = parsed.dependencies.map(project);
  expect(keys(actual)).toEqual(keys(expected));
}

describe('serializeManifest round trip', () => {
  // Feature: dependency-graveyard-core, Property 9: Serialize then parse round trip
  // **Validates: Requirements 5.8, 5.3**
  it('Property 9: parse(serialize(list, format)) equals restrict(list, format) without warnings', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FORMATS).chain((format) => arbDependencyList(format).map((list) => [format, list] as const)),
        ([format, list]) => {
          checkRoundTrip(list, format);
        },
      ),
      cfg({ examples: FORMATS.map((format) => [[format, fixtureList(format)]] as [readonly [ManifestFormat, SerializableDependency[]]]) }),
    );
  });
});

describe('real-world fixtures', () => {
  for (const format of FORMATS) {
    it(`${format} sample parses cleanly, and its dependencies survive serialize then parse`, () => {
      const first = parseManifest(fixtureText(format), format);
      expect(first.dependencies.length).toBeGreaterThan(0);
      checkRoundTrip(fixtureList(format), format);
      // everything the parser produced is Representable, so nothing is omitted
      const again = parseManifest((serializeManifest(first.dependencies, format) as { value: string }).value, format);
      expect(keys(again.dependencies)).toEqual(keys(first.dependencies));
    });
  }

  it('requirements.txt sample keeps Django, PyYAML and SQLAlchemy and writes the spellings of the input', () => {
    const list = fixtureList('requirements.txt');
    const names = list.map((d) => d.rawName);
    expect(names).toEqual(expect.arrayContaining(['Django', 'PyYAML', 'SQLAlchemy']));
    const out = serializeManifest(list, 'requirements.txt');
    expect(out.ok && out.value).toContain('Django >=4.2,<5');
  });

  it('Cargo.toml sample keeps git and path dependencies with their source kinds', () => {
    const list = fixtureList('Cargo.toml');
    expect(list.find((d) => d.name === 'fork-crate')?.sourceKind).toBe('git');
    expect(list.find((d) => d.name === 'shared')?.sourceKind).toBe('path');
  });
});

// ---------------------------------------------------------------------------
// Property 10
// ---------------------------------------------------------------------------

/** Mixed-case and non-normalized pypi names with git and path references, some containing a backslash (skipped by 2.13). */
const arbBackslashRequirements: fc.Arbitrary<string> = fc
  .array(
    fc.tuple(
      fc.constantFrom(...MIXED_CASE_NAMES),
      fc.constantFrom(
        ' @ git+https://h/a\\b',
        ' @ git+https://h/a.git',
        ' @ .\\local\\pkg',
        ' @ ./local/pkg',
        ' @ C:\\work\\pkg',
        '==1.0',
        ' >=2,<3',
        '',
      ),
    ),
    { maxLength: 8 },
  )
  .map((items) => items.map(([n, s]) => `${n}${s}`).join('\n'));

const arbInputText: Readonly<Record<ManifestFormat, fc.Arbitrary<string>>> = {
  'package.json': arbAnyPackageJsonText,
  'requirements.txt': fc.oneof({ weight: 4, arbitrary: arbAnyRequirementsText }, { weight: 1, arbitrary: arbBackslashRequirements }),
  'Cargo.toml': arbAnyCargoText,
};

describe('parse, serialize, parse', () => {
  // Feature: dependency-graveyard-core, Property 10: Parse, serialize, parse is stable
  // **Validates: Requirements 5.9**
  it('Property 10: parse(serialize(parse(x).dependencies)) has the same projection as parse(x)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FORMATS).chain((format) => arbInputText[format].map((text) => [format, text] as const)),
        ([format, text]) => {
          const p1 = parseManifest(text, format);
          const s = serializeManifest(p1.dependencies, format);
          expect(s.ok).toBe(true);
          if (!s.ok) return;
          const p2 = parseManifest(s.value, format);
          expect([...dependencySet(p2.dependencies)].sort()).toEqual([...dependencySet(p1.dependencies)].sort());
        },
      ),
      cfg({ examples: FORMATS.map((format) => [[format, fixtureText(format)]] as [readonly [ManifestFormat, string]]) }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11
// ---------------------------------------------------------------------------

describe('serialization idempotence', () => {
  // Feature: dependency-graveyard-core, Property 11: Serialization is idempotent
  // **Validates: Requirements 5.10**
  it('Property 11: serialize(parse(serialize(list)).dependencies) is byte-identical to serialize(list)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FORMATS).chain((format) => arbDependencyList(format).map((list) => [format, list] as const)),
        ([format, list]) => {
          const first = serializeManifest(list, format);
          expect(first.ok).toBe(true);
          if (!first.ok) return;
          const second = serializeManifest(parseManifest(first.value, format).dependencies, format);
          expect(second.ok).toBe(true);
          if (!second.ok) return;
          expect(second.value).toBe(first.value);
        },
      ),
      cfg({ examples: FORMATS.map((format) => [[format, fixtureList(format)]] as [readonly [ManifestFormat, SerializableDependency[]]]) }),
    );
  });
});

// ---------------------------------------------------------------------------
// Properties 12 and 7
// ---------------------------------------------------------------------------

/** SCOPE_ORDER written out, so the expectation does not come from production code. */
const SCOPE_ORDER_EXPECTED = ['runtime', 'dev', 'build', 'optional', 'peer'] as const;
const PACKAGE_JSON_SECTIONS: Readonly<Record<string, number>> = { dependencies: 0, devDependencies: 1, optionalDependencies: 3, peerDependencies: 4 };
const CARGO_TABLES: Readonly<Record<string, number>> = { '[dependencies]': 0, '[dev-dependencies]': 1, '[build-dependencies]': 2 };

const arbListAndPermutation = fc
  .constantFrom(...FORMATS)
  .chain((format) =>
    arbDuplicatedList(format).chain((list) => arbPermutationOf(list).map((perm) => [format, list, perm] as const)),
  );

function mustSerialize(list: readonly SerializableDependency[], format: ManifestFormat): string {
  const r = serializeManifest(list, format);
  expect(r.ok).toBe(true);
  return r.ok ? r.value : '';
}

/** Table or section headers of the text, in text order (entries never start a line at these positions). */
function headerLines(text: string, format: ManifestFormat): string[] {
  if (format === 'package.json') return [...text.matchAll(/^ {2}"([^"\\]*)": \{$/gm)].map((m) => m[1]);
  if (format === 'Cargo.toml') return text.split('\n').filter((l) => l.startsWith('['));
  return [];
}

describe('serializer determinism', () => {
  // Feature: dependency-graveyard-core, Property 12: Serializer determinism and Dependency_Order output
  // **Validates: Requirements 5.12, 5.6, 5.4, 5.5, 5.2, 4.6**
  it('Property 12: permutations give byte-identical text, restricted and deduplicated in Dependency_Order', () => {
    fc.assert(
      fc.property(arbListAndPermutation, ([format, list, perm]) => {
        const text = mustSerialize(list, format);
        expect(mustSerialize(list, format)).toBe(text);
        expect(mustSerialize(perm, format)).toBe(text);

        const expected = restrict(list, format);
        const parsed = parseManifest(text, format);
        expect(parsed.warnings).toEqual([]);
        expect(parsed.dependencies.map(projectionKey)).toEqual(expected.map(projectionKey));

        if (format === 'requirements.txt') {
          // tie between spellings: the kept entry's spelling is the one written
          const written = expected.map((d) => (d.rawName !== undefined && oracleNormalize(d.rawName) === d.name ? d.rawName : d.name));
          expect(parsed.dependencies.map((d) => d.rawName ?? d.name)).toEqual(written);
          if (text !== '') {
            expect(text.endsWith('\n')).toBe(true);
            const lines = text.slice(0, -1).split('\n');
            expect(lines.every((l) => l.length > 0 && !l.includes('\r'))).toBe(true);
            expect(lines.length).toBe(expected.length);
          } else {
            expect(expected).toEqual([]);
          }
        } else {
          const ranks = format === 'package.json' ? PACKAGE_JSON_SECTIONS : CARGO_TABLES;
          const headers = headerLines(text, format);
          const wanted = SCOPE_ORDER_EXPECTED.filter((s) => expected.some((d) => d.scope === s));
          expect(headers.map((h) => ranks[h])).toEqual(wanted.map((s) => SCOPE_ORDER_EXPECTED.indexOf(s)));
          expect(new Set(headers).size).toBe(headers.length);
        }
      }),
      cfg({
        examples: FORMATS.map((format) => {
          const l = fixtureList(format);
          return [[format, l, [...l].reverse()]] as [readonly [ManifestFormat, SerializableDependency[], SerializableDependency[]]];
        }),
      }),
    );
  });
});

describe('dependency identity in the serializer', () => {
  // Feature: dependency-graveyard-core, Property 7: Dependency identity is name and scope (serializer side)
  // **Validates: Requirements 5.2, 5.4, 5.5, 4.6**
  it('Property 7: one entry per (name, scope), the first after filter and sort is kept, scopes stay separate', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FORMATS).chain((format) => arbDuplicatedList(format).map((list) => [format, list] as const)),
        ([format, list]) => {
          const parsed = parseManifest(mustSerialize(list, format), format).dependencies;
          const idents = parsed.map((d) => JSON.stringify([d.name, d.scope]));
          expect(new Set(idents).size).toBe(idents.length);

          const expected = restrict(list, format);
          const keptByKey = new Map(expected.map((d) => [JSON.stringify([d.name, d.scope]), d]));
          expect([...idents].sort()).toEqual([...keptByKey.keys()].sort());
          for (const d of parsed) {
            const kept = keptByKey.get(JSON.stringify([d.name, d.scope]));
            expect(kept && projectionKey(d)).toBe(kept && projectionKey(kept));
          }
        },
      ),
      cfg(),
    );
  });
});
