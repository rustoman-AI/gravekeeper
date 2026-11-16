import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import type { Dependency } from '../../../core';
import { parseToml } from '../../../core/parsers/toml-tree';

function parse(text: string) {
  return parseManifest(text, 'Cargo.toml');
}

function dep(name: string, over: Partial<Dependency> = {}): Dependency {
  return { name, rawName: name, ecosystem: 'cargo', versionSpec: '1.0', scope: 'runtime', sourceKind: 'registry', ...over };
}

describe('Cargo.toml parser', () => {
  it('3.1 returns one cargo Dependency per entry of the three top-level tables', () => {
    const r = parse('[dependencies]\nserde = "1"\n[dev-dependencies]\ntokio = "1"\n[build-dependencies]\ncc = "1"\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([
      dep('cc', { versionSpec: '1', scope: 'build' }),
      dep('serde', { versionSpec: '1' }),
      dep('tokio', { versionSpec: '1', scope: 'dev' }),
    ]);
  });

  it('3.2 returns no dependencies and no warnings without dependency tables or with empty ones', () => {
    for (const text of ['', '[package]\nname = "x"\n', '[dependencies]\n[dev-dependencies]\n[target.\'cfg(unix)\'.dependencies]\n']) {
      expect(parse(text)).toEqual({ dependencies: [], warnings: [] });
    }
  });

  it('3.3 sets scope from the table name', () => {
    const r = parse('[dependencies]\na = "1"\n[dev-dependencies]\nb = "1"\n[build-dependencies]\nc = "1"\n');
    expect(r.dependencies.map((d) => [d.name, d.scope])).toEqual([
      ['a', 'runtime'],
      ['b', 'dev'],
      ['c', 'build'],
    ]);
  });

  it('3.4 string value gives versionSpec and registry', () => {
    const r = parse('[dependencies]\nserde = "^1.0.2"\n');
    expect(r.dependencies).toEqual([dep('serde', { versionSpec: '^1.0.2' })]);
  });

  it('3.5 table with string version and no git or path gives registry', () => {
    const r = parse('[dependencies]\nserde = { version = "1.2", features = ["derive"] }\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([dep('serde', { versionSpec: '1.2' })]);
  });

  it('3.6 table without version, git and path gives "*" and registry', () => {
    const r = parse('[dependencies]\nserde = { features = ["derive"] }\n');
    expect(r.dependencies).toEqual([dep('serde', { versionSpec: '*' })]);
  });

  it('3.7 package key replaces the name; rawName equals name', () => {
    const r = parse('[dependencies]\nmy-alias = { package = "Real-Name", version = "2" }\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([dep('Real-Name', { versionSpec: '2' })]);
  });

  it('3.8 target tables use the scope of the table name, whatever the cfg', () => {
    const r = parse(
      [
        "[target.'cfg(unix)'.dependencies]",
        'a = "1"',
        "[target.'cfg(windows)'.dev-dependencies]",
        'b = "1"',
        '[target.x86_64-pc-windows-gnu.build-dependencies]',
        'c = "1"',
        '',
      ].join('\n'),
    );
    expect(r.warnings).toEqual([]);
    expect(r.dependencies.map((d) => [d.name, d.scope])).toEqual([
      ['a', 'runtime'],
      ['b', 'dev'],
      ['c', 'build'],
    ]);
  });

  it('3.8 the same crate in different kinds yields one Dependency per scope', () => {
    const r = parse('[dependencies]\nserde = "1"\n[dev-dependencies]\nserde = "2"\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies).toEqual([
      dep('serde', { versionSpec: '1' }),
      dep('serde', { versionSpec: '2', scope: 'dev' }),
    ]);
  });

  it('3.9 invalid TOML gives no dependencies and one warning, with a line only when smol-toml gives one', () => {
    const text = '[dependencies]\nserde = \n';
    const wrapped = parseToml(text);
    expect(wrapped.ok).toBe(false);
    const r = parse(text);
    expect(r.dependencies).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('not valid TOML');
    if (!wrapped.ok) {
      const { line } = wrapped.error;
      if (line === undefined) expect(r.warnings[0]).not.toMatch(/line/);
      else expect(r.warnings[0]).toContain(`line ${line}`);
    }
  });

  it('3.10 a non-string version, package, git or path omits the entry with one warning naming the key', () => {
    const r = parse(
      [
        '[dependencies]',
        'v = { version = 1 }',
        'p = { package = 2 }',
        'g = { git = true }',
        'h = { path = ["x"] }',
        'good = "1"',
        '',
      ].join('\n'),
    );
    expect(r.dependencies).toEqual([dep('good', { versionSpec: '1' })]);
    expect(r.warnings).toHaveLength(4);
    for (const key of ['v', 'p', 'g', 'h']) {
      expect(r.warnings.filter((w) => w.includes(`"${key}"`))).toHaveLength(1);
    }
  });

  it('3.11 git wins over path and version', () => {
    const r = parse('[dependencies]\nfoo = { git = "https://example.com/foo.git", path = "../foo", version = "1" }\n');
    expect(r.dependencies).toEqual([
      dep('foo', { versionSpec: 'https://example.com/foo.git', sourceKind: 'git' }),
    ]);
  });

  it('3.12 path wins over version when there is no git', () => {
    const r = parse('[dependencies]\nfoo = { path = "../foo", version = "1" }\n');
    expect(r.dependencies).toEqual([dep('foo', { versionSpec: '../foo', sourceKind: 'path' })]);
  });

  it('3.13 git and path entries are kept without warnings', () => {
    const r = parse('[dependencies]\ng = { git = "https://example.com/g.git" }\np = { path = "./p" }\n');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies.map((d) => [d.name, d.sourceKind])).toEqual([
      ['g', 'git'],
      ['p', 'path'],
    ]);
  });

  it('3.14 a value that is neither string nor table, or a section that is not a table, is omitted with one warning', () => {
    const r = parse('dependencies = 5\n[dev-dependencies]\nnum = 3\narr = [1]\nok = "1"\n');
    expect(r.dependencies).toEqual([dep('ok', { versionSpec: '1', scope: 'dev' })]);
    expect(r.warnings).toHaveLength(3);
    expect(r.warnings.filter((w) => w.includes('[dependencies]'))).toHaveLength(1);
    expect(r.warnings.filter((w) => w.includes('"num"'))).toHaveLength(1);
    expect(r.warnings.filter((w) => w.includes('"arr"'))).toHaveLength(1);
  });

  it('3.15 parsing goes through the wrapper and never throws on hostile text', () => {
    expect(() => parse('[dependencies\n\u0000\ud800')).not.toThrow();
    expect(parse('= = =').dependencies).toEqual([]);
  });

  it('3.16 an entry with a lone surrogate in the name or the spec is skipped with one warning naming the key', () => {
    // The wrapper's result is used to build the case, so the test does not depend on how smol-toml treats the character.
    const viaName = parse('[dependencies]\n"bad\ud800" = "1"\nok = "1"\n');
    const viaSpec = parse('[dependencies]\nbad2 = "1\udc00"\nok = "1"\n');
    const viaPackage = parse('[dependencies]\nbad3 = { package = "x\ud800" }\nok = "1"\n');
    for (const [r, key] of [[viaName, 'bad\ud800'], [viaSpec, 'bad2'], [viaPackage, 'bad3']] as const) {
      expect(r.dependencies).toEqual([dep('ok', { versionSpec: '1' })]);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain(`"${key}"`);
    }
  });

  it('3.17 rawName equals name without normalization, for mixed-case names and renames', () => {
    const r = parse('[dependencies]\nSerde_JSON = "1"\nalias = { package = "Foo_Bar" }\n');
    for (const d of r.dependencies) expect(d.rawName).toBe(d.name);
    expect(r.dependencies.map((d) => d.name)).toEqual(['Foo_Bar', 'Serde_JSON']);
  });

  it('3.18 the top-level table beats target tables even when target tables are written first', () => {
    const text = [
      "[target.'cfg(unix)'.dependencies]",
      'serde = "2"',
      "[target.'cfg(windows)'.dependencies]",
      'serde = "3"',
      '[dependencies]',
      'serde = "1"',
      '',
    ].join('\n');
    const r = parse(text);
    expect(r.dependencies).toEqual([dep('serde', { versionSpec: '1' })]);

    // Expected cfg order comes from the keys the wrapper returns for the target table.
    const wrapped = parseToml(text);
    if (!wrapped.ok) throw new Error('fixture must parse');
    const cfgs = Object.keys(wrapped.value['target'] as Record<string, unknown>);
    expect(cfgs.sort()).toEqual(["cfg(unix)", "cfg(windows)"]);
    const ordered = Object.keys(wrapped.value['target'] as Record<string, unknown>);
    const expected = ordered.map(
      (cfg) =>
        `Cargo.toml table [target.'${cfg}'.dependencies]: duplicate dependency "serde" in scope "runtime"; the first occurrence was kept.`,
    );
    expect(r.warnings).toEqual(expected);
  });

  it('3.18 literal example: the cfg tables follow the wrapper key order', () => {
    const r = parse("[target.'cfg(unix)'.dependencies]\nserde = \"2\"\n[target.'cfg(windows)'.dependencies]\nserde = \"3\"\n");
    // Only target tables: the first one in enumeration order (header order here) wins.
    expect(r.dependencies).toEqual([dep('serde', { versionSpec: '2' })]);
    expect(r.warnings).toEqual([
      `Cargo.toml table [target.'cfg(windows)'.dependencies]: duplicate dependency "serde" in scope "runtime"; the first occurrence was kept.`,
    ]);
  });

  it('3.19 duplicate warnings name the package and the table, with no line or column', () => {
    const r = parse(
      "[target.'cfg(unix)'.dependencies]\nserde = \"2\"\n[dependencies]\nserde = \"1\"\n",
    );
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain(`Cargo.toml table [target.'cfg(unix)'.dependencies]`);
    expect(r.warnings[0]).toContain('"serde"');
    expect(r.warnings[0]).not.toMatch(/line|column/i);
  });

  it('4.6 [dependencies] and [dev-dependencies] give two entries; same-scope repeat gives one warning', () => {
    const r = parse(
      "[dependencies]\nserde = \"1\"\n[dev-dependencies]\nserde = \"1\"\n[build-dependencies]\nx = \"1\"\n[target.a.build-dependencies]\nx = \"2\"\n",
    );
    expect(r.dependencies.filter((d) => d.name === 'serde').map((d) => d.scope)).toEqual(['runtime', 'dev']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('"x"');
    expect(r.warnings[0]).toContain('"build"');
  });

  it('4.9 __proto__ is an ordinary dependency name', () => {
    const r = parse('[dependencies]\n"__proto__" = "1"\n');
    expect(r.dependencies).toEqual([dep('__proto__', { versionSpec: '1' })]);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});
