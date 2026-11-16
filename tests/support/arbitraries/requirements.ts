// Arbitraries for requirements.txt text: package names, spelling pairs, requirement lines and files.
// Extended by later property tests (valid lines, comments, continuations, option lines, noise, mutations).
import * as fc from 'fast-check';

/** Well-known mixed-case package names. */
export const MIXED_CASE_NAMES: readonly string[] = ['Django', 'PyYAML', 'SQLAlchemy', 'Foo__Bar', 'foo.-_bar', 'Foo_Bar', 'foo.bar'];

const arbAlnumWord = fc.stringMatching(/^[A-Za-z0-9]{1,6}$/);
/** One or more of `-`, `_` and `.`. */
export const arbSeparatorRun: fc.Arbitrary<string> = fc.stringMatching(/^[-_.]{1,4}$/);

/** Name_Token `[A-Za-z0-9][A-Za-z0-9._-]*` built from words and separator runs (trailing run allowed). */
export const arbNameToken: fc.Arbitrary<string> = fc
  .tuple(
    arbAlnumWord,
    fc.array(fc.tuple(arbSeparatorRun, arbAlnumWord), { maxLength: 4 }),
    fc.option(arbSeparatorRun, { nil: '' }),
  )
  .map(([head, rest, tail]) => head + rest.map(([s, w]) => s + w).join('') + tail);

/** Well-known mixed-case names and separator runs, plus generated Name_Tokens. */
export const arbPypiNameToken: fc.Arbitrary<string> = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom(...MIXED_CASE_NAMES) },
  { weight: 3, arbitrary: arbNameToken },
);

const swapCase = (c: string): string => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase());

/** Respells a name: random case flips per letter and every separator run replaced by another run. */
export const arbRespelling = (name: string): fc.Arbitrary<string> => {
  const parts = name.split(/([-_.]+)/); // separators at odd indexes
  return fc
    .tuple(
      fc.array(fc.boolean(), { minLength: name.length, maxLength: name.length }),
      fc.array(arbSeparatorRun, { minLength: parts.length, maxLength: parts.length }),
    )
    .map(([flips, runs]) => {
      let i = 0;
      return parts
        .map((p, idx) =>
          idx % 2 === 1
            ? runs[idx]
            : Array.from(p, (c) => {
                const flip = flips[i++];
                return flip ? swapCase(c) : c;
              }).join(''),
        )
        .join('');
    });
};

/** Two spellings of one package. */
export const arbSpellingPair: fc.Arbitrary<readonly [string, string]> = arbPypiNameToken.chain((n) =>
  fc.tuple(arbRespelling(n), arbRespelling(n)),
);

export type RequirementKind = 'registry' | 'bare' | 'git-at' | 'path-at' | 'git-egg' | 'path-egg';

const arbRegistrySpec = fc.constantFrom('==1.0', '>=2', '~=1.4.2', '!=3.1', '===1', '<2,>=1', '>1.0');
const arbRepo = fc.stringMatching(/^[a-z]{1,6}$/);

/** A requirement line that declares package `name` exactly as written. */
export const arbRequirementLine = (name: string): fc.Arbitrary<{ line: string; kind: RequirementKind }> =>
  fc.oneof(
    arbRegistrySpec.map((spec) => ({ line: `${name}${spec}`, kind: 'registry' as const })),
    arbRegistrySpec.map((spec) => ({ line: `${name} ${spec}`, kind: 'registry' as const })),
    arbRepo.map((r) => ({ line: `${name} @ git+https://h.example/${r}.git`, kind: 'git-at' as const })),
    arbRepo.map((r) => ({ line: `${name} @ ./${r}`, kind: 'path-at' as const })),
    arbRepo.map((r) => ({ line: `git+https://h.example/${r}.git#egg=${name}`, kind: 'git-egg' as const })),
    arbRepo.map((r) => ({ line: `./${r}#egg=${name}`, kind: 'path-egg' as const })),
  );

export interface GeneratedRequirements {
  readonly text: string;
  /** Package names exactly as written in the generated lines. */
  readonly writtenNames: readonly string[];
}

/** Requirement file: names (including spelling pairs of one package), one line each, LF or CRLF. */
export const arbRequirementsFile: fc.Arbitrary<GeneratedRequirements> = fc
  .tuple(
    fc.array(arbPypiNameToken, { maxLength: 6 }),
    fc.array(arbSpellingPair, { maxLength: 3 }),
    fc.constantFrom('\n', '\r\n'),
  )
  .chain(([singles, pairs, eol]) => {
    const names = [...singles, ...pairs.flatMap(([a, b]) => [a, b])];
    return fc
      .tuple(...names.map((n) => arbRequirementLine(n)))
      .chain((lines) =>
        fc.shuffledSubarray(lines, { minLength: lines.length, maxLength: lines.length }).map((ordered) => ({
          text: ordered.map((l) => l.line).join(eol) + (ordered.length > 0 ? eol : ''),
          writtenNames: names,
        })),
      );
  });

/** Arbitrary strings for the idempotence half: full-unicode, separator-heavy, mixed-case and look-alike letters. */
export const arbNormalizeInput: fc.Arbitrary<string> = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 60 }),
  fc.string({ unit: 'grapheme', maxLength: 30 }),
  fc.string({ maxLength: 60 }),
  fc
    .array(fc.oneof(fc.constantFrom('-', '_', '.', '--', '_.-', 'A', 'Z', 'a', 'z', '\u212A', '\u0130', '\u017F'), fc.string({ maxLength: 3 })), {
      maxLength: 30,
    })
    .map((parts) => parts.join('')),
  arbPypiNameToken,
);

// ---------------------------------------------------------------------------
// Valid lines, comments, continuations, option lines, noise and mutations (Properties 3 and 6)
// ---------------------------------------------------------------------------

/** Names that stress the ordering: integer-like, mixed case, prefixes of each other, separator variants. */
export const ORDERING_NAMES: readonly string[] = [
  '1', '2', '10', '42', '9', 'a', 'A', 'B', 'ab', 'a1', 'a-b', 'a_b', 'a.b', 'Zed', 'zed2', 'Z', '0', '007', 'foo', 'Foo', 'FOO-bar',
];

/** A package name for ordering tests: the well-known set, integer-like names or generated Name_Tokens. */
export const arbOrderingName: fc.Arbitrary<string> = fc.oneof(
  { weight: 2, arbitrary: fc.constantFrom(...ORDERING_NAMES) },
  { weight: 1, arbitrary: fc.constantFrom(...MIXED_CASE_NAMES) },
  { weight: 2, arbitrary: arbNameToken },
  { weight: 1, arbitrary: fc.stringMatching(/^[0-9]{1,3}$/) },
);

/** A comment line, or a line holding only whitespace. */
export const arbCommentLine: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 20 }).map((s) => `#${s.replace(/[\r\n\\]/g, ' ')}`),
  fc.stringMatching(/^[ \t]{0,3}#[ a-z0-9=@-]{0,15}$/),
  fc.stringMatching(/^[ \t]{0,4}$/),
);

/** Option lines, which the parser skips silently. */
export const arbOptionLine: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom('-r', '-c', '-e', '--index-url', '--extra-index-url', '-i', '--hash=sha256:', '--no-binary', '-f', '-'),
    fc.stringMatching(/^[A-Za-z0-9./:=-]{0,12}$/),
  )
  .map(([opt, arg]) => (arg === '' ? opt : `${opt} ${arg}`));

/** Lines the parser rejects or never understood, without line breaks. */
export const arbNoiseLine: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 30 }).map((s) => s.replace(/[\r\n\\]/g, ' ')),
  fc.constantFrom('foo 1.0', 'foo @ https://x', './pkg', '[extras]', '@@', 'foo[', '===', 'pkg ;marker', 'name==1.0 \\ x', '\u00e9t\u00e9==1', '=1.0'),
  arbNameToken.chain((n) => fc.constantFrom(`${n}bogus`, `${n} 1.0`, `${n}[x`, `${n} @ nowhere`, `${n} @`)),
);

/** Splits `line` into physical lines joined by backslash continuations at random points (line has no backslash). */
export const arbContinued = (line: string, eol: string): fc.Arbitrary<string> =>
  fc
    .array(fc.integer({ min: 0, max: line.length }), { maxLength: 3 })
    .map((cuts) => {
      const points = [...new Set(cuts)].sort((a, b) => a - b);
      let out = '';
      let prev = 0;
      for (const p of points) {
        out += `${line.slice(prev, p)}\\${eol}`;
        prev = p;
      }
      return out + line.slice(prev);
    });

/** One chunk of text (one logical line, possibly spread over continuations) that carries no dependency or one. */
export const arbInertChunk: fc.Arbitrary<string> = fc.oneof(arbCommentLine, arbOptionLine, fc.constant(''));

/** Line terminators. */
export const arbEol: fc.Arbitrary<string> = fc.constantFrom('\n', '\r\n', '\r');

/** A rendered chunk for a requirement line: plain, with trailing comment or spread over continuations. */
export const arbRenderedRequirement = (line: string, eol: string): fc.Arbitrary<string> =>
  fc.oneof(
    { weight: 3, arbitrary: fc.constant(line) },
    { weight: 1, arbitrary: fc.constantFrom(`${line}  # note`, `${line} # x == 1`, `  ${line}  `) },
    { weight: 2, arbitrary: arbContinued(line, eol) },
  );

export interface RequirementsModel {
  /** Distinct normalized names, each with one requirement line. */
  readonly entries: readonly { readonly name: string; readonly line: string }[];
  /** Chunks that declare nothing (comments, blanks, option lines). */
  readonly inert: readonly string[];
  readonly eol: string;
}

/** A model without duplicate keys: every normalized name appears once. */
export const arbRequirementsModel: fc.Arbitrary<RequirementsModel> = fc
  .tuple(
    fc.uniqueArray(arbOrderingName, { maxLength: 8, selector: (n) => oracleNormalizeName(n) }),
    fc.array(arbInertChunk, { maxLength: 5 }),
    arbEol,
  )
  .chain(([names, inert, eol]) =>
    fc
      .tuple(...names.map((n) => arbRequirementLine(n)))
      .map((lines) => ({ entries: names.map((name, i) => ({ name, line: (lines[i] as { line: string }).line })), inert, eol })),
  );

/** Same rule as PEP 503 for ASCII names; kept local so the arbitrary file does not import the oracle. */
function oracleNormalizeName(s: string): string {
  return s.replace(/[-_.]+/g, '-').toLowerCase();
}

/** Renders model chunks (each possibly continued) in the given order, joined by the model's eol. */
export const arbRenderedModel = (model: RequirementsModel): fc.Arbitrary<string[]> =>
  fc
    .tuple(...model.entries.map((e) => arbRenderedRequirement(e.line, model.eol)))
    .map((rendered) => [...rendered, ...model.inert]);

/** Valid requirements text (all line kinds mixed, in random order), as a list of chunks and the eol. */
export const arbMixedChunks: fc.Arbitrary<{ chunks: string[]; eol: string }> = arbRequirementsModel.chain((model) =>
  arbRenderedModel(model).chain((chunks) =>
    fc
      .shuffledSubarray(chunks, { minLength: chunks.length, maxLength: chunks.length })
      .map((shuffled) => ({ chunks: shuffled, eol: model.eol })),
  ),
);

const TROUBLE_CHARS = ['\\', '[', ']', ';', '#', '@', '\r', '\n', '-', ' ', '\t', '=', '<', '>', '!', '~', '\u00e9', '\u{1F600}', '\uFF5E', '\0'];

/** Edits text at random places: deletions, insertions of awkward characters, truncation, duplicated ranges. */
export const arbMutation = (text: string): fc.Arbitrary<string> =>
  fc
    .array(
      fc.tuple(
        fc.constantFrom('delete', 'insert', 'truncate', 'duplicate'),
        fc.nat({ max: Math.max(text.length, 1) }),
        fc.nat({ max: 6 }),
        fc.constantFrom(...TROUBLE_CHARS),
      ),
      { minLength: 1, maxLength: 4 },
    )
    .map((edits) => {
      let t = text;
      for (const [kind, at, len, ch] of edits) {
        const i = Math.min(at, t.length);
        if (kind === 'delete') t = t.slice(0, i) + t.slice(i + len);
        else if (kind === 'insert') t = t.slice(0, i) + ch + t.slice(i);
        else if (kind === 'truncate') t = t.slice(0, i);
        else t = t.slice(0, i + len) + t.slice(i);
      }
      return t;
    });

/** Any requirements.txt text: valid mixed text, mutated valid text, noise lines and raw strings. */
export const arbAnyRequirementsText: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: arbMixedChunks.map(({ chunks, eol }) => chunks.join(eol)) },
  { weight: 3, arbitrary: arbMixedChunks.chain(({ chunks, eol }) => arbMutation(chunks.join(eol))) },
  {
    weight: 2,
    arbitrary: fc
      .array(fc.oneof(arbNoiseLine, arbCommentLine, arbOptionLine, arbOrderingName.chain((n) => arbRequirementLine(n)).map((l) => l.line)), {
        maxLength: 10,
      })
      .chain((lines) => arbEol.map((eol) => lines.join(eol))),
  },
  { weight: 1, arbitrary: arbRequirementsFile.map((f) => f.text) },
  { weight: 1, arbitrary: fc.string({ unit: 'binary', maxLength: 200 }) },
  { weight: 1, arbitrary: fc.string({ maxLength: 200 }) },
);

// ---------------------------------------------------------------------------
// Model-based renderer with duplicate keys (Properties 4, 7 and 8)
// ---------------------------------------------------------------------------

/** Four spellings of one package, with one Dependency_Key. */
export const FOO_BAR_SPELLINGS: readonly string[] = ['Foo_Bar', 'foo-bar', 'FOO.BAR', 'foo__bar'];

/** Names valid as requirement names that collide with Object.prototype members. */
export const PROTO_NAMES: readonly string[] = ['constructor', 'prototype', 'toString', 'hasOwnProperty'];

export interface SpecLine {
  readonly line: string;
  /** versionSpec the parser must report for the line. */
  readonly versionSpec: string;
  readonly sourceKind: 'registry' | 'git' | 'path';
}

/** A requirement line for `name` together with the versionSpec and sourceKind the parser must report. */
export const arbSpecLine = (name: string): fc.Arbitrary<SpecLine> =>
  fc.oneof(
    arbRegistrySpec.map((spec) => ({ line: `${name}${spec}`, versionSpec: spec, sourceKind: 'registry' as const })),
    arbRegistrySpec.map((spec) => ({ line: `${name} ${spec}`, versionSpec: spec, sourceKind: 'registry' as const })),
    fc.constant({ line: name, versionSpec: '*', sourceKind: 'registry' as const }),
    arbRepo.map((r) => ({ line: `${name} @ git+https://h.example/${r}.git`, versionSpec: `git+https://h.example/${r}.git`, sourceKind: 'git' as const })),
    arbRepo.map((r) => ({ line: `${name} @ ./${r}`, versionSpec: `./${r}`, sourceKind: 'path' as const })),
    arbRepo.map((r) => ({ line: `git+https://h.example/${r}.git#egg=${name}`, versionSpec: `git+https://h.example/${r}.git#egg=${name}`, sourceKind: 'git' as const })),
    arbRepo.map((r) => ({ line: `./${r}#egg=${name}`, versionSpec: `./${r}#egg=${name}`, sourceKind: 'path' as const })),
  );

export interface DuplicateModelEntry {
  readonly name: string;
  readonly versionSpec: string;
  readonly sourceKind: 'registry' | 'git' | 'path';
}

export interface DuplicateModel {
  /** Entries in text order (the First_Occurrence order of requirements.txt). */
  readonly entries: readonly DuplicateModelEntry[];
  /** 1-based number of the first physical line of each entry in `text`. */
  readonly lines: readonly number[];
  readonly eol: string;
  readonly text: string;
}

/**
 * A requirements.txt model whose entries repeat Dependency_Keys under different spellings, specs and source kinds,
 * rendered with comments, blanks, option lines, trailing comments and continuations between and around the entries.
 * Every name of `required` appears at least once, at a random position.
 */
export const arbDuplicateModel = (required: readonly string[] = []): fc.Arbitrary<DuplicateModel> =>
  fc
    .tuple(
      fc.array(fc.oneof({ weight: 2, arbitrary: fc.constant<string | null>(null) }, { weight: 1, arbitrary: arbPypiNameToken }), { minLength: 1, maxLength: 3 }),
      fc.nat({ max: 9 }),
      arbEol,
    )
    .chain(([families, extra, eol]) => {
      // Family null is Foo_Bar with its four fixed spellings; other families are respelled at random.
      const spell = (family: string | null): fc.Arbitrary<string> =>
        family === null ? fc.constantFrom(...FOO_BAR_SPELLINGS) : fc.oneof(fc.constant(family), arbRespelling(family));
      const picks: fc.Arbitrary<string>[] = [
        ...Array.from({ length: extra + 1 }, () => fc.constantFrom(...families).chain(spell)),
        ...required.map((r) => fc.oneof(fc.constant(r), arbRespelling(r))),
      ];
      return fc.tuple(...picks).chain((names) =>
        fc.shuffledSubarray(names, { minLength: names.length, maxLength: names.length }).chain((ordered) =>
          fc
            .tuple(
              fc.tuple(...ordered.map((n) => arbSpecLine(n).chain((s) => arbRenderedRequirement(s.line, eol).map((chunk) => ({ n, s, chunk }))))),
              fc.array(fc.tuple(arbInertChunk, fc.nat({ max: ordered.length })), { maxLength: 6 }),
            )
            .map(([rendered, inert]) => {
              const items: { chunk: string; entry: number | null }[] = rendered.map((r, i) => ({ chunk: r.chunk, entry: i }));
              for (const [chunk, at] of inert) {
                // Insert before the item at `at` counted over entries only (stable relative order of entries).
                let seen = 0;
                let idx = items.length;
                for (let k = 0; k < items.length; k++) {
                  if (items[k]?.entry !== null) {
                    if (seen === at) {
                      idx = k;
                      break;
                    }
                    seen += 1;
                  }
                }
                items.splice(idx, 0, { chunk, entry: null });
              }
              const lines: number[] = new Array<number>(rendered.length).fill(0);
              let prefix = '';
              for (const item of items) {
                if (item.entry !== null) lines[item.entry] = prefix.split(/\r\n|\n|\r/).length;
                prefix += item.chunk + eol;
              }
              return {
                entries: rendered.map((r) => ({ name: r.n, versionSpec: r.s.versionSpec, sourceKind: r.s.sourceKind })),
                lines,
                eol,
                text: items.map((i) => i.chunk).join(eol),
              };
            }),
        ),
      );
    });
