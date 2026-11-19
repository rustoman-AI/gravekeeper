import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  checkArchitecture,
  checkRangePackageVersions,
  type SourceFileInput,
  type Violation,
} from '../../scripts/architecture/check';
import { extractImports, type ImportKind } from '../../scripts/architecture/imports';
import { isInsideDir, resolveSpecifier } from '../../scripts/architecture/resolve';
import type { RuleId } from '../../scripts/architecture/rules';

const ROOT = join(__dirname, '..', '..');

function f(path: string, text: string): SourceFileInput {
  return { path, text };
}

function find(violations: Violation[], rule: RuleId): Violation[] {
  return violations.filter((v) => v.rule === rule);
}

/** Asserts that `files` yield `rule` at `file:line`. */
function expectRule(files: SourceFileInput[], rule: RuleId, file: string, line: number): void {
  const hits = find(checkArchitecture(files), rule);
  expect(hits).toContainEqual({ file, line, rule });
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
}

describe('architecture checker: real tree', () => {
  // Requirement 22.16
  it('reports zero violations', () => {
    const files: SourceFileInput[] = [];
    for (const name of ['core', 'pipeline', 'adapters', 'app', 'components']) {
      const dir = join(ROOT, name);
      const found: string[] = [];
      try {
        walk(dir, found);
      } catch {
        continue;
      }
      for (const full of found.sort()) {
        files.push({
          path: full.slice(ROOT.length + 1).split('\\').join('/'),
          text: readFileSync(full, 'utf8'),
        });
      }
    }
    expect(files.length).toBeGreaterThan(0);
    expect(checkArchitecture(files)).toEqual([]);
  });
});

describe('architecture checker: one snippet per rule', () => {
  // Requirement 22.2
  it('mapping-import-not-allowed', () => {
    expectRule(
      [f('pipeline/mapping/a.ts', "export const a = 1;\nimport { x } from '../http/x';\n")],
      'mapping-import-not-allowed',
      'pipeline/mapping/a.ts',
      2,
    );
    expectRule(
      [f('pipeline/mapping/a.ts', "import z from 'zod';\n")],
      'mapping-import-not-allowed',
      'pipeline/mapping/a.ts',
      1,
    );
  });

  it('mapping allows core, mapping and constants imports', () => {
    const v = checkArchitecture([
      f(
        'pipeline/mapping/a.ts',
        "import type { A } from '../../core';\nimport { b } from './b';\nimport { c } from '../constants';\nexport const a = 1;\n",
      ),
    ]);
    expect(find(v, 'mapping-import-not-allowed')).toEqual([]);
  });

  // Requirement 22.6
  it('mapping-forbidden-api', () => {
    expectRule(
      [f('pipeline/mapping/a.ts', 'export const a = 1;\nexport const t = Date.now();\n')],
      'mapping-forbidden-api',
      'pipeline/mapping/a.ts',
      2,
    );
  });

  // Requirement 22.4, 22.7
  it('core-imports-upper-layer', () => {
    expectRule(
      [f('core/a.ts', "\nimport { x } from '../pipeline/ports';\n")],
      'core-imports-upper-layer',
      'core/a.ts',
      2,
    );
  });

  // Requirement 22.9
  it('adapters-import-not-allowed', () => {
    expectRule(
      [f('adapters/a.ts', "\n\nimport { x } from '../pipeline/mapping/x';\n")],
      'adapters-import-not-allowed',
      'adapters/a.ts',
      3,
    );
  });

  // Requirement 22.10
  it('layer-imports-adapters', () => {
    expectRule(
      [f('pipeline/a.ts', "import { x } from '../adapters/x';\n")],
      'layer-imports-adapters',
      'pipeline/a.ts',
      1,
    );
    const route = checkArchitecture([
      f('app/api/scan/route.ts', "import { x } from '@/adapters/x';\n"),
    ]);
    expect(find(route, 'layer-imports-adapters')).toEqual([]);
  });

  // Requirement 22.11
  it('ports-missing-interface', () => {
    expectRule(
      [f('pipeline/ports/index.ts', 'export interface GithubSource {}\n')],
      'ports-missing-interface',
      'pipeline/ports/index.ts',
      1,
    );
  });

  it('ports-import-not-allowed', () => {
    expectRule(
      [f('pipeline/ports/a.ts', "export type A = 1;\nimport type { B } from '../mapping/b';\n")],
      'ports-import-not-allowed',
      'pipeline/ports/a.ts',
      2,
    );
  });

  // Requirement 22.12
  it('pipeline-forbidden-api', () => {
    expectRule(
      [f('pipeline/a.ts', "export const a = 1;\nexport const r = fetch('x');\n")],
      'pipeline-forbidden-api',
      'pipeline/a.ts',
      2,
    );
    expectRule(
      [f('pipeline/a.ts', "\nimport * as net from 'node:net';\n")],
      'pipeline-forbidden-api',
      'pipeline/a.ts',
      2,
    );
  });

  // Requirement 22.8
  it('file-name-style', () => {
    expectRule(
      [f('pipeline/BadName.ts', 'export const a = 1;\n')],
      'file-name-style',
      'pipeline/BadName.ts',
      1,
    );
    expect(find(checkArchitecture([f('pipeline/good-name2.ts', 'export const a = 1;\n')]), 'file-name-style')).toEqual(
      [],
    );
  });

  it('no-default-export', () => {
    expectRule(
      [f('adapters/a.ts', 'export const a = 1;\nexport default a;\n')],
      'no-default-export',
      'adapters/a.ts',
      2,
    );
    expectRule(
      [f('pipeline/b.ts', 'export default function b() {}\n')],
      'no-default-export',
      'pipeline/b.ts',
      1,
    );
    expectRule(
      [f('pipeline/c.ts', 'const c = 1;\nexport { c as default };\n')],
      'no-default-export',
      'pipeline/c.ts',
      2,
    );
  });

  // Requirement 15.10
  it('adapters-forbidden-time-api', () => {
    expectRule(
      [f('adapters/a.ts', 'export const a = 1;\nexport const t = Date.now();\n')],
      'adapters-forbidden-time-api',
      'adapters/a.ts',
      2,
    );
    const exempt = checkArchitecture([
      f('adapters/runtime/system-clock.ts', 'export const t = () => Date.now();\n'),
    ]);
    expect(find(exempt, 'adapters-forbidden-time-api')).toEqual([]);
  });
});

describe('architecture checker: range packages', () => {
  // Requirement 5.3
  it('range-package-not-allowed outside the wrapper files', () => {
    for (const path of ['pipeline/mapping/version-select.ts', 'pipeline/scan/x.ts', 'adapters/x.ts']) {
      expectRule([f(path, "import semver from 'semver';\n")], 'range-package-not-allowed', path, 1);
    }
    expectRule(
      [f('pipeline/scan/x.ts', "\nimport { gt } from 'semver/functions/gt';\n")],
      'range-package-not-allowed',
      'pipeline/scan/x.ts',
      2,
    );
    expectRule(
      [f('adapters/x.ts', "import { a } from '@renovatebot/pep440';\n")],
      'range-package-not-allowed',
      'adapters/x.ts',
      1,
    );
  });

  it('the wrapper files report nothing', () => {
    expect(
      checkArchitecture([
        f('pipeline/mapping/range-semver.ts', "import { parse } from 'semver';\nimport { gt } from 'semver/functions/gt';\n"),
        f('pipeline/mapping/range-pep440.ts', "import { parse } from '@renovatebot/pep440';\n"),
      ]),
    ).toEqual([]);
  });

  it('a wrapper may not import the other range package', () => {
    const v = checkArchitecture([
      f('pipeline/mapping/range-semver.ts', "import { parse } from '@renovatebot/pep440';\n"),
    ]);
    expect(v).toContainEqual({
      file: 'pipeline/mapping/range-semver.ts',
      line: 1,
      rule: 'range-package-not-allowed',
    });
  });

  it('any other package in pipeline/mapping is still mapping-import-not-allowed', () => {
    expectRule(
      [f('pipeline/mapping/range-semver.ts', "import z from 'zod';\n")],
      'mapping-import-not-allowed',
      'pipeline/mapping/range-semver.ts',
      1,
    );
    expectRule(
      [f('pipeline/mapping/a.ts', "import z from 'zod';\n")],
      'mapping-import-not-allowed',
      'pipeline/mapping/a.ts',
      1,
    );
  });

  // Requirement 5.4
  it('range-package-version-exact', () => {
    const text = '{\n  "dependencies": {\n    "semver": "^7.8.6"\n  }\n}\n';
    expect(checkRangePackageVersions(text)).toEqual([
      { file: 'package.json', line: 3, rule: 'range-package-version-exact' },
    ]);
    expect(
      checkRangePackageVersions('{"dependencies":{"@renovatebot/pep440":"~5.0.1"}}'),
    ).toHaveLength(1);
  });

  it('accepts exact versions, absent packages and unparsable JSON', () => {
    expect(
      checkRangePackageVersions(
        '{"dependencies":{"semver":"7.8.6","@renovatebot/pep440":"5.0.1","zod":"^3.0.0"}}',
      ),
    ).toEqual([]);
    expect(checkRangePackageVersions('{}')).toEqual([]);
    expect(checkRangePackageVersions('not json')).toEqual([]);
  });
});

describe('architecture checker: import kinds and specifiers', () => {
  // Requirement 22.13
  const cases: Array<[ImportKind, string]> = [
    ['import', "import { x } from 'a';"],
    ['import-type', "import type { X } from 'a';"],
    ['export-from', "export { x } from 'a';"],
    ['import-equals-require', "import x = require('a');"],
    ['import-type-expression', "type T = import('a').X;"],
    ['dynamic-import', "const m = import('a');"],
    ['require-call', "const m = require('a');"],
  ];

  for (const [kind, code] of cases) {
    it(`extracts ${kind}`, () => {
      expect(extractImports('x.ts', `\n${code}\n`)).toEqual([{ kind, specifier: 'a', line: 2 }]);
    });

    it(`checks ${kind} against the layer rules`, () => {
      const text = code.replace("'a'", "'../pipeline/x'");
      expectRule([f('core/a.ts', text)], 'core-imports-upper-layer', 'core/a.ts', 1);
    });
  }

  // Requirement 22.14
  it('reports a non-literal specifier as null and as a violation', () => {
    const text = "const name = 'x';\nconst m = import(name);\n";
    expect(extractImports('x.ts', text)).toEqual([
      { kind: 'dynamic-import', specifier: null, line: 2 },
    ]);
    expectRule([f('pipeline/a.ts', text)], 'non-literal-specifier', 'pipeline/a.ts', 2);
    expectRule(
      [f('pipeline/a.ts', 'const m = require(`a${1}`);\n')],
      'non-literal-specifier',
      'pipeline/a.ts',
      1,
    );
  });

  it('resolves relative and @/ specifiers to root-relative POSIX paths', () => {
    expect(resolveSpecifier('pipeline/mapping/a.ts', '../ports')).toEqual({
      kind: 'project',
      path: 'pipeline/ports',
    });
    expect(resolveSpecifier('app/page.tsx', '@/core/model')).toEqual({
      kind: 'project',
      path: 'core/model',
    });
    expect(resolveSpecifier('app/page.tsx', 'react')).toEqual({ kind: 'package', name: 'react' });
    expect(resolveSpecifier('app/page.tsx', '@scope/pkg/deep')).toEqual({
      kind: 'package',
      name: '@scope/pkg',
    });
  });

  it('compares directories by whole segment', () => {
    expect(isInsideDir('pipeline/mapping-extra/a.ts', 'pipeline/mapping')).toBe(false);
    expect(isInsideDir('pipeline/mapping/a.ts', 'pipeline/mapping')).toBe(true);
    const v = checkArchitecture([
      f('pipeline/mapping-extra/a.ts', "import z from 'zod';\nexport const a = Date.now;\n"),
    ]);
    expect(find(v, 'mapping-import-not-allowed')).toEqual([]);
    expect(find(v, 'mapping-forbidden-api')).toEqual([]);
    // A mapping file importing the lookalike directory is rejected.
    expectRule(
      [f('pipeline/mapping/a.ts', "import { x } from '../mapping-extra/x';\n")],
      'mapping-import-not-allowed',
      'pipeline/mapping/a.ts',
      1,
    );
  });
});

describe('architecture checker: token rules', () => {
  // Requirement 22.17
  it('token-reference-count flags every file when two contain the token', () => {
    const files = [
      f('adapters/a.ts', 'export const a = process.env.GITHUB_TOKEN;\n'),
      f('app/b.ts', '\nexport const b = process.env.GITHUB_TOKEN;\n'),
    ];
    const hits = find(checkArchitecture(files), 'token-reference-count');
    expect(hits).toEqual([
      { file: 'adapters/a.ts', line: 1, rule: 'token-reference-count' },
      { file: 'app/b.ts', line: 2, rule: 'token-reference-count' },
    ]);
  });

  it('allows a single file with the token', () => {
    const v = checkArchitecture([f('app/b.ts', 'export const b = process.env.GITHUB_TOKEN;\n')]);
    expect(find(v, 'token-reference-count')).toEqual([]);
  });

  it('token-next-public', () => {
    expectRule(
      [f('app/b.ts', "const t = process.env.GITHUB_TOKEN;\nconst p = 'NEXT_PUBLIC_X';\n")],
      'token-next-public',
      'app/b.ts',
      2,
    );
  });

  it('token-client-reachability follows imports transitively', () => {
    const files = [
      f('components/c.tsx', "'use client';\nimport { m } from './mid';\nexport const C = m;\n"),
      f('components/mid.ts', "export { t } from '../app/token';\n"),
      f('app/token.ts', 'export const t = process.env.GITHUB_TOKEN;\n'),
    ];
    expectRule(files, 'token-client-reachability', 'components/c.tsx', 2);
  });

  it('token-client-reachability flags a client file that holds the token', () => {
    expectRule(
      [f('app/c.tsx', "'use client';\nexport const t = process.env.GITHUB_TOKEN;\n")],
      'token-client-reachability',
      'app/c.tsx',
      2,
    );
  });

  it('does not flag a client file that cannot reach the token', () => {
    const files = [
      f('components/c.tsx', "'use client';\nexport const C = 1;\n"),
      f('app/token.ts', 'export const t = process.env.GITHUB_TOKEN;\n'),
    ];
    expect(find(checkArchitecture(files), 'token-client-reachability')).toEqual([]);
  });
});

describe('architecture CLI', () => {
  const tmpRoots: string[] = [];
  const tsxCli = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  function run(files: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), 'arch-'));
    tmpRoots.push(dir);
    for (const [rel, text] of Object.entries(files)) {
      const full = join(dir, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, text);
    }
    return spawnSync(
      process.execPath,
      [tsxCli, join(ROOT, 'scripts', 'check-architecture.ts'), dir],
      { encoding: 'utf8' },
    );
  }

  afterAll(() => {
    for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
  });

  // Requirement 22.16
  it('exits 1 and prints file:line for a violation', () => {
    const r = run({ 'core/a.ts': "export const a = 1;\nimport { x } from '../pipeline/x';\n" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('core/a.ts:2 core-imports-upper-layer');
  });

  it('exits 0 on a clean tree', () => {
    const r = run({ 'core/a.ts': 'export const a = 1;\n' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Architecture check OK');
  });
});
