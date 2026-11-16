import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import type { Dependency } from '../../../core';

function parse(text: string) {
  return parseManifest(text, 'requirements.txt');
}

function dep(name: string, over: Partial<Dependency> = {}): Dependency {
  return { name, rawName: name, ecosystem: 'pypi', versionSpec: '*', scope: 'runtime', sourceKind: 'registry', ...over };
}

describe('requirements.txt parser', () => {
  it('2.1 returns one pypi runtime Dependency per requirement line', () => {
    const r = parse('requests==2.0\nflask>=1\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([
      dep('flask', { versionSpec: '>=1' }),
      dep('requests', { versionSpec: '==2.0' }),
    ]);
  });

  it('2.2 accepts Django, PyYAML and SQLAlchemy with rawName as written and a normalized name', () => {
    const r = parse('Django\nPyYAML\nSQLAlchemy\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([
      dep('django', { rawName: 'Django' }),
      dep('pyyaml', { rawName: 'PyYAML' }),
      dep('sqlalchemy', { rawName: 'SQLAlchemy' }),
    ]);
  });

  it('2.3 keeps the specifier text, trims whitespace and uses * when absent', () => {
    const r = parse('a  >=2.0,<3  \nb\nc==1 ; python_version < "3"\nd >=1;os_name=="nt"\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies.map((d) => [d.name, d.versionSpec])).toEqual([
      ['a', '>=2.0,<3'],
      ['b', '*'],
      ['c', '==1'],
      ['d', '>=1'],
    ]);
  });

  it('2.3 accepts the === operator and an explicit *', () => {
    const r = parse('foo ===1\nbar *\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([dep('bar'), dep('foo', { versionSpec: '===1' })]);
  });

  it('2.4 excludes extras from name and versionSpec', () => {
    const r = parse('requests[security,socks]>=2\nfoo [bar] ==1\nbaz[x]\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies.map((d) => [d.name, d.versionSpec])).toEqual([
      ['baz', '*'],
      ['foo', '==1'],
      ['requests', '>=2'],
    ]);
  });

  it('2.5 ignores # at line start or after whitespace, keeps # inside a URL fragment', () => {
    const r = parse('# comment\nfoo==1 # trailing\nbar==2\t#tab\n-e git+https://h/r.git#egg=baz\nqux @ git+https://h/r.git#frag\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([
      dep('bar', { versionSpec: '==2' }),
      dep('foo', { versionSpec: '==1' }),
      dep('qux', { versionSpec: 'git+https://h/r.git#frag', sourceKind: 'git' }),
    ]);
  });

  it('2.5 keeps # in a bare git URL egg fragment', () => {
    const r = parse('git+https://h/r.git#egg=Baz_Pkg\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([
      dep('baz-pkg', { rawName: 'Baz_Pkg', versionSpec: 'git+https://h/r.git#egg=Baz_Pkg', sourceKind: 'git' }),
    ]);
  });

  it('2.6 joins continuation lines and counts them as one line', () => {
    const r = parse('foo>=1,\\\n  <3\\\n,!=2\nbar @ nope\n');
    expect(r.dependencies).toEqual([dep('foo', { versionSpec: '>=1,  <3,!=2' })]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('line 4');
  });

  it('2.6 handles CRLF line endings', () => {
    const r = parse('foo==1\r\nbar==2\\\r\n.0\r\nbaz\r\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([
      dep('bar', { versionSpec: '==2.0' }),
      dep('baz'),
      dep('foo', { versionSpec: '==1' }),
    ]);
  });

  it('2.7 skips blank, whitespace-only and option lines silently', () => {
    const r = parse('\n   \n-r other.txt\n  -e .\n--index-url https://x\n\t--hash=abc\nfoo\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([dep('foo')]);
  });

  it('2.8 rejects an unparsable name with one warning carrying the line number', () => {
    const r = parse('ok\n_bad==1\n');
    expect(r.dependencies).toEqual([dep('ok')]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('line 2');
  });

  it('2.8 rejects `foo 1.0` (no comparison operator)', () => {
    const r = parse('a\nfoo 1.0\n');
    expect(r.dependencies).toEqual([dep('a')]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('line 2');
  });

  it('2.8 rejects `foo @ https://x` (neither VCS nor path)', () => {
    const r = parse('\nfoo @ https://x\n');
    expect(r.dependencies).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('line 2');
  });

  it('2.8 rejects a bare ./pkg without #egg and a bare git URL without #egg', () => {
    const r = parse('./pkg\ngit+https://h/r.git\n');
    expect(r.dependencies).toEqual([]);
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0]).toContain('line 1');
    expect(r.warnings[1]).toContain('line 2');
  });

  it('2.8 uses the first line of a joined group in the warning', () => {
    const r = parse('a\nfoo\\\n 1.0\nb\n');
    expect(r.dependencies.map((d) => d.name)).toEqual(['a', 'b']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('line 2');
  });

  it('2.8 an unclosed extras list is rejected', () => {
    const r = parse('foo[bar==1\n');
    expect(r.dependencies).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('line 1');
  });

  it('2.9 parses a final line without its trailing backslash', () => {
    const r = parse('foo==1\\');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([dep('foo', { versionSpec: '==1' })]);
  });

  it('2.10 git direct reference: name or egg, normalized name, versionSpec exactly as written', () => {
    const r = parse('Foo_Pkg @ git+https://h/r.git@v1 ; python_version>"3"\ngit+ssh://h/r.git#egg=Bar.Pkg\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([
      dep('bar-pkg', { rawName: 'Bar.Pkg', versionSpec: 'git+ssh://h/r.git#egg=Bar.Pkg', sourceKind: 'git' }),
      dep('foo-pkg', { rawName: 'Foo_Pkg', versionSpec: 'git+https://h/r.git@v1', sourceKind: 'git' }),
    ]);
  });

  it('2.11 path direct reference: file:, ./, ../ and / targets, and bare paths with #egg', () => {
    const r = parse('a @ file:///x\nb @ ./b\nc @ ../c\nd @ /d\n./e#egg=E_Pkg\n../f#egg=f\n/g#egg=g\nfile:h#egg=h\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies.map((d) => [d.name, d.rawName, d.versionSpec, d.sourceKind])).toEqual([
      ['a', 'a', 'file:///x', 'path'],
      ['b', 'b', './b', 'path'],
      ['c', 'c', '../c', 'path'],
      ['d', 'd', '/d', 'path'],
      ['e-pkg', 'E_Pkg', './e#egg=E_Pkg', 'path'],
      ['f', 'f', '../f#egg=f', 'path'],
      ['g', 'g', '/g#egg=g', 'path'],
      ['h', 'h', 'file:h#egg=h', 'path'],
    ]);
  });

  it('2.12 plain requirements have sourceKind registry', () => {
    const r = parse('foo==1\nbar\n');
    expect(r.dependencies.every((d) => d.sourceKind === 'registry')).toBe(true);
  });

  describe('2.13 backslash left in the versionSpec', () => {
    it('skips a registry spec with a backslash, with the first line of the group', () => {
      const r = parse('a\nfoo==1\\\nx\\y\nb\n');
      expect(r.dependencies.map((d) => d.name)).toEqual(['a', 'b']);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain('line 2');
    });

    it('skips a registry spec with a backslash inside one physical line', () => {
      const r = parse('foo==1\\2\n');
      expect(r.dependencies).toEqual([]);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain('line 1');
    });

    it('skips a git reference with a backslash', () => {
      const r = parse('a\nfoo @ git+https://h\\r.git\n');
      expect(r.dependencies).toEqual([dep('a')]);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain('line 2');
    });

    it('skips a path reference with a backslash', () => {
      const r = parse('a\n\nfoo @ ./pkg\\sub\n');
      expect(r.dependencies).toEqual([dep('a')]);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain('line 3');
    });

    it('skips a bare path with #egg and a backslash', () => {
      const r = parse('./pkg\\sub#egg=foo\n');
      expect(r.dependencies).toEqual([]);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain('line 1');
    });
  });

  describe('4.6 repeated names', () => {
    it('Foo_Bar then foo.bar keeps the first spelling and warns once', () => {
      const r = parse('a\nb\nFoo_Bar==1\nc\nd\ne\nf\ng\nfoo.bar==2\n');
      const kept = r.dependencies.filter((d) => d.name === 'foo-bar');
      expect(kept).toEqual([dep('foo-bar', { rawName: 'Foo_Bar', versionSpec: '==1' })]);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain('foo-bar');
      expect(r.warnings[0]).toContain('line 9');
    });

    it('foo.bar then Foo_Bar keeps foo.bar and warns once', () => {
      const r = parse('foo.bar==1\nFoo_Bar==2\n');
      expect(r.dependencies).toEqual([dep('foo-bar', { rawName: 'foo.bar', versionSpec: '==1' })]);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain('foo-bar');
      expect(r.warnings[0]).toContain('line 2');
    });

    it('Foo_Bar on line 3 and foo-bar on line 9 keep line 3 and warn once', () => {
      const r = parse('a\nb\nFoo_Bar\nc\nd\ne\nf\ng\nfoo-bar\n');
      const kept = r.dependencies.filter((d) => d.name === 'foo-bar');
      expect(kept).toEqual([dep('foo-bar', { rawName: 'Foo_Bar' })]);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain('line 9');
    });

    it('the first occurrence wins regardless of sourceKind', () => {
      const r = parse('foo==1\nFoo @ git+https://h/r.git\n');
      expect(r.dependencies).toEqual([dep('foo', { versionSpec: '==1' })]);
      expect(r.warnings).toHaveLength(1);
    });
  });

  it('returns an empty result for empty text', () => {
    expect(parse('')).toEqual({ dependencies: [], warnings: [] });
  });
});
