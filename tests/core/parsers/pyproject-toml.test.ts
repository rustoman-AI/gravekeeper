import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import type { ParseResult } from '../../../core';

function parse(text: string): ParseResult {
  return parseManifest(text, 'pyproject.toml');
}

/** `name|scope|versionSpec|sourceKind`, in the order the parser returned them. */
function rows(r: ParseResult): string[] {
  return r.dependencies.map((d) => `${d.name}|${d.scope}|${d.versionSpec}|${d.sourceKind}`);
}

// psf/requests pyproject.toml as described in the design (dependencies, extras, groups).
const REQUESTS = `
[build-system]
requires = ["setuptools>=64"]
build-backend = "setuptools.build_meta"

[project]
name = "requests"
dependencies = [
    "charset_normalizer>=2,<4",
    "idna>=2.5,<4",
    "urllib3>=1.21.1,<3",
    "certifi>=2017.4.17",
]

[project.optional-dependencies]
security = []
socks = ["PySocks>=1.5.6, !=1.5.7"]
use_chardet_on_py3 = ["chardet>=3.0.2,<8"]

[dependency-groups]
test = [
    "pytest>=2.8.0,<9",
    "requests[socks]",
]
typecheck = [
    "mypy>=1.13,<2",
]
`;

describe('pyproject.toml parser', () => {
  it('psf/requests: runtime, optional and group entries, self reference skipped', () => {
    const r = parse(REQUESTS);
    const runtime = r.dependencies.filter((d) => d.scope === 'runtime');
    expect(runtime.map((d) => d.name).sort()).toEqual(['certifi', 'charset-normalizer', 'idna', 'urllib3']);
    expect(runtime.find((d) => d.name === 'charset-normalizer')).toEqual({
      name: 'charset-normalizer',
      rawName: 'charset_normalizer',
      ecosystem: 'pypi',
      versionSpec: '>=2,<4',
      scope: 'runtime',
      sourceKind: 'registry',
    });
    const optional = r.dependencies.filter((d) => d.scope === 'optional');
    expect(optional.map((d) => `${d.name}|${d.versionSpec}`).sort()).toEqual([
      'chardet|>=3.0.2,<8',
      'pysocks|>=1.5.6, !=1.5.7',
    ]);
    const dev = r.dependencies.filter((d) => d.scope === 'dev');
    expect(dev.map((d) => d.name).sort()).toEqual(['mypy', 'pytest']);
    expect(r.dependencies).toHaveLength(8);
    expect(r.warnings).toEqual([
      'pyproject.toml table [dependency-groups.test]: "requests" refers to this project itself and was skipped.',
    ]);
  });

  it('Poetry: caret, tilde, wildcard, bare and table forms', () => {
    const r = parse(`
[tool.poetry.dependencies]
python = "^3.9"
Caret = "^1.2.3"
tilde = "~1.2"
wild = "1.*"
star = "*"
bare = "1.2.3"
tbl = { version = "^0.2.3", optional = true, extras = ["x"], markers = "sys_platform == 'win32'", python = ">=3.8" }
noversion = { extras = ["a"] }
`);
    expect(r.warnings).toEqual([]);
    expect(rows(r).sort()).toEqual(
      [
        'bare|runtime|==1.2.3|registry',
        'caret|runtime|>=1.2.3,<2.0.0|registry',
        'noversion|runtime|*|registry',
        'star|runtime|*|registry',
        'tbl|optional|>=0.2.3,<0.3.0|registry',
        'tilde|runtime|>=1.2,<1.3|registry',
        'wild|runtime|==1.*|registry',
      ].sort(),
    );
    expect(r.dependencies.find((d) => d.name === 'caret')?.rawName).toBe('Caret');
  });

  it('Poetry multiple-constraint array keeps the first and warns for the rest', () => {
    const r = parse(`
[tool.poetry.dependencies]
multi = [
  { version = "^1.0", python = "<3.10" },
  { version = "^2.0", python = ">=3.10" },
  { version = "^3.0" },
]
`);
    expect(rows(r)).toEqual(['multi|runtime|>=1.0,<2.0|registry']);
    const dup =
      'pyproject.toml table [tool.poetry.dependencies]: duplicate dependency "multi" in scope "runtime"; the first occurrence was kept.';
    expect(r.warnings).toEqual([dup, dup]);
  });

  it('Poetry git, path and url sources, python key and legacy dev-dependencies', () => {
    const r = parse(`
[tool.poetry.dependencies]
Python = "^3.9"
g = { git = "https://example.org/g.git", branch = "main" }
p = { path = "../p", develop = true }
u = { url = "https://example.org/u.zip" }

[tool.poetry.dev-dependencies]
python = "^3.9"
pytest = "^7.0"
`);
    expect(r.warnings).toEqual([]);
    expect(rows(r).sort()).toEqual(
      [
        'g|runtime|https://example.org/g.git|git',
        'p|runtime|../p|path',
        'pytest|dev|>=7.0,<8.0|registry',
        'u|runtime|https://example.org/u.zip|git',
      ].sort(),
    );
  });

  it('Poetry group tables map to dev whatever optional says', () => {
    const r = parse(`
[tool.poetry.group.lint.dependencies]
ruff = { version = "^0.1", optional = true }
`);
    expect(rows(r)).toEqual(['ruff|dev|>=0.1,<0.2|registry']);
  });

  it('a || constraint is kept as * with its warning', () => {
    const r = parse('[tool.poetry.dependencies]\nalt = "^1 || ^2"\n');
    expect(rows(r)).toEqual(['alt|runtime|*|registry']);
    expect(r.warnings).toEqual([
      'pyproject.toml table [tool.poetry.dependencies]: constraint "^1 || ^2" of "alt" uses || alternatives that PEP 440 cannot express; the package is checked at any version.',
    ]);
  });

  it('an untranslatable constraint is kept as * with its warning', () => {
    const r = parse('[tool.poetry.dependencies]\nbad = "^1.2.3rc1"\n');
    expect(rows(r)).toEqual(['bad|runtime|*|registry']);
    expect(r.warnings).toEqual([
      'pyproject.toml table [tool.poetry.dependencies]: constraint "^1.2.3rc1" of "bad" could not be translated to a PEP 440 range; the package is checked at any version.',
    ]);
  });

  it('include-group entries are skipped with one warning each, nothing resolved', () => {
    const r = parse(`
[dependency-groups]
test = ["pytest", { include-group = "lint" }, { include-group = "missing" }, { other = 1 }]
lint = ["ruff", { include-group = "lint" }]
`);
    expect(rows(r).sort()).toEqual(['pytest|dev|*|registry', 'ruff|dev|*|registry']);
    expect(r.warnings).toEqual([
      'pyproject.toml table [dependency-groups.test]: include-group "lint" was skipped; groups are not resolved.',
      'pyproject.toml table [dependency-groups.test]: include-group "missing" was skipped; groups are not resolved.',
      'pyproject.toml table [dependency-groups.test]: entry 3 is not a requirement string or an include-group table; it was skipped.',
      'pyproject.toml table [dependency-groups.lint]: include-group "lint" was skipped; groups are not resolved.',
    ]);
  });

  it('PEP 621 wins over Poetry for the same package and scope, with one warning', () => {
    const r = parse(`
[project]
dependencies = ["requests>=2"]

[tool.poetry.dependencies]
Requests = "^1.0"
`);
    expect(rows(r)).toEqual(['requests|runtime|>=2|registry']);
    expect(r.warnings).toEqual([
      'pyproject.toml table [tool.poetry.dependencies]: duplicate dependency "requests" in scope "runtime"; the first occurrence was kept.',
    ]);
  });

  it('the same name in two scopes gives two dependencies and no warning', () => {
    const r = parse(`
[project]
dependencies = ["foo>=1"]

[project.optional-dependencies]
extra = ["foo>=2"]
`);
    expect(rows(r).sort()).toEqual(['foo|optional|>=2|registry', 'foo|runtime|>=1|registry']);
    expect(r.warnings).toEqual([]);
  });

  describe('files with nothing to read', () => {
    const none =
      'pyproject.toml has no dependency tables ([project], [dependency-groups] or [tool.poetry]); no dependencies were read.';

    it('only [tool.ruff]', () => {
      expect(parse('[tool.ruff]\nline-length = 100\n')).toEqual({ dependencies: [], warnings: [none] });
    });

    it('empty file', () => {
      expect(parse('')).toEqual({ dependencies: [], warnings: [none] });
    });

    it('dynamic dependencies', () => {
      expect(parse('[project]\nname = "x"\ndynamic = ["dependencies"]\n')).toEqual({
        dependencies: [],
        warnings: [
          'pyproject.toml: [project] declares its dependencies as dynamic; they cannot be read from this file.',
        ],
      });
    });

    it('an empty table gives no warning', () => {
      expect(parse('[project]\ndependencies = []\n')).toEqual({ dependencies: [], warnings: [] });
    });
  });

  describe('malformed input', () => {
    it('invalid TOML gives one warning with a line number', () => {
      const r = parse('a = \n');
      expect(r.dependencies).toEqual([]);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toMatch(/^pyproject\.toml is not valid TOML: .+ \(line \d+\)$/);
    });

    it('invalid TOML without a line number has no suffix', async () => {
      // smol-toml always supplies a line, so the no-line branch is reached through a stubbed parseToml.
      const { vi } = await import('vitest');
      vi.resetModules();
      vi.doMock('../../../core/parsers/toml-tree', () => ({
        parseToml: () => ({ ok: false, error: { message: 'SyntaxError: boom' } }),
      }));
      try {
        const { parseManifest: stubbed } = await import('../../../core');
        expect(stubbed('x', 'pyproject.toml')).toEqual({
          dependencies: [],
          warnings: ['pyproject.toml is not valid TOML: SyntaxError: boom'],
        });
      } finally {
        vi.doUnmock('../../../core/parsers/toml-tree');
        vi.resetModules();
      }
    });

    it('wrong table types are skipped with one warning each', () => {
      const r = parse(`
[project]
dependencies = "x"

[project.optional-dependencies]
extra = "y"

[dependency-groups]
grp = 3

[tool.poetry]
dependencies = ["z"]
`);
      expect(r.dependencies).toEqual([]);
      expect(r.warnings).toEqual([
        'pyproject.toml table [project.dependencies] is not a list; it was skipped.',
        'pyproject.toml table [project.optional-dependencies.extra] is not a list; it was skipped.',
        'pyproject.toml table [dependency-groups.grp] is not a list; it was skipped.',
        'pyproject.toml table [tool.poetry.dependencies] is not a table; it was skipped.',
      ]);
    });

    it('a 200-character name in a warning is cut to 60 code points', () => {
      const key = '\u{1F600}'.repeat(200);
      const r = parse(`[tool.poetry.dependencies]\n"${key}" = "1"\n`);
      expect(r.dependencies).toEqual([]);
      expect(r.warnings).toEqual([
        `pyproject.toml table [tool.poetry.dependencies]: entry "${'\u{1F600}'.repeat(59)}\u2026" is not a valid package name; it was skipped.`,
      ]);
      expect(Array.from(r.warnings[0] as string)).not.toContain('\n');
    });
  });
});
