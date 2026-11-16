// package.json arbitraries (design: Generator strategy: manifests). Three paths:
// valid (model, then render), mutation (valid text with 1 to 3 text mutations) and noise.
import * as fc from 'fast-check';
import { arbMutatedText, arbNoise } from './tokens';

export const PACKAGE_JSON_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;
export type PackageJsonSection = (typeof PACKAGE_JSON_SECTIONS)[number];

export interface PackageJsonEntry {
  readonly name: string;
  readonly spec: string;
}

export type PackageJsonModel = Readonly<Record<PackageJsonSection, readonly PackageJsonEntry[]>>;

/** Section order and per-section entry order of one rendering of a model. */
export interface PackageJsonLayout {
  readonly sections: readonly PackageJsonSection[];
  readonly entries: Readonly<Record<PackageJsonSection, readonly PackageJsonEntry[]>>;
}

/** Names that sort differently by code point, UTF-16 unit, case, or as object keys. */
export const NAME_POOL: readonly string[] = [
  '1', '42', '0', '007', '10', '2', '4294967295', '4294967294', // integer-like and near-integer-like
  'foo', 'Foo', 'FOO', 'Foo_Bar', 'foo.bar', 'a', 'B', '_x', // mixed case
  '\uFF5E', '\u{1F600}', '\u{10000}', '\uE000', 'caf\u00E9', // BMP high versus astral
  '@scope/pkg', '@Scope/Pkg',
  '__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf', // prototype names
];

export const arbPackageName: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...NAME_POOL) },
  { weight: 2, arbitrary: fc.stringMatching(/^[a-z0-9][a-z0-9._-]{0,10}$/) },
  { weight: 1, arbitrary: fc.string({ minLength: 1, maxLength: 12 }) },
  { weight: 1, arbitrary: fc.string({ unit: 'binary', minLength: 1, maxLength: 8 }) },
  { weight: 1, arbitrary: fc.stringMatching(/^@[a-z]{1,5}\/[a-z]{1,5}$/) },
);

export const arbPackageSpec: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('^1.2.3', '~0', '>=1 <2', '*', 'latest', '', 'npm:alias@1', 'f\u00FC\u{1F600}'),
  fc.constantFrom('git+https://h/r.git', 'github:u/r', 'u/r#ref', 'git://h/r'),
  fc.constantFrom('file:../x', 'link:./y', 'workspace:*'),
  fc.string({ maxLength: 12 }),
);

const arbEntries = fc.uniqueArray(fc.record({ name: arbPackageName, spec: arbPackageSpec }), {
  selector: (e) => e.name,
  maxLength: 8,
});

/** A model without a repeated key inside a section. */
export const arbPackageJsonModel: fc.Arbitrary<PackageJsonModel> = fc.record({
  dependencies: arbEntries,
  devDependencies: arbEntries,
  optionalDependencies: arbEntries,
  peerDependencies: arbEntries,
});

export function defaultLayout(model: PackageJsonModel): PackageJsonLayout {
  return { sections: PACKAGE_JSON_SECTIONS, entries: model };
}

/** A random layout (section order and key order) of a model. */
export const arbLayout = (model: PackageJsonModel): fc.Arbitrary<PackageJsonLayout> =>
  fc
    .tuple(
      fc.shuffledSubarray([...PACKAGE_JSON_SECTIONS], { minLength: 4, maxLength: 4 }),
      ...PACKAGE_JSON_SECTIONS.map((s) =>
        fc.shuffledSubarray([...model[s]], { minLength: model[s].length, maxLength: model[s].length }),
      ),
    )
    .map(([sections, a, b, c, d]) => ({
      sections: sections as PackageJsonSection[],
      entries: { dependencies: a, devDependencies: b, optionalDependencies: c, peerDependencies: d },
    }));

/** Writes the layout as JSON text. Written by hand so that `__proto__` and integer-like keys stay in the given order. */
export function renderPackageJson(layout: PackageJsonLayout): string {
  const sections = layout.sections.map((s) => {
    const body = layout.entries[s].map((e) => `${JSON.stringify(e.name)}:${JSON.stringify(e.spec)}`).join(',');
    return `${JSON.stringify(s)}:{${body}}`;
  });
  return `{"name":"x","version":"1.0.0",${sections.join(',')}}`;
}

export const arbValidText: fc.Arbitrary<string> = arbPackageJsonModel.map((m) => renderPackageJson(defaultLayout(m)));

export const arbMutatedPackageJson: fc.Arbitrary<string> = arbMutatedText(arbValidText);

export const arbNoisePackageJson: fc.Arbitrary<string> = arbNoise('package.json');

/** Valid, mutated and noisy texts. */
export const arbAnyPackageJsonText: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: arbValidText },
  { weight: 3, arbitrary: arbMutatedPackageJson },
  { weight: 3, arbitrary: arbNoisePackageJson },
);

// ---------------------------------------------------------------------------
// Task 5.10: repeated keys, identity across scopes, prototype names
// ---------------------------------------------------------------------------

export const PROTOTYPE_NAMES = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty'] as const;

/** One written occurrence, in text order. */
export interface PackageJsonOccurrence {
  readonly section: PackageJsonSection;
  readonly name: string;
  readonly spec: string;
}

/** Writes occurrences in the given order, one JSON object per section (a section appears once, its members keep text order). */
export function renderOccurrences(occurrences: readonly PackageJsonOccurrence[]): string {
  const parts = PACKAGE_JSON_SECTIONS.flatMap((s) => {
    const list = occurrences.filter((o) => o.section === s);
    if (list.length === 0) return [];
    return [`${JSON.stringify(s)}:{${list.map((o) => `${JSON.stringify(o.name)}:${JSON.stringify(o.spec)}`).join(',')}}`];
  });
  return `{"name":"x",${parts.join(',')}}`;
}

const arbSection = fc.constantFrom(...PACKAGE_JSON_SECTIONS);

/** Occurrences where keys repeat inside a section (same name, same section, different or equal specs). */
export const arbRepeatedKeyOccurrences: fc.Arbitrary<PackageJsonOccurrence[]> = fc
  .array(fc.record({ section: arbSection, name: arbPackageName, spec: arbPackageSpec }), { minLength: 1, maxLength: 8 })
  .chain((base) =>
    fc
      .array(fc.tuple(fc.nat({ max: base.length - 1 }), arbPackageSpec), { maxLength: 8 })
      .map((repeats) => {
        const all: PackageJsonOccurrence[] = [...base];
        for (const [i, spec] of repeats) all.push({ section: base[i].section, name: base[i].name, spec });
        return all;
      }),
  )
  .chain((all) => fc.shuffledSubarray(all, { minLength: all.length, maxLength: all.length }));

/** A name with a non-empty set of scopes that declare it, each with its own spec. */
export const arbNameInScopes: fc.Arbitrary<{ name: string; entries: PackageJsonOccurrence[] }> = fc
  .tuple(arbPackageName, fc.subarray([...PACKAGE_JSON_SECTIONS], { minLength: 1 }))
  .chain(([name, sections]) =>
    fc
      .array(arbPackageSpec, { minLength: sections.length, maxLength: sections.length })
      .map((specs) => ({ name, entries: sections.map((section, i) => ({ section, name, spec: specs[i] })) })),
  );

/** Prototype names mixed with random names, unique per section. */
export const arbPrototypeModel: fc.Arbitrary<PackageJsonModel> = fc.record({
  dependencies: protoEntries(),
  devDependencies: protoEntries(),
  optionalDependencies: protoEntries(),
  peerDependencies: protoEntries(),
});

function protoEntries(): fc.Arbitrary<PackageJsonEntry[]> {
  return fc.uniqueArray(
    fc.record({ name: fc.oneof(fc.constantFrom(...PROTOTYPE_NAMES), arbPackageName), spec: arbPackageSpec }),
    { selector: (e) => e.name, maxLength: 8 },
  );
}
