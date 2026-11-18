import * as fc from 'fast-check';
import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkArchitecture } from '../../scripts/architecture/check';
import type { ImportKind } from '../../scripts/architecture/imports';
import { cfg } from '../support/fc-config';

// Feature: scan-pipeline, Property 66: The architecture checker finds every forbidden import
// Validates: Requirements 22.15

/** The rules about what a file may import (not the API, naming or token rules). */
const IMPORT_RULES = new Set<string>([
  'mapping-import-not-allowed',
  'core-imports-upper-layer',
  'adapters-import-not-allowed',
  'layer-imports-adapters',
  'ports-import-not-allowed',
]);

type Target =
  | { kind: 'dir'; dir: string }
  | { kind: 'file'; path: string }
  | { kind: 'package'; name: string };

interface Layer {
  name: string;
  roots: string[];
  allowed: Target[];
  forbidden: Target[];
}

const dir = (d: string): Target => ({ kind: 'dir', dir: d });
const CONSTANTS: Target = { kind: 'file', path: 'pipeline/constants' };
const PACKAGES: Target[] = ['zod', 'react', '@scope/pkg', 'lodash/get'].map((name) => ({
  kind: 'package',
  name,
}));

// The layer rules of R22.2, R22.4, R22.9, R22.10 and R22.11, written independently of the checker.
const LAYERS: Layer[] = [
  {
    name: 'mapping',
    roots: ['pipeline/mapping'],
    allowed: [dir('core'), dir('pipeline/mapping'), CONSTANTS],
    forbidden: [
      dir('pipeline/http'),
      dir('pipeline/ports'),
      dir('pipeline/internal'),
      dir('pipeline/mapping-extra'),
      dir('pipeline/constants-extra'),
      dir('adapters'),
      dir('app'),
      dir('components'),
      ...PACKAGES,
    ],
  },
  {
    name: 'core',
    roots: ['core'],
    allowed: [dir('core'), ...PACKAGES],
    forbidden: [
      dir('pipeline'),
      dir('pipeline/mapping'),
      CONSTANTS,
      dir('adapters'),
      dir('app'),
      dir('components'),
    ],
  },
  {
    name: 'adapters',
    roots: ['adapters'],
    allowed: [dir('core'), dir('adapters'), dir('pipeline/ports'), CONSTANTS, ...PACKAGES],
    forbidden: [
      dir('pipeline/mapping'),
      dir('pipeline/http'),
      dir('pipeline/internal'),
      dir('pipeline/ports-extra'),
      dir('app'),
      dir('components'),
    ],
  },
  {
    name: 'ports',
    roots: ['pipeline/ports'],
    allowed: [dir('core'), dir('pipeline/ports'), CONSTANTS],
    forbidden: [
      dir('pipeline/mapping'),
      dir('pipeline/http'),
      dir('adapters'),
      dir('app'),
      dir('components'),
      ...PACKAGES,
    ],
  },
  {
    name: 'pipeline',
    roots: ['pipeline/http', 'pipeline/internal', 'pipeline/orchestrator'],
    allowed: [
      dir('core'),
      dir('pipeline/mapping'),
      dir('pipeline/ports'),
      dir('pipeline/http'),
      CONSTANTS,
      ...PACKAGES,
    ],
    forbidden: [dir('adapters')],
  },
  {
    name: 'app',
    roots: ['app'],
    allowed: [dir('core'), dir('pipeline'), dir('components'), dir('app'), ...PACKAGES],
    forbidden: [dir('adapters')],
  },
  {
    name: 'components',
    roots: ['components'],
    allowed: [dir('core'), dir('pipeline'), dir('components'), dir('app'), ...PACKAGES],
    forbidden: [dir('adapters')],
  },
];

const SCAN_ROUTE = 'app/api/scan/route.ts';

const arbSegment = fc.stringMatching(/^[a-z][a-z0-9]{0,5}(-[a-z0-9]{1,4})?$/);
const arbSubPath = fc.array(arbSegment, { minLength: 0, maxLength: 2 });

const arbFilePath = (layer: Layer): fc.Arbitrary<string> =>
  fc
    .record({
      root: fc.constantFrom(...layer.roots),
      sub: arbSubPath,
      name: arbSegment,
      ext: fc.constantFrom('ts', 'tsx'),
    })
    .map(({ root, sub, name, ext }) => [root, ...sub, `${name}.${ext}`].join('/'))
    .filter((p) => p !== SCAN_ROUTE);

const arbTarget = (targets: Target[]): fc.Arbitrary<Target> => fc.constantFrom(...targets);

/** The project-root-relative path a target dir or file stands for. */
const arbTargetPath = (target: Target): fc.Arbitrary<string | null> => {
  if (target.kind === 'package') return fc.constant(null);
  if (target.kind === 'file') return fc.constant(target.path);
  return fc.tuple(arbSubPath, arbSegment).map(([sub, name]) => [target.dir, ...sub, name].join('/'));
};

const KINDS: ImportKind[] = [
  'import',
  'import-type',
  'export-from',
  'import-equals-require',
  'import-type-expression',
  'dynamic-import',
  'require-call',
];

function statement(kind: ImportKind, specifier: string): string {
  const s = JSON.stringify(specifier);
  switch (kind) {
    case 'import':
      return `import { a } from ${s};`;
    case 'import-type':
      return `import type { a } from ${s};`;
    case 'export-from':
      return `export { a } from ${s};`;
    case 'import-equals-require':
      return `import a = require(${s});`;
    case 'import-type-expression':
      return `export type T = import(${s}).X;`;
    case 'dynamic-import':
      return `export const m = import(${s});`;
    case 'require-call':
      return `export const m = require(${s});`;
  }
}

type SpecifierForm = 'minimal-relative' | 'root-relative' | 'alias' | 'detour-relative';

/** Builds the specifier for a target from the importing file, with a given form and extra `../` depth. */
function makeSpecifier(
  from: string,
  target: Target,
  targetPath: string | null,
  form: SpecifierForm,
  extraUps: number,
): string {
  if (target.kind === 'package') {
    return target.name;
  }
  const path = targetPath as string;
  const fromDir = posix.dirname(from);
  const depth = fromDir.split('/').length;
  switch (form) {
    case 'alias':
      return `@/${path}`;
    case 'root-relative':
      return `${'../'.repeat(depth)}${path}`;
    case 'detour-relative': {
      // Go up `depth` levels, then down into a directory and back up `extraUps` times.
      const detour = Array.from({ length: extraUps }, () => 'zz/..').join('/');
      return `${'../'.repeat(depth)}${detour ? `${detour}/` : ''}${path}`;
    }
    case 'minimal-relative': {
      const rel = posix.relative(fromDir, path);
      return rel.startsWith('.') ? rel : `./${rel}`;
    }
  }
}

interface Case {
  layer: Layer;
  file: string;
  target: Target;
  specifier: string;
  kind: ImportKind;
  padding: number;
}

const arbCase = (allowed: boolean): fc.Arbitrary<Case> =>
  fc
    .constantFrom(...LAYERS)
    .chain((layer) =>
      fc
        .tuple(
          arbFilePath(layer),
          arbTarget(allowed ? layer.allowed : layer.forbidden).chain((target) =>
            arbTargetPath(target).map((p) => ({ target, p })),
          ),
          fc.constantFrom<SpecifierForm>('minimal-relative', 'root-relative', 'alias', 'detour-relative'),
          fc.integer({ min: 0, max: 3 }),
          fc.constantFrom(...KINDS),
          fc.integer({ min: 0, max: 5 }),
        )
        .map(([file, { target, p }, form, extraUps, kind, padding]) => ({
          layer,
          file,
          target,
          specifier: makeSpecifier(file, target, p, form, extraUps),
          kind,
          padding,
        })),
    );

function render(c: Case): { text: string; line: number } {
  const pad = Array.from({ length: c.padding }, (_, i) => `// pad ${i}`);
  return { text: [...pad, statement(c.kind, c.specifier)].join('\n') + '\n', line: c.padding + 1 };
}

describe('P66 architecture checker finds every forbidden import', () => {
  it('P66 reports a violation on the import line when the target is forbidden', () => {
    fc.assert(
      fc.property(arbCase(false), (c) => {
        const { text, line } = render(c);
        const input = [{ path: c.file, text }];
        const hits = checkArchitecture(input).filter(
          (v) => v.line === line && v.file === c.file && IMPORT_RULES.has(v.rule),
        );
        expect(hits.length, `${c.file}: ${text}`).toBeGreaterThanOrEqual(1);
        expect(checkArchitecture(input)).toEqual(checkArchitecture(input));
      }),
      cfg(),
    );
  });

  it('P66 reports no import violation when the target is allowed', () => {
    fc.assert(
      fc.property(arbCase(true), (c) => {
        const { text } = render(c);
        const input = [{ path: c.file, text }];
        const first = checkArchitecture(input);
        expect(first.filter((v) => IMPORT_RULES.has(v.rule) || v.rule === 'non-literal-specifier'))
          .toEqual([]);
        expect(checkArchitecture(input)).toEqual(first);
      }),
      cfg(),
    );
  });
});
