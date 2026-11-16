import { afterAll, describe, expect, it } from 'vitest';
import {
  checkPackageJson,
  checkSource,
  TOML_WRAPPER_PATH,
  type ViolationRule,
} from '../../scripts/core-purity/check';
import { CORE_ALLOWED_PACKAGES } from '../../core/model/constants';

const options = { allowedPackages: CORE_ALLOWED_PACKAGES };
const FILE = 'core/a.ts';

type Found = { rule: ViolationRule; line: number; column: number };

function run(text: string, file: string = FILE): Found[] {
  return checkSource(file, text, options).map(({ rule, line, column }) => ({ rule, line, column }));
}

describe('checkSource: banned constructs (rule, line, column)', () => {
  const cases: Array<[string, string, Found[]]> = [
    ['fetch call', `fetch('x');`, [{ rule: 'forbidden-global', line: 1, column: 1 }]],
    ['globalThis.fetch', `globalThis.fetch('x');`, [{ rule: 'forbidden-global', line: 1, column: 1 }]],
    ['window.fetch', `window.fetch('x');`, [{ rule: 'forbidden-global', line: 1, column: 1 }]],
    [
      'XMLHttpRequest',
      `const x = new XMLHttpRequest();`,
      [{ rule: 'forbidden-global', line: 1, column: 15 }],
    ],
    ['Date.now', `const t = Date.now();`, [{ rule: 'nondeterministic-call', line: 1, column: 11 }]],
    ['Date["now"]', `const t = Date["now"]();`, [{ rule: 'nondeterministic-call', line: 1, column: 11 }]],
    ['new Date()', `const t = new Date();`, [{ rule: 'nondeterministic-call', line: 1, column: 11 }]],
    ['Date()', `const t = Date();`, [{ rule: 'nondeterministic-call', line: 1, column: 11 }]],
    ['Math.random', `const r = Math.random();`, [{ rule: 'nondeterministic-call', line: 1, column: 11 }]],
    ['Math["random"]', `const r = Math["random"]();`, [{ rule: 'nondeterministic-call', line: 1, column: 11 }]],
    ['import()', `const m = import('fs');`, [{ rule: 'import-not-allowed', line: 1, column: 18 }]],
    ['require()', `const m = require('fs');`, [{ rule: 'import-not-allowed', line: 1, column: 19 }]],
    [
      'import x = require()',
      `import x = require('fs');`,
      [{ rule: 'import-not-allowed', line: 1, column: 20 }],
    ],
    ['export ... from', `export * from 'fs';`, [{ rule: 'import-not-allowed', line: 1, column: 15 }]],
    [
      'export { } from',
      `export { a } from 'fs';`,
      [{ rule: 'import-not-allowed', line: 1, column: 19 }],
    ],
    ['import ... from', `import fs from 'fs';`, [{ rule: 'import-not-allowed', line: 1, column: 16 }]],
    [
      'later line and indentation',
      `const a = 1;\n\nfunction f() {\n  return Date.now();\n}`,
      [{ rule: 'nondeterministic-call', line: 4, column: 10 }],
    ],
  ];

  it.each(cases)('%s', (_name, text, expected) => {
    expect(run(text)).toEqual(expected);
  });

  it('reports import of /adapters, /app and /components as forbidden-layer-import', () => {
    for (const layer of ['adapters', 'app', 'components']) {
      const found = run(`import x from '../${layer}/x';`);
      expect(found).toContainEqual({ rule: 'forbidden-layer-import', line: 1, column: 15 });
      expect(found).toContainEqual({ rule: 'import-not-allowed', line: 1, column: 15 });
    }
  });

  it('reports the file path in each violation', () => {
    const [v] = checkSource(FILE, `fetch('x');`, options);
    expect(v?.file).toBe(FILE);
    expect(v?.message.length).toBeGreaterThan(0);
  });

  it('does not flag a property named fetch or a dated Date', () => {
    expect(run(`const a = x.fetch('u');`)).toEqual([]);
    expect(run(`const d = new Date(5);`)).toEqual([]);
    expect(run(`const d = new Date('2020-01-01');`)).toEqual([]);
  });
});

describe('checkSource: import allow-list', () => {
  it.each([
    [`import a from 'fs';`],
    [`import a from 'node:fs';`],
    [`import a from 'path';`],
    [`import a from 'lodash';`],
    [`import a from 'smol-toml/x';`],
    [`import a from '@/core/x';`],
    [`import a from '../outside';`],
    [`import a from '../../x';`],
  ])('%s is import-not-allowed', (text) => {
    const found = run(text);
    expect(found.map((f) => f.rule)).toContain('import-not-allowed');
    expect(found.every((f) => f.line === 1 && f.column === 15)).toBe(true);
  });

  it('allows relative imports that stay inside /core', () => {
    expect(run(`import a from './b';`, 'core/a.ts')).toEqual([]);
    expect(run(`import a from '../model/x';`, 'core/parsers/a.ts')).toEqual([]);
    expect(run(`import a from '../internal/x';`, 'core/parsers/a.ts')).toEqual([]);
    expect(run(`export * from './model';`, 'core/index.ts')).toEqual([]);
  });

  it('flags a relative path leaving /core from a nested file', () => {
    const found = run(`import a from '../../scripts/x';`, 'core/parsers/a.ts');
    expect(found.map((f) => f.rule)).toEqual(['import-not-allowed']);
  });

  it('allows smol-toml only in the wrapper module', () => {
    const text = `import { parse } from 'smol-toml';`;
    expect(run(text, TOML_WRAPPER_PATH)).toEqual([]);
    expect(run(text, 'core/parsers/other.ts')).toEqual([
      { rule: 'toml-import-outside-wrapper', line: 1, column: 23 },
    ]);
    expect(run(text, 'core/a.ts').map((f) => f.rule)).toEqual(['toml-import-outside-wrapper']);
  });

  it('recognises the wrapper by absolute and Windows-style paths', () => {
    const text = `import { parse } from 'smol-toml';`;
    expect(run(text, 'C:\\proj\\core\\parsers\\toml-tree.ts')).toEqual([]);
    expect(run(text, '/work/proj/core/parsers/toml-tree.ts')).toEqual([]);
  });

  it('flags require/import of smol-toml outside the wrapper', () => {
    expect(run(`const t = require('smol-toml');`).map((f) => f.rule)).toEqual([
      'toml-import-outside-wrapper',
    ]);
    expect(run(`export * from 'smol-toml';`).map((f) => f.rule)).toEqual([
      'toml-import-outside-wrapper',
    ]);
  });

  it('flags a non-literal module specifier', () => {
    expect(run(`const m = require(name);`).map((f) => f.rule)).toEqual(['import-not-allowed']);
    expect(run(`const m = import(name);`).map((f) => f.rule)).toEqual(['import-not-allowed']);
  });
});

describe('checkSource: comments and strings', () => {
  it('ignores banned words in comments and string literals', () => {
    const text = [
      `// fetch Date.now() Math.random() new Date() require('fs')`,
      `/* XMLHttpRequest import x from 'fs' globalThis.fetch */`,
      `const a = "fetch Date.now() Math.random() XMLHttpRequest";`,
      'const b = `new Date() import("fs") ${1}`;',
      `const c = 'import x from "fs"';`,
      `const d = { fetch: 1, Date: 2 };`,
    ].join('\n');
    expect(run(text)).toEqual([]);
  });

  it('returns no violations for an empty file', () => {
    expect(run('')).toEqual([]);
  });
});

describe('checkPackageJson', () => {
  const pkg = (version: string | null): string =>
    JSON.stringify({ name: 'x', dependencies: version === null ? {} : { 'smol-toml': version } }, null, 2);
  const check = (text: string) => checkPackageJson(text, { ...options, filePath: 'package.json' });

  it.each(['1.2.3', '1.2.3-beta.1', '0.0.1', '10.20.30'])('accepts %s', (version) => {
    expect(check(pkg(version))).toEqual([]);
  });

  it.each([
    '^1.2.3',
    '~1.2.3',
    '1.2',
    '1.x',
    '*',
    '>=1.0.0',
    'latest',
    'npm:smol-toml@1.2.3',
    '',
  ])('rejects %j', (version) => {
    const found = check(pkg(version));
    expect(found).toHaveLength(1);
    expect(found[0]?.rule).toBe('package-not-pinned');
    expect(found[0]?.file).toBe('package.json');
  });

  it('reports a bad entry at the line and column of the entry', () => {
    const text = `{\n  "dependencies": {\n    "smol-toml": "^1.2.3"\n  }\n}`;
    const [v] = check(text);
    expect(v).toMatchObject({ rule: 'package-not-pinned', line: 3, column: 5 });
  });

  it('rejects a missing entry, a missing dependencies block and a non-string value', () => {
    expect(check(pkg(null)).map((v) => v.rule)).toEqual(['package-not-pinned']);
    expect(check(`{ "name": "x" }`).map((v) => v.rule)).toEqual(['package-not-pinned']);
    expect(check(`{ "dependencies": { "smol-toml": 1 } }`).map((v) => v.rule)).toEqual([
      'package-not-pinned',
    ]);
  });

  it('does not accept the package only under devDependencies', () => {
    const text = JSON.stringify({ devDependencies: { 'smol-toml': '1.2.3' } });
    expect(check(text).map((v) => v.rule)).toEqual(['package-not-pinned']);
  });
});

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';

const REPO_ROOT = nodePath.resolve(__dirname, '..', '..');
const TSX_CLI = nodePath.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_SCRIPT = nodePath.join(REPO_ROOT, 'scripts', 'check-core-purity.ts');

function runCli(rootDir?: string) {
  const args = [TSX_CLI, CLI_SCRIPT, ...(rootDir ? [rootDir] : [])];
  const r = spawnSync(process.execPath, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('real tree and CLI', () => {
  const tmpDirs: string[] = [];
  function makeTmp(coreSource: string): string {
    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'purity-'));
    tmpDirs.push(dir);
    fs.mkdirSync(nodePath.join(dir, 'core'));
    fs.writeFileSync(nodePath.join(dir, 'core', 'a.ts'), coreSource);
    fs.writeFileSync(
      nodePath.join(dir, 'package.json'),
      JSON.stringify({ name: 'tmp', dependencies: { 'smol-toml': '1.9.1' } }),
    );
    return dir;
  }
  afterAll(() => {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  });

  it('reports zero violations over the real /core tree and package.json', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = nodePath.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.ts')) files.push(full);
      }
    };
    walk(nodePath.join(REPO_ROOT, 'core'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const rel = nodePath.relative(REPO_ROOT, f).split(nodePath.sep).join('/');
      expect(checkSource(rel, fs.readFileSync(f, 'utf8'), options)).toEqual([]);
    }
    expect(
      checkPackageJson(fs.readFileSync(nodePath.join(REPO_ROOT, 'package.json'), 'utf8'), {
        allowedPackages: CORE_ALLOWED_PACKAGES,
        filePath: 'package.json',
      }),
    ).toEqual([]);
  });

  it('CLI exits 0 on the real repository', () => {
    const r = runCli();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Core purity check OK.');
  });

  it('CLI exits 1 and prints path:line for a violating file', () => {
    const dir = makeTmp(`const a = 1;\nconst t = Date.now();\n`);
    const r = runCli(dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('core/a.ts:2:11 nondeterministic-call');
  });

  it('CLI exits 0 on a clean directory', () => {
    const dir = makeTmp(`export const a = 1;\n`);
    const r = runCli(dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Core purity check OK.');
  });
});
