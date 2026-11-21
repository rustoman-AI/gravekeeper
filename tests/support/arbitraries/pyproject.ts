// pyproject.toml arbitraries (pyproject spec, design: Round trip, Generator strategy).
// - arbPyprojectDependencies: Dependency lists for the round trip (PY-P2), no repeated (name, scope).
// - arbHostilePyprojectText: TOML-shaped and hostile texts (PY-P1).
// - arbGroupsWithIncludes: PEP 735 groups with Include_Entries (PY-P7).
// - arbPoetryOptionalModel / arbScopeModel: tables with `optional` flags and every table kind (PY-P6).
// Expected values come from the models, never from the parser.
import * as fc from 'fast-check';
import type { Dependency, Scope, SourceKind } from '../../../core/model';
import { oracleNormalize } from '../oracles/manifest-model';
import { tomlBasicString } from '../oracles/pyproject-writer';
import { arbNameToken, arbRespelling, MIXED_CASE_NAMES } from './requirements';

const q = tomlBasicString;

// ---------------------------------------------------------------------------
// Names and specs
// ---------------------------------------------------------------------------

/**
 * Name tokens with mixed case and separator runs. A name that normalizes to `python` is excluded because
 * Poetry tables skip that key (requirement 5.4).
 */
export const arbPyprojectName: fc.Arbitrary<string> = fc
  .oneof(
    { weight: 1, arbitrary: fc.constantFrom(...MIXED_CASE_NAMES) },
    { weight: 1, arbitrary: fc.constantFrom('a', 'A', 'a-', 'a.', 'A__b', 'a-._b', 'x1', '0', '9z') },
    { weight: 4, arbitrary: arbNameToken },
  )
  .filter((n) => oracleNormalize(n) !== 'python');

const arbVersion = fc.array(fc.nat({ max: 30 }), { minLength: 2, maxLength: 3 }).map((p) => p.join('.'));

const COMPARISONS = ['>=', '>', '<=', '<', '==', '!=', '~='] as const;

/**
 * The restricted forms of the design ("Round trip"): `*`, or one to three comparison terms joined by `,`
 * with numeric versions of two or three parts.
 */
export const arbRestrictedVersionSpec: fc.Arbitrary<string> = fc.oneof(
  { weight: 1, arbitrary: fc.constant('*') },
  {
    weight: 5,
    arbitrary: fc
      .array(fc.tuple(fc.constantFrom(...COMPARISONS), arbVersion), { minLength: 1, maxLength: 3 })
      .map((terms) => terms.map(([op, v]) => `${op}${v}`).join(',')),
  },
);

const arbWord = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);

const arbGitSpec: fc.Arbitrary<string> = fc
  .tuple(arbWord, fc.option(arbWord, { nil: undefined }))
  .map(([r, ref]) => `git+https://h.example/${r}.git${ref === undefined ? '' : `@${ref}`}`);

const arbPathSpec: fc.Arbitrary<string> = fc.oneof(
  arbWord.map((p) => `./${p}`),
  arbWord.map((p) => `../${p}`),
  arbWord.map((p) => `/${p}/abs`),
  fc.constant('file:///z'),
);

const arbSourceKind: fc.Arbitrary<SourceKind> = fc.oneof(
  { weight: 6, arbitrary: fc.constant<SourceKind>('registry') },
  { weight: 1, arbitrary: fc.constant<SourceKind>('git') },
  { weight: 1, arbitrary: fc.constant<SourceKind>('path') },
);

const arbSpecFor = (kind: SourceKind): fc.Arbitrary<string> =>
  kind === 'registry' ? arbRestrictedVersionSpec : kind === 'git' ? arbGitSpec : arbPathSpec;

const WRITER_SCOPES: readonly Scope[] = ['runtime', 'dev', 'optional'];

/** One Dependency whose `rawName` is a respelling of the normalized `name` (or the name itself). */
const arbDependency: fc.Arbitrary<Dependency> = arbPyprojectName.chain((written) =>
  fc
    .tuple(fc.constantFrom(...WRITER_SCOPES), arbSourceKind, fc.boolean().chain((r) => (r ? arbRespelling(written) : fc.constant(written))))
    .chain(([scope, sourceKind, spelled]) =>
      arbSpecFor(sourceKind).map(
        (versionSpec): Dependency => ({
          name: oracleNormalize(spelled),
          rawName: spelled,
          ecosystem: 'pypi',
          versionSpec,
          scope,
          sourceKind,
        }),
      ),
    ),
);

/**
 * Dependency lists with no repeated `(normalized name, scope)`, in generated order.
 * The Poetry style writes `runtime` and `optional` entries into one table, so one name cannot appear in both
 * scopes there. Pass `{ poetrySafe: true }` to keep such lists out; the default lists suit the PEP 621 style
 * and, with the flag, both styles.
 */
export const arbPyprojectDependencies = (maxLength = 12, opts: { poetrySafe?: boolean } = {}): fc.Arbitrary<Dependency[]> =>
  fc.uniqueArray(arbDependency, {
    maxLength,
    selector: (d) => JSON.stringify([d.name, opts.poetrySafe === true && d.scope !== 'dev' ? 'main' : d.scope]),
  });

// ---------------------------------------------------------------------------
// Hostile and TOML-shaped text (PY-P1)
// ---------------------------------------------------------------------------

/** Valid or nearly valid tables with values of the wrong type, odd shapes and proto names. */
export const PYPROJECT_FRAGMENTS: readonly string[] = [
  '[project]\nname = "p"\ndependencies = "x"',
  '[project]\ndependencies = [1, true, { a = 1 }, ["x"], "a @ ", "a\\\\b", "", "  ", "-r x", "a @ git+", "p"]',
  '[project]\ndependencies = ["requests[socks]>=2 ; python_version >= \'3\'", "pkg @ ./x#frag", "n @ file:x"]',
  '[project]\ndynamic = ["dependencies"]',
  '[project]\ndynamic = "dependencies"\ndependencies = 1',
  '[project]\ndependencies = []\noptional-dependencies = 1',
  '[project.optional-dependencies]\nx = "y"\n"" = ["a"]\n__proto__ = ["a"]\nconstructor = [{}]',
  '[project.optional-dependencies]\ndocs = ["a", "b>=1"]\ntest = []',
  '[dependency-groups]\ng = [{ include-group = 1 }, {}, { include-group = "g" }, { include-group = "nope" }, 3]',
  '[dependency-groups]\n__proto__ = ["a"]\nprototype = "x"\n"a.b" = ["c"]',
  '[tool.poetry.dependencies]\npython = "^3.8"\nfoo = 1\nbar = [{ version = "1" }, 2, { git = 3 }]\n"a b" = "1"\n"" = "1"',
  '[tool.poetry.dependencies]\nfoo = "^1 || ^2"\nbar = ">=1.*"\nbaz = { version = "~1.2", optional = "yes" }\nqux = { git = "u", path = "p", url = "z" }',
  '[tool.poetry.dependencies.__proto__]\nversion = "1"',
  '[tool.poetry]\ngroup = 1\ndev-dependencies = []',
  '[tool.poetry.group.x]\ndependencies = []',
  '[tool.poetry.group.__proto__.dependencies]\na = "*"',
  '[tool.poetry.dev-dependencies]\na = "1"\nb = { version = "^0.0.3" }\n"c.d" = "*"',
  'tool = 1',
  'tool.poetry = []',
  'project = []',
  '__proto__ = { x = 1 }\n[__proto__]\ny = 2',
  '[constructor]\nprototype = { toString = 1 }',
  '[[project.dependencies]]\nname = "a"',
  '[[tool.poetry.dependencies]]\nname = "a"',
  'a = 1979-05-27T07:32:00Z\nb = 1.5e3\nc = 0xDEADBEEF\nd = inf\ne = nan\nf = 07:32:00',
  "s = '''\n[project]\ndependencies = [\"x\"]\n'''",
  '# [project]\n# dependencies = ["x"]',
];

const arbEol = fc.constantFrom('\n', '\r\n');

/** A key in one of its odd spellings: dotted, quoted, empty, unicode, escaped, with a lone surrogate. */
export const arbOddKey: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    '""',
    '"a.b"',
    '"a b"',
    '"\\u00e9"',
    "'lit.eral'",
    '"\\u0000"',
    '__proto__',
    'constructor',
    '"__proto__"',
    'a.b.c',
    '"\u{1F600}"',
    '"\uD800"',
    '"\uDC00x"',
    '1234',
    '-',
    '_',
  ),
  fc.stringMatching(/^[A-Za-z0-9_-]{1,10}$/),
  fc.string({ unit: 'binary', minLength: 1, maxLength: 6 }).map((s) => `"${s.replace(/["\\\n\r]/g, '')}"`),
);

const repeat = (s: string, n: number): string => s.repeat(n);

/** Generated fragments: deep nesting, large arrays, odd keys, lone surrogates, repeated tables. */
export const arbGeneratedFragment: fc.Arbitrary<string> = fc.oneof(
  // deep table path, with or without a dependency key at the end
  fc
    .tuple(fc.integer({ min: 1, max: 300 }), fc.constantFrom('a', 'project', 'tool', 'poetry'))
    .map(([n, seg]) => `[${Array.from({ length: n }, (_, i) => (i % 2 === 0 ? seg : 'b')).join('.')}]\nx = 1`),
  // deep inline arrays and tables
  fc.integer({ min: 1, max: 400 }).map((n) => `deep = ${repeat('[', n)}${repeat(']', n)}`),
  fc.integer({ min: 1, max: 300 }).map((n) => `deep = ${repeat('{ a = ', n)}1${repeat(' }', n)}`),
  // a huge array of requirement strings, bounded far below MAX_MANIFEST_LENGTH
  fc
    .tuple(fc.integer({ min: 100, max: 4000 }), fc.constantFrom('project', 'dependency-groups', 'project.optional-dependencies'))
    .map(([n, table]) => {
      const items = Array.from({ length: n }, (_, i) => `"p${i}>=${i % 9}"`).join(', ');
      return table === 'project' ? `[project]\ndependencies = [${items}]` : `[${table}]\ng = [${items}]`;
    }),
  // a huge Poetry table
  fc
    .integer({ min: 100, max: 3000 })
    .map((n) => `[tool.poetry.dependencies]\n${Array.from({ length: n }, (_, i) => `p${i} = "^${i % 9}.0"`).join('\n')}`),
  // odd keys in every table kind
  fc
    .tuple(
      fc.constantFrom('[tool.poetry.dependencies]', '[tool.poetry.dev-dependencies]', '[dependency-groups]', '[project.optional-dependencies]'),
      fc.array(fc.tuple(arbOddKey, fc.constantFrom('"1"', '"^1.2"', '["a"]', '{ version = "1" }', '1', '{}', '[]')), { maxLength: 6 }),
    )
    .map(([header, entries]) => `${header}\n${entries.map(([k, v]) => `${k} = ${v}`).join('\n')}`),
  // raw lone surrogates in a string value or a comment (invalid UTF-16)
  fc
    .tuple(fc.constantFrom('\uD800', '\uDBFF', '\uDC00', '\uDFFF'), fc.constantFrom('a', '', '\u{1F600}'))
    .map(([s, pad]) => `[project]\ndependencies = ["x${s}${pad}", "y>=1"]\n# ${s}`),
  fc
    .constantFrom('\uD800', '\uDC00')
    .map((s) => `[tool.poetry.dependencies]\n"k${s}" = "1"\nok = "${s}"`),
  // the same table header repeated, sometimes in different forms
  fc
    .tuple(fc.constantFrom('[project]', '[tool.poetry.dependencies]', '[dependency-groups]', '[project.optional-dependencies]'), fc.integer({ min: 2, max: 4 }))
    .map(([h, n]) => Array.from({ length: n }, (_, i) => `${h}\nk${i} = "1"`).join('\n')),
  fc.constantFrom('[a]\n[a]\n', '[a.b]\n[a]\n[a.b]\n', 'a = 1\na = 2', '[project]\n[project]\ndependencies = []'),
);

/** A table fragment: a fixed hostile one or a generated one. */
export const arbTableFragment: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...PYPROJECT_FRAGMENTS) },
  { weight: 2, arbitrary: arbGeneratedFragment },
);

/** Texts for PY-P1: fragments joined, byte noise, and valid fragments with one code unit replaced or removed. */
export const arbHostilePyprojectText: fc.Arbitrary<string> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc
      .tuple(fc.array(arbTableFragment, { maxLength: 6 }), arbEol, fc.boolean())
      .map(([parts, eol, bom]) => (bom ? '\uFEFF' : '') + parts.join(eol)),
  },
  {
    weight: 2,
    arbitrary: fc
      .tuple(fc.array(arbTableFragment, { minLength: 1, maxLength: 3 }), fc.nat(), fc.string({ unit: 'binary', maxLength: 2 }))
      .map(([parts, at, ins]) => {
        const t = parts.join('\n');
        const i = t.length === 0 ? 0 : at % (t.length + 1);
        return t.slice(0, i) + ins + t.slice(i + 1);
      }),
  },
  { weight: 1, arbitrary: fc.string({ unit: 'binary', maxLength: 200 }) },
  { weight: 1, arbitrary: fc.string({ maxLength: 200 }) },
);

// ---------------------------------------------------------------------------
// Groups with Include_Entries (PY-P7)
// ---------------------------------------------------------------------------

export type GroupItem =
  | { readonly kind: 'requirement'; readonly text: string }
  | { readonly kind: 'include'; readonly target: string };

export interface GeneratedGroup {
  readonly name: string;
  readonly items: readonly GroupItem[];
}

export interface GroupsWithIncludes {
  readonly groups: readonly GeneratedGroup[];
  readonly includeCount: number;
  /** `[dependency-groups]` text with the Include_Entries in place. */
  readonly withIncludes: string;
  /** The same text with every Include_Entry removed. */
  readonly withoutIncludes: string;
}

const GROUP_NAMES = ['test', 'dev', 'lint', 'docs', 'a.b', 'Dev', '__proto__', 'constructor', 'x y', ''] as const;

const arbRequirementText: fc.Arbitrary<string> = fc
  .tuple(arbPyprojectName, fc.oneof(fc.constant(''), arbRestrictedVersionSpec.filter((s) => s !== '*')))
  .map(([n, spec]) => `${n}${spec}`);

export function renderGroups(groups: readonly GeneratedGroup[], includes: boolean): string {
  const lines = groups.map((g) => {
    const items = g.items
      .filter((i) => includes || i.kind === 'requirement')
      .map((i) => (i.kind === 'requirement' ? q(i.text) : `{ include-group = ${q(i.target)} }`));
    return `${q(g.name)} = [${items.map((i) => `\n  ${i},`).join('')}${items.length > 0 ? '\n' : ''}]`;
  });
  return `[dependency-groups]\n${lines.join('\n')}\n`;
}

/** Groups with Include_Entries naming other groups, themselves (cycles) and missing groups. */
export const arbGroupsWithIncludes: fc.Arbitrary<GroupsWithIncludes> = fc
  .uniqueArray(fc.constantFrom(...GROUP_NAMES), { minLength: 1, maxLength: 5 })
  .chain((names) => {
    const arbTarget = fc.oneof(
      { weight: 3, arbitrary: fc.constantFrom(...names) },
      { weight: 1, arbitrary: fc.constantFrom('missing', 'Test', '', '__proto__') },
    );
    const arbItem: fc.Arbitrary<GroupItem> = fc.oneof(
      { weight: 3, arbitrary: arbRequirementText.map((text): GroupItem => ({ kind: 'requirement', text })) },
      { weight: 2, arbitrary: arbTarget.map((target): GroupItem => ({ kind: 'include', target })) },
    );
    return fc
      .tuple(...names.map(() => fc.array(arbItem, { maxLength: 5 })))
      .map((itemLists): GroupsWithIncludes => {
        const groups = names.map((name, i): GeneratedGroup => ({ name, items: itemLists[i] }));
        const includeCount = groups.reduce((n, g) => n + g.items.filter((i) => i.kind === 'include').length, 0);
        return {
          groups,
          includeCount,
          withIncludes: renderGroups(groups, true),
          withoutIncludes: renderGroups(groups, false),
        };
      });
  });

// ---------------------------------------------------------------------------
// Table kinds, scopes and `optional` flags (PY-P6)
// ---------------------------------------------------------------------------

export type TableKind =
  | 'project'
  | 'extra'
  | 'group'
  | 'poetry-main'
  | 'poetry-group'
  | 'poetry-dev';

/** The scope that requirement 8.1 gives an entry of this kind (a Poetry main entry with optional = true: optional). */
export function expectedScope(kind: TableKind, optionalFlag: boolean): Scope {
  switch (kind) {
    case 'project':
      return 'runtime';
    case 'poetry-main':
      return optionalFlag ? 'optional' : 'runtime';
    case 'extra':
      return 'optional';
    case 'group':
    case 'poetry-group':
    case 'poetry-dev':
      return 'dev';
  }
}

export interface ScopeEntry {
  readonly kind: TableKind;
  /** The name as written. */
  readonly rawName: string;
  /** Extra name or group name, for the kinds that have one. */
  readonly container: string;
  /** `optional` flag of a Poetry entry: undefined means a plain string or no key. */
  readonly optional: boolean | undefined;
  readonly spec: string;
}

export interface ScopeModel {
  readonly entries: readonly ScopeEntry[];
  readonly text: string;
  /** Expected `(name, rawName, scope)` per entry. Names are distinct after normalization. */
  readonly expected: readonly { readonly name: string; readonly rawName: string; readonly scope: Scope }[];
}

const KINDS: readonly TableKind[] = ['project', 'extra', 'group', 'poetry-main', 'poetry-group', 'poetry-dev'];
const CONTAINERS = ['dev', 'test', '__proto__', 'a.b', 'Docs', 'constructor'] as const;

const POETRY_KINDS: ReadonlySet<TableKind> = new Set(['poetry-main', 'poetry-group', 'poetry-dev']);

const arbScopeEntry = (kinds: readonly TableKind[]): fc.Arbitrary<ScopeEntry> =>
  fc
    .record({
      kind: fc.constantFrom(...kinds),
      rawName: arbPyprojectName,
      container: fc.constantFrom(...CONTAINERS),
      optional: fc.constantFrom<boolean | undefined>(undefined, true, false),
      spec: arbRestrictedVersionSpec,
    })
    .map((e): ScopeEntry => ({ ...e, optional: POETRY_KINDS.has(e.kind) ? e.optional : undefined }));

function poetryEntryValue(e: ScopeEntry): string {
  if (e.optional === undefined) return q(e.spec);
  return `{ version = ${q(e.spec)}, optional = ${e.optional ? 'true' : 'false'} }`;
}

/** Deterministic text for entries of every kind: one block per table, containers in first-seen order. */
export function renderScopeModel(entries: readonly ScopeEntry[]): string {
  const of = (kind: TableKind): ScopeEntry[] => entries.filter((e) => e.kind === kind);
  const byContainer = (list: readonly ScopeEntry[]): Map<string, ScopeEntry[]> => {
    const m = new Map<string, ScopeEntry[]>();
    for (const e of list) m.set(e.container, [...(m.get(e.container) ?? []), e]);
    return m;
  };
  const array = (key: string, list: readonly ScopeEntry[]): string =>
    `${q(key)} = [\n${list.map((e) => `  ${q(e.spec === '*' ? e.rawName : `${e.rawName}${e.spec}`)},`).join('\n')}\n]`;
  const poetryLines = (list: readonly ScopeEntry[]): string =>
    list.map((e) => `${q(e.rawName)} = ${poetryEntryValue(e)}`).join('\n');
  const blocks: string[] = [];
  const project = of('project');
  if (project.length > 0) {
    blocks.push(`[project]\ndependencies = [\n${project.map((e) => `  ${q(e.spec === '*' ? e.rawName : `${e.rawName}${e.spec}`)},`).join('\n')}\n]`);
  }
  const extras = of('extra');
  if (extras.length > 0) {
    blocks.push(`[project.optional-dependencies]\n${[...byContainer(extras)].map(([c, l]) => array(c, l)).join('\n')}`);
  }
  const groups = of('group');
  if (groups.length > 0) {
    blocks.push(`[dependency-groups]\n${[...byContainer(groups)].map(([c, l]) => array(c, l)).join('\n')}`);
  }
  const main = of('poetry-main');
  if (main.length > 0) blocks.push(`[tool.poetry.dependencies]\n${poetryLines(main)}`);
  for (const [c, l] of byContainer(of('poetry-group'))) {
    blocks.push(`[tool.poetry.group.${q(c)}.dependencies]\n${poetryLines(l)}`);
  }
  const dev = of('poetry-dev');
  if (dev.length > 0) blocks.push(`[tool.poetry.dev-dependencies]\n${poetryLines(dev)}`);
  return blocks.length === 0 ? '' : `${blocks.join('\n\n')}\n`;
}

const toModel = (entries: ScopeEntry[]): ScopeModel => ({
  entries,
  text: renderScopeModel(entries),
  expected: entries.map((e) => ({
    name: oracleNormalize(e.rawName),
    rawName: e.rawName,
    scope: expectedScope(e.kind, e.optional === true),
  })),
});

const uniqueByName = (e: ScopeEntry): string => oracleNormalize(e.rawName);

/** Entries in any combination of the six table kinds, with distinct normalized names. */
export const arbScopeModel: fc.Arbitrary<ScopeModel> = fc
  .uniqueArray(arbScopeEntry(KINDS), { maxLength: 14, selector: uniqueByName })
  .map(toModel);

/** Poetry entries only (main, group and dev tables), with and without `optional` flags. */
export const arbPoetryOptionalModel: fc.Arbitrary<ScopeModel> = fc
  .uniqueArray(arbScopeEntry(['poetry-main', 'poetry-group', 'poetry-dev']), { maxLength: 12, selector: uniqueByName })
  .map(toModel);
