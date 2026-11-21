// Validates: Requirements 5.1, 5.2, 5.3
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectPyprojectTool } from '../../../core';

const fixture = (name: string): string => readFileSync(join(__dirname, '..', '..', 'fixtures', name), 'utf8');

describe('detectPyprojectTool', () => {
  it('returns pep621 for the psf/requests layout', () => {
    expect(detectPyprojectTool(fixture('sample-pyproject.toml'))).toBe('pep621');
  });

  it('returns poetry for the Poetry fixture', () => {
    expect(detectPyprojectTool(fixture('sample-poetry-pyproject.toml'))).toBe('poetry');
  });

  it('returns mixed when both table kinds exist', () => {
    const text = '[project]\ndependencies = ["requests"]\n[tool.poetry.dependencies]\nhttpx = "^0.27"\n';
    expect(detectPyprojectTool(text)).toBe('mixed');
  });

  it('counts group and dev-dependencies tables of Poetry', () => {
    expect(detectPyprojectTool('[tool.poetry.group.test.dependencies]\npytest = "*"\n')).toBe('poetry');
    expect(detectPyprojectTool('[tool.poetry.dev-dependencies]\npytest = "*"\n')).toBe('poetry');
  });

  it('counts optional-dependencies and dependency-groups of PEP 621', () => {
    expect(detectPyprojectTool('[project.optional-dependencies]\ndev = ["pytest"]\n')).toBe('pep621');
    expect(detectPyprojectTool('[dependency-groups]\ndev = ["pytest"]\n')).toBe('pep621');
  });

  it('returns null for [tool.ruff] only and for an empty string', () => {
    expect(detectPyprojectTool('[tool.ruff]\nline-length = 100\n')).toBeNull();
    expect(detectPyprojectTool('')).toBeNull();
  });

  it('does not count the python key alone or empty tables', () => {
    expect(detectPyprojectTool('[tool.poetry.dependencies]\npython = "^3.10"\n')).toBeNull();
    expect(detectPyprojectTool('[project]\ndependencies = []\n')).toBeNull();
  });

  it('returns poetry when [project] has only a name', () => {
    const text = '[project]\nname = "x"\n[tool.poetry.dependencies]\npython = "^3.10"\nhttpx = "*"\n';
    expect(detectPyprojectTool(text)).toBe('poetry');
  });

  it('returns null for invalid TOML and a 1 MB string without throwing', () => {
    expect(detectPyprojectTool('[project\ndependencies = ')).toBeNull();
    expect(detectPyprojectTool('#'.repeat(1_000_000))).toBeNull();
  });

  it('does not count __proto__ and constructor keys as tables', () => {
    expect(detectPyprojectTool('[tool.poetry]\n"__proto__" = { a = 1 }\n')).toBeNull();
    expect(detectPyprojectTool('"constructor" = { dependencies = ["a"] }\n')).toBeNull();
    expect(detectPyprojectTool('[project]\n"constructor" = { a = 1 }\n')).toBeNull();
  });
});
