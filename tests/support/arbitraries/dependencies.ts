// Arbitraries for serializer input: lists of Dependencies per Manifest_Format (design: Generator strategy: manifests).
// Per-ecosystem spec generators produce only values consistent with sourceKind. Non-Representable entries are mixed in
// at low weight to check omission. rawName comes in three kinds for pypi: absent, a spelling of name, and a spelling
// of another name (the serializer must fall back to name).
import * as fc from 'fast-check';
import type { Ecosystem, ManifestFormat, Scope, SerializableDependency, SourceKind } from '../../../core/model';
import { oracleNormalize, oracleNpmSourceKind } from '../oracles/manifest-model';
import { arbRespelling } from './requirements';

export const ECOSYSTEM_OF_FORMAT: Readonly<Record<ManifestFormat, Ecosystem>> = {
  'package.json': 'npm',
  'requirements.txt': 'pypi',
  'pyproject.toml': 'pypi',
  'Cargo.toml': 'cargo',
};

export const SCOPES_OF_ECOSYSTEM: Readonly<Record<Ecosystem, readonly Scope[]>> = {
  npm: ['runtime', 'dev', 'optional', 'peer'],
  pypi: ['runtime'],
  cargo: ['runtime', 'dev', 'build'],
};

const ALL_SCOPES: readonly Scope[] = ['runtime', 'dev', 'build', 'optional', 'peer'];

const arbWord = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const arbNpmName: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.stringMatching(/^[a-z][a-z0-9._-]{0,15}$/) },
  { weight: 1, arbitrary: fc.constantFrom('__proto__', 'constructor', 'prototype', 'toString') },
  { weight: 2, arbitrary: fc.string({ minLength: 1, maxLength: 20 }) },
  { weight: 2, arbitrary: fc.tuple(arbWord, arbWord).map(([s, n]) => `@${s}/${n}`) },
);

const arbCargoName: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_-]{0,15}$/) },
  { weight: 2, arbitrary: fc.string({ minLength: 1, maxLength: 20 }) },
);

const PYPI_DICTIONARY = ['django', 'pyyaml', 'sqlalchemy', 'foo-bar', 'a', 'a-b'] as const;

/** A normalized pypi name: lower-case words joined by single hyphens, or a dictionary name. */
export const arbNormalizedPypiName: fc.Arbitrary<string> = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom(...PYPI_DICTIONARY) },
  { weight: 3, arbitrary: fc.stringMatching(/^[a-z0-9]+(-[a-z0-9]+){0,3}$/) },
);

const arbName: Readonly<Record<Ecosystem, fc.Arbitrary<string>>> = {
  npm: arbNpmName,
  pypi: arbNormalizedPypiName,
  cargo: arbCargoName,
};

// ---------------------------------------------------------------------------
// Version specs consistent with sourceKind
// ---------------------------------------------------------------------------

const arbNpmRegistry: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('^1.2.3', '~0', '>=1 <2', '*', 'latest', '', 'npm:alias@1', '1.x', '\u00e9\u4e2d\u6587'),
  fc.tuple(fc.constantFrom('^', '~', '>=', '<', ''), fc.nat({ max: 20 }), fc.nat({ max: 20 })).map(([op, a, b]) => `${op}${a}.${b}.0`),
  fc.string({ maxLength: 15 }).filter((s) => oracleNpmSourceKind(s) === 'registry'),
);

const arbNpmGit: fc.Arbitrary<string> = fc.oneof(
  arbWord.map((r) => `git+https://h.example/${r}.git`),
  fc.tuple(arbWord, arbWord).map(([u, r]) => `github:${u}/${r}`),
  fc.tuple(arbWord, arbWord, arbWord).map(([u, r, ref]) => `${u}/${r}#${ref}`),
  fc.constantFrom('git://h.example/x.git', 'gitlab:u/r', 'bitbucket:u/r', 'u/r#'),
);

const arbNpmPath: fc.Arbitrary<string> = fc.oneof(
  arbWord.map((p) => `file:../${p}`),
  arbWord.map((p) => `link:./${p}`),
  fc.constantFrom('workspace:*', 'workspace:^1.0.0', 'file:'),
);

const arbPypiRegistry: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('>=2.0,<3', '==1.*', '~=1.4', '!=2', '*', '===1', '<=3', '>0.1'),
  fc.tuple(fc.constantFrom('==', '>=', '<=', '~=', '!=', '<', '>', '==='), fc.nat({ max: 30 }), fc.nat({ max: 30 })).map(([op, a, b]) => `${op}${a}.${b}`),
);

const arbPypiGit: fc.Arbitrary<string> = fc
  .tuple(arbWord, fc.option(arbWord, { nil: undefined }))
  .map(([r, ref]) => `git+https://h.example/${r}.git${ref === undefined ? '' : `@${ref}`}`);

const arbPypiPath: fc.Arbitrary<string> = fc.oneof(
  arbWord.map((p) => `./${p}`),
  arbWord.map((p) => `../${p}`),
  arbWord.map((p) => `/${p}/abs`),
  fc.constantFrom('file:///z', './x'),
);

const arbCargoRegistry: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('1.0', '^0.3', '*', '=1.2.3', '>=1, <2', '', '\u00e9'),
  fc.tuple(fc.nat({ max: 20 }), fc.nat({ max: 20 })).map(([a, b]) => `${a}.${b}`),
  fc.string({ maxLength: 15 }),
);

const arbCargoGit: fc.Arbitrary<string> = fc.oneof(
  arbWord.map((r) => `https://h.example/${r}.git`),
  fc.string({ maxLength: 15 }).map((s) => `https://h.example/${s}`),
);

const arbCargoPath: fc.Arbitrary<string> = fc.oneof(
  arbWord.map((p) => `../${p}`),
  fc.constantFrom('../crate', './x', 'a"b\\c'),
);

const SPECS: Readonly<Record<Ecosystem, Readonly<Record<SourceKind, fc.Arbitrary<string>>>>> = {
  npm: { registry: arbNpmRegistry, git: arbNpmGit, path: arbNpmPath },
  pypi: { registry: arbPypiRegistry, git: arbPypiGit, path: arbPypiPath },
  cargo: { registry: arbCargoRegistry, git: arbCargoGit, path: arbCargoPath },
};

/** A versionSpec for `eco` that is consistent with `kind` (registry has the most weight in the full generator). */
export const arbSpec = (eco: Ecosystem, kind: SourceKind): fc.Arbitrary<string> => SPECS[eco][kind];

const arbSourceKind: fc.Arbitrary<SourceKind> = fc.oneof(
  { weight: 6, arbitrary: fc.constant<SourceKind>('registry') },
  { weight: 1, arbitrary: fc.constant<SourceKind>('git') },
  { weight: 1, arbitrary: fc.constant<SourceKind>('path') },
);

// ---------------------------------------------------------------------------
// rawName
// ---------------------------------------------------------------------------

/**
 * rawName for a given `name`. npm and cargo: absent or equal to name. pypi: absent, a spelling of name
 * (`Django` for `django`), or a spelling of another name (the serializer must write name instead).
 */
export const arbRawName = (eco: Ecosystem, name: string): fc.Arbitrary<string | undefined> => {
  if (eco !== 'pypi') return fc.constantFrom<string | undefined>(undefined, name);
  return fc.oneof(
    { weight: 1, arbitrary: fc.constant<string | undefined>(undefined) },
    { weight: 2, arbitrary: arbRespelling(name) },
    {
      weight: 1,
      arbitrary: arbNormalizedPypiName
        .filter((other) => other !== name)
        .chain((other) => arbRespelling(other)),
    },
  );
};

function build(
  name: string,
  rawName: string | undefined,
  ecosystem: Ecosystem,
  versionSpec: string,
  scope: Scope,
  sourceKind: SourceKind,
): SerializableDependency {
  return rawName === undefined
    ? { name, ecosystem, versionSpec, scope, sourceKind }
    : { name, rawName, ecosystem, versionSpec, scope, sourceKind };
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/** A Dependency of `eco` in one of its own scopes, with a spec that matches the sourceKind. */
export const arbRepresentableDependency = (eco: Ecosystem): fc.Arbitrary<SerializableDependency> =>
  fc
    .tuple(arbName[eco], fc.constantFrom(...SCOPES_OF_ECOSYSTEM[eco]), arbSourceKind)
    .chain(([name, scope, kind]) =>
      fc
        .tuple(arbSpec(eco, kind), arbRawName(eco, name))
        .map(([spec, raw]) => build(name, raw, eco, spec, scope, kind)),
    );

const otherEcosystems = (eco: Ecosystem): Ecosystem[] => (['npm', 'pypi', 'cargo'] as const).filter((e) => e !== eco);

/** An entry that the serializer must omit for the format of `eco` (criteria 5.1, 5.2, 5.13). */
export const arbNonRepresentableDependency = (eco: Ecosystem): fc.Arbitrary<SerializableDependency> => {
  const cases: fc.Arbitrary<SerializableDependency>[] = [
    // wrong ecosystem
    fc.constantFrom(...otherEcosystems(eco)).chain((other) => arbRepresentableDependency(other)),
    // empty name
    arbSpec(eco, 'registry').map((spec) => build('', undefined, eco, spec, 'runtime', 'registry')),
  ];
  const unsupported = ALL_SCOPES.filter((s) => !SCOPES_OF_ECOSYSTEM[eco].includes(s));
  if (unsupported.length > 0) {
    // unsupported scope
    cases.push(
      fc
        .tuple(arbName[eco], fc.constantFrom(...unsupported), arbSourceKind)
        .chain(([name, scope, kind]) => arbSpec(eco, kind).map((spec) => build(name, undefined, eco, spec, scope, kind))),
    );
  }
  if (eco === 'npm') {
    // spec classification disagrees with sourceKind
    cases.push(
      fc
        .tuple(arbName.npm, fc.constantFrom(...SCOPES_OF_ECOSYSTEM.npm), arbSourceKind, arbSourceKind)
        .filter(([, , a, b]) => a !== b)
        .chain(([name, scope, specKind, declared]) =>
          arbSpec('npm', specKind).map((spec) => build(name, undefined, 'npm', spec, scope, declared)),
        ),
    );
  }
  if (eco === 'pypi') {
    // a git+ spec marked registry, and a path spec marked git
    cases.push(
      arbNormalizedPypiName.chain((name) => arbPypiGit.map((spec) => build(name, undefined, 'pypi', spec, 'runtime', 'registry'))),
      arbNormalizedPypiName.chain((name) => arbPypiPath.map((spec) => build(name, undefined, 'pypi', spec, 'runtime', 'git'))),
      // a name that is not normalized and has no matching rawName
      fc
        .constantFrom('Django', 'Foo_Bar', 'foo.bar', 'PyYAML')
        .chain((name) =>
          fc
            .constantFrom<string | undefined>(undefined, 'Other', 'bar')
            .chain((raw) => arbPypiRegistry.map((spec) => build(name, raw, 'pypi', spec, 'runtime', 'registry'))),
        ),
      // a name that is not a Name_Token
      arbPypiRegistry.map((spec) => build('na me', undefined, 'pypi', spec, 'runtime', 'registry')),
    );
  }
  if (eco === 'cargo') {
    // lone surrogate in name or spec
    cases.push(
      fc.constantFrom('\ud800', '\udc00').chain((s) => fc.constantFrom(`a${s}`, `${s}`).map((name) => build(name, undefined, 'cargo', '1.0', 'runtime', 'registry'))),
      fc.constantFrom('\ud800', 'x\udfff').map((s) => build('crate', undefined, 'cargo', s, 'dev', 'registry')),
    );
  }
  return fc.oneof(...cases);
};

/** Dependency_Key of the list generator: ecosystem, name (pypi: normalized) and scope. */
export const dependencyKeyString = (d: SerializableDependency): string =>
  JSON.stringify([d.ecosystem, d.ecosystem === 'pypi' ? oracleNormalize(d.name) : d.name, d.scope]);

/**
 * A list for `format`: unique on the key, mostly Representable entries of the format's ecosystem, a few that
 * the serializer must omit.
 */
export const arbDependencyList = (format: ManifestFormat, opts: { maxLength?: number } = {}): fc.Arbitrary<SerializableDependency[]> => {
  const eco = ECOSYSTEM_OF_FORMAT[format];
  return fc.uniqueArray(
    fc.oneof(
      { weight: 12, arbitrary: arbRepresentableDependency(eco) },
      { weight: 1, arbitrary: arbNonRepresentableDependency(eco) },
    ),
    { selector: dependencyKeyString, maxLength: opts.maxLength ?? 60 },
  );
};

// ---------------------------------------------------------------------------
// Lists with repeated (name, scope) and permutations (Properties 7 and 12)
// ---------------------------------------------------------------------------

/** A copy of `base` (same name and scope) with other spec, source kind and, for pypi, another spelling. */
const arbRepeat = (base: SerializableDependency, eco: Ecosystem): fc.Arbitrary<SerializableDependency> =>
  fc.tuple(arbSourceKind, arbRawName(eco, base.name)).chain(([kind, raw]) =>
    arbSpec(eco, kind).map((spec) => build(base.name, raw, eco, spec, base.scope, kind)),
  );

/** A copy of `base` (same name and scope) that the serializer must omit: wrong ecosystem, or a spec no writer accepts. */
const arbNonRepresentableRepeat = (base: SerializableDependency, eco: Ecosystem): fc.Arbitrary<SerializableDependency> => {
  const cases: fc.Arbitrary<SerializableDependency>[] = [
    fc.constantFrom(...otherEcosystems(eco)).map((other) => ({ ...base, ecosystem: other })),
  ];
  if (eco === 'pypi') cases.push(fc.constantFrom('1.0', 'x y', '').map((spec) => build(base.name, undefined, eco, spec, base.scope, 'registry')));
  if (eco === 'npm') cases.push(fc.constant(build(base.name, undefined, eco, 'file:../x', base.scope, 'registry')));
  if (eco === 'cargo') cases.push(fc.constant(build(base.name, undefined, eco, '\ud800', base.scope, 'registry')));
  return fc.oneof(...cases);
};

/** `list` in a random order (same elements). */
export const arbPermutationOf = <T>(list: readonly T[]): fc.Arbitrary<T[]> =>
  fc.shuffledSubarray([...list], { minLength: list.length, maxLength: list.length });

/**
 * A list for `format` in which many (name, scope) keys repeat: repeats differ in spec, source kind and (pypi)
 * spelling, and some repeats are non-Representable so that they can precede the Representable entry of the key.
 * The order of the list is random.
 */
export const arbDuplicatedList = (format: ManifestFormat, opts: { maxLength?: number } = {}): fc.Arbitrary<SerializableDependency[]> => {
  const eco = ECOSYSTEM_OF_FORMAT[format];
  return arbDependencyList(format, { maxLength: opts.maxLength ?? 20 }).chain((base) => {
    if (base.length === 0) return fc.constant<SerializableDependency[]>([]);
    const arbExtra = fc
      .nat({ max: base.length - 1 })
      .chain((i) =>
        fc.oneof(
          { weight: 3, arbitrary: arbRepeat(base[i], eco) },
          { weight: 2, arbitrary: arbNonRepresentableRepeat(base[i], eco) },
        ),
      );
    return fc
      .array(arbExtra, { maxLength: 30 })
      .chain((extra) => arbPermutationOf([...base, ...extra]));
  });
};
