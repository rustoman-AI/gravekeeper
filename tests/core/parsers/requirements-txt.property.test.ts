import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import { normalizePypiName } from '../../../core/formats/requirements-lexical';
import {
  FOO_BAR_SPELLINGS,
  PROTO_NAMES,
  arbAnyRequirementsText,
  arbDuplicateModel,
  arbEol,
  arbInertChunk,
  arbNormalizeInput,
  arbPypiNameToken,
  arbRenderedModel,
  arbRequirementsFile,
  arbRequirementsModel,
  arbSpecLine,
  type DuplicateModel,
} from '../../support/arbitraries/requirements';
import { cfg } from '../../support/fc-config';
import {
  firstOccurrence,
  isSortedByNameAndScope,
  oracleNormalize,
  sortInDependencyOrder,
  type ManifestModel,
} from '../../support/oracles/manifest-model';
import { CONSTANTS } from '../../../core';

const SOURCE_KINDS = ['registry', 'git', 'path'];

describe('requirements.txt parser properties', () => {
  // Feature: dependency-graveyard-core, Property 44: PEP 503 normalization is idempotent and consistent with parsed names
  // Validates: Requirements 2.14
  it('Property 44: normalize is idempotent and equals the independent oracle', () => {
    fc.assert(
      fc.property(arbNormalizeInput, (s) => {
        const once = normalizePypiName(s);
        expect(normalizePypiName(once)).toBe(once);
        expect(once).toBe(oracleNormalize(s));
        expect(oracleNormalize(oracleNormalize(s))).toBe(oracleNormalize(s));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 44: PEP 503 normalization is idempotent and consistent with parsed names
  // Validates: Requirements 2.14
  it('Property 44: every parsed pypi Dependency has normalize(rawName) === name', () => {
    fc.assert(
      fc.property(arbRequirementsFile, ({ text, writtenNames }) => {
        const { dependencies } = parseManifest(text, 'requirements.txt');
        // Not vacuous: one Dependency per distinct normalized name, each rawName spelled as in the file.
        expect(dependencies.length).toBe(new Set(writtenNames.map(oracleNormalize)).size);
        for (const d of dependencies) {
          expect(d.ecosystem).toBe('pypi');
          expect(normalizePypiName(d.rawName)).toBe(d.name);
          expect(oracleNormalize(d.rawName)).toBe(d.name);
          expect(writtenNames).toContain(d.rawName);
        }
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 44: PEP 503 normalization is idempotent and consistent with parsed names
  // Validates: Requirements 2.14
  it('Property 44: parsed pypi Dependencies from arbitrary text satisfy normalize(rawName) === name', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (text) => {
        for (const d of parseManifest(text, 'requirements.txt').dependencies) {
          expect(normalizePypiName(d.rawName)).toBe(d.name);
        }
      }),
      cfg(),
    );
  });
});

describe('requirements.txt shape and ordering properties', () => {
  // Feature: dependency-graveyard-core, Property 3: Parsed dependencies are well formed
  // Validates: Requirements 4.5, 2.2
  it('Property 3: every parsed dependency is well formed for valid, mutated and noisy text', () => {
    fc.assert(
      fc.property(arbAnyRequirementsText, (text) => {
        const { dependencies } = parseManifest(text, 'requirements.txt');
        for (const d of dependencies) {
          expect(d.name.length).toBeGreaterThanOrEqual(1);
          expect(d.rawName.length).toBeGreaterThanOrEqual(1);
          expect(d.ecosystem).toBe('pypi');
          expect(CONSTANTS.SCOPE_ORDER).toContain(d.scope);
          expect(SOURCE_KINDS).toContain(d.sourceKind);
          expect(typeof d.versionSpec).toBe('string');
          expect(d.name).toBe(normalizePypiName(d.rawName));
        }
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 6: Parser output is sorted in Dependency_Order
  // Validates: Requirements 4.8, 2.2
  it('Property 6: output is sorted by code point name then scope for valid, mutated and noisy text', () => {
    fc.assert(
      fc.property(arbAnyRequirementsText, (text) => {
        const { dependencies } = parseManifest(text, 'requirements.txt');
        expect(isSortedByNameAndScope(dependencies)).toBe(true);
        expect(dependencies).toEqual(sortInDependencyOrder(dependencies));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 6: Parser output is sorted in Dependency_Order (permutations)
  // Validates: Requirements 4.8, 2.2
  it('Property 6: permuting the lines of a manifest without duplicate keys gives the same dependencies', () => {
    fc.assert(
      fc.property(
        arbRequirementsModel.chain((model) =>
          arbRenderedModel(model).chain((chunks) =>
            fc.tuple(
              fc.shuffledSubarray(chunks, { minLength: chunks.length, maxLength: chunks.length }),
              fc.shuffledSubarray(chunks, { minLength: chunks.length, maxLength: chunks.length }),
              fc.constant(model),
            ),
          ),
        ),
        ([first, second, model]) => {
          const a = parseManifest(first.join(model.eol), 'requirements.txt').dependencies;
          const b = parseManifest(second.join(model.eol), 'requirements.txt').dependencies;
          expect(b).toEqual(a);
          // Not vacuous: one Dependency per model name, in Dependency_Order, spelled as written.
          expect(a.map((d) => d.rawName).sort()).toEqual(model.entries.map((e) => e.name).sort());
          expect(a.map((d) => d.name)).toEqual(
            sortInDependencyOrder(model.entries.map((e) => ({ name: oracleNormalize(e.name), scope: 'runtime' as const, ecosystem: 'pypi' as const, versionSpec: '', sourceKind: 'registry' as const }))).map((d) => d.name),
          );
        },
      ),
      cfg(),
    );
  });
});

describe('requirements.txt duplicates, identity and prototype safety properties', () => {
  const toModel = (m: DuplicateModel): ManifestModel => ({
    format: 'requirements.txt',
    entries: m.entries.map((e) => ({ name: e.name, scope: 'runtime' as const, versionSpec: e.versionSpec, sourceKind: e.sourceKind })),
  });

  /** Expected duplicate warnings in line order: one per entry whose normalized name occurred earlier. */
  const expectedDiscards = (m: DuplicateModel): { line: number; name: string }[] => {
    const seen = new Set<string>();
    const out: { line: number; name: string }[] = [];
    m.entries.forEach((e, i) => {
      const key = oracleNormalize(e.name);
      if (seen.has(key)) out.push({ line: m.lines[i] as number, name: key });
      seen.add(key);
    });
    return out;
  };

  // Feature: dependency-graveyard-core, Property 4: One Dependency per key, first occurrence wins, one warning per discard
  // Validates: Requirements 4.6, 2.2
  it('Property 4: first line wins with its rawName, and each discard gets one warning naming package and scope', () => {
    fc.assert(
      fc.property(arbDuplicateModel(), (m) => {
        const model = toModel(m);
        const expected = firstOccurrence(model);
        const result = parseManifest(m.text, 'requirements.txt');
        expect(result.dependencies).toEqual(expected.dependencies);
        const keys = result.dependencies.map((d) => `${d.name}\u0000${d.scope}`);
        expect(new Set(keys).size).toBe(keys.length);
        const discards = expectedDiscards(m);
        expect(discards.length).toBe(expected.discarded);
        // All lines in the model are valid, so the only warnings are the duplicate warnings, in line order.
        expect(result.warnings).toHaveLength(discards.length);
        discards.forEach((d, i) => {
          const w = result.warnings[i] as string;
          expect(w.startsWith(`requirements.txt line ${d.line}: `)).toBe(true);
          expect(w).toContain(`duplicate dependency "${d.name}" in scope "runtime"`);
        });
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 4: One Dependency per key, first occurrence wins, one warning per discard (Foo_Bar spellings)
  // Validates: Requirements 4.6, 2.2
  it('Property 4: Foo_Bar, foo-bar, FOO.BAR and foo__bar collapse to the first spelling in the text', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...FOO_BAR_SPELLINGS), { minLength: 2, maxLength: 8 }),
        fc.array(arbInertChunk, { maxLength: 4 }),
        arbEol,
        (spellings, inert, eol) => {
          const text = spellings.flatMap((s, i) => [s + (i % 2 === 0 ? '==1.' : '>=2.') + i, ...inert]).join(eol);
          const { dependencies, warnings } = parseManifest(text, 'requirements.txt');
          expect(dependencies).toHaveLength(1);
          expect(dependencies[0]?.rawName).toBe(spellings[0]);
          expect(dependencies[0]?.name).toBe('foo-bar');
          expect(dependencies[0]?.versionSpec).toBe('==1.0');
          expect(warnings).toHaveLength(spellings.length - 1);
          for (const w of warnings) expect(w).toContain('duplicate dependency "foo-bar" in scope "runtime"');
        },
      ),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 7: Dependency identity is name and scope (extra), parser side
  // Validates: Requirements 4.6, 2.2
  it('Property 7: a name declared once yields exactly one runtime Dependency with the declared fields and no warning', () => {
    fc.assert(
      fc.property(
        arbPypiNameToken.chain((name) => arbSpecLine(name).map((s) => ({ name, s }))),
        ({ name, s }) => {
          const { dependencies, warnings } = parseManifest(s.line, 'requirements.txt');
          expect(warnings).toEqual([]);
          expect(dependencies).toEqual([
            { name: oracleNormalize(name), rawName: name, ecosystem: 'pypi', versionSpec: s.versionSpec, scope: 'runtime', sourceKind: s.sourceKind },
          ]);
        },
      ),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 7: Dependency identity is name and scope (extra), parser side
  // Validates: Requirements 4.6, 2.2
  it('Property 7: distinct names stay distinct entries and requirements.txt only has the runtime scope', () => {
    fc.assert(
      fc.property(arbRequirementsModel.chain((model) => arbRenderedModel(model).map((chunks) => ({ model, chunks }))), ({ model, chunks }) => {
        const { dependencies, warnings } = parseManifest(chunks.join(model.eol), 'requirements.txt');
        expect(warnings).toEqual([]);
        expect(dependencies).toHaveLength(model.entries.length);
        expect(new Set(dependencies.map((d) => d.name))).toEqual(new Set(model.entries.map((e) => oracleNormalize(e.name))));
        for (const d of dependencies) expect(d.scope).toBe('runtime');
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 8: Prototype safety
  // Validates: Requirements 4.9
  it('Property 8: names that collide with Object.prototype members are ordinary Dependencies and nothing is polluted', () => {
    fc.assert(
      fc.property(arbDuplicateModel(PROTO_NAMES), (m) => {
        const before = Reflect.ownKeys(Object.prototype).map(String).sort();
        // `__proto__` is not a Name_Token (criterion 2.8), so these two lines are rejected, each with one warning.
        const text = `${m.text}${m.eol}__proto__==1.0${m.eol}__proto__ @ ./x`;
        const result = parseManifest(text, 'requirements.txt');
        const expected = firstOccurrence(toModel(m));
        expect(result.dependencies).toEqual(expected.dependencies);
        for (const n of PROTO_NAMES) {
          const d = result.dependencies.find((x) => x.name === oracleNormalize(n));
          expect(d).toBeDefined();
          expect(Object.getPrototypeOf(d)).toBe(Object.prototype);
        }
        expect(result.dependencies.some((d) => d.name === '__proto__')).toBe(false);
        expect(result.warnings.filter((w) => w.includes('cannot parse requirement "__proto__'))).toHaveLength(2);
        expect(result.warnings).toHaveLength(expected.discarded + 2);
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
        for (const d of result.dependencies) expect(Object.getPrototypeOf(d)).toBe(Object.prototype);
        expect(Reflect.ownKeys(Object.prototype).map(String).sort()).toEqual(before);
        expect((({}) as Record<string, unknown>).polluted).toBeUndefined();
      }),
      cfg(),
    );
  });
});
