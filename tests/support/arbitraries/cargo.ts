// Cargo.toml arbitraries (design: Generator strategy: manifests, Cargo.toml rows).
// A valid manifest is built from a model (entries), laid out into blocks (tables, entry headers, traps),
// then rendered with a chosen line ending and optional BOM. The expected Dependencies come from the model
// only (`expectedCargoDependencies`), never from the text or the parser.
import * as fc from 'fast-check';
import type { Dependency, Scope, SourceKind } from '../../../core/model';
import { sortInDependencyOrder } from '../oracles/manifest-model';
import { arbMutatedText, arbNoise } from './tokens';

export type CargoScope = Extract<Scope, 'runtime' | 'dev' | 'build'>;

export const CARGO_TABLE_NAME: Readonly<Record<CargoScope, string>> = {
  runtime: 'dependencies',
  dev: 'dev-dependencies',
  build: 'build-dependencies',
};
const CARGO_SCOPES: readonly CargoScope[] = ['runtime', 'dev', 'build'];

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** A dependency value: `name = "spec"` or an inline/header table with optional fields. */
export type CargoValue =
  | { readonly kind: 'string'; readonly spec: string }
  | {
      readonly kind: 'table';
      readonly version?: string;
      readonly git?: string;
      readonly path?: string;
      /** Raw TOML `key = value` fragments that the parser must ignore (`features = ["[dependencies]"]`). */
      readonly extras: readonly string[];
    };

/** One crate in one scope. The TOML key is `alias` when present (and `package = name` is written), else `name`. */
export interface CargoEntry {
  readonly name: string;
  readonly scope: CargoScope;
  readonly value: CargoValue;
  readonly alias?: string;
}

export const cargoKeyOf = (e: CargoEntry): string => e.alias ?? e.name;

/** Source kind and versionSpec by criteria 3.4 to 3.6, 3.11, 3.12 (git beats path beats version), written from the glossary. */
export function cargoOutcome(v: CargoValue): { versionSpec: string; sourceKind: SourceKind } {
  if (v.kind === 'string') return { versionSpec: v.spec, sourceKind: 'registry' };
  if (v.git !== undefined) return { versionSpec: v.git, sourceKind: 'git' };
  if (v.path !== undefined) return { versionSpec: v.path, sourceKind: 'path' };
  return { versionSpec: v.version ?? '*', sourceKind: 'registry' };
}

/** Expected parser output for entries with no duplicate `(name, scope)`, in Dependency_Order. */
export function expectedCargoDependencies(entries: readonly CargoEntry[]): Dependency[] {
  return sortInDependencyOrder(
    entries.map((e) => ({
      name: e.name,
      rawName: e.name,
      ecosystem: 'cargo' as const,
      scope: e.scope,
      ...cargoOutcome(e.value),
    })),
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** A TOML basic string. Escapes quotes, backslashes, control characters and DEL; other characters stay as they are. */
export function tomlString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += '\\\\';
    else if (c < 0x20 || c === 0x7f) out += `\\u${c.toString(16).padStart(4, '0')}`;
    else out += s.charAt(i);
  }
  return out + '"';
}

function renderFields(v: Extract<CargoValue, { kind: 'table' }>, alias: string | undefined, name: string): string[] {
  const fields: string[] = [];
  if (alias !== undefined) fields.push(`package = ${tomlString(name)}`);
  if (v.version !== undefined) fields.push(`version = ${tomlString(v.version)}`);
  if (v.git !== undefined) fields.push(`git = ${tomlString(v.git)}`);
  if (v.path !== undefined) fields.push(`path = ${tomlString(v.path)}`);
  fields.push(...v.extras);
  return fields;
}

/** `key = value` for the inline style. */
export function renderInlineEntry(e: CargoEntry): string {
  const key = tomlString(cargoKeyOf(e));
  if (e.value.kind === 'string') {
    // A string value cannot carry a rename, so a renamed string entry is written as an inline table.
    return e.alias === undefined
      ? `${key} = ${tomlString(e.value.spec)}`
      : `${key} = { package = ${tomlString(e.name)}, version = ${tomlString(e.value.spec)} }`;
  }
  return `${key} = { ${renderFields(e.value, e.alias, e.name).join(', ')} }`;
}

/** Header style: `[dependencies."key"]` followed by one field per line. */
export function renderHeaderEntry(e: CargoEntry, cfg: string | null, eol: string): string {
  const prefix = cfg === null ? '' : `target.${tomlString(cfg)}.`;
  const header = `[${prefix}${CARGO_TABLE_NAME[e.scope]}.${tomlString(cargoKeyOf(e))}]`;
  const fields =
    e.value.kind === 'string'
      ? [...(e.alias === undefined ? [] : [`package = ${tomlString(e.name)}`]), `version = ${tomlString(e.value.spec)}`]
      : renderFields(e.value, e.alias, e.name);
  return [header, ...fields].join(eol);
}

export type CargoBlock =
  /** `[dependencies]` or `[target.<cfg>.dependencies]` with one inline entry per line, in this order. */
  | { readonly kind: 'table'; readonly scope: CargoScope; readonly cfg: string | null; readonly entries: readonly CargoEntry[] }
  /** One entry under its own header. */
  | { readonly kind: 'entry'; readonly cfg: string | null; readonly entry: CargoEntry }
  /** Verbatim text that must not change the dependencies (written with `\n`; converted to the layout's line ending). */
  | { readonly kind: 'trap'; readonly text: string };

export interface CargoLayout {
  readonly blocks: readonly CargoBlock[];
  readonly eol: '\n' | '\r\n';
  readonly bom: boolean;
  readonly trailingEol: boolean;
}

export function renderCargo(layout: CargoLayout): string {
  const { eol } = layout;
  const parts = layout.blocks.map((b): string => {
    if (b.kind === 'trap') return b.text.replace(/\r?\n/g, eol);
    if (b.kind === 'entry') return renderHeaderEntry(b.entry, b.cfg, eol);
    const prefix = b.cfg === null ? '' : `target.${tomlString(b.cfg)}.`;
    return [`[${prefix}${CARGO_TABLE_NAME[b.scope]}]`, ...b.entries.map(renderInlineEntry)].join(eol);
  });
  const body = parts.join(eol) + (layout.trailingEol && parts.length > 0 ? eol : '');
  return (layout.bom ? '\uFEFF' : '') + body;
}

// ---------------------------------------------------------------------------
// Traps: text that looks like headers or dependency entries but is not
// ---------------------------------------------------------------------------

/** Distinct table headers, so any subset is valid TOML. None of them changes the dependencies. */
export const CARGO_TRAP_TABLES: readonly string[] = [
  '[package]\nname = "x"\ndescription = """\n[dependencies]\nfoo = "1"\n[dev-dependencies]\n"""',
  "[package.metadata.docs]\nnote = '''\n[target.'cfg(unix)'.dependencies]\nzzz = \"9\"\n'''",
  '[features]\ndefault = [\n  "[dependencies]",\n  # [build-dependencies]\n  "x",\n]',
  '[lib]  # [dev-dependencies]\nname = "lib"',
  '[profile.release]\nopt-level = 3 # [dependencies]\nnote = "[dependencies] = 1"',
  '[workspace]\nmembers = ["a", "[dependencies]"]',
  '[workspace.dependencies]\nserde = "1"',
  '[package.metadata]\ndependencies = { inner = "1" }\n"dev-dependencies" = "not a table"',
  '[patch.crates-io]\nserde = { git = "https://example.com/serde" }',
];

/** Lines that may be repeated anywhere between blocks. */
export const CARGO_TRAP_COMMENTS: readonly string[] = [
  '# [dependencies]',
  '# serde = "1"',
  '   # [dev-dependencies]',
  '#[target.\'cfg(unix)\'.dependencies]',
  '',
];

// ---------------------------------------------------------------------------
// Entry arbitraries
// ---------------------------------------------------------------------------

const ALIAS_PREFIX = 'alias#';

const arbGraphemes = (maxLength: number, minLength = 0): fc.Arbitrary<string> =>
  fc.string({ unit: 'grapheme', minLength, maxLength });

/** Crate names: bare-key-like, integer-like, mixed case, `_` against `-`, astral against high BMP, proto names, free text. */
export const arbCargoName: fc.Arbitrary<string> = fc
  .oneof(
    { weight: 4, arbitrary: fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_-]{0,15}$/) },
    { weight: 2, arbitrary: fc.constantFrom('1', '2', '10', '42', '007', '4294967295', '4294967296') },
    { weight: 2, arbitrary: fc.constantFrom('serde', 'Serde', 'serde_json', 'serde-json', 'Serde_Json', 'a.b', 'a b') },
    { weight: 2, arbitrary: fc.constantFrom('\uFF5E', '\u{1F600}', '\uFF5E\u{1F600}', '\u{10000}', '\uFFFF', 'a\u{1F600}', 'a\uFF5E') },
    { weight: 2, arbitrary: fc.constantFrom('__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf') },
    { weight: 2, arbitrary: arbGraphemes(8, 1) },
  )
  .filter((n) => n.length > 0 && !n.startsWith(ALIAS_PREFIX));

const SPEC_DICTIONARY = ['1.0', '^0.3', '*', '=1.2.3', '>=1, <2', '', '1', '0.1.0-alpha.1+build'] as const;
const arbCargoSpec: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...SPEC_DICTIONARY) },
  { weight: 1, arbitrary: arbGraphemes(10) },
);
const arbCargoUrl: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('https://example.com/a.git', 'git://h/r', 'ssh://git@h/r.git', "https://h/r'q\"x"),
  arbGraphemes(10),
);
const arbCargoPath: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('../crate', './x', '/abs/y', 'C:\\Users\\x'),
  arbGraphemes(10),
);

/** Extras never carry a package, version, git or path key. Some contain header-looking text inside arrays and strings. */
const EXTRAS = [
  'optional = true',
  'default-features = false',
  'features = ["[dependencies]", "x"]',
  'registry = "[target.\'cfg(unix)\'.dependencies]"',
  'workspace = false',
] as const;
const arbExtras = fc.subarray([...EXTRAS], { maxLength: 3 });

export const arbCargoValue: fc.Arbitrary<CargoValue> = fc.oneof(
  { weight: 3, arbitrary: arbCargoSpec.map((spec): CargoValue => ({ kind: 'string', spec })) },
  {
    weight: 4,
    arbitrary: fc
      .record({
        version: fc.option(arbCargoSpec, { nil: undefined }),
        git: fc.option(arbCargoUrl, { nil: undefined, freq: 3 }),
        path: fc.option(arbCargoPath, { nil: undefined, freq: 3 }),
        extras: arbExtras,
      })
      .map(({ version, git, path, extras }): CargoValue => ({
        kind: 'table',
        extras,
        ...(version === undefined ? {} : { version }),
        ...(git === undefined ? {} : { git }),
        ...(path === undefined ? {} : { path }),
      })),
  },
);

/** Entries with no two sharing `(name, scope)`; about a fifth are written under an alias key with `package = name`. */
export const arbCargoEntries = (maxLength = 12): fc.Arbitrary<CargoEntry[]> =>
  fc
    .uniqueArray(
      fc.record({
        name: arbCargoName,
        scope: fc.constantFrom(...CARGO_SCOPES),
        value: arbCargoValue,
      }),
      { maxLength, selector: (e) => JSON.stringify([e.name, e.scope]) },
    )
    .map((list) =>
      list.map(
        (e, i): CargoEntry => ({
          name: e.name,
          scope: e.scope,
          value: e.value,
          ...(i % 5 === 2 ? { alias: `${ALIAS_PREFIX}${i}` } : {}),
        }),
      ),
    );

// ---------------------------------------------------------------------------
// Layout arbitraries
// ---------------------------------------------------------------------------

/** cfg strings, including ones with `.`, quotes and integer-like keys. */
export const CARGO_CFGS: readonly string[] = [
  'cfg(unix)',
  'cfg(windows)',
  'cfg(target_os = "linux")',
  "cfg(feature = 'x')",
  'cfg(a.b)',
  'x86_64-pc-windows-msvc',
  'a.b.c',
  "'",
  '"',
  '1',
  '10',
  '2',
];

const arbCfg: fc.Arbitrary<string | null> = fc.oneof(
  { weight: 2, arbitrary: fc.constant(null) },
  { weight: 3, arbitrary: fc.constantFrom(...CARGO_CFGS) },
);

/** Line ending, BOM and trailing newline for a layout. */
export const arbCargoRenderOptions = fc.record({
  eol: fc.constantFrom('\n' as const, '\r\n' as const),
  bom: fc.boolean(),
  trailingEol: fc.boolean(),
});

/**
 * A layout of `entries`: each entry gets a table (top level or a cfg), an inline or header style, and a position;
 * trap tables and comment lines are mixed in. Inline entries of one `(scope, cfg)` share one block (a table may be
 * written once). Different layouts of the same entries must parse to the same Dependencies.
 */
export const arbCargoLayout = (
  entries: readonly CargoEntry[],
  opts: { traps?: boolean } = {},
): fc.Arbitrary<CargoLayout> => {
  const withTraps = opts.traps ?? true;
  const arbPlacement = fc.record({ cfg: arbCfg, header: fc.boolean(), prio: fc.nat({ max: 1000 }) });
  return fc
    .record({
      placements: fc.tuple(...entries.map(() => arbPlacement)),
      traps: withTraps ? fc.subarray([...CARGO_TRAP_TABLES]) : fc.constant([] as string[]),
      trapPrios: fc.array(fc.nat({ max: 1000 }), { minLength: CARGO_TRAP_TABLES.length, maxLength: CARGO_TRAP_TABLES.length }),
      comments: withTraps
        ? fc.array(fc.tuple(fc.constantFrom(...CARGO_TRAP_COMMENTS), fc.nat({ max: 1000 })), { maxLength: 4 })
        : fc.constant([] as [string, number][]),
      render: arbCargoRenderOptions,
    })
    .map(({ placements, traps, trapPrios, comments, render }) => {
      const prioritized: { prio: number; block: CargoBlock }[] = [];
      const tables = new Map<string, { prio: number; scope: CargoScope; cfg: string | null; entries: { prio: number; e: CargoEntry }[] }>();
      entries.forEach((e, i) => {
        const p = placements[i];
        const asHeader = p.header && (e.value.kind === 'table' || e.value.kind === 'string');
        if (asHeader) {
          prioritized.push({ prio: p.prio, block: { kind: 'entry', cfg: p.cfg, entry: e } });
          return;
        }
        const k = JSON.stringify([e.scope, p.cfg]);
        const t = tables.get(k) ?? { prio: p.prio, scope: e.scope, cfg: p.cfg, entries: [] };
        t.prio = Math.min(t.prio, p.prio);
        t.entries.push({ prio: p.prio, e });
        tables.set(k, t);
      });
      for (const t of tables.values()) {
        const sorted = [...t.entries].sort((a, b) => a.prio - b.prio);
        prioritized.push({ prio: t.prio, block: { kind: 'table', scope: t.scope, cfg: t.cfg, entries: sorted.map((x) => x.e) } });
      }
      traps.forEach((text) => {
        prioritized.push({ prio: trapPrios[CARGO_TRAP_TABLES.indexOf(text)], block: { kind: 'trap', text } });
      });
      for (const [text, prio] of comments) prioritized.push({ prio, block: { kind: 'trap', text } });
      prioritized.sort((a, b) => a.prio - b.prio);
      return { blocks: prioritized.map((x) => x.block), ...render } satisfies CargoLayout;
    });
};

// ---------------------------------------------------------------------------
// Valid text, mutated text, trap text, noise
// ---------------------------------------------------------------------------

export interface CargoValidManifest {
  readonly entries: readonly CargoEntry[];
  readonly layout: CargoLayout;
  readonly text: string;
  readonly expected: readonly Dependency[];
}

/** Valid Cargo.toml text with its model and the expected Dependencies (no warnings are expected). */
export const arbCargoValid: fc.Arbitrary<CargoValidManifest> = arbCargoEntries().chain((entries) =>
  arbCargoLayout(entries).map((layout) => ({
    entries,
    layout,
    text: renderCargo(layout),
    expected: expectedCargoDependencies(entries),
  })),
);

/** Valid Cargo.toml text only. Reused by the cross-format tests. */
export const arbCargoText: fc.Arbitrary<string> = arbCargoValid.map((v) => v.text);

/** One model rendered with two independent layouts (permuted entries, tables and blocks, line endings, BOM). */
export const arbCargoTwoLayouts: fc.Arbitrary<{
  entries: readonly CargoEntry[];
  a: CargoLayout;
  b: CargoLayout;
}> = arbCargoEntries().chain((entries) =>
  fc.tuple(arbCargoLayout(entries), arbCargoLayout(entries)).map(([a, b]) => ({ entries, a, b })),
);

const TRAP_LINES: readonly string[] = [
  '[dependencies]',
  '[dev-dependencies]',
  '[build-dependencies]',
  "[target.'cfg(unix)'.dependencies]",
  '[dependencies.foo]',
  '[[dependencies]]',
  '# [dependencies]',
  'a = """',
  '"""',
  "b = '''",
  "'''",
  'c = [',
  ']',
  '"[dependencies]",',
  'foo = "1" # [dev-dependencies]',
  'foo = { version = "1", git = "u" }',
  '"__proto__" = "1"',
  '__proto__ = { path = "../p" }',
  'version = "1"',
  'package = "x"',
  '',
];

/** Lines made of header-looking and string-opening text, with mixed line endings and an optional BOM. */
export const arbCargoTrapText: fc.Arbitrary<string> = fc
  .record({
    lines: fc.array(fc.oneof(fc.constantFrom(...TRAP_LINES), arbGraphemes(10)), { maxLength: 25 }),
    eol: fc.constantFrom('\n', '\r\n', '\r'),
    bom: fc.boolean(),
  })
  .map(({ lines, eol, bom }) => (bom ? '\uFEFF' : '') + lines.join(eol));

/** Valid text with one to three mutations. */
export const arbCargoMutated: fc.Arbitrary<string> = arbMutatedText(arbCargoText);

/** Pure and token noise for Cargo.toml. */
export const arbCargoNoise: fc.Arbitrary<string> = arbNoise('Cargo.toml');

/** Any text: valid, mutated, trap, noise. */
export const arbAnyCargoText: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: arbCargoText },
  { weight: 3, arbitrary: arbCargoMutated },
  { weight: 2, arbitrary: arbCargoTrapText },
  { weight: 2, arbitrary: arbCargoNoise },
);

// ---------------------------------------------------------------------------
// Duplicate model (task 5.21): entries that share a Dependency_Key across tables
// ---------------------------------------------------------------------------

/** Names that must stay ordinary keys (criterion 4.9). */
export const CARGO_PROTO_NAMES: readonly string[] = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty'];

/** One written entry of a duplicate model. `key` is the TOML key; `name` the package (the `package` value when it differs from `key`). */
export interface CargoDupEntry {
  readonly name: string;
  readonly key: string;
  /** package = name is written (always when key differs from 
ame). */
  readonly package: boolean;
  readonly scope: CargoScope;
  /** `null`: top-level table of the scope; else the `<cfg>` of `[target.<cfg>.<table>]`. */
  readonly cfg: string | null;
  /** Written under its own `[<table>.<key>]` header instead of inside `[<table>]`. */
  readonly header: boolean;
  readonly value: CargoValue;
}

export interface CargoDupModel {
  /** Entries in the order their keys come into existence in the text (the insertion order smol-toml sees). */
  readonly entries: readonly CargoDupEntry[];
  readonly layout: CargoLayout;
  readonly text: string;
}

/** Makes `versionSpec` unique per entry (so a test can tell which occurrence was kept) without changing the source kind. */
function tagValue(v: CargoValue, tag: string): CargoValue {
  if (v.kind === 'string') return { kind: 'string', spec: `${v.spec}~${tag}` };
  const hasSource = v.git !== undefined || v.path !== undefined;
  return {
    kind: 'table',
    extras: v.extras,
    ...(v.version !== undefined || !hasSource ? { version: `${v.version ?? ''}~${tag}` } : {}),
    ...(v.git === undefined ? {} : { git: `${v.git}~${tag}` }),
    ...(v.path === undefined ? {} : { path: `${v.path}~${tag}` }),
  };
}

/**
 * Cargo manifests whose entries share `(name, scope)`: `[dependencies]` against several `[target.<cfg>.*]` tables,
 * `[dependencies.foo]` entry headers, `package` renames under other keys, headers in any order.
 * Names come from a small pool taken from `arbName`, so collisions are frequent.
 */
export const arbCargoDupModel = (arbName: fc.Arbitrary<string> = arbCargoName, maxLength = 14): fc.Arbitrary<CargoDupModel> =>
  fc
    .tuple(
      fc.uniqueArray(arbName, { minLength: 1, maxLength: 4 }),
      fc.array(
        fc.record({
          pick: fc.nat({ max: 3 }),
          keyMode: fc.nat({ max: 5 }),
          keyPick: fc.nat({ max: 3 }),
          scope: fc.constantFrom(...CARGO_SCOPES),
          cfg: arbCfg,
          header: fc.boolean(),
          value: arbCargoValue,
          prio: fc.nat({ max: 1000 }),
        }),
        { minLength: 2, maxLength },
      ),
      fc.subarray([...CARGO_TRAP_TABLES]),
      fc.array(fc.nat({ max: 1000 }), { minLength: CARGO_TRAP_TABLES.length, maxLength: CARGO_TRAP_TABLES.length }),
      arbCargoRenderOptions,
    )
    .map(([pool, raws, traps, trapPrios, render]) => {
      const used = new Set<string>();
      const picked: { e: CargoDupEntry; prio: number }[] = [];
      raws.forEach((r, i) => {
        const name = pool[r.pick % pool.length];
        // keyMode: 0 or 1 the name itself, 2 the name with an explicit `package`, 3 another pool name, 4 and 5 a fresh alias.
        const key = r.keyMode <= 2 ? name : r.keyMode === 3 ? pool[r.keyPick % pool.length] : `${ALIAS_PREFIX}${i}`;
        const slot = JSON.stringify([r.scope, r.cfg, key]);
        if (used.has(slot)) return; // one key per table
        used.add(slot);
        picked.push({
          e: { name, key, package: key !== name || r.keyMode === 2, scope: r.scope, cfg: r.cfg, header: r.header, value: tagValue(r.value, String(i)) },
          prio: r.prio,
        });
      });

      const toCargoEntry = (e: CargoDupEntry): CargoEntry => ({
        name: e.name,
        scope: e.scope,
        value: e.value,
        ...(e.package ? { alias: e.key } : {}),
      });

      const blocks: { prio: number; block: CargoBlock; order: CargoDupEntry[] }[] = [];
      const tables = new Map<string, { prio: number; scope: CargoScope; cfg: string | null; items: { prio: number; e: CargoDupEntry }[] }>();
      for (const { e, prio } of picked) {
        if (e.header) {
          blocks.push({ prio, block: { kind: 'entry', cfg: e.cfg, entry: toCargoEntry(e) }, order: [e] });
          continue;
        }
        const k = JSON.stringify([e.scope, e.cfg]);
        const t = tables.get(k) ?? { prio, scope: e.scope, cfg: e.cfg, items: [] };
        t.prio = Math.min(t.prio, prio);
        t.items.push({ prio, e });
        tables.set(k, t);
      }
      for (const t of tables.values()) {
        const items = [...t.items].sort((a, b) => a.prio - b.prio);
        blocks.push({
          prio: t.prio,
          block: { kind: 'table', scope: t.scope, cfg: t.cfg, entries: items.map((x) => toCargoEntry(x.e)) },
          order: items.map((x) => x.e),
        });
      }
      traps.forEach((text) => {
        blocks.push({ prio: trapPrios[CARGO_TRAP_TABLES.indexOf(text)], block: { kind: 'trap', text }, order: [] });
      });
      blocks.sort((a, b) => a.prio - b.prio);
      const layout: CargoLayout = { blocks: blocks.map((b) => b.block), ...render };
      return { entries: blocks.flatMap((b) => b.order), layout, text: renderCargo(layout) } satisfies CargoDupModel;
    });
