import { describe, expect, it } from 'vitest';
import { parseManifest, serializeManifest } from '../../../core';
import type { Ecosystem, ManifestFormat, Scope, SerializableDependency, SourceKind } from '../../../core';

const ECO: Record<ManifestFormat, Ecosystem> = { 'package.json': 'npm', 'requirements.txt': 'pypi', 'pyproject.toml': 'pypi', 'Cargo.toml': 'cargo' };

function dep(
  format: ManifestFormat,
  name: string,
  versionSpec: string,
  scope: Scope = 'runtime',
  sourceKind: SourceKind = 'registry',
  rawName?: string,
): SerializableDependency {
  const d = { name, ecosystem: ECO[format], versionSpec, scope, sourceKind };
  return rawName === undefined ? d : { ...d, rawName };
}

function text(deps: readonly SerializableDependency[], format: unknown): string {
  const r = serializeManifest(deps, format as ManifestFormat);
  if (!r.ok) throw new Error(`serialize failed: ${JSON.stringify(r.error)}`);
  return r.value;
}

/** Parsed dependencies reduced to the compared fields (no rawName), in parser order. */
function parsed(t: string, format: ManifestFormat) {
  return parseManifest(t, format).dependencies.map(({ name, versionSpec, scope, sourceKind }) => ({
    name,
    versionSpec,
    scope,
    sourceKind,
  }));
}

const P = 'package.json' as const;
const R = 'requirements.txt' as const;
const C = 'Cargo.toml' as const;

describe('serializeManifest: exact text per format', () => {
  it('package.json writes sections in scope order with entries sorted by name', () => {
    const deps = [
      dep(P, 'jest', '^29.0.0', 'dev'),
      dep(P, 'react', '^18.0.0'),
      dep(P, 'lib', 'git+https://example.com/lib.git', 'runtime', 'git'),
      dep(P, 'local', 'file:../local', 'runtime', 'path'),
      dep(P, 'peerdep', '>=1', 'peer'),
      dep(P, 'opt', '1.0.0', 'optional'),
    ];
    expect(text(deps, P)).toBe(
      [
        '{',
        '  "dependencies": {',
        '    "lib": "git+https://example.com/lib.git",',
        '    "local": "file:../local",',
        '    "react": "^18.0.0"',
        '  },',
        '  "devDependencies": {',
        '    "jest": "^29.0.0"',
        '  },',
        '  "optionalDependencies": {',
        '    "opt": "1.0.0"',
        '  },',
        '  "peerDependencies": {',
        '    "peerdep": ">=1"',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('package.json writes each section once when names interleave across scopes', () => {
    const deps = [dep(P, 'a', '1', 'runtime'), dep(P, 'b', '2', 'dev'), dep(P, 'c', '3', 'runtime')];
    expect(text(deps, P)).toBe(
      '{\n  "dependencies": {\n    "a": "1",\n    "c": "3"\n  },\n  "devDependencies": {\n    "b": "2"\n  }\n}\n',
    );
  });

  it('requirements.txt writes one line per requirement, using the Written_Name', () => {
    const deps = [
      dep(R, 'requests', '*'),
      dep(R, 'django', '>=3', 'runtime', 'registry', 'Django'),
      dep(R, 'flask', '==2.0', 'runtime', 'registry', 'Other'),
      dep(R, 'mylib', 'git+https://example.com/m.git', 'runtime', 'git'),
      dep(R, 'localpkg', './local', 'runtime', 'path'),
    ];
    expect(text(deps, R)).toBe(
      'Django >=3\nflask ==2.0\nlocalpkg @ ./local\nmylib @ git+https://example.com/m.git\nrequests\n',
    );
  });

  it('requirements.txt writes `name` when rawName does not normalize to name, and when rawName is absent', () => {
    expect(text([dep(R, 'django', '>=3', 'runtime', 'registry', 'Flask')], R)).toBe('django >=3\n');
    expect(text([dep(R, 'django', '>=3')], R)).toBe('django >=3\n');
  });

  it('requirements.txt keeps one line for same-key entries, with the smaller rawName (absent first)', () => {
    const a = dep(R, 'foo-bar', '>=1', 'runtime', 'registry', 'Foo_Bar');
    const b = dep(R, 'foo-bar', '>=1', 'runtime', 'registry', 'foo.bar');
    expect(text([a, b], R)).toBe('Foo_Bar >=1\n');
    expect(text([b, a], R)).toBe('Foo_Bar >=1\n');
    const none = dep(R, 'foo-bar', '>=1');
    expect(text([a, b, none], R)).toBe('foo-bar >=1\n');
  });

  it('Cargo.toml writes tables in scope order with inline git and path tables', () => {
    const deps = [
      dep(C, 'cc', '1.0', 'build'),
      dep(C, 'tokio', '1', 'dev'),
      dep(C, 'serde', '1.0'),
      dep(C, 'gitdep', 'https://example.com/g.git', 'runtime', 'git'),
      dep(C, 'pathdep', '../pathdep', 'runtime', 'path'),
    ];
    expect(text(deps, C)).toBe(
      [
        '[dependencies]',
        '"gitdep" = { git = "https://example.com/g.git" }',
        '"pathdep" = { path = "../pathdep" }',
        '"serde" = "1.0"',
        '',
        '[dev-dependencies]',
        '"tokio" = "1"',
        '',
        '[build-dependencies]',
        '"cc" = "1.0"',
        '',
      ].join('\n'),
    );
  });

  it('package.json and Cargo.toml ignore rawName', () => {
    expect(text([dep(P, 'abc', '1', 'runtime', 'registry', 'ABC')], P)).toBe(
      text([dep(P, 'abc', '1')], P),
    );
    expect(text([dep(C, 'abc', '1', 'runtime', 'registry', 'ABC')], C)).toBe(text([dep(C, 'abc', '1')], C));
    expect(text([dep(C, 'abc', '1', 'runtime', 'registry', 'ABC')], C)).toBe('[dependencies]\n"abc" = "1"\n');
  });

  it('output parses back to the same dependencies', () => {
    const deps = [dep(C, 'cc', '1.0', 'build'), dep(C, 'serde', '1.0'), dep(C, 'g', 'https://x/g.git', 'dev', 'git')];
    expect(parsed(text(deps, C), C)).toEqual([
      { name: 'g', versionSpec: 'https://x/g.git', scope: 'dev', sourceKind: 'git' },
      { name: 'serde', versionSpec: '1.0', scope: 'runtime', sourceKind: 'registry' },
      { name: 'cc', versionSpec: '1.0', scope: 'build', sourceKind: 'registry' },
    ].sort((x, y) => (x.name < y.name ? -1 : 1)));
  });
});

describe('serializeManifest: errors', () => {
  it('returns an unsupported-format error and no text', () => {
    const r = serializeManifest([], 'yaml' as unknown as ManifestFormat);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('unsupported-format');
    expect('value' in r).toBe(false);
    for (const bad of [undefined, null, 5, {}, 'package.JSON']) {
      const rr = serializeManifest([], bad as unknown as ManifestFormat);
      expect(rr.ok).toBe(false);
      expect('value' in rr).toBe(false);
    }
  });

  it('returns an error and no text for non-array input', () => {
    for (const bad of [undefined, null, 'x', 5, {}, { length: 0 }]) {
      for (const f of [P, R, C]) {
        const r = serializeManifest(bad as unknown as readonly SerializableDependency[], f);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.kind).toBe('invalid-input');
        expect('value' in r).toBe(false);
      }
    }
  });

  it('accepts exactly MAX_SERIALIZED_DEPENDENCIES and rejects one more, with no text', () => {
    const make = (n: number) =>
      Array.from({ length: n }, (_, i) => dep(P, `d${String(i).padStart(5, '0')}`, '1'));
    const max = serializeManifest(make(10_000), P);
    expect(max.ok).toBe(true);
    if (max.ok) expect(parsed(max.value, P)).toHaveLength(10_000);
    for (const f of [P, R, C]) {
      const over = serializeManifest(make(10_001), f);
      expect(over.ok).toBe(false);
      if (!over.ok) expect(over.error).toEqual({ kind: 'too-many-dependencies', limit: 10_000 });
      expect('value' in over).toBe(false);
    }
  });
});

describe('serializeManifest: empty and no-match lists', () => {
  it('writes an empty set for an empty list', () => {
    expect(text([], P)).toBe('{}\n');
    expect(text([], R)).toBe('');
    expect(text([], C)).toBe('');
    for (const f of [P, R, C]) expect(parsed(text([], f), f)).toEqual([]);
  });

  it('writes an empty set when no dependency matches the format', () => {
    const npm = dep(P, 'a', '1');
    const pypi = dep(R, 'a', '>=1');
    const cargo = dep(C, 'a', '1');
    expect(text([pypi, cargo], P)).toBe('{}\n');
    expect(text([npm, cargo], R)).toBe('');
    expect(text([npm, pypi], C)).toBe('');
    for (const f of [P, R, C]) expect(parsed(text([npm, pypi, cargo].filter((d) => d.ecosystem !== ECO[f]), f), f)).toEqual([]);
  });
});

describe('serializeManifest: omissions', () => {
  it('omits dependencies of another ecosystem', () => {
    expect(text([dep(R, 'a', '>=1'), dep(P, 'b', '1')], P)).toBe('{\n  "dependencies": {\n    "b": "1"\n  }\n}\n');
  });

  it('omits scopes the format does not support', () => {
    expect(text([dep(P, 'a', '1', 'build')], P)).toBe('{}\n');
    expect(text([dep(R, 'a', '>=1', 'dev')], R)).toBe('');
    expect(text([dep(C, 'a', '1', 'optional'), dep(C, 'b', '1', 'peer')], C)).toBe('');
    expect(text([dep(C, 'a', '1', 'optional'), dep(C, 'b', '1')], C)).toBe('[dependencies]\n"b" = "1"\n');
  });

  it('omits entries that are not Representable', () => {
    expect(text([dep(P, 'a', '^1', 'runtime', 'git'), dep(P, '', '1'), dep(P, 'ok', '1')], P)).toBe(
      '{\n  "dependencies": {\n    "ok": "1"\n  }\n}\n',
    );
    expect(text([dep(R, 'a', '1.0'), dep(R, 'b', '>=1', 'runtime', 'git'), dep(R, 'Upper', '>=1')], R)).toBe('');
    expect(text([dep(C, '', '1'), dep(C, 'a', '1')], C)).toBe('[dependencies]\n"a" = "1"\n');
  });

  it('keeps one entry per (name, scope), the first in Dependency_Order', () => {
    const deps = [dep(P, 'a', '2.0.0'), dep(P, 'a', '1.0.0'), dep(P, 'a', '3.0.0')];
    expect(text(deps, P)).toBe('{\n  "dependencies": {\n    "a": "1.0.0"\n  }\n}\n');
    expect(text([dep(C, 'a', '2'), dep(C, 'a', '1')], C)).toBe('[dependencies]\n"a" = "1"\n');
    expect(text([dep(R, 'a', '>=2'), dep(R, 'a', '>=1')], R)).toBe('a >=1\n');
  });

  it('does not let an earlier non-Representable entry suppress a later Representable duplicate (5.2)', () => {
    // '^1' sorts before '^2' but is not Representable (sourceKind git does not match the classification).
    const bad = dep(P, 'a', '^1', 'runtime', 'git');
    const good = dep(P, 'a', '^2');
    const expected = '{\n  "dependencies": {\n    "a": "^2"\n  }\n}\n';
    expect(text([bad, good], P)).toBe(expected);
    expect(text([good, bad], P)).toBe(expected);
    expect(text([dep(R, 'a', '>=1', 'runtime', 'git'), dep(R, 'a', '>=2')], R)).toBe('a >=2\n');
  });

  it('keeps the same name in two scopes', () => {
    expect(text([dep(P, 'a', '1', 'dev'), dep(P, 'a', '2')], P)).toBe(
      '{\n  "dependencies": {\n    "a": "2"\n  },\n  "devDependencies": {\n    "a": "1"\n  }\n}\n',
    );
    expect(text([dep(C, 'a', '1', 'build'), dep(C, 'a', '2', 'dev')], C)).toBe(
      '[dev-dependencies]\n"a" = "2"\n\n[build-dependencies]\n"a" = "1"\n',
    );
  });

  it('does not modify the input list', () => {
    const deps = [dep(P, 'b', '1'), dep(P, 'a', '1')];
    const copy = structuredClone(deps);
    text(deps, P);
    expect(deps).toEqual(copy);
  });
});

describe('serializeManifest: escaping', () => {
  const name = 'a"b\\c';
  const spec = '1 "x" \\ \n \u0001 \té☃😀';

  it('escapes quotes, backslashes, control characters and unicode in JSON', () => {
    const out = text([dep(P, name, spec)], P);
    expect(out).toBe(
      String.raw`{
  "dependencies": {
    "a\"b\\c": "1 \"x\" \\ \n \u0001 \té☃😀"
  }
}
`,
    );
    expect(parsed(out, P)).toEqual([{ name, versionSpec: spec, scope: 'runtime', sourceKind: 'registry' }]);
  });

  it('escapes quotes, backslashes, control characters and unicode in TOML', () => {
    const out = text([dep(C, name, `${spec}\u007f`)], C);
    expect(out).toBe(
      String.raw`[dependencies]
"a\"b\\c" = "1 \"x\" \\ \n \u0001 \té☃😀\u007F"
`,
    );
    expect(parsed(out, C)).toEqual([{ name, versionSpec: `${spec}\u007f`, scope: 'runtime', sourceKind: 'registry' }]);
  });

  it('escapes TOML inline git and path values', () => {
    const out = text([dep(C, 'g', 'a"b\\c', 'runtime', 'git'), dep(C, 'p', '..\\x"', 'runtime', 'path')], C);
    expect(out).toBe(String.raw`[dependencies]
"g" = { git = "a\"b\\c" }
"p" = { path = "..\\x\"" }
`);
    expect(parsed(out, C)).toEqual([
      { name: 'g', versionSpec: 'a"b\\c', scope: 'runtime', sourceKind: 'git' },
      { name: 'p', versionSpec: '..\\x"', scope: 'runtime', sourceKind: 'path' },
    ]);
  });
});

describe('serializeManifest: __proto__ names', () => {
  it('writes and round-trips a __proto__ name in package.json and Cargo.toml', () => {
    const p = text([dep(P, '__proto__', '1'), dep(P, 'constructor', '2')], P);
    expect(p).toBe('{\n  "dependencies": {\n    "__proto__": "1",\n    "constructor": "2"\n  }\n}\n');
    expect(parsed(p, P).map((d) => d.name)).toEqual(['__proto__', 'constructor']);
    const c = text([dep(C, '__proto__', '1')], C);
    expect(c).toBe('[dependencies]\n"__proto__" = "1"\n');
    expect(parsed(c, C)).toEqual([{ name: '__proto__', versionSpec: '1', scope: 'runtime', sourceKind: 'registry' }]);
  });

  it('omits a __proto__ name in requirements.txt (not a Name_Token)', () => {
    expect(text([dep(R, '__proto__', '>=1')], R)).toBe('');
  });
});

describe('serializeManifest: determinism', () => {
  it('returns byte-identical text on repeat calls and for permuted input', () => {
    const deps = [
      dep(P, 'z', '1', 'dev'),
      dep(P, 'a', '1'),
      dep(P, 'm', '1', 'peer'),
      dep(P, 'a', '2'),
      dep(P, 'q', 'git+https://x/q.git', 'runtime', 'git'),
    ];
    for (const f of [P, R, C]) {
      const list = deps.map((d) => ({ ...d, ecosystem: ECO[f] }));
      const first = text(list, f);
      expect(text(list, f)).toBe(first);
      expect(text([...list].reverse(), f)).toBe(first);
    }
  });
});
