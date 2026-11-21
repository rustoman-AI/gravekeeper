import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import type { Ecosystem, ManifestFormat, Scope, SerializableDependency, SourceKind } from '../../../core';
import { sourceKindOfNpmSpec } from '../../../core/formats/npm-source-kind';
import { isRepresentable } from '../../../core/serializers/representable';
import { oracleNpmSourceKind } from '../../support/oracles/manifest-model';

const ECO: Record<ManifestFormat, Ecosystem> = { 'package.json': 'npm', 'requirements.txt': 'pypi', 'pyproject.toml': 'pypi', 'Cargo.toml': 'cargo' };

function dep(
  format: ManifestFormat,
  name: string,
  versionSpec: string,
  sourceKind: SourceKind = 'registry',
  rawName?: string,
  scope: Scope = 'runtime',
): SerializableDependency {
  const d = { name, ecosystem: ECO[format], versionSpec, scope, sourceKind };
  return rawName === undefined ? d : { ...d, rawName };
}

const rep = (format: ManifestFormat, d: SerializableDependency) => isRepresentable(d, format);

describe('isRepresentable: package.json', () => {
  const f = 'package.json';
  it('accepts matching classification', () => {
    expect(rep(f, dep(f, 'a', '^1.0.0'))).toBe(true);
    expect(rep(f, dep(f, 'a', 'git+https://x/y.git', 'git'))).toBe(true);
    expect(rep(f, dep(f, 'a', 'file:../a', 'path'))).toBe(true);
    expect(rep(f, dep(f, 'a', 'u/r', 'git'))).toBe(true);
  });
  it('rejects a sourceKind that differs from the classification of versionSpec', () => {
    expect(rep(f, dep(f, 'a', '^1.0.0', 'git'))).toBe(false);
    expect(rep(f, dep(f, 'a', 'git+https://x/y.git', 'registry'))).toBe(false);
    expect(rep(f, dep(f, 'a', 'file:../a', 'git'))).toBe(false);
    expect(rep(f, dep(f, 'a', 'u/r', 'registry'))).toBe(false);
  });
  it('rejects an empty name', () => {
    expect(rep(f, dep(f, '', '1'))).toBe(false);
  });
  it('allows newline, backslash, outer whitespace and ignores rawName', () => {
    expect(rep(f, dep(f, 'A_b', ' 1\n\\ ', 'registry', 'zzz'))).toBe(true);
  });
});

describe('criterion 1.9 GitHub shorthand with a ref', () => {
  it.each([
    ['a/b#', 'git'],
    ['a/b#c/d', 'git'],
    ['a/b#semver:^1', 'git'],
    ['a/b', 'git'],
    ['a/b/c', 'registry'],
    ['a/b/c#x', 'registry'],
    ['/b#x', 'registry'],
    ['a/#x', 'registry'],
    ['a b/c#x', 'registry'],
    ['#a/b', 'registry'],
  ] as const)('%s is %s in core and oracle', (spec, kind) => {
    expect(sourceKindOfNpmSpec(spec)).toBe(kind);
    expect(oracleNpmSourceKind(spec)).toBe(kind);
  });
});

describe('isRepresentable: Cargo.toml', () => {
  const f = 'Cargo.toml';
  it('accepts every sourceKind regardless of spec shape', () => {
    expect(rep(f, dep(f, 'serde', '1.0'))).toBe(true);
    expect(rep(f, dep(f, 'serde', 'https://x/y', 'git'))).toBe(true);
    expect(rep(f, dep(f, 'serde', '../serde', 'path'))).toBe(true);
    expect(rep(f, dep(f, 'serde', ' a\n\\;# ', 'registry'))).toBe(true);
  });
  it('rejects an empty name', () => {
    expect(rep(f, dep(f, '', '1'))).toBe(false);
  });
  it('rejects a lone surrogate in name or versionSpec', () => {
    expect(rep(f, dep(f, 'a\ud800', '1'))).toBe(false);
    expect(rep(f, dep(f, 'a\udc00b', '1'))).toBe(false);
    expect(rep(f, dep(f, 'a', '1\ud800'))).toBe(false);
  });
  it('accepts a valid surrogate pair', () => {
    expect(rep(f, dep(f, 'a\u{1F600}', '1\u{1F600}'))).toBe(true);
  });
});

describe('isRepresentable: requirements.txt', () => {
  const f = 'requirements.txt';
  it('accepts well-formed dependencies of each sourceKind', () => {
    expect(rep(f, dep(f, 'django', '==4.2'))).toBe(true);
    expect(rep(f, dep(f, 'django', '*'))).toBe(true);
    expect(rep(f, dep(f, 'foo', 'git+https://x/y.git#egg=foo', 'git'))).toBe(true);
    expect(rep(f, dep(f, 'foo', './local', 'path'))).toBe(true);
    expect(rep(f, dep(f, 'foo', 'file:///x', 'path'))).toBe(true);
    expect(rep(f, dep(f, 'foo', '../x', 'path'))).toBe(true);
    expect(rep(f, dep(f, 'foo', '/abs/x', 'path'))).toBe(true);
  });
  it.each(['==', '!=', '<=', '>=', '<', '>', '~=', '==='])('accepts registry operator %s', (op) => {
    expect(rep(f, dep(f, 'foo', `${op}1.0`))).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(rep(f, dep(f, '', '==1'))).toBe(false);
  });

  describe('source kind and prefix', () => {
    it('rejects git+ prefix with registry or path sourceKind', () => {
      expect(rep(f, dep(f, 'foo', 'git+https://x/y.git', 'registry'))).toBe(false);
      expect(rep(f, dep(f, 'foo', 'git+https://x/y.git', 'path'))).toBe(false);
    });
    it('rejects git sourceKind without git+ prefix', () => {
      expect(rep(f, dep(f, 'foo', 'https://x/y.git', 'git'))).toBe(false);
    });
    it('rejects path prefixes with registry or git sourceKind', () => {
      expect(rep(f, dep(f, 'foo', './x', 'registry'))).toBe(false);
      expect(rep(f, dep(f, 'foo', 'file:x', 'git'))).toBe(false);
    });
    it('rejects path sourceKind without a path prefix', () => {
      expect(rep(f, dep(f, 'foo', 'x/y', 'path'))).toBe(false);
    });
  });

  describe('versionSpec lexical conditions', () => {
    it.each(['registry', 'git', 'path'] as const)('rejects newline, CR, backslash and outer whitespace for %s', (kind) => {
      const base = kind === 'registry' ? '==1' : kind === 'git' ? 'git+https://x/y' : './x';
      expect(rep(f, dep(f, 'foo', base, kind))).toBe(true);
      expect(rep(f, dep(f, 'foo', `${base}\n`, kind))).toBe(false);
      expect(rep(f, dep(f, 'foo', `${base}\r`, kind))).toBe(false);
      expect(rep(f, dep(f, 'foo', `${base}\\x`, kind))).toBe(false);
      expect(rep(f, dep(f, 'foo', ` ${base}`, kind))).toBe(false);
      expect(rep(f, dep(f, 'foo', `${base} `, kind))).toBe(false);
    });
    it('rejects a registry spec without operator', () => {
      expect(rep(f, dep(f, 'foo', '1.0'))).toBe(false);
      expect(rep(f, dep(f, 'foo', ''))).toBe(false);
      expect(rep(f, dep(f, 'foo', '=1.0'))).toBe(false);
      expect(rep(f, dep(f, 'foo', '**'))).toBe(false);
    });
  });

  describe('D2: ; and #', () => {
    it('rejects any ; in a registry spec', () => {
      expect(rep(f, dep(f, 'foo', '==1;python_version<"3"'))).toBe(false);
      expect(rep(f, dep(f, 'foo', '==1 ;x'))).toBe(false);
    });
    it('rejects whitespace followed by # in a registry spec, allows # without whitespace', () => {
      expect(rep(f, dep(f, 'foo', '==1 #c'))).toBe(false);
      expect(rep(f, dep(f, 'foo', '==1\t#c'))).toBe(false);
      expect(rep(f, dep(f, 'foo', '==1#c'))).toBe(true);
    });
    it.each([
      ['git', 'git+https://x/y.git'],
      ['path', './x'],
    ] as const)('rejects whitespace followed by ; or # for %s, allows them without whitespace', (kind, base) => {
      expect(rep(f, dep(f, 'foo', `${base} ;x`, kind))).toBe(false);
      expect(rep(f, dep(f, 'foo', `${base} #x`, kind))).toBe(false);
      expect(rep(f, dep(f, 'foo', `${base}\t;x`, kind))).toBe(false);
      expect(rep(f, dep(f, 'foo', `${base};x`, kind))).toBe(true);
      expect(rep(f, dep(f, 'foo', `${base}#egg=foo`, kind))).toBe(true);
    });
  });

  describe('Written_Name', () => {
    it('accepts rawName Django with name django', () => {
      expect(rep(f, dep(f, 'django', '==1', 'registry', 'Django'))).toBe(true);
    });
    it('accepts rawName whose separators normalize to name', () => {
      expect(rep(f, dep(f, 'foo-bar', '==1', 'registry', 'Foo__Bar'))).toBe(true);
    });
    it('rejects a non-normalized name without rawName', () => {
      expect(rep(f, dep(f, 'Foo', '==1'))).toBe(false);
      expect(rep(f, dep(f, 'foo_bar', '==1'))).toBe(false);
    });
    it('rejects a non-normalized name whose rawName does not normalize to it', () => {
      expect(rep(f, dep(f, 'Foo', '==1', 'registry', 'Bar'))).toBe(false);
    });
    it('falls back to name when rawName does not normalize to name', () => {
      expect(rep(f, dep(f, 'django', '==1', 'registry', 'Flask'))).toBe(true);
      expect(rep(f, dep(f, 'Django', '==1', 'registry', 'Flask'))).toBe(false);
    });
    it('rejects a Written_Name that is not a Name_Token', () => {
      expect(rep(f, dep(f, '-foo', '==1'))).toBe(false);
      expect(rep(f, dep(f, 'foo bar', '==1'))).toBe(false);
      expect(rep(f, dep(f, 'foo!', '==1'))).toBe(false);
      expect(rep(f, dep(f, 'foo-', '==1'))).toBe(true);
    });
  });
});

describe('parser outputs are Representable', () => {
  const samples: [ManifestFormat, string][] = [
    [
      'package.json',
      JSON.stringify({
        dependencies: { react: '^18.0.0', a: 'u/r#v1', b: 'git+https://x/y.git', c: 'file:../c', d: 'a/b#', e: ' 1 ' },
        devDependencies: { vitest: '*' },
        peerDependencies: { x: '>=1 <2' },
        optionalDependencies: { y: 'workspace:*' },
      }),
    ],
    [
      'requirements.txt',
      [
        '# comment',
        'Django==4.2',
        'PyYAML>=6.0 ; python_version > "3"',
        'SQLAlchemy',
        'Foo__Bar~=1.0',
        'requests[security]==2.0',
        'mylib @ git+https://github.com/x/mylib.git',
        'git+https://github.com/x/other.git#egg=Other_Pkg',
        'loc @ ./vendor/loc',
        './vendor/thing#egg=Thing',
        'pinned==1.0 \\',
        '  --hash=sha256:abc',
        'bad line here',
      ].join('\n'),
    ],
    [
      'Cargo.toml',
      [
        '[dependencies]',
        'serde = "1.0"',
        'tokio = { version = "1", features = ["full"] }',
        'mine = { path = "../mine" }',
        'remote = { git = "https://github.com/x/remote" }',
        'renamed = { package = "real-name", version = "2" }',
        '[dev-dependencies]',
        'criterion = "0.5"',
        '[build-dependencies]',
        'cc = "1"',
        "[target.'cfg(unix)'.dependencies]",
        'libc = "0.2"',
      ].join('\n'),
    ],
  ];

  it.each(samples)('every parsed Dependency of %s is Representable in its format', (format, text) => {
    const { dependencies } = parseManifest(text, format);
    expect(dependencies.length).toBeGreaterThan(3);
    for (const d of dependencies) expect(isRepresentable(d, format), JSON.stringify(d)).toBe(true);
  });
});
