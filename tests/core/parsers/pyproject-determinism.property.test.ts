import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import type { Dependency } from '../../../core/model';
import {
  arbHostilePyprojectText,
  arbPyprojectDependencies,
  arbPyprojectName,
  arbScopeModel,
  renderScopeModel,
} from '../../support/arbitraries/pyproject';
import { cfg } from '../../support/fc-config';
import { isSortedByNameAndScope, oracleNormalize, sortInDependencyOrder } from '../../support/oracles/manifest-model';
import { tomlBasicString, writePyproject, type PyprojectStyle } from '../../support/oracles/pyproject-writer';

// Feature: pyproject, Property PY-P4
// Property 4: Output is deterministic, sorted and free of repeated keys (PY-P4)
// Validates: Requirements 8.2, 8.3, 8.5, 8.6, 8.7

const parse = (text: string) => parseManifest(text, 'pyproject.toml');

/** Checks of Requirements 8.5 and 8.6 on one text: two calls agree, order is Dependency_Order, keys are unique. */
function expectDeterministicSortedUnique(text: string): ReturnType<typeof parse> {
  const first = parse(text);
  const second = parse(text);
  expect(second).toEqual(first);
  expect(isSortedByNameAndScope(first.dependencies)).toBe(true);
  expect(first.dependencies).toEqual(sortInDependencyOrder(first.dependencies));
  const keys = first.dependencies.map((d) => JSON.stringify([d.name, d.scope]));
  expect(new Set(keys).size).toBe(keys.length);
  for (const w of first.warnings) expect(w).not.toMatch(/[\r\n]/);
  return first;
}

/** A permutation of `items` driven by generated naturals (Fisher-Yates). */
function permute<T>(items: readonly T[], picks: readonly number[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (picks[i % Math.max(picks.length, 1)] ?? 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const arbPicks = fc.array(fc.nat(), { minLength: 1, maxLength: 16 });

const sameSet = (a: readonly Dependency[], b: readonly Dependency[]) => expect(b).toEqual(a);

describe('pyproject.toml parser property PY-P4: determinism, order and unique keys', () => {
  it('PY-P4: hostile and TOML-shaped text parses to equal results twice, sorted, without repeated keys', () => {
    fc.assert(
      fc.property(arbHostilePyprojectText, (text) => {
        const before = text.slice();
        expectDeterministicSortedUnique(text);
        expect(text).toBe(before);
      }),
      cfg(),
    );
  });

  it('PY-P4: written dependency lists (both styles) parse deterministically, sorted, without repeated keys, no warnings', () => {
    fc.assert(
      fc.property(arbPyprojectDependencies(12, { poetrySafe: true }), fc.constantFrom<PyprojectStyle>('pep621', 'poetry'), (deps, style) => {
        const result = expectDeterministicSortedUnique(writePyproject(deps, style));
        if (deps.length > 0) expect(result.warnings).toEqual([]);
        expect(result.dependencies).toHaveLength(deps.length);
      }),
      cfg(),
    );
  });

  it('PY-P4: permuting the entries of a written list gives the same dependency list and warnings', () => {
    fc.assert(
      fc.property(
        arbPyprojectDependencies(12, { poetrySafe: true }),
        arbPicks,
        fc.constantFrom<PyprojectStyle>('pep621', 'poetry'),
        (deps, picks, style) => {
          const a = parse(writePyproject(deps, style));
          const b = parse(writePyproject(permute(deps, picks), style));
          sameSet(a.dependencies, b.dependencies);
          expect(b.warnings).toEqual(a.warnings);
        },
      ),
      cfg(),
    );
  });

  it('PY-P4: scope models of every table kind are sorted and unique, and entry and table order do not change the result', () => {
    fc.assert(
      fc.property(arbScopeModel, arbPicks, arbPicks, (model, entryPicks, blockPicks) => {
        const base = expectDeterministicSortedUnique(model.text);
        if (model.entries.length > 0) expect(base.warnings).toEqual([]);
        // Reordered entries (each table's key order and the container order change).
        const permutedEntries = parse(renderScopeModel(permute(model.entries, entryPicks)));
        sameSet(base.dependencies, permutedEntries.dependencies);
        expect(permutedEntries.warnings).toEqual(base.warnings);
        // Reordered top-level sections of the text.
        const blocks = model.text.split('\n\n').map((b) => b.replace(/\n+$/, ''));
        const permutedBlocks = parse(`${permute(blocks, blockPicks).join('\n\n')}\n`);
        sameSet(base.dependencies, permutedBlocks.dependencies);
        expect(permutedBlocks.warnings).toEqual(base.warnings);
      }),
      cfg(),
    );
  });

  it('PY-P4: the same package in a PEP 621 and a Poetry table keeps the PEP 621 entry whatever the text order, with one warning', () => {
    fc.assert(
      fc.property(arbPyprojectName, fc.boolean(), fc.constantFrom('runtime', 'dev'), (name, poetryFirst, scope) => {
        const pep =
          scope === 'runtime'
            ? `[project]\ndependencies = [${tomlBasicString(`${name}>=1`)}]`
            : `[dependency-groups]\ng = [${tomlBasicString(`${name}>=1`)}]`;
        const poetry =
          scope === 'runtime'
            ? `[tool.poetry.dependencies]\n${tomlBasicString(name)} = "2.0"`
            : `[tool.poetry.group.x.dependencies]\n${tomlBasicString(name)} = "2.0"`;
        const text = `${poetryFirst ? `${poetry}\n\n${pep}` : `${pep}\n\n${poetry}`}\n`;
        const result = expectDeterministicSortedUnique(text);
        expect(result.dependencies).toEqual([
          { name: oracleNormalize(name), rawName: name, ecosystem: 'pypi', versionSpec: '>=1', scope, sourceKind: 'registry' },
        ]);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain(`duplicate dependency "${oracleNormalize(name)}" in scope "${scope}"`);
      }),
      cfg(),
    );
  });
});
