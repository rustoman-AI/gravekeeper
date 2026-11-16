import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CONSTANTS, parseManifest } from '../../../core';
import {
  arbAnyPackageJsonText,
  arbLayout,
  arbNameInScopes,
  arbPackageJsonModel,
  arbPrototypeModel,
  arbRepeatedKeyOccurrences,
  defaultLayout,
  renderOccurrences,
  renderPackageJson,
  type PackageJsonOccurrence,
  type PackageJsonSection,
} from '../../support/arbitraries/package-json';
import { cfg } from '../../support/fc-config';
import {
  firstOccurrence,
  isSortedByNameAndScope,
  oracleNpmSourceKind,
  sortInDependencyOrder,
} from '../../support/oracles/manifest-model';

const SOURCE_KINDS = ['registry', 'git', 'path'];

const SCOPE_OF: Record<PackageJsonSection, 'runtime' | 'dev' | 'optional' | 'peer'> = {
  dependencies: 'runtime',
  devDependencies: 'dev',
  optionalDependencies: 'optional',
  peerDependencies: 'peer',
};

describe('package.json parser properties', () => {
  // Feature: dependency-graveyard-core, Property 3: Parsed dependencies are well formed
  // Validates: Requirements 4.5, 1.12
  it('Property 3: every parsed dependency is well formed and rawName equals name', () => {
    fc.assert(
      fc.property(arbAnyPackageJsonText, (text) => {
        const result = parseManifest(text, 'package.json');
        for (const d of result.dependencies) {
          expect(d.name.length).toBeGreaterThanOrEqual(1);
          expect(d.rawName).toBe(d.name);
          expect(d.ecosystem).toBe('npm');
          expect(CONSTANTS.SCOPE_ORDER).toContain(d.scope);
          expect(SOURCE_KINDS).toContain(d.sourceKind);
          expect(typeof d.versionSpec).toBe('string');
        }
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 6: Parser output is sorted in Dependency_Order
  // Validates: Requirements 4.8
  it('Property 6: output is sorted by code point name then scope for valid, mutated and noisy text', () => {
    fc.assert(
      fc.property(arbAnyPackageJsonText, (text) => {
        const { dependencies } = parseManifest(text, 'package.json');
        expect(isSortedByNameAndScope(dependencies)).toBe(true);
        expect(dependencies).toEqual(sortInDependencyOrder(dependencies));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 6: Parser output is sorted in Dependency_Order (permutations)
  // Validates: Requirements 4.8, 1.12
  it('Property 6: permuting sections and keys of a manifest gives the same dependencies in the same order', () => {
    fc.assert(
      fc.property(
        arbPackageJsonModel.chain((m) => fc.tuple(fc.constant(m), arbLayout(m), arbLayout(m))),
        ([model, l1, l2]) => {
          const base = parseManifest(renderPackageJson(defaultLayout(model)), 'package.json');
          const a = parseManifest(renderPackageJson(l1), 'package.json');
          const b = parseManifest(renderPackageJson(l2), 'package.json');
          expect(a.warnings).toEqual([]);
          expect(a.dependencies).toEqual(base.dependencies);
          expect(b.dependencies).toEqual(base.dependencies);
          expect(isSortedByNameAndScope(base.dependencies)).toBe(true);
          const total = Object.values(model).reduce((n, list) => n + list.length, 0);
          expect(base.dependencies).toHaveLength(total);
        },
      ),
      cfg(),
    );
  });
});

describe('package.json parser properties: duplicates, identity, prototype safety', () => {
  // Feature: dependency-graveyard-core, Property 4: One Dependency per key, first occurrence wins, one warning per discard (no two share a key)
  // Validates: Requirements 4.6, 1.11
  it('Property 4: no two dependencies share (name, scope) for any text', () => {
    fc.assert(
      fc.property(arbAnyPackageJsonText, (text) => {
        const { dependencies } = parseManifest(text, 'package.json');
        const keys = dependencies.map((d) => JSON.stringify([d.name, d.scope]));
        expect(new Set(keys).size).toBe(keys.length);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 4: One Dependency per key, first occurrence wins, one warning per discard (repeated key inside one section)
  // Validates: Requirements 4.6, 1.11
  it('Property 4: a key repeated inside one section keeps the last value and adds no warning', () => {
    fc.assert(
      fc.property(arbRepeatedKeyOccurrences, (occurrences) => {
        const result = parseManifest(renderOccurrences(occurrences), 'package.json');
        const expected = firstOccurrence({
          format: 'package.json',
          entries: occurrences.map((o: PackageJsonOccurrence) => ({
            name: o.name,
            scope: SCOPE_OF[o.section],
            versionSpec: o.spec,
            sourceKind: oracleNpmSourceKind(o.spec),
          })),
        });
        expect(result.warnings).toEqual([]);
        expect(result.dependencies).toEqual(expected.dependencies);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 7: Dependency identity is name and scope (parser side)
  // Validates: Requirements 1.8, 4.6
  it('Property 7: a name declared once in each scope of a non-empty set gives one dependency per scope, no warning', () => {
    fc.assert(
      fc.property(arbNameInScopes, ({ name, entries }) => {
        const result = parseManifest(renderOccurrences(entries), 'package.json');
        expect(result.warnings).toEqual([]);
        expect(result.dependencies).toHaveLength(entries.length);
        for (const e of entries) {
          const found = result.dependencies.filter((d) => d.name === name && d.scope === SCOPE_OF[e.section]);
          expect(found).toHaveLength(1);
          expect(found[0].versionSpec).toBe(e.spec);
          expect(found[0].sourceKind).toBe(oracleNpmSourceKind(e.spec));
        }
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 8: Prototype safety
  // Validates: Requirements 4.9
  it('Property 8: prototype names are ordinary dependencies and Object.prototype is untouched', () => {
    fc.assert(
      fc.property(arbPrototypeModel, (model) => {
        const before = Reflect.ownKeys(Object.prototype).map(String).sort();
        const occurrences: PackageJsonOccurrence[] = (Object.keys(model) as PackageJsonSection[]).flatMap((section) =>
          model[section].map((e) => ({ section, name: e.name, spec: e.spec })),
        );
        const result = parseManifest(renderOccurrences(occurrences), 'package.json');
        for (const o of occurrences) {
          const found = result.dependencies.filter((d) => d.name === o.name && d.scope === SCOPE_OF[o.section]);
          expect(found).toHaveLength(1);
          expect(found[0].versionSpec).toBe(o.spec);
          expect(found[0].rawName).toBe(o.name);
        }
        expect(result.dependencies).toHaveLength(occurrences.length);
        expect(Reflect.ownKeys(Object.prototype).map(String).sort()).toEqual(before);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        for (const d of result.dependencies) expect(Object.getPrototypeOf(d)).toBe(Object.prototype);
      }),
      cfg(),
    );
  });
});
