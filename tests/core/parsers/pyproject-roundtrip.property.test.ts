import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import type { Dependency } from '../../../core/model';
import { arbPyprojectDependencies } from '../../support/arbitraries/pyproject';
import { cfg } from '../../support/fc-config';
import { sortInDependencyOrder } from '../../support/oracles/manifest-model';
import { writePyproject, type PyprojectStyle } from '../../support/oracles/pyproject-writer';

// Feature: pyproject, Property PY-P2: The normalized set round-trips through a pyproject writer

const normalized = (d: Dependency) => ({
  name: d.name,
  rawName: d.rawName,
  scope: d.scope,
  versionSpec: d.versionSpec,
  sourceKind: d.sourceKind,
  ecosystem: d.ecosystem,
});

function roundTrip(deps: Dependency[], style: PyprojectStyle): void {
  const text = writePyproject(deps, style);
  const result = parseManifest(text, 'pyproject.toml');
  // An empty list is written as '' and the parser then reports "no dependency tables", which is correct.
  if (deps.length > 0) expect(result.warnings).toEqual([]);
  expect(result.dependencies.map(normalized)).toEqual(sortInDependencyOrder(deps).map(normalized));
}

describe('pyproject round trip', () => {
  // **Validates: Requirements 8.9, 5.5, 5.7, 3.1, 3.2, 4.1**
  it('PY-P2 PEP 621 style: write then parse returns the sorted input with no warnings', () => {
    fc.assert(
      fc.property(arbPyprojectDependencies(12), (deps) => {
        roundTrip(deps, 'pep621');
      }),
      cfg(),
    );
  });

  // **Validates: Requirements 8.9, 5.5, 5.7, 3.1, 3.2, 4.1**
  it('PY-P2 Poetry style: write then parse returns the sorted input with no warnings', () => {
    fc.assert(
      fc.property(arbPyprojectDependencies(12, { poetrySafe: true }), (deps) => {
        roundTrip(deps, 'poetry');
      }),
      cfg(),
    );
  });
});
