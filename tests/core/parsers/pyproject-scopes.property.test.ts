import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import { supportedScopes } from '../../../core/formats/manifest-format';
import type { Scope } from '../../../core/model';
import {
  arbPoetryOptionalModel,
  arbScopeModel,
  expectedScope,
  type ScopeModel,
  type TableKind,
} from '../../support/arbitraries/pyproject';
import { cfg } from '../../support/fc-config';
import { oracleNormalize } from '../../support/oracles/manifest-model';

// Feature: pyproject, Property PY-P6: Scope mapping is total

// Local oracle: the scope table of Requirement 8.1, written out independently of `expectedScope`.
const SCOPE_TABLE: Readonly<Record<TableKind, { readonly plain: Scope; readonly optionalTrue: Scope }>> = {
  project: { plain: 'runtime', optionalTrue: 'runtime' },
  extra: { plain: 'optional', optionalTrue: 'optional' },
  group: { plain: 'dev', optionalTrue: 'dev' },
  'poetry-main': { plain: 'runtime', optionalTrue: 'optional' },
  'poetry-group': { plain: 'dev', optionalTrue: 'dev' },
  'poetry-dev': { plain: 'dev', optionalTrue: 'dev' },
};

const ALL_KINDS = Object.keys(SCOPE_TABLE) as TableKind[];

const tableScope = (kind: TableKind, optional: boolean | undefined): Scope =>
  optional === true ? SCOPE_TABLE[kind].optionalTrue : SCOPE_TABLE[kind].plain;

function checkModel(model: ScopeModel): void {
  const allowed = supportedScopes('pyproject.toml');
  // The model's own expectations agree with the local oracle.
  expect(model.expected).toEqual(
    model.entries.map((e) => ({
      name: oracleNormalize(e.rawName),
      rawName: e.rawName,
      scope: tableScope(e.kind, e.optional),
    })),
  );

  const result = parseManifest(model.text, 'pyproject.toml');
  // Every entry of every table kind is returned: none dropped silently.
  expect(result.dependencies).toHaveLength(model.expected.length);
  const byName = new Map(result.dependencies.map((d) => [d.name, d]));
  expect(byName.size).toBe(model.expected.length);
  for (const exp of model.expected) {
    const got = byName.get(exp.name);
    expect(got, `missing ${exp.name}`).toBeDefined();
    expect(got?.scope).toBe(exp.scope);
    expect(allowed).toContain(got?.scope);
  }
}

describe('Pyproject parser properties: scope mapping', () => {
  // Validates: Requirements 8.1, 8.8, 3.1, 3.2, 4.1, 5.1, 5.2, 5.3
  it('PY-P6: the local scope table agrees with expectedScope for every kind and optional flag', () => {
    for (const kind of ALL_KINDS) {
      for (const optional of [false, true]) {
        expect(expectedScope(kind, optional)).toBe(tableScope(kind, optional ? true : undefined));
      }
    }
  });

  // Validates: Requirements 8.1, 8.8, 3.1, 3.2, 4.1, 5.1, 5.2, 5.3
  it('PY-P6: every dependency of every table kind has exactly its table scope, within supportedScopes', () => {
    fc.assert(
      fc.property(
        arbScopeModel.filter((m) => m.text !== ''),
        checkModel,
      ),
      cfg(),
    );
  });

  // Validates: Requirements 8.1, 8.8, 5.1, 5.2, 5.3
  it('PY-P6: Poetry entries map by table and optional flag, within supportedScopes', () => {
    fc.assert(
      fc.property(
        arbPoetryOptionalModel.filter((m) => m.text !== ''),
        checkModel,
      ),
      cfg(),
    );
  });
});
