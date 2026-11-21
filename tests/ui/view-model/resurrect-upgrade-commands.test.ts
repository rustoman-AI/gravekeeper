import { describe, expect, it } from 'vitest';
import type { ManifestFormat, Scope } from '../../../core';
import { buildUpgradeBlocks } from '../../../view-model/resurrect-commands';
import type { ManifestOrigin, ResurrectSegment } from '../../../view-model/types';

// Validates: Requirements 6.3 to 6.11 (resurrect-upgrade)
function origin(
  format: ManifestFormat,
  path: string,
  tool: ManifestOrigin['pyprojectTool'] = null,
): ManifestOrigin {
  return { path, format, pyprojectTool: tool };
}
function build(origins: ManifestOrigin[], scopes: Scope[], name: string, version: string) {
  return buildUpgradeBlocks({ origins, scopes, name, version });
}
function leadText(lead: readonly ResurrectSegment[] | null): string | null {
  return lead === null ? null : lead.map((s) => s.text).join('');
}

describe('buildUpgradeBlocks (resurrect-upgrade Requirements 6.3 to 6.11)', () => {
  it('builds the npm line and the block fields', () => {
    const blocks = build([origin('package.json', 'package.json')], ['runtime'], 'uuid', '11.1.0');
    expect(blocks).toEqual([
      {
        heading: null,
        lead: null,
        lines: ['npm install uuid@11.1.0'],
        note: null,
        copyLabel: 'Copy commands to upgrade uuid',
        copyText: 'npm install uuid@11.1.0',
        copyName: 'uuid',
      },
    ]);
  });

  it.each([
    ['dev', 'npm install --save-dev uuid@11.1.0'],
    ['optional', 'npm install --save-optional uuid@11.1.0'],
    ['peer', 'npm install --save-peer uuid@11.1.0'],
  ] as const)('adds the npm flag for scope %s', (scope, line) => {
    expect(build([origin('package.json', 'package.json')], [scope], 'uuid', '11.1.0')[0]?.lines).toEqual([line]);
  });

  it.each([
    ['runtime', 'cargo add serde@1.0.200'],
    ['dev', 'cargo add --dev serde@1.0.200'],
    ['build', 'cargo add --build serde@1.0.200'],
    ['optional', 'cargo add --optional serde@1.0.200'],
  ] as const)('builds the cargo line for scope %s', (scope, line) => {
    expect(build([origin('Cargo.toml', 'Cargo.toml')], [scope], 'serde', '1.0.200')[0]?.lines).toEqual([line]);
  });

  it('builds the requirements.txt sentence and the quoted pip line', () => {
    const [block] = build([origin('requirements.txt', 'requirements.txt')], ['runtime'], 'requests', '2.31.0');
    expect(leadText(block?.lead ?? null)).toBe(
      'Change the line for requests in requirements.txt to requests==2.31.0, then run:',
    );
    expect(block?.lines).toEqual(['pip install "requests==2.31.0"']);
    expect(block?.note).toBeNull();
  });

  it('builds the poetry line with the group note', () => {
    const [block] = build([origin('pyproject.toml', 'pyproject.toml', 'poetry')], ['runtime'], 'requests', '2.31.0');
    expect(block?.lead).toBeNull();
    expect(block?.lines).toEqual(['poetry add requests@2.31.0']);
    expect(block?.note).toBe(
      'Add --group <group> to the poetry add line if the old package was in a dependency group.',
    );
  });

  it('builds the PEP 621 sentence and the quoted >= pip line', () => {
    const [block] = build([origin('pyproject.toml', 'pyproject.toml', 'pep621')], ['runtime'], 'requests', '2.31.0');
    expect(leadText(block?.lead ?? null)).toBe(
      'Change the entry for requests in the dependencies of pyproject.toml to requests>=2.31.0, then run:',
    );
    expect(block?.lines).toEqual(['pip install "requests>=2.31.0"']);
  });

  it.each([['mixed' as const], [null]])('gives the Poetry and PEP 621 blocks for tool %s', (tool) => {
    const blocks = build([origin('pyproject.toml', 'pyproject.toml', tool)], ['runtime'], 'requests', '2.31.0');
    expect(blocks.map((b) => b.heading)).toEqual([
      'If this project uses Poetry',
      'If this project uses another tool (PEP 621)',
    ]);
    expect(blocks.map((b) => b.lines)).toEqual([
      ['poetry add requests@2.31.0'],
      ['pip install "requests>=2.31.0"'],
    ]);
  });

  it('gives one block per manifest with the path as heading', () => {
    const blocks = build(
      [origin('package.json', 'a/package.json'), origin('package.json', 'b/package.json')],
      ['runtime'],
      'uuid',
      '11.1.0',
    );
    expect(blocks.map((b) => b.heading)).toEqual(['a/package.json', 'b/package.json']);
  });

  it('gives one block per distinct scope and treats no scope as runtime', () => {
    const o = [origin('package.json', 'package.json')];
    expect(build(o, ['runtime', 'dev'], 'uuid', '11.1.0').map((b) => b.lines[0])).toEqual([
      'npm install uuid@11.1.0',
      'npm install --save-dev uuid@11.1.0',
    ]);
    expect(build(o, [], 'uuid', '11.1.0')[0]?.lines).toEqual(['npm install uuid@11.1.0']);
  });

  it('builds no block for an unsafe name or a non-strict version', () => {
    const origins = [
      origin('package.json', 'package.json'),
      origin('requirements.txt', 'requirements.txt'),
      origin('pyproject.toml', 'pyproject.toml', 'poetry'),
      origin('Cargo.toml', 'Cargo.toml'),
    ];
    expect(build(origins, ['runtime'], 'a;b', '1.2.3')).toEqual([]);
    expect(build(origins, ['runtime'], '-rf', '1.2.3')).toEqual([]);
    expect(build(origins, ['runtime'], 'uuid', '1.2.3;rm')).toEqual([]);
    expect(build(origins, ['runtime'], 'uuid', '1.2.3+build')).toEqual([]);
    // `1.2` is a valid PyPI release but not a semantic version.
    expect(build([origins[0]!, origins[3]!], ['runtime'], 'uuid', '1.2')).toEqual([]);
  });

  it('builds a block only for the origins whose ecosystem accepts the version', () => {
    // `1.0rc1` is a Strict_Version for PyPI but not for npm or cargo.
    const blocks = build(
      [origin('package.json', 'package.json'), origin('requirements.txt', 'requirements.txt')],
      ['runtime'],
      'foo',
      '1.0rc1',
    );
    expect(blocks.map((b) => b.lines)).toEqual([['pip install "foo==1.0rc1"']]);
  });
});
