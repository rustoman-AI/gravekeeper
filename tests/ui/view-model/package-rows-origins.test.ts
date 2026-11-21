import { describe, expect, it } from 'vitest';
import { buildPackageRows } from '../../../view-model/package-rows';
import type { ParsedScanResult } from '../../../view-model/types';
import { buildScanResult } from '../../support/ui/scan-result-builder';

// Resurrect R5.7, R10.8.
const parsed = (value: unknown): ParsedScanResult => value as ParsedScanResult;

describe('buildPackageRows manifest origins and hints (R5.7, R10.8)', () => {
  it('gives one origin for a package declared in package.json, with a null tool', () => {
    const result = buildScanResult([{ name: 'request', kind: 'alive' }]);
    const [row] = buildPackageRows(parsed(result));
    expect(row!.manifestOrigins).toEqual([
      { path: 'package.json', format: 'package.json', pyprojectTool: null },
    ]);
    expect(row!.hints).toEqual([]);
  });

  it('gives two origins in path order with the tool on the second only', () => {
    const base = buildScanResult(
      [
        { name: 'requests', kind: 'alive', ecosystem: 'pypi', manifestPath: 'requirements.txt' },
        { name: 'requests', kind: 'alive', ecosystem: 'pypi', manifestPath: 'sub/pyproject.toml' },
      ],
      { manifestPaths: ['requirements.txt', 'sub/pyproject.toml'] },
    );
    const result = {
      ...base,
      manifests: [
        { path: 'requirements.txt', format: 'requirements.txt', warnings: [] },
        { path: 'sub/pyproject.toml', format: 'pyproject.toml', pyprojectTool: 'poetry', warnings: [] },
      ],
    };
    const rows = buildPackageRows(parsed(result));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.manifestOrigins).toEqual([
      { path: 'requirements.txt', format: 'requirements.txt', pyprojectTool: null },
      { path: 'sub/pyproject.toml', format: 'pyproject.toml', pyprojectTool: 'poetry' },
    ]);
  });

  it('gives a null tool for a pyproject.toml result without pyprojectTool', () => {
    const base = buildScanResult([
      { name: 'requests', kind: 'alive', ecosystem: 'pypi', manifestPath: 'pyproject.toml' },
    ]);
    const result = {
      ...base,
      manifests: [{ path: 'pyproject.toml', format: 'pyproject.toml', warnings: [] }],
    };
    const [row] = buildPackageRows(parsed(result));
    expect(row!.manifestOrigins).toEqual([
      { path: 'pyproject.toml', format: 'pyproject.toml', pyprojectTool: null },
    ]);
  });

  it('takes hints from the first entry in manifest order that has hints', () => {
    const base = buildScanResult(
      [
        { name: 'request', kind: 'alive', manifestPath: 'a/package.json' },
        { name: 'request', kind: 'alive', manifestPath: 'b/package.json' },
      ],
      { manifestPaths: ['a/package.json', 'b/package.json'] },
    );
    const hint = { kind: 'deprecation-notice', text: 'moved', sourceUrl: null, link: null };
    const result = {
      ...base,
      dependencies: base.dependencies.map((d, i) => ({ ...d, hints: i === 1 ? [hint] : [] })),
    };
    const [row] = buildPackageRows(parsed(result));
    expect(row!.hints).toEqual([hint]);
  });
});
