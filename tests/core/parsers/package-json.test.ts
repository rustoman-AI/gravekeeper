import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import type { Dependency } from '../../../core';
import { parsePackageJson } from '../../../core/parsers/package-json';

function parse(text: string) {
  return parseManifest(text, 'package.json');
}

function dep(name: string, over: Partial<Dependency> = {}): Dependency {
  return { name, rawName: name, ecosystem: 'npm', versionSpec: '1.0.0', scope: 'runtime', sourceKind: 'registry', ...over };
}

describe('package.json parser', () => {
  it('1.1 returns one npm Dependency per entry, name as written', () => {
    const r = parse('{"dependencies":{"left-pad":"^1.0.0","@scope/Pkg":"2"}}');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([
      dep('@scope/Pkg', { versionSpec: '2' }),
      dep('left-pad', { versionSpec: '^1.0.0' }),
    ]);
  });

  it('1.2 maps each section to its scope', () => {
    const r = parse(
      '{"dependencies":{"a":"1"},"devDependencies":{"b":"1"},"optionalDependencies":{"c":"1"},"peerDependencies":{"d":"1"}}',
    );
    expect(r.dependencies.map((d) => [d.name, d.scope])).toEqual([
      ['a', 'runtime'],
      ['b', 'dev'],
      ['c', 'optional'],
      ['d', 'peer'],
    ]);
  });

  it('1.3 keeps versionSpec exactly as written, including whitespace, case and empty string', () => {
    const r = parse('{"dependencies":{"a":"  ^1.0.0-Beta  ","b":""}}');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies.map((d) => d.versionSpec)).toEqual(['  ^1.0.0-Beta  ', '']);
  });

  it('1.4 omits a non-string value with one warning naming package and section', () => {
    const r = parse('{"devDependencies":{"bad":1,"obj":{},"nul":null,"good":"1"}}');
    expect(r.dependencies).toEqual([dep('good', { versionSpec: '1', scope: 'dev' })]);
    expect(r.warnings).toHaveLength(3);
    for (const name of ['bad', 'obj', 'nul']) {
      expect(r.warnings.filter((w) => w.includes(`"${name}"`) && w.includes('devDependencies'))).toHaveLength(1);
    }
  });

  it.each([
    ['null', 'null'],
    ['array', '[]'],
    ['string', '"x"'],
    ['number', '5'],
    ['boolean', 'true'],
  ])('1.5 omits a %s section with one warning naming it and keeps other sections', (_label, value) => {
    const r = parse(`{"dependencies":${value},"devDependencies":{"ok":"1"}}`);
    expect(r.dependencies).toEqual([dep('ok', { versionSpec: '1', scope: 'dev' })]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('"dependencies"');
  });

  it.each([
    ['invalid JSON', '{"dependencies":'],
    ['empty text', ''],
    ['array top level', '[]'],
    ['null top level', 'null'],
    ['string top level', '"x"'],
    ['number top level', '1'],
  ])('1.6 returns no dependencies and one warning for %s', (_label, text) => {
    const r = parse(text);
    expect(r.dependencies).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });

  it.each([
    ['no sections', '{"name":"x"}'],
    ['empty sections', '{"dependencies":{},"devDependencies":{},"optionalDependencies":{},"peerDependencies":{}}'],
  ])('1.7 returns nothing and no warnings for %s', (_label, text) => {
    expect(parse(text)).toEqual({ dependencies: [], warnings: [] });
  });

  it('1.8 same name in two sections gives two entries with their own scopes', () => {
    const r = parse('{"dependencies":{"react":"18"},"peerDependencies":{"react":"^18"}}');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([
      dep('react', { versionSpec: '18', scope: 'runtime' }),
      dep('react', { versionSpec: '^18', scope: 'peer' }),
    ]);
  });

  it.each([
    ['file:../x', 'path'],
    ['link:../x', 'path'],
    ['workspace:*', 'path'],
    ['git+https://example.com/a.git', 'git'],
    ['git://example.com/a.git', 'git'],
    ['github:user/repo', 'git'],
    ['gitlab:user/repo', 'git'],
    ['bitbucket:user/repo', 'git'],
    ['user/repo', 'git'],
    ['user/repo#main', 'git'],
    ['^1.2.3', 'registry'],
    ['', 'registry'],
    ['a/b/c', 'registry'],
    ['npm:other@1', 'registry'],
  ])('1.9 sourceKind of %j is %s', (spec, kind) => {
    const r = parse(JSON.stringify({ dependencies: { pkg: spec } }));
    expect(r.dependencies).toHaveLength(1);
    expect(r.dependencies[0]?.sourceKind).toBe(kind);
  });

  it('1.10 keeps git and path entries as written with no warning', () => {
    const r = parse('{"dependencies":{"a":"file:../a","b":"github:u/b"}}');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([
      dep('a', { versionSpec: 'file:../a', sourceKind: 'path' }),
      dep('b', { versionSpec: 'github:u/b', sourceKind: 'git' }),
    ]);
  });

  it('1.11 a key repeated in one section keeps the last value with no warning', () => {
    const r = parse('{"dependencies":{"a":"1","a":"2"}}');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([dep('a', { versionSpec: '2' })]);
  });

  it('1.12 rawName equals name and mixed-case names are not normalized', () => {
    const r = parse('{"dependencies":{"Foo_Bar.Baz":"1"}}');
    expect(r.dependencies).toHaveLength(1);
    expect(r.dependencies[0]?.name).toBe('Foo_Bar.Baz');
    expect(r.dependencies[0]?.rawName).toBe('Foo_Bar.Baz');
  });

  it('4.9 __proto__, constructor and prototype are ordinary dependencies and prototypes are untouched', () => {
    const r = parse('{"dependencies":{"__proto__":"1","constructor":"2","prototype":"3"}}');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies.map((d) => [d.name, d.versionSpec])).toEqual([
      ['__proto__', '1'],
      ['constructor', '2'],
      ['prototype', '3'],
    ]);
    expect(Object.getPrototypeOf(Object.prototype)).toBeNull();
    expect(({} as Record<string, unknown>).versionSpec).toBeUndefined();
    expect(Object.keys(Object.prototype)).toEqual([]);
    for (const d of r.dependencies) expect(Object.getPrototypeOf(d)).toBe(Object.prototype);
  });

  it('4.9 does not read inherited section names from a polluted-looking root', () => {
    const r = parse('{"__proto__":{"dependencies":{"x":"1"}}}');
    expect(r).toEqual({ dependencies: [], warnings: [] });
  });

  it('4.10 skips an empty name with exactly one warning naming the section', () => {
    const r = parse('{"devDependencies":{"":"1","ok":"2"}}');
    expect(r.dependencies).toEqual([dep('ok', { versionSpec: '2', scope: 'dev' })]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('devDependencies');
  });

  it('parsePackageJson returns raw candidates and never throws on bad text', () => {
    const raw = parsePackageJson('{"dependencies":{"a":"1"}}');
    expect(raw.warnings).toEqual([]);
    expect(raw.candidates.map((c) => c.dependency)).toEqual([dep('a', { versionSpec: '1' })]);
    expect(parsePackageJson('{').candidates).toEqual([]);
  });
});
