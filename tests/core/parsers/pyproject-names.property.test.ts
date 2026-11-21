import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import { arbPyprojectName } from '../../support/arbitraries/pyproject';
import { cfg } from '../../support/fc-config';
import { tomlBasicString as q } from '../../support/oracles/pyproject-writer';

// Feature: pyproject, Property PY-P5: Names are PEP 503 normalized and rawName is kept
// Validates: Requirements 7.1, 7.2, 7.3, 7.4

/** PEP 503 by a linear scan: lowercase, each run of `-`, `_`, `.` becomes one `-`. */
function pep503(raw: string): string {
  let out = '';
  let inRun = false;
  for (const ch of raw) {
    if (ch === '-' || ch === '_' || ch === '.') {
      if (!inRun) out += '-';
      inRun = true;
    } else {
      out += ch.toLowerCase();
      inRun = false;
    }
  }
  return out;
}

const TABLE_KINDS = ['project', 'extra', 'group', 'poetry-main', 'poetry-group', 'poetry-dev'] as const;
type Kind = (typeof TABLE_KINDS)[number];

function pyprojectWith(kind: Kind, raw: string): string {
  switch (kind) {
    case 'project':
      return `[project]\nname = "host"\ndependencies = [${q(raw)}]\n`;
    case 'extra':
      return `[project]\nname = "host"\n\n[project.optional-dependencies]\nx = [${q(raw)}]\n`;
    case 'group':
      return `[dependency-groups]\ng = [${q(raw)}]\n`;
    case 'poetry-main':
      return `[tool.poetry.dependencies]\n${q(raw)} = "*"\n`;
    case 'poetry-group':
      return `[tool.poetry.group.g.dependencies]\n${q(raw)} = "*"\n`;
    case 'poetry-dev':
      return `[tool.poetry.dev-dependencies]\n${q(raw)} = "*"\n`;
  }
}

describe('pyproject names', () => {
  it('PY-P5: the oracle collapses separator runs and lowercases (self check)', () => {
    expect(pep503('Foo__Bar-._baz')).toBe('foo-bar-baz');
    expect(pep503('A-')).toBe('a-');
    expect(pep503('')).toBe('');
  });

  it('PY-P5: in every table kind, name is the PEP 503 form, rawName is as written, and it matches requirements.txt', () => {
    fc.assert(
      fc.property(arbPyprojectName, (raw) => {
        const fromRequirements = parseManifest(raw, 'requirements.txt').dependencies;
        expect(fromRequirements).toHaveLength(1);
        const reference = fromRequirements[0];
        for (const kind of TABLE_KINDS) {
          const { dependencies } = parseManifest(pyprojectWith(kind, raw), 'pyproject.toml');
          expect(dependencies, kind).toHaveLength(1);
          const d = dependencies[0];
          expect(d?.name, kind).toBe(pep503(raw));
          expect(d?.rawName, kind).toBe(raw);
          expect(d?.ecosystem, kind).toBe('pypi');
          expect(d?.name, kind).toBe(reference?.name);
          expect(d?.rawName, kind).toBe(reference?.rawName);
        }
      }),
      cfg(),
    );
  });
});
