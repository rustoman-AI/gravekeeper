import { describe, expect, it } from 'vitest';
import type { ManifestFormat, Scope } from '../../../core';
import { buildCommandBlocks } from '../../../view-model/resurrect-commands';
import type { ManifestOrigin, ResurrectSegment } from '../../../view-model/types';

function origin(
  format: ManifestFormat,
  path: string,
  tool: ManifestOrigin['pyprojectTool'] = null,
): ManifestOrigin {
  return { path, format, pyprojectTool: tool };
}
function build(origins: ManifestOrigin[], scopes: Scope[], from: string, to: string) {
  return buildCommandBlocks({ origins, scopes, from, to });
}
function leadText(lead: readonly ResurrectSegment[] | null): string | null {
  return lead === null ? null : lead.map((s) => s.text).join('');
}

describe('resurrect Command_Builder (Requirements 10.2 to 10.10)', () => {
  it('builds the npm lines for a runtime package', () => {
    const [block, ...rest] = build([origin('package.json', 'package.json')], ['runtime'], 'request', 'got');
    expect(rest).toEqual([]);
    expect(block).toEqual({
      heading: null,
      lead: null,
      lines: ['npm uninstall request', 'npm install got'],
      note: null,
      copyLabel: 'Copy commands for got',
      copyText: 'npm uninstall request\nnpm install got',
      copyName: 'got',
    });
  });

  it('adds the npm flags for dev, optional and peer', () => {
    const o = [origin('package.json', 'package.json')];
    expect(build(o, ['dev'], 'request', 'got')[0]?.lines[1]).toBe('npm install --save-dev got');
    expect(build(o, ['optional'], 'request', 'got')[0]?.lines[1]).toBe('npm install --save-optional got');
    expect(build(o, ['peer'], 'request', 'got')[0]?.lines[1]).toBe('npm install --save-peer got');
  });

  it('builds the requirements.txt lead sentence with the path and the pip line', () => {
    const [block] = build([origin('requirements.txt', 'api/requirements.txt')], ['runtime'], 'pycrypto', 'pycryptodome');
    expect(leadText(block?.lead ?? null)).toBe(
      'Replace the line for pycrypto in api/requirements.txt with pycryptodome, then run:',
    );
    expect(block?.lead?.filter((s) => s.kind === 'code').map((s) => s.text)).toEqual([
      'pycrypto',
      'api/requirements.txt',
      'pycryptodome',
    ]);
    expect(block?.lines).toEqual(['pip install pycryptodome']);
    expect(block?.note).toBeNull();
  });

  it('builds the poetry lines with the --group note and no scope flag', () => {
    const [block] = build([origin('pyproject.toml', 'pyproject.toml', 'poetry')], ['dev'], 'nose', 'pytest');
    expect(block?.lines).toEqual(['poetry remove nose', 'poetry add pytest']);
    expect(block?.note).toBe(
      'Add --group <group> to the poetry add line if the old package was in a dependency group.',
    );
    expect(block?.lead).toBeNull();
  });

  it('builds the PEP 621 lead sentence and the pip line', () => {
    const [block] = build([origin('pyproject.toml', 'pyproject.toml', 'pep621')], ['runtime'], 'nose', 'pytest');
    expect(leadText(block?.lead ?? null)).toBe(
      'Replace the entry for nose in the dependencies of pyproject.toml with pytest, then run:',
    );
    expect(block?.lines).toEqual(['pip install pytest']);
  });

  it('builds the cargo lines with --dev, --build and --optional', () => {
    const o = [origin('Cargo.toml', 'Cargo.toml')];
    expect(build(o, ['runtime'], 'bincode', 'wincode')[0]?.lines).toEqual([
      'cargo remove bincode',
      'cargo add wincode',
    ]);
    expect(build(o, ['dev'], 'bincode', 'wincode')[0]?.lines[1]).toBe('cargo add --dev wincode');
    expect(build(o, ['build'], 'bincode', 'wincode')[0]?.lines[1]).toBe('cargo add --build wincode');
    expect(build(o, ['optional'], 'bincode', 'wincode')[0]?.lines[1]).toBe('cargo add --optional wincode');
  });

  it.each([['mixed' as const], [null]])('shows the Poetry and the PEP 621 block for tool %s', (tool) => {
    const blocks = build([origin('pyproject.toml', 'pyproject.toml', tool)], ['runtime'], 'nose', 'pytest');
    expect(blocks.map((b) => b.heading)).toEqual([
      'If this project uses Poetry',
      'If this project uses another tool (PEP 621)',
    ]);
    expect(blocks[0]?.lines).toEqual(['poetry remove nose', 'poetry add pytest']);
    expect(blocks[1]?.lines).toEqual(['pip install pytest']);
  });

  it('gives one block per distinct scope, with the manifest path as heading', () => {
    const blocks = build([origin('package.json', 'package.json')], ['runtime', 'dev'], 'request', 'got');
    expect(blocks.map((b) => b.lines[1])).toEqual(['npm install got', 'npm install --save-dev got']);
    expect(blocks.map((b) => b.heading)).toEqual(['package.json', 'package.json']);
  });

  it('gives one block per origin with the path as heading and drops identical blocks', () => {
    const blocks = build(
      [origin('package.json', 'a/package.json'), origin('package.json', 'b/package.json')],
      ['runtime'],
      'request',
      'got',
    );
    expect(blocks.map((b) => b.heading)).toEqual(['a/package.json', 'b/package.json']);
    const pip = build([origin('requirements.txt', 'requirements.txt')], ['runtime', 'dev'], 'a', 'b');
    expect(pip).toHaveLength(1);
    expect(pip[0]?.heading).toBeNull();
  });

  it.each([
    ['-rf', 'npm'],
    ['a;b', 'npm'],
    ['~x', 'npm'],
    ['$(x)', 'npm'],
  ])('builds no block for the hostile name %s', (bad) => {
    const origins = [
      origin('package.json', 'package.json'),
      origin('requirements.txt', 'requirements.txt'),
      origin('pyproject.toml', 'pyproject.toml', 'poetry'),
      origin('Cargo.toml', 'Cargo.toml'),
    ];
    expect(build(origins, ['runtime'], bad, 'got')).toEqual([]);
    expect(build(origins, ['runtime'], 'request', bad)).toEqual([]);
  });
});
