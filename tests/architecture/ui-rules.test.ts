import { describe, expect, it } from 'vitest';
import { checkArchitecture, type SourceFileInput } from '../../scripts/architecture/check';
import type { RuleId } from '../../scripts/architecture/rules';

function hits(path: string, text: string, rule: RuleId): number {
  const files: SourceFileInput[] = [{ path, text }];
  return checkArchitecture(files).filter((v) => v.rule === rule).length;
}

function expectPair(
  rule: RuleId,
  path: string,
  bad: string,
  good: string,
  goodPath: string = path,
): void {
  expect(hits(path, bad, rule)).toBeGreaterThan(0);
  expect(hits(goodPath, good, rule)).toBe(0);
}

describe('architecture rules for the UI', () => {
  // Requirements 6.1, 6.5
  it('view-model-import-not-allowed', () => {
    expectPair(
      'view-model-import-not-allowed',
      'view-model/x.ts',
      "import { useState } from 'react';\nexport const a = useState;\n",
      "import type { ScanResult } from '../core';\nimport { b } from './b';\nexport const a = b;\n",
    );
  });

  // Requirements 6.2, 6.5
  it('view-model-forbidden-api', () => {
    expectPair(
      'view-model-forbidden-api',
      'view-model/x.ts',
      'export const t = Date.now();\n',
      'export const t = (now: number) => now + 1;\n',
    );
  });

  // Requirement 6.8
  it('view-model-uses-core-merge', () => {
    expectPair(
      'view-model-uses-core-merge',
      'view-model/package-rows.ts',
      "export const rows = STATUS_RANK;\n",
      "import { uniquePackages } from '../core';\nexport const rows = uniquePackages;\n",
    );
  });

  // Requirement 21.1
  it('no-inner-html', () => {
    expectPair(
      'no-inner-html',
      'components/a.tsx',
      "export const A = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\n",
      'export const A = () => <div>x</div>;\n',
    );
  });

  // Requirement 15.2
  it('no-literal-colour', () => {
    expectPair(
      'no-literal-colour',
      'components/a.tsx',
      "export const A = () => <div style={{ color: '#ff0000' }} />;\n",
      "export const A = () => <div style={{ color: 'var(--ink)' }} />;\n",
    );
  });

  // Requirement 2.5
  it('no-fixture-import', () => {
    expectPair(
      'no-fixture-import',
      'app/x.tsx',
      "import { f } from '../tests/fixtures/scan';\nexport const a = f;\n",
      "import { b } from '../view-model/b';\nexport const a = b;\n",
    );
  });

  // Requirement 6.5
  it('components-import-pipeline-runtime', () => {
    expectPair(
      'components-import-pipeline-runtime',
      'components/a.tsx',
      "import { x } from '../pipeline/constants';\nexport const a = x;\n",
      "import type { x } from '../pipeline/constants';\nexport type A = typeof x;\n",
    );
  });
});
