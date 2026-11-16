import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CONSTANTS, parseManifest } from '../../../core';
import {
  arbAnyCargoText,
  arbCargoDupModel,
  arbCargoLayout,
  arbCargoName,
  CARGO_PROTO_NAMES,
  cargoOutcome,
  type CargoDupEntry,
  type CargoEntry,
  type CargoScope,
  arbCargoTwoLayouts,
  arbCargoValid,
  expectedCargoDependencies,
  renderCargo,
} from '../../support/arbitraries/cargo';
import { cfg } from '../../support/fc-config';
import {
  firstOccurrence,
  isSortedByNameAndScope,
  sortInDependencyOrder,
  type ModelEntry,
} from '../../support/oracles/manifest-model';

const SOURCE_KINDS = ['registry', 'git', 'path'];

describe('Cargo.toml parser properties: shape and ordering', () => {
  // Feature: dependency-graveyard-core, Property 3: Parsed dependencies are well formed
  // Validates: Requirements 4.5, 3.17
  it('Property 3: every parsed dependency is well formed and rawName equals name (valid, mutated, trap and noise text)', () => {
    fc.assert(
      fc.property(arbAnyCargoText, (text) => {
        const result = parseManifest(text, 'Cargo.toml');
        for (const d of result.dependencies) {
          expect(d.name.length).toBeGreaterThanOrEqual(1);
          expect(d.rawName.length).toBeGreaterThanOrEqual(1);
          expect(d.rawName).toBe(d.name);
          expect(d.ecosystem).toBe('cargo');
          expect(CONSTANTS.SCOPE_ORDER).toContain(d.scope);
          expect(SOURCE_KINDS).toContain(d.sourceKind);
          expect(typeof d.versionSpec).toBe('string');
        }
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 3: Parsed dependencies are well formed (valid text yields the model)
  // Validates: Requirements 4.5, 3.17
  it('Property 3: valid text gives exactly the modelled dependencies, rawName equal to the package or key as written, no warnings', () => {
    fc.assert(
      fc.property(arbCargoValid, ({ text, expected }) => {
        const result = parseManifest(text, 'Cargo.toml');
        expect(result.warnings).toEqual([]);
        expect(result.dependencies).toEqual(expected);
        for (const d of result.dependencies) expect(d.rawName).toBe(d.name);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 6: Parser output is sorted in Dependency_Order
  // Validates: Requirements 4.8
  it('Property 6: output is sorted by code point name then scope for valid, mutated, trap and noise text', () => {
    fc.assert(
      fc.property(arbAnyCargoText, (text) => {
        const { dependencies } = parseManifest(text, 'Cargo.toml');
        expect(isSortedByNameAndScope(dependencies)).toBe(true);
        expect(dependencies).toEqual(sortInDependencyOrder(dependencies));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 6: Parser output is sorted in Dependency_Order (permutations)
  // Validates: Requirements 4.8, 3.17
  it('Property 6: permuting entries, tables, headers, line endings and BOM gives the same dependencies in the same order', () => {
    fc.assert(
      fc.property(arbCargoTwoLayouts, ({ entries, a, b }) => {
        const expected = expectedCargoDependencies(entries);
        const ra = parseManifest(renderCargo(a), 'Cargo.toml');
        const rb = parseManifest(renderCargo(b), 'Cargo.toml');
        expect(ra.warnings).toEqual([]);
        expect(rb.warnings).toEqual([]);
        expect(ra.dependencies).toEqual(expected);
        expect(rb.dependencies).toEqual(ra.dependencies);
        expect(isSortedByNameAndScope(ra.dependencies)).toBe(true);
      }),
      cfg(),
    );
  });
});

// ---------------------------------------------------------------------------
// Task 5.21: duplicates, identity and prototype safety (model-based)
// ---------------------------------------------------------------------------

const TABLE_NAME: Readonly<Record<CargoScope, string>> = {
  runtime: 'dependencies',
  dev: 'dev-dependencies',
  build: 'build-dependencies',
};

/** Table label of criterion 3.19, bounded to 80 code points as the duplicate warning is (criterion 4.6). */
function whereOf(table: string | null, scope: CargoScope): string {
  const label = table === null ? TABLE_NAME[scope] : `target.'${table}'.${TABLE_NAME[scope]}`;
  const points = Array.from(`Cargo.toml table [${label}]`);
  return points.length <= 80 ? points.join('') : `${points.slice(0, 79).join('')}\u2026`;
}

/** Model entries (text key-creation order) and the warnings expected for the discarded ones, computed from the model only. */
function expectFromModel(entries: readonly CargoDupEntry[]) {
  const model: ModelEntry[] = entries.map((e) => ({
    name: e.name,
    key: e.key,
    scope: e.scope,
    table: e.cfg,
    ...cargoOutcome(e.value),
  }));
  const expected = firstOccurrence({ format: 'Cargo.toml', entries: model });
  const warnings: string[] = [];
  entries.forEach((e, i) => {
    const m = model[i];
    // `versionSpec` is unique per entry in the generator, so it identifies the kept occurrence.
    const kept = expected.dependencies.some(
      (d) => d.name === m.name && d.scope === m.scope && d.versionSpec === m.versionSpec && d.sourceKind === m.sourceKind,
    );
    if (!kept) {
      warnings.push(
        `${whereOf(e.cfg, e.scope)}: duplicate dependency "${e.name}" in scope "${e.scope}"; the first occurrence was kept.`,
      );
    }
  });
  return { expected, warnings };
}

describe('Cargo.toml parser properties: duplicates, identity and prototype safety', () => {
  // Feature: dependency-graveyard-core, Property 4: One Dependency per key, first occurrence wins, one warning per discard
  // Validates: Requirements 4.6, 3.8, 3.18, 3.19
  it('Property 4: the kept dependency per key is the position-free First_Occurrence and each discard has one warning naming package and table', () => {
    fc.assert(
      fc.property(arbCargoDupModel(), ({ entries, text }) => {
        const { expected, warnings } = expectFromModel(entries);
        const result = parseManifest(text, 'Cargo.toml');
        expect(result.dependencies).toEqual(expected.dependencies);
        const keys = result.dependencies.map((d) => JSON.stringify([d.name, d.scope]));
        expect(new Set(keys).size).toBe(keys.length);
        expect(warnings).toHaveLength(expected.discarded);
        expect([...result.warnings].sort()).toEqual([...warnings].sort());
        for (const w of result.warnings) expect(w).not.toMatch(/\bline \d|\bcolumn\b|:\d+:\d+/);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 4: header order does not change the outcome when no table is split
  // Validates: Requirements 4.6, 3.18
  it('Property 4: one table pair `[dependencies]` against `[target.<cfg>.dependencies]` keeps the top-level entry whatever the header order', () => {
    fc.assert(
      fc.property(
        arbCargoName,
        fc.constantFrom("cfg(unix)", 'cfg(a.b)', "'", '"', '1'),
        fc.boolean(),
        fc.boolean(),
        (name, cfgName, targetFirst, header) => {
          const top: CargoEntry = { name, scope: 'runtime', value: { kind: 'string', spec: '1.0' } };
          const tgt: CargoEntry = { name, scope: 'runtime', value: { kind: 'string', spec: '2.0' } };
          const blocks = [
            { kind: 'table' as const, scope: 'runtime' as const, cfg: null, entries: [top] },
            header
              ? { kind: 'entry' as const, cfg: cfgName, entry: tgt }
              : { kind: 'table' as const, scope: 'runtime' as const, cfg: cfgName, entries: [tgt] },
          ];
          const ordered = targetFirst ? [blocks[1], blocks[0]] : blocks;
          const text = renderCargo({ blocks: ordered, eol: '\n', bom: false, trailingEol: true });
          const result = parseManifest(text, 'Cargo.toml');
          expect(result.dependencies).toEqual(expectedCargoDependencies([top]));
          expect(result.warnings).toEqual([
            `${whereOf(cfgName, 'runtime')}: duplicate dependency "${name}" in scope "runtime"; the first occurrence was kept.`,
          ]);
        },
      ),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 7: Dependency identity is name and scope (parser side)
  // Validates: Requirements 3.8, 3.18, 4.6
  it('Property 7: one name declared once in each scope of a non-empty set gives one dependency per scope and no warning', () => {
    const arbSameName = fc
      .tuple(arbCargoName, fc.subarray(['runtime', 'dev', 'build'] as CargoScope[], { minLength: 1 }), fc.array(fc.string({ maxLength: 6 }), { minLength: 3, maxLength: 3 }))
      .map(([name, scopes, specs]): CargoEntry[] =>
        scopes.map((scope, i) => ({
          name,
          scope,
          value:
            i % 2 === 0
              ? { kind: 'string' as const, spec: `${specs[i]}~${i}` }
              : { kind: 'table' as const, git: `g${specs[i]}~${i}`, extras: [] },
        })),
      );
    fc.assert(
      fc.property(
        arbSameName.chain((entries) => arbCargoLayout(entries).map((layout) => ({ entries, layout }))),
        ({ entries, layout }) => {
          const result = parseManifest(renderCargo(layout), 'Cargo.toml');
          expect(result.warnings).toEqual([]);
          expect(result.dependencies).toHaveLength(entries.length);
          expect(result.dependencies).toEqual(expectedCargoDependencies(entries));
          expect(new Set(result.dependencies.map((d) => d.scope)).size).toBe(entries.length);
        },
      ),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 8: Prototype safety
  // Validates: Requirements 4.9
  it('Property 8: prototype-like names are ordinary dependencies and no prototype changes', () => {
    const arbProtoName = fc.oneof(
      { weight: 3, arbitrary: fc.constantFrom(...CARGO_PROTO_NAMES) },
      { weight: 1, arbitrary: arbCargoName },
    );
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    fc.assert(
      fc.property(arbCargoDupModel(arbProtoName), ({ entries, text }) => {
        const { expected, warnings } = expectFromModel(entries);
        const result = parseManifest(text, 'Cargo.toml');
        expect(result.dependencies).toEqual(expected.dependencies);
        expect([...result.warnings].sort()).toEqual([...warnings].sort());
        for (const e of expected.dependencies) {
          if (CARGO_PROTO_NAMES.includes(e.name)) {
            expect(result.dependencies.filter((d) => d.name === e.name && d.scope === e.scope)).toEqual([e]);
          }
        }
        expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
        expect((({}) as Record<string, unknown>).polluted).toBeUndefined();
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
        expect(Object.getPrototypeOf(result.dependencies)).toBe(Array.prototype);
        expect(Object.getPrototypeOf(result.warnings)).toBe(Array.prototype);
        for (const d of result.dependencies) expect(Object.getPrototypeOf(d)).toBe(Object.prototype);
      }),
      cfg(),
    );
  });
});
