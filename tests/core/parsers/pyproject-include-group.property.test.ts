import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import { arbGroupsWithIncludes, renderGroups, type GroupsWithIncludes } from '../../support/arbitraries/pyproject';
import { cfg } from '../../support/fc-config';

// Feature: pyproject, Property PY-P7: include-group entries are skipped with one warning and never resolved

// Requirement 4.2 text, from the design's warning table.
const includeWarning = (group: string, target: string): string =>
  `pyproject.toml table [dependency-groups.${group}]: include-group "${target}" was skipped; groups are not resolved.`;

const isIncludeWarning = (w: string): boolean => w.includes(': include-group "') && w.endsWith('was skipped; groups are not resolved.');

function expectedIncludeWarnings(model: GroupsWithIncludes): string[] {
  return model.groups
    .flatMap((g) => g.items.flatMap((i) => (i.kind === 'include' ? [includeWarning(g.name, i.target)] : [])))
    .sort();
}

const depKey = (d: { name: string; scope: string }): string => `${d.name}\u0000${d.scope}`;

describe('Pyproject parser properties: include-group', () => {
  // Validates: Requirements 4.2, 4.4, 4.5
  it('PY-P7: dependencies equal those of the input without Include_Entries', () => {
    fc.assert(
      fc.property(arbGroupsWithIncludes, (model) => {
        const withInc = parseManifest(model.withIncludes, 'pyproject.toml');
        const without = parseManifest(model.withoutIncludes, 'pyproject.toml');
        expect(withInc.dependencies).toEqual(without.dependencies);
      }),
      cfg(),
    );
  });

  // Validates: Requirements 4.2, 4.5
  it('PY-P7: exactly one Requirement 4.2 warning is added per Include_Entry, with the verbatim text', () => {
    fc.assert(
      fc.property(arbGroupsWithIncludes, (model) => {
        const withInc = parseManifest(model.withIncludes, 'pyproject.toml');
        const without = parseManifest(model.withoutIncludes, 'pyproject.toml');
        expect(withInc.warnings).toHaveLength(without.warnings.length + model.includeCount);
        expect(withInc.warnings.filter(isIncludeWarning).sort()).toEqual(expectedIncludeWarnings(model));
        expect(without.warnings.filter(isIncludeWarning)).toEqual([]);
        expect(withInc.warnings.filter((w) => !isIncludeWarning(w))).toEqual(without.warnings);
      }),
      cfg(),
    );
  });

  // Validates: Requirements 4.2, 4.4
  it('PY-P7: no dependency has an included group as its only source', () => {
    fc.assert(
      fc.property(arbGroupsWithIncludes, (model) => {
        // Only requirement items count as sources; an include never contributes one.
        const sourced = new Set<string>();
        const withInc = parseManifest(model.withIncludes, 'pyproject.toml');
        const own = parseManifest(renderGroups(model.groups, false), 'pyproject.toml');
        for (const d of own.dependencies) sourced.add(depKey(d));
        for (const d of withInc.dependencies) expect(sourced.has(depKey(d))).toBe(true);
        expect(withInc.dependencies).toHaveLength(own.dependencies.length);
      }),
      cfg(),
    );
  });

  // Validates: Requirements 4.4, 4.5
  it('PY-P7: self cycles and missing targets neither throw nor produce an error warning', () => {
    fc.assert(
      fc.property(arbGroupsWithIncludes, (model) => {
        const result = parseManifest(model.withIncludes, 'pyproject.toml');
        expect(result.warnings.some((w) => w.includes('not valid TOML') || w.includes('internal'))).toBe(false);
      }),
      cfg(),
    );
  });
});
