# Implementation Plan: dependency-graveyard-core

## Overview

This plan builds the pure logic layer in `/core` in five groups: project scaffold, types and constants (with the purity checker), parsers and serializer, classifier and scoring, repo summary. Each group ends with a checkpoint that runs `npx tsc --noEmit`, `npm run lint` and `npx vitest --run`. Property-based tests are mandatory and sit directly after the code task they validate. Unit tests are mandatory too. Requirement numbers are criterion numbers from `requirements.md`; Property numbers are from `design.md`.

Implementation language: TypeScript (strict). The project root is the `gravekeeper` folder. Test files follow `<module>.test.ts` and `<module>.property.test.ts`, under `/tests` as laid out in `design.md`.

## Tasks

- [x] 1. Project scaffold
  - [x] 1.1 Create the Next.js app in the repo root
    - Run `create-next-app` in `gravekeeper` with App Router, TypeScript, Tailwind CSS and ESLint, no `src` directory, no Turbopack-specific flags needed.
    - Confirm `tsconfig.json` has `"strict": true`; add it if missing.
    - Keep the existing `.git`, `.kiro`, `KIRO_LOG.md` and `LICENSE` untouched.
    - _Requirements: 13.4_

  - [x] 1.2 Write `.gitignore`
    - Replace the generated file so it ignores ONLY `node_modules`, `.next` and env files (`.env*`).
    - It must never ignore `.kiro`. Do not add other entries (no `coverage`, `*.tsbuildinfo`, `next-env.d.ts`, `.vercel`).
    - _Requirements: 13.1_

  - [x] 1.3 Add test tooling and the pinned TOML dependency
    - Install `vitest`, `fast-check`, `tsx` as dev dependencies, and install the latest stable `smol-toml` under `dependencies` with `--save-exact` (a plain `<major>.<minor>.<patch>` string, no `^` or `~`).
    - Add `vitest.config.ts` (include `tests/**/*.test.ts`, 30 second `testTimeout`, Node environment) and package scripts `typecheck` (`tsc --noEmit`), `test` (`vitest --run`), keeping the generated `lint` script.
    - The `smol-toml` version is the latest stable release at install time, pinned exactly; the `__proto__` regression test in task 5.17 must pass on it.
    - _Requirements: 3.15, 13.10_

  - [x] 1.4 Create the folder structure and fast-check config
    - Create `core/` with a placeholder `core/index.ts` (`export {};`), `adapters/`, `components/`, `tests/core/`, `tests/support/arbitraries/`, `tests/support/oracles/`, `tests/fixtures/` (use `.gitkeep` where a folder would be empty). `/app` already exists from the scaffold.
    - Write `tests/support/fc-config.ts` exporting `cfg()` as in `design.md` (`FC_NUM_RUNS`, `FC_SEED`, `FC_PATH`, `verbose: 1`, default 100 runs).
    - _Requirements: 13.1_

  - [x] 1.5 Write unit tests for repo configuration
    - `tests/repo-config.test.ts`: `.gitignore` lists `node_modules`, `.next` and `.env*` and does not contain `.kiro`; `package.json` pins `smol-toml` to an exact version; `tsconfig.json` has `strict: true`.
    - _Requirements: 13.4, 13.10_

- [x] 2. Checkpoint - Scaffold
  - Run `npx tsc --noEmit`, `npm run lint` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [ ] 3. Types, constants, internal helpers and the purity checker
  - [~] 3.1 Define the model types
    - Create `core/model/types.ts` and `core/model/index.ts` with every type from the design's Data Models section (`Dependency` with `rawName`, `SerializableDependency` (a `Dependency` with an optional `rawName`), `SourceKind`, `Scope`, `Severity`, `Status`, `Grade`, `HealthFacts`, `RawHealthFacts`, `RuleId`, `Reason`, `Classification`, `ParseResult`, `AssessedDependency`, `UniquePackage`, `RankedPackage`, `UnassessedItem`, `RepoSummary`, and the rest).
    - _Requirements: 1.12, 2.2, 3.17, 5.11, 13.4, 13.5_

  - [~] 3.2 Define the constants
    - Create `core/model/constants.ts` with the `CONSTANTS` object (`as const satisfies ConstantsShape`), named re-exports of every key, `SCOPE_ORDER`, `CORE_ALLOWED_PACKAGES` (`smol-toml` only), `SEVERITIES`, and the values from the requirements Constants table.
    - _Requirements: 10.21, 13.10_

  - [~] 3.3 Write unit tests for the constants
    - `tests/core/model/constants.test.ts`: exact table values; the five consistency rules (caps sum to 100, `STALE_AGE_POINTS` <= `DORMANT_RELEASE_POINTS` < `ABANDONED_AGE_POINTS`, dormant points below the smaller of archived, deprecated and the abandonment cap, `0 <= GRADE_A_MAX < GRADE_B_MAX < GRADE_C_MAX < GRADE_D_MAX < 100`, lowest severity points above 0); exact grade thresholds 19, 39, 59 and 79.
    - _Requirements: 10.21_

  - [~] 3.4 Implement the internal helpers
    - Create `core/internal/result.ts` (`Result`, `ok`, `err`, `SerializeError`), `safe.ts` (`guard`), `compare.ts` (`compareCodePoints` using a `codePointAt` loop, not `localeCompare`) and `deep-equal-key.ts` (`canonicalKey`).
    - _Requirements: 4.8, 5.12, 12.6, 13.3_

  - [~] 3.5 Write unit tests for the internal helpers
    - `tests/core/internal/internal.test.ts`: `compareCodePoints` orders `"\u{1F600}"` before `"\uFF5E"` (astral against high BMP) and puts `"10"` before `"2"`; `guard` returns the fallback on a thrown `Error`, string and `undefined`; `canonicalKey` is stable for equal values and differs for different Reason text.
    - _Requirements: 4.8, 12.6_

  - [~] 3.6 Wire the public entry point types and test the exports
    - Update `core/index.ts` to `export * from './model'`, exporting the types listed in criterion 13.5 and the constants.
    - Write `tests/core/public-api.test.ts` with `expectTypeOf` assertions for `Dependency`, `SourceKind`, `HealthFacts`, `Classification`, `Reason`, `ParseResult`, `AssessedDependency`, `UniquePackage`, `RankedPackage`, `UnassessedItem`, `RepoSummary`, and runtime checks for `CONSTANTS` and `CORE_ALLOWED_PACKAGES`.
    - _Requirements: 13.5_

  - [~] 3.7 Implement the purity checker (source rules)
    - Create `scripts/core-purity/check.ts` exporting `checkSource(filePath, sourceText): Violation[]`, built on the TypeScript compiler API (`ts.createSourceFile`).
    - Rules: imports resolving into `/adapters`, `/app`, `/components`; `import-not-allowed` for every specifier that is not a relative path staying inside `/core` or exactly a name in `CORE_ALLOWED_PACKAGES` (Node built-ins, other bare packages, `smol-toml/x`, the `@/` alias, relative paths leaving `/core`); `toml-import-outside-wrapper` for `smol-toml` outside `core/parsers/toml-tree.ts` (`TOML_WRAPPER_PATH`); identifiers `fetch` and `XMLHttpRequest` (not property names such as `x.fetch`, but including `globalThis.fetch`); `Date.now`, `Date["now"]`, `new Date()` with no arguments, `Date()` as a call, `Math.random`, `Math["random"]`.
    - Cover `import`, `export ... from`, `import()`, `require()` and `import x = require()`.
    - _Requirements: 13.1, 13.2, 13.10, 13.11_

  - [~] 3.8 Implement the package pin check
    - Add `checkPackageJson(text): Violation[]` to `scripts/core-purity/check.ts` using `ts.parseJsonText`. For each name in `CORE_ALLOWED_PACKAGES`, require a `dependencies` entry matching `^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$`; rule `package-not-pinned`, reported at the entry's line.
    - _Requirements: 13.10_

  - [~] 3.9 Write unit tests for the checker
    - `tests/core/purity.test.ts` (inline snippets): one snippet per banned construct asserting rule, line and column; allow-list cases (`fs`, `node:fs`, `path`, `lodash`, `smol-toml/x`, `@/core/...`, a relative path leaving `/core` are violations; a relative import inside `/core` is clean; `smol-toml` is clean only in `core/parsers/toml-tree.ts`); words in comments and strings cause no violation; pin cases (`1.2.3`, `1.2.3-beta.1` pass; `^1.2.3`, `~1.2.3`, `1.2`, `1.x`, `*`, `>=1.0.0`, `latest`, `npm:smol-toml@1.2.3` and a missing entry fail).
    - _Requirements: 13.1, 13.2, 13.10, 13.11_

  - [~] 3.10 Implement the purity CLI and build hook
    - Create `scripts/check-core-purity.ts`: walk `core/**/*.ts`, run `checkSource` on each file, run `checkPackageJson` on the root `package.json`, print `path:line:column rule message` per violation, and exit 1 when there is at least one.
    - Add `"check:core": "tsx scripts/check-core-purity.ts"` and `"prebuild": "npm run check:core"` to `package.json`.
    - _Requirements: 13.8_

  - [~] 3.11 Write tests for the CLI and the real tree
    - Append to `tests/core/purity.test.ts`: the checker over the real `/core` tree and the real `package.json` reports zero violations; a CLI test spawns `tsx` on a temporary directory with a violating file and asserts exit code 1 and the printed `path:line`, and exit code 0 for a clean directory.
    - _Requirements: 13.1, 13.2, 13.8, 13.10, 13.11_

- [~] 4. Checkpoint - Types, constants and purity checker
  - Run `npx tsc --noEmit`, `npm run lint` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [ ] 5. Parsers and serializer
  - [~] 5.1 Implement the shared format helpers
    - Create `core/formats/manifest-format.ts` (`MANIFEST_FORMATS`, `ecosystemOf`, `supportedScopes`), `key.ts` (`dependencyKey` as `JSON.stringify([name, scope])`), `order.ts` (`compareDependencies` = Dependency_Order on the normalized `name`, with `rawName` as the last tie-break and an absent `rawName` first, `scopeIndex`), `npm-source-kind.ts` (`sourceKindOfNpmSpec`, prefix checks plus one non-backtracking scan) and `requirements-lexical.ts` (`normalizePypiName` as PEP503_Normalization by ASCII code point arithmetic, `isNameToken`, `writtenName`, comparison operator list, canonical-spec predicate, direct-reference helpers).
    - Add a `// Requirement <n>` comment above each rule-like function.
    - _Requirements: 1.9, 2.2, 2.8, 2.14, 4.8, 5.11, 5.12, 5.13_

  - [~] 5.2 Write unit tests for the format helpers
    - `tests/core/formats/formats.test.ts`: `sourceKindOfNpmSpec` (`file:`, `link:`, `workspace:` to path; `git+`, `git://`, `github:`, `gitlab:`, `bitbucket:` to git; `a/b#c` and `foo/bar#v1.0` to git; `@scope/pkg`, `1.0.0`, `` (empty) to registry); `normalizePypiName` lower-cases only ASCII `A` to `Z` (non-ASCII letters unchanged), collapses runs of `-`, `_`, `.` into one `-`, is idempotent, and maps `Django`, `PyYAML`, `SQLAlchemy`, `Foo_Bar` and `foo.bar` to `django`, `pyyaml`, `sqlalchemy`, `foo-bar` and `foo-bar`; `isNameToken` accepts `Django` and `a.b_c-d` and rejects an empty string, `-a` and `a b`; `writtenName` returns `rawName` when its normalization equals `name`, otherwise `name`, and `name` when `rawName` is absent; `compareDependencies` orders by code point then `SCOPE_ORDER` then the tie fields, ending with `rawName` (absent first) (astral against high BMP, integer-like names).
    - _Requirements: 1.9, 2.2, 2.14, 4.8, 5.11_

  - [~] 5.3 Implement `finish` (rank, dedupe, sort)
    - Create `core/parsers/finish.ts` with `Candidate`, stable sort by rank (lexicographic number arrays), first occurrence wins per `dependencyKey` (built from the normalized `name`, so `Foo_Bar` and `foo.bar` share a key; the kept entry keeps its own `rawName`), one duplicate warning per discard (naming the normalized name and the scope) (`<where>: duplicate dependency "<name>" in scope "<scope>"; the first occurrence was kept.`, `where` truncated to 80 characters), final sort with `compareDependencies`, warnings ordered as parser warnings then duplicate warnings.
    - _Requirements: 4.6, 4.7, 4.8_

  - [~] 5.4 Write unit tests for `finish`
    - `tests/core/parsers/finish.test.ts`: first occurrence kept regardless of `sourceKind` and `rawName` (`Foo_Bar` before `foo.bar` keeps `Foo_Bar`, one warning naming `foo-bar`); one warning per discard naming package and scope; output sorted in Dependency_Order independent of candidate order; same name in two scopes is two entries; names containing separators do not collide.
    - _Requirements: 4.6, 4.8_

  - [~] 5.5 Implement the `package.json` parser
    - Create `core/parsers/package-json.ts`: `JSON.parse` in `try`; non-object top level, invalid or empty text gives one warning; read the four sections with `Object.hasOwn`; non-object section gives one warning; non-string value gives one warning naming package and section; empty name skipped with one warning; `versionSpec` untouched; `rawName` equal to `name` with no normalization (1.12); `sourceKind` from `sourceKindOfNpmSpec`; candidates have rank `[]`. Header comment documents the 1.11 exception (last value wins, no duplicate warning).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 4.9, 4.10_

  - [~] 5.6 Implement `parseManifest` and register `package.json`
    - Create `core/parsers/index.ts`: `guard` wrapper with the internal-error fallback; format validated first and never inferred; non-string `text` gives one warning "Manifest input must be a string, received <type>." (`typeOf` returns `null` and `array`); length above `MAX_MANIFEST_LENGTH` gives one warning stating the value; dispatch through a `PARSERS` map that currently holds `package.json`; then `finish`.
    - Export `parseManifest` from `core/index.ts`.
    - _Requirements: 4.1, 4.3, 4.4, 4.7_

  - [~] 5.7 Write unit tests for the `package.json` parser and `parseManifest`
    - `tests/core/parsers/package-json.test.ts` and `tests/core/parsers/parse-manifest.test.ts`: one example per criterion 1.1 to 1.10; `rawName` equals `name` and mixed-case names are not normalized (1.12); empty string value kept; `null` section warns once; `__proto__`, `constructor`, `prototype` entries are ordinary Dependencies and `Object.prototype` is untouched; same name in two sections gives two entries; a key repeated in one section keeps the last value with no warning (1.11); empty name skipped with one warning; non-string text and unsupported format; text of exactly `MAX_MANIFEST_LENGTH` is parsed and `MAX_MANIFEST_LENGTH + 1` is rejected with one warning stating 1000000.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 4.1, 4.3, 4.4, 4.9, 4.10_

  - [~] 5.8 Build shared manifest test support
    - Create `tests/support/arbitraries/tokens.ts` (per-format token dictionaries, noise strings, mutation operators from the design: truncate, insert, delete, duplicate, delimiter swap, CRLF/CR, BOM, huge value, `__proto__` name, unpaired surrogate, NUL) and `tests/support/oracles/manifest-model.ts` (independent code-point comparator via `Array.from` and `codePointAt`, `firstOccurrence(model)`, `restrict(deps, format)`, set equality helper that compares the five Dependency_Set fields and drops `rawName`, and a `normalize` oracle written independently of `normalizePypiName`).
    - Per-format renderers and arbitraries go in their own files in later tasks.
    - _Requirements: 4.2, 4.5, 4.6, 4.8_

  - [~] 5.9 Write property tests for `package.json` shape and ordering
    - `tests/core/parsers/package-json.property.test.ts` with `tests/support/arbitraries/package-json.ts` (valid path, mutation path, noise path, name pool with integer-like, mixed-case, astral and proto names).
    - **Property 3: Parsed dependencies are well formed** (format `package.json`)
    - **Property 6: Parser output is sorted in Dependency_Order** (format `package.json`, including permuted sections and keys)
    - **Validates: Requirements 4.5, 4.8, 1.12**

  - [~] 5.10 Write property tests for `package.json` duplicates, identity and prototype safety
    - Append to `tests/core/parsers/package-json.property.test.ts`.
    - **Property 4: One Dependency per key, first occurrence wins, one warning per discard** (`package.json` case: a repeated key inside one section keeps the last value with zero warnings)
    - **Property 7: Dependency identity is name and scope** (parser side: one Dependency per scope that declares the name)
    - **Property 8: Prototype safety** (names from `__proto__`, `constructor`, `prototype`, `toString`, `hasOwnProperty`)
    - **Validates: Requirements 4.6, 1.11, 1.8, 4.9**

  - [~] 5.11 Implement the `requirements.txt` parser and register it
    - Create `core/parsers/requirements-txt.ts` as the line scanner from the design: split on `\r\n`, `\n`, `\r`; join backslash continuations (final backslash without successor is dropped); strip comments from `#` at index 0 or after whitespace; skip blank and `-` lines silently; hand-written tokenizer (name token, extras, rest); direct references `<name> @ <target>` and bare `#egg=` references with `git` and `path` classification; registry rest must be empty, `*`, or start with `===`, `==`, `!=`, `<=`, `>=`, `~=`, `<`, `>`; candidates ranked `[firstLineNumber]`, `where = "requirements.txt line <n>"`; no regex with nested quantifiers.
    - Names: accept any Name_Token, including non-normalized spellings such as `Django`, `PyYAML` and `SQLAlchemy`; set `rawName` to the name as written and `name = normalizePypiName(rawName)` (2.2); for git and path references take `rawName` from `<name>` or the `egg` fragment (2.10, 2.11). A spec (registry, git or path) that still contains a backslash after continuation joining is skipped with one warning that has the first line number of the group (2.13).
    - Register it in the `PARSERS` map in `core/parsers/index.ts`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 4.6, 4.9, 4.10_

  - [~] 5.12 Write unit tests for the `requirements.txt` parser
    - `tests/core/parsers/requirements-txt.test.ts`: one example per criterion 2.1 to 2.12; extras excluded; markers removed; `#` inside a URL fragment kept; CRLF; trailing backslash on the last line; `Django`, `PyYAML` and `SQLAlchemy` parse with `name` `django`, `pyyaml`, `sqlalchemy` and `rawName` as written, with no warning (2.2); `Foo_Bar` on line 3 and `foo.bar` on line 9 give one Dependency (`name` `foo-bar`, `rawName` `Foo_Bar`) and one warning naming `foo-bar` and line 9, and the reverse order keeps `foo.bar` (4.6); git and path references take `rawName` from `<name>` or `#egg=` and `name` from its normalization; `foo @ https://x` rejected; bare `./pkg` without `#egg` rejected; `foo 1.0` rejected; `foo ===1` accepted; option lines skipped silently; warning carries the first line number of a joined group; `Foo_Bar` on line 3 and `foo-bar` on line 9 keep line 3 and warn once; a spec with a backslash in a joined line, and a git or path reference with a backslash, are each skipped with one warning that has the first line number of the group (2.13).
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 4.6_

  - [~] 5.13 Write property test for PEP503_Normalization and parsed pypi names
    - Create `tests/core/parsers/requirements-txt.property.test.ts` and `tests/support/arbitraries/requirements.ts` (name generators: mixed-case names `Django`, `PyYAML`, `SQLAlchemy`, separator runs `Foo__Bar` and `foo.-_bar`, spelling pairs of one package, git and path references with `#egg=` or `<name> @` names, arbitrary strings for the idempotence half).
    - **Property 44: PEP 503 normalization is idempotent and consistent with parsed names** (`normalizePypiName(normalizePypiName(s))` equals `normalizePypiName(s)` for all strings; every `pypi` Dependency from `parseManifest(input, 'requirements.txt')` has `normalizePypiName(rawName) === name`)
    - **Validates: Requirements 2.14, 2.2**

  - [~] 5.14 Write property tests for `requirements.txt` shape and ordering
    - Append to `tests/core/parsers/requirements-txt.property.test.ts` and extend `tests/support/arbitraries/requirements.ts` (valid lines, comments, continuations, option lines, noise, mutations).
    - **Property 3: Parsed dependencies are well formed** (format `requirements.txt`, including `rawName` and `name` both at least 1 character)
    - **Property 6: Parser output is sorted in Dependency_Order** (format `requirements.txt`, including permuted lines)
    - **Validates: Requirements 4.5, 4.8, 2.2**

  - [~] 5.15 Write property tests for `requirements.txt` duplicates, identity and prototype safety
    - Append to `tests/core/parsers/requirements-txt.property.test.ts` using the model-based renderer: name spellings `Foo_Bar`, `foo-bar`, `FOO.BAR`, `foo__bar`, repeats separated by comments, blanks, option lines and continuations; the model compares the kept `rawName` with the first spelling.
    - **Property 4: One Dependency per key, first occurrence wins, one warning per discard** (line order; the kept Dependency has the `rawName` of the first spelling; one warning per discard naming the normalized package name and scope)
    - **Property 7: Dependency identity is name and scope** (parser side)
    - **Property 8: Prototype safety**
    - **Validates: Requirements 4.6, 2.2, 4.9**

  - [~] 5.16 Implement the TOML wrapper
    - Create `core/parsers/toml-tree.ts`, the only module that imports `smol-toml`. Export `TomlTable` and `parseToml(text): Result<TomlTable, { message: string; line?: number }>`. One `try`/`catch (e: unknown)` handles `Error`, non-Error throws and `RangeError`; `line` is set only when the thrown value has a finite numeric `line`; the message is the error name plus a truncated message.
    - _Requirements: 3.9, 3.15, 13.11_

  - [~] 5.17 Write unit tests for the TOML wrapper
    - `tests/core/parsers/toml-tree.test.ts`: mock `smol-toml` to throw an `Error`, a string and `undefined` and assert a `Result` each time; line number passed through when present; `__proto__`, `constructor`, `prototype` regression (`[dependencies]` with those keys are own enumerable properties, `Object.prototype` and `({}).__proto__` unchanged, `Object.entries` lists them). This test must pass again on every `smol-toml` version bump.
    - _Requirements: 3.9, 3.15, 4.9_

  - [~] 5.18 Implement the `Cargo.toml` parser and register it
    - Create `core/parsers/cargo-toml.ts`: `parseToml` error gives one warning, with a line number only when the `smol-toml` error provides one (no scan of its own); collect `dependencies`, `dev-dependencies`, `build-dependencies` at top level and under each `target.<cfg>` using own-property reads only (scope depends only on the table name); string value is registry; table value checks `version`, `package`, `git`, `path` types first (non-string omits the entry with one warning naming the key), `name = package ?? key`, `git` wins over `path` and `version`, `path` wins over `version`, default `versionSpec` is `*`; non-table section or `target` and non-string, non-table values give one warning each; empty name skipped with one warning; rank `[tableOrdinal, enumIndex]` (criterion 3.18: `tableOrdinal` 0 for the top-level table of the scope, `1 + k` for the `k`-th key of `target` in `Object.entries` order, `enumIndex` the entry index in its own table; no line or column is recorded), `where = "Cargo.toml table [<table path>]"` so that warnings name the package and the table (3.19), for example `Cargo.toml table [target.'cfg(unix)'.dependencies]: duplicate dependency "serde" in scope "runtime"`.
    - Set `rawName` equal to `name` (the `package` value when present, else the key) with no normalization (3.17). A `name` or `versionSpec` containing a lone surrogate is skipped with one warning naming the key (3.16).
    - Register it in the `PARSERS` map in `core/parsers/index.ts`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16, 3.17, 3.18, 3.19, 4.6, 4.9, 4.10_

  - [~] 5.19 Write unit tests for the `Cargo.toml` parser
    - `tests/core/parsers/cargo-toml.test.ts`: one example per criterion 3.1 to 3.19 (`rawName` equals `name`, also for a `package` rename and for mixed-case names; lone surrogate in the name or the spec skips the entry with one warning, 3.16); `serde` in `[dependencies]`, `[target.'cfg(unix)'.dependencies]` and `[target.'cfg(windows)'.dependencies]` with the target tables written first (the top-level `[dependencies]` entry wins whatever the header order, then the `target` tables in the enumeration order the wrapper returns, two warnings that name the table and carry no line; the expected `<cfg>` order is derived from the keys the wrapper returns, plus one literal example) (3.18, 3.19); `[dependencies]` against `[dev-dependencies]` gives two entries; `package` rename; `git` beats `path` beats `version`; non-string `version` omits the entry; invalid TOML gives one warning, with a line only when the `smol-toml` error has one; lone surrogate entry skipped with one warning; `git` and `path` entries kept without warnings.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16, 3.17, 3.18, 3.19, 4.6_

  - [~] 5.20 Write property tests for `Cargo.toml` shape and ordering
    - `tests/core/parsers/cargo-toml.property.test.ts` with `tests/support/arbitraries/cargo.ts` (valid tables, mutations, noise, trap strings that contain header-looking lines, comments with `[dependencies]`, CRLF, BOM; header order must not change the outcome).
    - **Property 3: Parsed dependencies are well formed** (format `Cargo.toml`)
    - **Property 6: Parser output is sorted in Dependency_Order** (format `Cargo.toml`, including permuted entries and tables)
    - **Validates: Requirements 4.5, 4.8, 3.17**

  - [~] 5.21 Write property tests for `Cargo.toml` duplicates, identity and prototype safety
    - Append to `tests/core/parsers/cargo-toml.property.test.ts` using the model-based renderer: `[dependencies]` against several `[target.'<cfg>'.dependencies]` tables (cfg strings containing `.` and quotes), `[dev-dependencies]`, `[dependencies.foo]` entry headers, `package` renames under different keys, interleaved headers (header order must not change the outcome); the oracle ranks by criterion 3.18 computed independently from the model.
    - **Property 4: One Dependency per key, first occurrence wins, one warning per discard** (the position-free rule of criterion 3.18: top-level table, then `target` tables in enumeration order, then entries in enumeration order)
    - **Property 7: Dependency identity is name and scope** (parser side)
    - **Property 8: Prototype safety**
    - **Validates: Requirements 4.6, 3.8, 3.18, 4.9**

  - [~] 5.22 Write cross-format property tests for `parseManifest`
    - `tests/core/parsers/parse-manifest.property.test.ts`. Each format's text is also fed to the other two parsers; non-string inputs come from `fc.anything()` filtered plus `null`, `undefined`, `NaN`, `[]`, `{}`, a function, a symbol and a bigint.
    - **Property 1: Parsers never throw on strings** (strings up to about 20,000 characters; no warning starts with the internal-error prefix)
    - **Property 2: Non-string input is rejected with one warning**
    - **Property 5: Parser determinism**
    - **Validates: Requirements 4.2, 4.3, 4.7**

  - [~] 5.23 Write the performance and size-boundary unit tests
    - Append to `tests/core/parsers/parse-manifest.test.ts`: a maximum-length hostile string per format (1,000,000 `a` characters, long runs of `[`, `\`, `"`) completes within a generous time limit and returns a `Parse_Result`; `MAX_MANIFEST_LENGTH` boundary per format.
    - _Requirements: 4.2, 4.4_

  - [~] 5.24 Implement the Representable rules
    - Create `core/serializers/representable.ts` with `isRepresentable(dep, format)` following criterion 5.13 per format, with a `// Requirement 5.13` comment.
    - Follow criterion 5.13 exactly and add nothing. For `requirements.txt` that includes: `name` non-empty; `writtenName(d)` is a Name_Token and `normalizePypiName(writtenName(d)) === name` (so `Django` with `name` `django` is Representable and a non-normalized `name` without a matching `rawName` is not); `versionSpec` has no newline, no backslash and no outer whitespace; a `registry` spec is `*` or starts with a comparison operator and has no `;` and no `#` preceded by whitespace; a `git` or `path` spec has no whitespace followed by `;` or `#`. `rawName` matters only through the Written_Name of `requirements.txt` and is ignored for `package.json` and `Cargo.toml`.
    - _Requirements: 5.13, 5.11, 5.1, 5.2_

  - [~] 5.25 Write unit tests for Representable
    - `tests/core/serializers/representable.test.ts`: every condition of criterion 5.13 per format (npm `sourceKind` mismatch, `git+` registry mismatch, newline, backslash, outer whitespace, registry spec without operator, empty name, lone surrogate in Cargo), plus the Written_Name condition (name `Foo` without `rawName` rejected; `name` `django` with `rawName` `Django` accepted; `name` `django` with `rawName` `Flask` rejected; `rawName` that is not a Name_Token rejected) and the `;` and ` #` cases (rejected for `registry`, and whitespace followed by `;` or `#` rejected for `git` and `path`). Also assert that parser outputs from examples are Representable.
    - _Requirements: 5.13_

  - [~] 5.26 Implement `serializeManifest` and the `package.json` writer
    - Create `core/serializers/index.ts`: `guard` wrapper with the `internal-error` fallback; unsupported format gives `err({ kind: 'unsupported-format' })`; non-array gives `invalid-input`; more than `MAX_SERIALIZED_DEPENDENCIES` gives `too-many-dependencies` and no text; filter by well-formedness, ecosystem, supported scope and `isRepresentable`; then sort with `compareDependencies` and keep the first entry per `(name, scope)`; pass to the format writer. This is the filter, sort, dedupe order of criterion 5.2: a Representable Dependency that repeats the key of an earlier non-Representable one survives.
    - Create `core/serializers/package-json.ts`: hand-built text from `JSON.stringify(string)` fragments, sections in scope order (`dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`), only non-empty sections, 2-space indent, trailing newline, empty output `{}\n`.
    - Export `serializeManifest` from `core/index.ts`.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 5.11, 5.12, 5.18, 5.19_

  - [~] 5.27 Implement the `requirements.txt` writer
    - Create `core/serializers/requirements-txt.ts`: one line per dependency ending in a single `\n`, no blank lines; registry is `<Written_Name>` when the spec is `*` else `<Written_Name> <versionSpec>`; git and path are `<Written_Name> @ <versionSpec>`, where `<Written_Name>` comes from `writtenName(d)` (`rawName` when `normalizePypiName(rawName) === name`, else `name`; 5.11, 5.17); empty output is the empty string. Register it in `core/serializers/index.ts`.
    - _Requirements: 5.3, 5.6, 5.11, 5.12, 5.17_

  - [~] 5.28 Implement the `Cargo.toml` writer
    - Create `core/serializers/cargo-toml.ts`: tables `[build-dependencies]`, `[dev-dependencies]`, `[dependencies]` in scope order (only non-empty ones); one line per entry with a quoted key; registry `"name" = "<spec>"`, git `"name" = { git = "<spec>" }`, path `"name" = { path = "<spec>" }`; TOML basic-string escaping (`\\`, `\"`, `\b \t \n \f \r`, other control characters and DEL as `\uXXXX`); empty output is the empty string. Register it in `core/serializers/index.ts`.
    - _Requirements: 5.3, 5.5, 5.11, 5.12, 5.14, 5.15, 5.16_

  - [~] 5.29 Write unit tests for the serializer
    - `tests/core/serializers/serialize-manifest.test.ts`: exact expected text per format for a small list; unsupported format error and no text; non-array input; empty list and no-match list parse to an empty set; omission cases (wrong ecosystem, unsupported scope, non-Representable, repeated `(name, scope)`; same name in two scopes kept); `MAX_SERIALIZED_DEPENDENCIES` written and `+1` errors with no text; escaping of quotes, backslashes, control characters and unicode in JSON and TOML; `__proto__` names; byte-identical output on repeat calls; `requirements.txt` writes the Written_Name (`Django` with `name` `django` is written as `Django`, 5.11; `rawName` `Flask` with `name` `django` is written as `django`; absent `rawName` writes `name`; `Foo_Bar` and `foo.bar` entries with the same key give one line, the one with the smaller `rawName` code point order, absent first, 5.2), git and path lines are `<Written_Name> @ <spec>` (5.17), and `package.json` and `Cargo.toml` ignore `rawName` (5.11).
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.11, 5.12, 5.14, 5.15, 5.16, 5.17, 5.18, 5.19_

  - [~] 5.30 Write the serialize-then-parse round-trip property test
    - `tests/core/serializers/serialize-manifest.property.test.ts` with `tests/support/arbitraries/dependencies.ts` (per-ecosystem spec generators consistent with `sourceKind`, `arbDependencyList` with `uniqueArray` on the key, low-weight non-Representable entries, and `rawName` in three kinds: absent, normalizing to `name` such as `Django` for `django`, and normalizing to something else; both sides are projected without `rawName` before the set comparison) and fixtures in `tests/fixtures/` (a few real-world public `package.json`, `requirements.txt`, `Cargo.toml` samples) used as `examples` seeds and example tests.
    - **Property 9: Serialize then parse round trip** (no warnings; expected set from `restrict`, compared on the projection without `rawName`, per criterion 5.8)
    - **Validates: Requirements 5.8, 5.3**

  - [~] 5.31 Write the parse-serialize-parse property test
    - Append to `tests/core/serializers/serialize-manifest.property.test.ts` (noise, mutation and fixture inputs for all three formats).
    - **Property 10: Parse, serialize, parse is stable** (the serialize result is `ok` and both Dependency_Sets are equal on the projection without `rawName`; the noise generator includes mixed-case and non-normalized pypi names, and git and path references with a backslash, which the parser skips under 2.13)
    - **Validates: Requirements 5.9**

  - [~] 5.32 Write the serialization idempotence property test
    - Append to `tests/core/serializers/serialize-manifest.property.test.ts`.
    - **Property 11: Serialization is idempotent** (text compared byte for byte, so the Written_Name must be stable through one parse; the generator mixes the three `rawName` kinds)
    - **Validates: Requirements 5.10**

  - [~] 5.33 Write the serializer determinism and identity property tests
    - Append to `tests/core/serializers/serialize-manifest.property.test.ts` with `arbDuplicatedList` and permutations.
    - **Property 12: Serializer determinism and Dependency_Order output** (spellings of one pypi name with different `rawName` tie-break on `rawName`, absent first, before deduplication; the parsed result is compared on the projection without `rawName`; byte-identical text for permutations; `requirements.txt` lines end in one `\n` with no blank lines)
    - **Property 7: Dependency identity is name and scope** (serializer side: one entry per `(name, scope)`, separate entries per scope)
    - **Validates: Requirements 5.12, 5.6, 5.4, 5.5, 5.2, 4.6**

- [~] 6. Checkpoint - Parsers and serializer
  - Run `npx tsc --noEmit`, `npm run lint` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [ ] 7. Classifier and scoring
  - [~] 7.1 Implement fact normalization
    - Create `core/facts/normalize.ts`: `HEALTH_FACT_FIELDS`, `NormalizedFacts`, `normalizeFacts(unknown)`. Read only with `typeof input === 'object' && input !== null && Object.hasOwn(input, field)`; numbers pass `Number.isFinite` (day counts also `>= 0`); count fields also `Number.isInteger`; booleans and `Severity` checked by type; `-0` is valid; `unknownFields` in `HEALTH_FACT_FIELDS` order, each once.
    - _Requirements: 6.2, 6.4, 6.5, 6.6, 6.7_

  - [~] 7.2 Write unit tests for fact normalization
    - `tests/core/facts/normalize.test.ts`: null, missing, `NaN`, `Infinity`, `-1`, `0.5` for counts, wrong types, unrecognized severity strings (`'critical'`), non-object input (null, number, string, array), inherited properties ignored, throwing getters do not escape `normalizeFacts` callers via `classify` later, `-0` valid.
    - _Requirements: 6.2, 6.5, 6.6_

  - [~] 7.3 Build fact test support
    - Create `tests/support/arbitraries/facts.ts` (`arbValidDays` with boundary weights, `arbBadNumber`, `arbWrongType`, per-field fact arbitraries, `arbRawFacts` with optional keys, `arbAnyFactsInput`, `arbThrowingGetters`, `arbValidFacts`) and `tests/support/oracles/facts-oracle.ts` (independent Valid_Fact, unknown-field set, `vulnerable`, `abandoned`, `dormant` from the glossary text, not calling production predicates).
    - _Requirements: 6.2, 6.6, 8.10, 8.11_

  - [~] 7.4 Implement the predicates
    - Create `core/facts/predicates.ts`: `isVulnerable`, `isReleaseAbandoned`, `isDormant`, `isAbandoned`, `isStaleRelease`, each with a `// Requirement <n>` comment on the line above. `maintainerCount` is not read by any predicate.
    - _Requirements: 7.1, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.9, 10.6_

  - [~] 7.5 Write unit tests for the predicates
    - `tests/core/facts/predicates.test.ts`: boundaries `ABANDONMENT_DAYS - 1`, `ABANDONMENT_DAYS`, `STALE_DAYS - 1`, `STALE_DAYS`; commit unknown counts as stale for 8.3; `isReleaseAbandoned` and `isDormant` never both true; `maintainerCount` has no influence.
    - _Requirements: 8.3, 8.4, 8.7, 8.8, 8.9_

  - [~] 7.6 Implement the scoring components
    - Create `core/scoring/vulnerability.ts`, `abandonment.ts`, `maintainers.ts` and `index.ts` (`scoreComponents`, `computeScore` as the sum) as in the design, each function with a requirement comment. `f.maxSeverity ?? DEFAULT_SEVERITY` is read in exactly one place.
    - _Requirements: 7.3, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.16, 10.17, 10.23_

  - [~] 7.7 Write unit tests for scoring
    - `tests/core/scoring/scoring.test.ts`: vulnerability points for each severity and counts 0, 1, 2, 6, 7, 100; unknown severity equals `MEDIUM`; archived 30, deprecated 25, 8.3 gives 20, dormant gives exactly 10 and never adds 20 or stale points, stale gives 10; cap case (archived plus deprecated plus 8.3 is 30); maintainer 0, 1, 2, null; `CRITICAL` with 7 vulnerabilities is 55; worst case total 100; `CRITICAL` vulnerable scores at least 50.
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.16, 10.17, 10.23_

  - [~] 7.8 Write property tests for vulnerability, severity and component bounds
    - `tests/core/scoring/scoring.property.test.ts` with `tests/support/arbitraries/facts-metamorphic.ts` (`arbVulnIncrement`, `arbSeverityRaise` choosing index pairs `i < j` with no `fc.pre`). Scores come from `computeScore(normalizeFacts(raw))`.
    - **Property 21: Score equals the sum of the components, clamp is a no-op** (component caps and `0 <= sum <= 100`; the check that `classify().score` equals the sum is added in task 7.20)
    - **Property 22: Adding a vulnerability never lowers the score**
    - **Property 23: Raising a known severity never lowers the score**
    - **Validates: Requirements 10.22, 10.1, 10.17, 10.11, 10.12**

  - [~] 7.9 Write property tests for age, archive and abandonment monotonicity
    - Append to `tests/core/scoring/scoring.property.test.ts` and extend `facts-metamorphic.ts` (`arbReleasePair` with 40 percent weight on pairs straddling `STALE_DAYS` or `ABANDONMENT_DAYS` and commit biased to `STALE_DAYS - 1`, `STALE_DAYS`, null; `arbFlagRaise`; `arbAbandonmentRaise` filtered by the oracle).
    - **Property 25: Larger release age never lowers the score**
    - **Property 26: Archived or deprecated never lowers the score**
    - **Property 27: Becoming abandoned never lowers the score**
    - **Validates: Requirements 10.13, 10.20, 10.14, 10.19**

  - [~] 7.10 Implement rules 6.3 and 7.2
    - Create `core/classifier/rules/types.ts` (rule shape `{ ruleId, evaluate }`, message helpers that keep each message one sentence, at most 200 characters), `rules/unknown-facts.ts` (6.3, lists each unknown field once) and `rules/vulnerability.ts` (7.2 and 7.3: states count and severity; says "assumed" when severity is unknown). Requirement comment directly above each exported rule.
    - _Requirements: 6.3, 7.2, 7.3, 7.4, 7.5, 11.3, 11.4_

  - [~] 7.11 Write unit tests for rules 6.3 and 7.2
    - Append to `tests/core/classifier/rules.test.ts`: all seven fields unknown lists all seven; one unknown lists exactly that one; 7.2 with known severity, with unknown severity (assumed, `DEFAULT_SEVERITY`), count 0 ignores severity, negative or fractional count gives no 7.2.
    - _Requirements: 6.3, 7.2, 7.3, 7.4, 7.5_

  - [~] 7.12 Implement rules 8.1 to 8.4
    - Create `core/classifier/rules/archived.ts` (8.1), `deprecated.ts` (8.2), `release-abandoned.ts` (8.3; states release days, `ABANDONMENT_DAYS`, commit days or "unknown and assumed stale") and `release-dormant.ts` (8.4). Requirement comment directly above each exported rule.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 11.3, 11.4_

  - [~] 7.13 Write unit tests for rules 8.1 to 8.4
    - Append to `tests/core/classifier/rules.test.ts`: each rule alone; several rules together give one Reason each; none met gives no 8.1 to 8.3; boundaries `ABANDONMENT_DAYS - 1` (no 8.3, no 8.4), commit `STALE_DAYS - 1` gives 8.4 only, commit `STALE_DAYS` gives 8.3 only, unknown commit gives 8.3 with the "assumed stale" wording.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [~] 7.14 Implement rules 10.6 to 10.8
    - Create `core/classifier/rules/release-stale.ts` (10.6, whole number of days), `no-maintainers.ts` (10.7) and `single-maintainer.ts` (10.8). Requirement comment directly above each exported rule.
    - _Requirements: 10.6, 10.7, 10.8, 11.3, 11.4_

  - [~] 7.15 Write unit tests for rules 10.6 to 10.8
    - Append to `tests/core/classifier/rules.test.ts`: 10.6 at `STALE_DAYS` and `ABANDONMENT_DAYS - 1` only; 10.7 for 0 maintainers and no change to `abandoned` or status; 10.8 for 1; none for 2 or null; the longest possible messages (the 6.3 Reason listing all seven fields, and 8.3 with 22-character numbers) are at most 200 characters.
    - _Requirements: 10.6, 10.7, 10.8, 11.4_

  - [~] 7.16 Implement the pipeline, status and `classify`
    - Create `core/classifier/pipeline.ts` (rules declared once in ascending `ruleId` order, defensive sort by requirement then criterion as integers, `11.2` fallback "No risk signals were found." with empty `facts` only when no other Reason exists), `status.ts` (`statusOf`, vulnerable wins over abandoned), and `core/classifier/index.ts` (`classify(facts: unknown)` wrapped in `guard`, falling back to the all-unknown Classification; score is the clamped sum of the components).
    - Export `classify` from `core/index.ts`.
    - _Requirements: 6.1, 6.4, 6.5, 9.1, 9.2, 9.3, 9.4, 10.1, 11.1, 11.2, 11.3, 11.5, 13.6, 13.9_

  - [~] 7.17 Write unit tests for `classify`
    - `tests/core/classifier/classify.test.ts`: status precedence examples (9.1 to 9.4, including dormant stays `ALIVE`, and both Reason sets kept when haunted and abandoned); all-unknown input gives `ALIVE`, score 0, one 6.3 Reason; no signals gives exactly one 11.2 Reason; Reason count between 1 and 20; ascending `ruleId` order; a throwing getter and a non-object input still return a Classification; `CRITICAL` vulnerable scores at least 50; each boundary from the design's boundary table.
    - _Requirements: 6.5, 9.1, 9.2, 9.3, 9.4, 10.16, 11.1, 11.2, 11.5_

  - [~] 7.18 Write property tests: never throws and unknown facts
    - `tests/core/classifier/classify.property.test.ts` using `arbAnyFactsInput` and the facts oracle.
    - **Property 13: Classifier never throws**
    - **Property 14: Unknown facts are reported exactly once**
    - **Validates: Requirements 6.4, 6.3, 6.5, 6.6**

  - [~] 7.19 Write property tests: flags and maintainer independence
    - Append to `tests/core/classifier/classify.property.test.ts` (`arbMaintainerChange`).
    - **Property 15: Abandoned flag matches its definition**
    - **Property 16: Dormant flag matches its definition**
    - **Property 17: Maintainer count never changes abandonment or status**
    - **Validates: Requirements 8.10, 8.11, 8.12**

  - [~] 7.20 Write property tests: status, determinism and score range
    - Append to `tests/core/classifier/classify.property.test.ts`.
    - **Property 18: Exactly one status, consistent with the flags**
    - **Property 19: Classifier determinism**
    - **Property 20: Score is an integer from 0 to 100**
    - **Property 21: Score equals the sum of the components, clamp is a no-op** (classify level: `classify(facts).score` equals the sum of `scoreComponents`)
    - **Validates: Requirements 9.5, 9.6, 10.10, 10.22, 10.1**

  - [~] 7.21 Write property tests: severity equivalence, combined risk, no-risk
    - Append to `tests/core/classifier/classify.property.test.ts` (`arbUnknownSeverityPair`, `arbHauntedAndAbandoned` with `removeVulnerability` and `removeAbandonment` helpers, `arbNoRisk`). For Property 24 remove the `6.3` entry from both `ruleId` sequences before comparing.
    - **Property 24: Unknown severity scores like MEDIUM**
    - **Property 28: Combined haunted and abandoned strictly exceeds either alone**
    - **Property 29: No risk signals means ALIVE**
    - **Validates: Requirements 10.24, 7.3, 10.18, 10.15**

  - [~] 7.22 Write property tests: Reasons
    - Append to `tests/core/classifier/classify.property.test.ts`.
    - **Property 30: Reasons are well formed and ordered** (1 to 20 Reasons, allowed `ruleId` set, `facts` name Health_Facts fields, message length 1 to 200, ascending order, `11.2` only alone with empty `facts`)
    - **Property 31: Status is explained by Reasons**
    - **Validates: Requirements 11.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7**

- [~] 8. Checkpoint - Classifier and scoring
  - Run `npx tsc --noEmit`, `npm run lint` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [ ] 9. Repo summary
  - [~] 9.1 Implement grouping
    - Create `core/summarizer/group.ts`: one pass over the input filling a `Map` keyed by the Package_Key `JSON.stringify([ecosystem, name, sourceKind])` (12.1); each group holds a `Set` of scopes and the non-null classifications; `scopes = SCOPE_ORDER.filter(...)`.
    - _Requirements: 12.1_

  - [~] 9.2 Implement classification merging
    - Create `core/summarizer/merge.ts`: `classificationTieKey` (flags with false before true, then `ruleId`s joined by `,` compared by code point), `compareClassifications` (12.22: score descending, status precedence `HAUNTED`, `DEAD`, `ALIVE`, Classification_Tie_Key ascending, then Classification_Canonical_Key via `canonicalKey` ascending), and `mergeClassifications` returning null for an empty list.
    - The total order is criterion 12.22: highest score, then status precedence, then Classification_Tie_Key ascending, then Classification_Canonical_Key ascending, where the canonical key is the canonical JSON of the whole Classification (object keys sorted by code point at every depth, array order kept), so classifications that differ only in Reason text still give an input-order-independent result.
    - _Requirements: 12.1, 12.2, 12.10, 12.22_

  - [~] 9.3 Write unit tests for grouping
    - `tests/core/summarizer/group.test.ts`: grouping key is `(ecosystem, name, sourceKind)` (12.1): one package in `runtime` and `dev` is one Unique_Package with `scopes` `['runtime', 'dev']`; the same name as `registry` and as `git` is two packages; the same name in `npm` and `cargo` is two packages; `__proto__` names are safe; `scopes` sorted in `SCOPE_ORDER` with no repeats.
    - _Requirements: 12.1_

  - [~] 9.4 Write unit tests for merging
    - `tests/core/summarizer/merge.test.ts`: highest score wins; equal score uses `HAUNTED`, `DEAD`, `ALIVE`; equal on that uses the tie key; equal on all of those but different Reason text (800 against 900 days) is decided by the Classification_Canonical_Key in either input order (12.22); the canonical key sorts object keys at every depth and keeps `reasons` order; one null among non-null is ignored; all null gives null.
    - _Requirements: 12.1, 12.10, 12.22_

  - [~] 9.5 Implement partition and ordering
    - Create `core/summarizer/partition.ts` (assessed iff `sourceKind === 'registry'` and a non-null Merged_Classification; `non-registry-source` takes precedence over `no-health-data`) and `core/summarizer/order.ts` (criterion 12.6 comparator: score descending, status precedence, `name`, `ecosystem`, `sourceKind`, tie key, all string comparisons by code point; unassessed items ordered by `ecosystem`, `name`, `sourceKind`).
    - _Requirements: 12.2, 12.6, 12.14_

  - [~] 9.6 Implement grade computation
    - Create `core/summarizer/grade.ts`: `grade(score)` takes the first of `A`, `B`, `C`, `D` whose threshold (`GRADE_A_MAX` 19, `GRADE_B_MAX` 39, `GRADE_C_MAX` 59, `GRADE_D_MAX` 79) is at least the score, else `F`; `worseGrade`; the repo grade is `worseGrade(grade(averageScore), grade(maxScore))`; `// Requirement 12.15` comments.
    - _Requirements: 12.15, 12.16_

  - [~] 9.7 Write unit tests for grades
    - `tests/core/summarizer/grade.test.ts`: `grade(score)` for 0, 19, 20, 39, 40, 59, 60, 79, 80 and 100 (`A`, `A`, `B`, `B`, `C`, `C`, `D`, `D`, `F`, `F`); the worse-of rule on both sides of each threshold; `maxScore` above 59 gives `D` or `F` whatever the average; the worse-of rule equals `grade(maxScore)` because `maxScore >= averageScore`.
    - _Requirements: 12.15, 12.16_

  - [~] 9.8 Write unit tests for partition and ordering
    - `tests/core/summarizer/partition-order.test.ts`: a `git` package with a classification is `non-registry-source`; a registry package with only null classifications is `no-health-data`; ordering tie-breaks by status, name, ecosystem, sourceKind; code-point comparison (astral against high BMP); unassessed item order.
    - _Requirements: 12.2, 12.6, 12.14_

  - [~] 9.9 Implement `summarize`
    - Create `core/summarizer/index.ts`: `guard` wrapper falling back to the summary of an empty list; group by the Package_Key (12.1), merge with the 12.22 order (Classification_Canonical_Key last), partition; `counts` object with fixed keys; integer half-up mean `Math.floor((2 * sum + n) / (2 * n))`; sort a copy of the input list (never mutate the argument); `maxScorePackage` from the first package of the full 12.6 order before the 12.7 exclusion and before truncation; `worst` excludes `ALIVE` with score 0 and unassessed packages and is cut to `WORST_LIST_SIZE`; `unassessedItems`; grade as the worse of Average_Grade and Worst_Grade; null fields and zero counts when `assessed` is 0.
    - Export `summarize` from `core/index.ts`.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.13, 12.14, 12.15, 12.16, 12.22, 13.3_

  - [~] 9.10 Write unit tests for `summarize`
    - `tests/core/summarizer/summarize.test.ts`: empty list; all-unassessed list; counts and `unassessed` arithmetic; mean 2.5 rounds to 3; a single package of score 60 among many zeros gives `D` or `F`; `worst` truncation at 0, 1, 10, 11 assessed; `ALIVE` score 0 excluded; all entries tied; `maxScorePackage` chosen before truncation and exclusion; a package with one null and one non-null classification is assessed; two entries of one Package_Key whose classifications differ only in Reason text give the same `worst` entry in either input order (12.22); `unassessedItems` reasons and order; the input array is not mutated.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.13, 12.14, 12.15, 12.16, 12.22, 13.3_

  - [~] 9.11 Build summarizer test support
    - Create `tests/support/arbitraries/assessed.ts` (`arbAssessedDependency` with a tiny name alphabet `a`, `b`, `a-b`, `Z`, `é`, few ecosystems and scopes, 70 percent `registry`, 15 percent null classification, real `classify` output and synthetic coherent classifications with scores from `0, 1, 19, 20, 39, 40, 59, 60, 79, 80, 100`, pairs that tie on everything except Reason text; list arbitraries up to 40 entries plus targeted lists; permutation and scope-repetition helpers) and `tests/support/oracles/summary-oracle.ts` (independent grouping by `(ecosystem, name, sourceKind)` with a `Map`, merge by the 12.22 order with its own canonical-JSON key writer, half-up integer mean, code-point comparator, `grade(score)` with the four thresholds, `scopes`, `unassessedItems`).
    - _Requirements: 12.1, 12.6, 12.10_

  - [~] 9.12 Write property tests: partition and averages
    - `tests/core/summarizer/summarize.property.test.ts`.
    - **Property 32: Counts and unassessed partition the Unique_Packages**
    - **Property 33: Average and maximum are bounded**
    - **Validates: Requirements 12.8, 12.1, 12.2, 12.3, 12.9, 12.4**

  - [~] 9.13 Write property tests: confluence and determinism
    - Append to `tests/core/summarizer/summarize.property.test.ts`.
    - **Property 34: Confluence under input permutation**
    - **Property 35: Summarizer determinism**
    - **Validates: Requirements 12.10, 12.11, 12.17**

  - [~] 9.14 Write property tests: worst list and grade domain
    - Append to `tests/core/summarizer/summarize.property.test.ts`.
    - **Property 36: Worst list is bounded and ordered**
    - **Property 37: Grade domain**
    - **Validates: Requirements 12.12, 12.6, 12.7, 12.17, 12.5**

  - [~] 9.15 Write property tests: grade bounds and maximum
    - Append to `tests/core/summarizer/summarize.property.test.ts`.
    - **Property 38: Grade is never better than its two components**
    - **Property 39: maxScore is consistent with the package it names**
    - **Validates: Requirements 12.18, 12.15, 12.16, 12.19, 12.13**

  - [~] 9.16 Write property tests: unassessed items and scope repetition
    - Append to `tests/core/summarizer/summarize.property.test.ts`.
    - **Property 40: Unassessed items match unassessed packages**
    - **Property 41: Repeating an entry in another scope only adds a scope**
    - **Validates: Requirements 12.20, 12.14, 12.21, 12.1**

  - [~] 9.17 Write property test: merged classification choice
    - Append to `tests/core/summarizer/summarize.property.test.ts`.
    - **Property 42: Merged classification picks the best classification of the group** (ties on score, status and Classification_Tie_Key are resolved by the Classification_Canonical_Key, independent of input order)
    - **Validates: Requirements 12.1, 12.2, 12.22**

  - [~] 9.18 Write the no-mutation property test
    - `tests/core/no-mutation.property.test.ts`: for `parseManifest`, `serializeManifest`, `classify` and `summarize`, a deep copy taken before the call equals the input after the call, and the call also succeeds on a deeply frozen copy.
    - **Property 43: Core functions do not mutate their inputs**
    - **Validates: Requirements 13.7, 13.3**

  - [~] 9.19 Extend the public API test with the functions
    - Append to `tests/core/public-api.test.ts`: `expectTypeOf` assertions for `parseManifest(text: unknown, format: ManifestFormat)`, `serializeManifest(dependencies, format: unknown)`, `classify(facts: unknown)` and `summarize(items)` as exported from `core/index.ts`.
    - _Requirements: 13.5_

- [~] 10. Final checkpoint - Repo summary
  - Run `npx tsc --noEmit`, `npm run lint` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

## Notes

- Every task, including the property-based tests, is required. Nothing is marked optional.
- Each property test carries the tag comments from `design.md` (`// Feature: dependency-graveyard-core, Property N: ...` and `// Validates: Requirements X.Y`) and uses `cfg()` from `tests/support/fc-config.ts`.
- Handoff: tasks after checkpoint 6 (the classifier and scoring group and the repo summary group) are executed in later sessions. Work through the tasks up to and including checkpoint 6 first.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["1.5"] },
    { "id": 4, "tasks": ["3.1", "3.4", "3.7"] },
    { "id": 5, "tasks": ["3.2", "3.5", "3.8"] },
    { "id": 6, "tasks": ["3.3", "3.6", "3.9", "3.10"] },
    { "id": 7, "tasks": ["3.11"] },
    { "id": 8, "tasks": ["5.1"] },
    { "id": 9, "tasks": ["5.2", "5.3", "5.5", "5.8", "5.16"] },
    { "id": 10, "tasks": ["5.4", "5.6", "5.17"] },
    { "id": 11, "tasks": ["5.7", "5.9", "5.11"] },
    { "id": 12, "tasks": ["5.10", "5.12", "5.13", "5.18"] },
    { "id": 13, "tasks": ["5.14", "5.19", "5.20", "5.22", "5.23", "5.24"] },
    { "id": 14, "tasks": ["5.15", "5.21", "5.25", "5.26"] },
    { "id": 15, "tasks": ["5.27"] },
    { "id": 16, "tasks": ["5.28"] },
    { "id": 17, "tasks": ["5.29"] },
    { "id": 18, "tasks": ["5.30"] },
    { "id": 19, "tasks": ["5.31"] },
    { "id": 20, "tasks": ["5.32"] },
    { "id": 21, "tasks": ["5.33"] },
    { "id": 22, "tasks": ["7.1", "7.3"] },
    { "id": 23, "tasks": ["7.2", "7.4"] },
    { "id": 24, "tasks": ["7.5", "7.6"] },
    { "id": 25, "tasks": ["7.7", "7.8", "7.10"] },
    { "id": 26, "tasks": ["7.9", "7.11", "7.12"] },
    { "id": 27, "tasks": ["7.13", "7.14"] },
    { "id": 28, "tasks": ["7.15", "7.16"] },
    { "id": 29, "tasks": ["7.17", "7.18"] },
    { "id": 30, "tasks": ["7.19"] },
    { "id": 31, "tasks": ["7.20"] },
    { "id": 32, "tasks": ["7.21"] },
    { "id": 33, "tasks": ["7.22"] },
    { "id": 34, "tasks": ["9.1", "9.2", "9.6", "9.11"] },
    { "id": 35, "tasks": ["9.3", "9.4", "9.5", "9.7"] },
    { "id": 36, "tasks": ["9.8", "9.9"] },
    { "id": 37, "tasks": ["9.10", "9.12", "9.18", "9.19"] },
    { "id": 38, "tasks": ["9.13"] },
    { "id": 39, "tasks": ["9.14"] },
    { "id": 40, "tasks": ["9.15"] },
    { "id": 41, "tasks": ["9.16"] },
    { "id": 42, "tasks": ["9.17"] }
  ]
}
```
