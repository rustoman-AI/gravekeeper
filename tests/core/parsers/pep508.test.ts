import { describe, expect, it } from 'vitest';
import { parsePep508 } from '../../../core/parsers/pep508';

describe('parsePep508', () => {
  it('reads a registry specifier (3.4)', () => {
    expect(parsePep508('requests>=2,<3')).toEqual({
      kind: 'ok',
      rawName: 'requests',
      versionSpec: '>=2,<3',
      sourceKind: 'registry',
    });
  });

  it('skips extras and cuts the environment marker (3.4, 3.5)', () => {
    expect(parsePep508('Requests[socks] >= 2 ; python_version >= "3.8"')).toEqual({
      kind: 'ok',
      rawName: 'Requests',
      versionSpec: '>= 2',
      sourceKind: 'registry',
    });
  });

  it('gives * for an empty rest (3.5)', () => {
    expect(parsePep508('requests')).toEqual({ kind: 'ok', rawName: 'requests', versionSpec: '*', sourceKind: 'registry' });
    expect(parsePep508('requests ; python_version >= "3.8"')).toEqual({
      kind: 'ok',
      rawName: 'requests',
      versionSpec: '*',
      sourceKind: 'registry',
    });
  });

  it('reads a git direct reference and keeps the # (3.4, 3.8)', () => {
    expect(parsePep508('pkg @ git+https://example.org/p.git#egg=pkg')).toEqual({
      kind: 'ok',
      rawName: 'pkg',
      versionSpec: 'git+https://example.org/p.git#egg=pkg',
      sourceKind: 'git',
    });
  });

  it('reads a path direct reference (3.4)', () => {
    expect(parsePep508('pkg @ ./local')).toEqual({ kind: 'ok', rawName: 'pkg', versionSpec: './local', sourceKind: 'path' });
  });

  it('cannot parse an https URL reference (3.6)', () => {
    expect(parsePep508('pkg @ https://example.org/p.whl')).toEqual({ kind: 'cannot-parse' });
  });

  it('cannot parse a bare git reference without a name (3.8)', () => {
    expect(parsePep508('git+https://x#egg=y')).toEqual({ kind: 'cannot-parse' });
  });

  it('reports a backslash (3.6)', () => {
    expect(parsePep508('requests>=2\\3')).toEqual({ kind: 'backslash' });
    expect(parsePep508('pkg @ ./a\\b')).toEqual({ kind: 'backslash' });
  });

  it('cannot parse a name with a leading dot (3.4)', () => {
    expect(parsePep508('.hidden>=1')).toEqual({ kind: 'cannot-parse' });
  });

  it('cannot parse an empty string (3.6)', () => {
    expect(parsePep508('')).toEqual({ kind: 'cannot-parse' });
    expect(parsePep508('   ')).toEqual({ kind: 'cannot-parse' });
  });

  it('does not throw and stays fast on a 10000-character input', () => {
    const inputs = [
      'a'.repeat(10000),
      'a>=' + '1'.repeat(10000),
      'a[' + 'x'.repeat(10000),
      'a @ ' + ' '.repeat(10000) + ';',
      'a' + ' '.repeat(10000) + '!',
    ];
    for (const input of inputs) {
      const start = performance.now();
      expect(() => parsePep508(input)).not.toThrow();
      expect(performance.now() - start).toBeLessThan(200);
    }
  });
});
