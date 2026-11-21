# Implementation Plan: pyproject

## Overview

This plan implements `requirements.md` and `design.md` of the spec `pyproject` in six working groups: (1) Core registration, the PEP 508 entry reader and the Poetry constraint translator, (2) the `pyproject.toml` parser and its properties, (3) pipeline changes (names, cache key, message, validator, the `*` rule) with their properties, (4) copy and documentation text, (5) the live probe, the fixture, the exported scan, the end-to-end test and the featured-list decision, (6) traceability, the final checks and the live report. Each group ends with a checkpoint that runs `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`; the end-to-end suite runs at the end. Property-based tests are mandatory sub-tasks and sit next to the code they validate. Unit tests are mandatory too. Requirement numbers are criterion numbers of `.kiro/specs/pyproject/requirements.md`; Property numbers `PY-P1` to `PY-P10` are those of `.kiro/specs/pyproject/design.md`.

Implementation language: TypeScript (strict). The project root is the `gravekeeper` folder. This spec writes no code in the spec phase; the tasks below do.

Rules for every task:

- One owner per file per task: a file named in a task is edited by that task only, and tasks that name the same file are in different waves of the dependency graph.
- Test files follow `<module>.test.ts` and `<module>.property.test.ts` under `/tests`. Every property test uses `cfg()` from `tests/support/fc-config.ts`, carries the tag comment `// Feature: pyproject, Property PY-P<n>: <title>` and a `// Validates: Requirements <list>` line, holds one property per file, and has titles that start with `PY-P<n>`.
- Never set `FC_NUM_RUNS` in the shell. Deep runs use `npm run test:deep -- <files>`.
- Never print, log or write a token. Live tasks take `GITHUB_TOKEN` from the process environment that the orchestrator provides.
- Tasks marked **orchestrator-only** are done by the orchestrator (they run `git commit` and `git push`, use the network or use the token). A coding sub-agent does not start them.
- graveyard-ui Properties 14 to 16 and every existing test stay green. A test changes only where `pyproject.toml` legitimately changes a format list, a name list, a message, the cache key version, the `*` rule or the featured list. Do not change the art, the palette, `app/globals.css` or the header layout.
- `AGENTS.md` applies: read the relevant guide in `node_modules/next/dist/docs/` before changing any Next.js code (this plan changes none except an optional text edit of `components/featured-graveyards.tsx`).
- Source code cites the requirement number in a comment above each rule (steering rule).
- Commit and push after each green group: the orchestrator stages the files of that group by name (no `git add -A`).

## Tasks

- [x] 1. Core: format registration, PEP 508 reader, Poetry translator
  - [x] 1.1 Register the format in the Core tables
    - In `core/model/types.ts` add `'pyproject.toml'` to `ManifestFormat`. In `core/formats/manifest-format.ts` add it to `MANIFEST_FORMATS` (order: `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`), to `ECOSYSTEM_BY_FORMAT` (`pypi`) and to `SCOPES_BY_FORMAT` (`runtime`, `dev`, `optional`). Change no other model type. Do not edit `core/serializers/index.ts` (the missing writer already gives `unsupported-format`).
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.7_
  - [x] 1.2 Update the Core tests that list the formats
    - Find them with `Select-String -Path tests/core,tests/support -Pattern "Cargo.toml|ManifestFormat" -Recurse`. Update `tests/core/formats/formats.test.ts` (list, `ecosystemOf`, `supportedScopes`), `tests/core/serializers/serialize-manifest.test.ts` (add: `serializeManifest([], 'pyproject.toml')` returns `err({ kind: 'unsupported-format', format: '"pyproject.toml"' })` and does not throw), `tests/core/parsers/parse-manifest.test.ts` (an over-long text for the new format gives the existing warning), `tests/core/public-api.test.ts` when it lists the union, and the generators or oracles in `tests/support/arbitraries/dependencies.ts` and `tests/support/oracles/manifest-model.ts` only where they enumerate formats so that the existing serializer properties keep their meaning (the new format has no writer; the round-trip properties of the other three formats are unchanged).
    - _Requirements: 1.1, 1.2, 1.3, 1.7, 1.8, 1.9_
  - [x] 1.3 Implement the PEP 508 entry reader
    - Create `core/parsers/pep508.ts` with `parsePep508(entry: string): Pep508Result` as in the design: name token, skipped `[extras]`, `@ <target>` direct reference (`git+` gives `git`; `file:`, `./`, `../`, `/` give `path`; marker cut at whitespace followed by `;`), registry rest cut at the first `;` (empty gives `*`), backslash result, no comment stripping, no option lines, bare `#egg=` references are `cannot-parse`. Reuse `isNameToken`, `isRegistryRest` and `directReferenceKind` from `core/formats/requirements-lexical.ts`. Linear scans only. Total: never throws. Run `npm run check:core`.
    - _Requirements: 3.4, 3.5, 3.6, 3.8_
  - [x] 1.4 Write unit tests for the PEP 508 reader
    - Create `tests/core/parsers/pep508.test.ts`: `requests>=2,<3`, `Requests[socks] >= 2 ; python_version >= "3.8"`, empty rest gives `*`, `pkg @ git+https://example.org/p.git#egg=pkg` (git, `#` kept), `pkg @ ./local` (path), `pkg @ https://example.org/p.whl` (cannot parse), `git+https://x#egg=y` bare (cannot parse), a backslash, a name with a leading dot, an empty string, a 10000-character string.
    - _Requirements: 3.4, 3.5, 3.6, 3.8_
  - [x] 1.5 Implement the Poetry constraint translator
    - Create `core/formats/poetry-constraint.ts` with `poetryToPep440(constraint: string): PoetryTranslation` by the table and the algorithm of the design: caret and tilde with 1 to 3 parts and same-length upper bounds, `V.*` to `==V.*`, `*` terms dropped, bare to `==V`, comparison and `~=` pass-through, tokens split at commas and whitespace, operator-only tokens joined to the next token, parts of 1 to 9 digits, `|` anywhere gives `alternatives`, anything else `unsupported`, output joined by `,`. No regex with nested quantifiers. Total. Run `npm run check:core`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
  - [x] 1.6 Write the Poetry reference oracle and its generators
    - Create `tests/support/oracles/poetry-reference.ts` (structured terms, prefix-equality semantics of the design, zero-padded tuple comparison, plus an independent evaluator of the PEP 440 term text that supports `>=`, `>`, `<=`, `<`, `==`, `==V.*`, `!=`, `!=V.*`, `~=`; it imports neither the translator nor `@renovatebot/pep440`) and `tests/support/arbitraries/poetry.ts` (generators for terms of every kind with parts in `0..5`, lengths within the allowed ones, joined by comma, space or comma and space, a text renderer, generated release versions of 1 to 4 parts, version lists with prereleases and junk).
    - _Requirements: 11.3, 6.10, 6.11_
  - [x] 1.7 Write unit tests for the translator
    - Create `tests/core/formats/poetry-constraint.test.ts`: every example of Requirement 6 and of the design table (`^1.2.3`, `^0.2.3`, `^0.0.3`, `^1.2`, `^0.0`, `^0`, `^1`, `~1.2.3`, `~1.2`, `~1`, `~0`, `1.*`, `1.2.*`, `*`, `1.2.3`, `1.2`, `>= 1.2, < 2.0`, `>=1.2 <2.0`, `!=1.2.*`, `~=1.4.0`, `^1.2, !=1.2.5`), the `alternatives` outcomes (`^1 || ^2`, `^1 | ^2`), and the `unsupported` outcomes (empty term, `,`, trailing comma, `v1`, `1.x`, `>=1.*`, `^1.2.3rc1`, `^1.2.3.4`, `~=1`, a ten-digit part, a lone operator). A test that every `ok` output (other than `*`) is accepted by `pepRange` of `pipeline/mapping/range-pep440.ts` is not placed here (core must not import pipeline); it is part of task 4.8.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
  - [x] 1.8 Write the property test for the Poetry translation
    - `tests/core/formats/poetry-constraint.property.test.ts`, with the oracle and generators of task 1.6.
    - **Property 3: Poetry translation accepts exactly the versions Poetry accepts (PY-P3)**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.10**

- [x] 2. Core: the pyproject.toml parser
  - [x] 2.1 Implement the PEP 621 and PEP 735 collectors
    - Create `core/parsers/pyproject-collector.ts` (the `Collector` and `PyprojectContext` types, the `isTable` and `ownValue` helpers, the bounded `quoted` helper of 60 code points, the lone-surrogate test) and `core/parsers/pyproject-pep.ts` with `collectPep621` (`[project].dependencies` to `runtime`, `[project.optional-dependencies].<extra>` to `optional`) and `collectPep735` (`[dependency-groups].<group>` to `dev`; `include-group` entries skipped with the warning of Requirement 4.2, other tables and non-strings skipped with the warning of 4.3). Use `parsePep508`, `normalizePypiName`, the Self_Reference rule and the warning texts of the design. Ranks and `where` labels follow the design table. Read only with `Object.hasOwn` and `Object.entries`. Run `npm run check:core`.
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 7.1, 7.2, 7.3, 8.1, 8.2_
  - [x] 2.2 Implement the Poetry collector
    - Create `core/parsers/pyproject-poetry.ts` with `collectPoetry(poetry, out)`: `[tool.poetry.dependencies]` (`runtime`, `optional` for `optional = true`), `[tool.poetry.group.<name>.dependencies]` (`dev`), `[tool.poetry.dev-dependencies]` (`dev`); skip the `python` key; string, table and array-of-tables values; `version`, `git`, `path`, `url` keys (`url` gives `git`); other keys ignored; `poetryToPep440` for registry entries, with the warnings of Requirements 6.7 and 6.8 and `versionSpec` `*` for `alternatives` and `unsupported`; invalid key and wrong value type warnings (5.9, 5.10); ranks with the extra element number for arrays. Run `npm run check:core`.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 6.7, 6.8, 6.9, 7.1, 7.2, 7.3, 8.1, 8.2_
  - [x] 2.3 Implement the parser entry and register it
    - Create `core/parsers/pyproject-toml.ts` with `parsePyprojectToml(text): RawParse` (`parseToml`, the TOML-error warning with the optional line, project name for Self_Reference, Dependency_Table_Present including `dynamic` dependencies, the collectors in table order, the no-tables warning). Register `'pyproject.toml': parsePyprojectToml` in `core/parsers/index.ts`. Run `npm run check:core`.
    - _Requirements: 1.4, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 8.2, 8.3, 8.4, 8.5, 8.6_
  - [x] 2.4 Write the pyproject writer and generators
    - Create `tests/support/oracles/pyproject-writer.ts` (PEP 621 style and Poetry style of Requirement 11.2, TOML string escaping, a deterministic layout) and `tests/support/arbitraries/pyproject.ts` (Dependency lists without repeated `(name, scope)`, names with mixed case and separator runs, restricted `versionSpec` forms of the design section "Round trip", table fragments and hostile TOML-shaped texts for PY-P1, groups with Include_Entries for PY-P7, Poetry tables with `optional` flags for PY-P6).
    - _Requirements: 11.2, 8.9_
  - [x] 2.5 Write unit tests for the parser
    - Create `tests/core/parsers/pyproject-toml.test.ts`: the `psf/requests` file text as an inline string (runtime four, optional `socks` and `use_chardet_on_py3`, empty `security`, groups with the self reference `requests[socks]` skipped with its warning), a Poetry file with caret, tilde, wildcard, bare, table forms (`optional`, `extras`, `markers`, `python`), the multiple-constraint array (one kept, duplicate warnings), `git`, `path` and `url` sources, the `python` key, the legacy `dev-dependencies`, a `||` constraint (kept with `*` and its warning), an untranslatable constraint, `include-group` entries, PEP 621 and Poetry duplicates (PEP 621 wins, one warning), the same name in two scopes, a file with `[tool.ruff]` only, an empty file, `dynamic` dependencies, invalid TOML with and without a line, wrong table types, a 200-character name in a warning, and `parseManifest` dispatch through `finish`.
    - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.3, 3.6, 3.7, 4.2, 4.3, 5.4, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 6.7, 6.8, 6.9, 8.2, 8.3, 8.4_
  - [x] 2.6 Write the property test for totality
    - `tests/core/parsers/pyproject-never-throws.property.test.ts`: arbitrary strings and generated TOML-shaped texts through `parseManifest`.
    - **Property 1: Parsing never throws (PY-P1)**
    - **Validates: Requirements 2.1, 2.2, 2.4, 2.6, 2.7**
  - [x] 2.7 Write the property test for the round trip
    - `tests/core/parsers/pyproject-roundtrip.property.test.ts`, with the writer of task 2.4 in both styles.
    - **Property 2: The normalized set round-trips through a pyproject writer (PY-P2)**
    - **Validates: Requirements 8.9, 5.5, 5.7, 3.1, 3.2, 4.1**
  - [x] 2.8 Write the property test for determinism and order
    - `tests/core/parsers/pyproject-determinism.property.test.ts`.
    - **Property 4: Output is deterministic, sorted and free of repeated keys (PY-P4)**
    - **Validates: Requirements 8.2, 8.3, 8.5, 8.6, 8.7**
  - [x] 2.9 Write the property test for names
    - `tests/core/parsers/pyproject-names.property.test.ts`.
    - **Property 5: Names are PEP 503 normalized and rawName is kept (PY-P5)**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
  - [x] 2.10 Write the property test for scope mapping
    - `tests/core/parsers/pyproject-scopes.property.test.ts`.
    - **Property 6: Scope mapping is total (PY-P6)**
    - **Validates: Requirements 8.1, 8.8, 3.1, 3.2, 4.1, 5.1, 5.2, 5.3**
  - [x] 2.11 Write the property test for include-group
    - `tests/core/parsers/pyproject-include-group.property.test.ts`.
    - **Property 7: include-group entries are skipped with one warning and never resolved (PY-P7)**
    - **Validates: Requirements 4.2, 4.4, 4.5**
  - [x] 2.12 Write the property test for PEP 508 agreement
    - `tests/core/parsers/pep508.property.test.ts`, using the generators of `tests/support/arbitraries/requirements.ts` restricted to lines without whitespace followed by `#` and not starting with `-`; compare the Pyproject_Parser (entry in a PEP 621 `dependencies` array) with `parseManifest(line, 'requirements.txt')`.
    - **Property 8: PEP 508 entries agree with the requirements.txt grammar (PY-P8)**
    - **Validates: Requirements 3.4, 3.5, 3.9**

- [x] 3. Checkpoint - Core
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 3.1 Commit and push the core group (orchestrator-only)
    - After the checkpoint is green, stage by name the files of groups 1 and 2 and commit with the subject `pyproject: core parser, Poetry translator and properties (groups 1-2)`. Push. Record the hash for the report (task 12.4).
    - _Requirements: 15.6_

- [x] 4. Pipeline: names, cache key, message, validator, `*` rule
  - [x] 4.1 Change the pipeline constants
    - In `pipeline/constants.ts` set `DISCOVERY_MANIFEST_NAMES` to `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml` and `CACHE_KEY_VERSION` to 3. Define no other `UPPER_SNAKE` constant.
    - _Requirements: 9.1, 10.1_
  - [x] 4.2 Update the constants tests
    - In `tests/pipeline/constants.test.ts` check the four names in order and `CACHE_KEY_VERSION` equal to 3, keeping the consistency rule (positive integer greater than 1) as its own test case. This task owns only that file.
    - _Requirements: 9.1, 10.1_
  - [x] 4.3 Change the `no-manifests` message and the spec table that holds it
    - In `pipeline/scan/messages.ts` set the text of `no-manifests` to `No package.json, requirements.txt, pyproject.toml or Cargo.toml was found in this repository.` In `.kiro/specs/scan-pipeline/requirements.md` change the same cell of the User-facing messages table (line of the row `no-manifests`). Update `tests/pipeline/scan/notes.test.ts` and `tests/pipeline/scan/messages.property.test.ts` only if they repeat the old text. No em dash.
    - _Requirements: 9.5, 9.6_
  - [x] 4.4 Accept the format in the stored-result validator and update the key tests
    - In `pipeline/scan/scan-cache.ts` extend `isManifestFormat` with `'pyproject.toml'`. Find the tests that cover `isScanResult` and the key prefix with `Select-String -Path tests -Pattern "isScanResult|scanCacheKey|CACHE_KEY_VERSION|gravekeeper:v" -Recurse` (excluding `tests/pipeline/constants.test.ts`, which task 4.2 owns). Add a case: a stored result whose manifest has format `pyproject.toml` is accepted; an unknown format is rejected; keys built with version 3 differ from version 2 keys for equal parts. Update any test that hard-codes `v2`.
    - _Requirements: 10.1, 10.2_
  - [x] 4.5 Treat `*` as no constraint for pypi in `chooseVersion`
    - In `pipeline/mapping/version-choose.ts`, when the ecosystem is `pypi`, drop a `versionSpec` equal to `*` after `trim` from the Declared_Ranges (like an empty one). Leave `npm` and `cargo` unchanged. Cite Requirement 10.5 in a comment. Update `tests/pipeline/mapping/version-choose.test.ts` (pypi `*` alone gives `default`, no note; pypi `*` with a range resolves the range; npm `*` still resolves to the highest stable version) and the generators of `tests/pipeline/mapping/version-choose.property.test.ts` and `tests/pipeline/mapping/version-select.property.test.ts` where an arbitrary `*` for `pypi` would now give no note (keep their tags and titles; the property still holds for every other string). Do not edit `range-resolve.ts`.
    - _Requirements: 10.5_
  - [x] 4.6 Update the discovery and selection tests and generators
    - Update `tests/pipeline/mapping/discovery.test.ts` (a `pyproject.toml` at the root and nested is listed with `format` `pyproject.toml`; one under `node_modules` is not), `tests/pipeline/mapping/selection.test.ts` (default selection with `pyproject.toml` and `requirements.txt` at the root returns both in code point order; an explicit nested `pyproject.toml` path is accepted; a path with another file name gives `manifest-not-found`), and the name lists of `tests/pipeline/mapping/selection.property.test.ts`, `discovery.property.test.ts`, `mappers.property.test.ts` and `tests/pipeline/scan/stage-discovery.test.ts` where they list the three names. Keep their tags.
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 4.7 Write the property test for discovery and root selection
    - `tests/pipeline/mapping/pyproject-discovery.property.test.ts`: generated trees with the four names, other names, skip directories and depths; oracle written independently of `discoverManifests`.
    - **Property 9: Discovery and root selection treat pyproject.toml like every manifest (PY-P9)**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.8**
  - [x] 4.8 Write the property test for translated ranges and the resolver
    - `tests/pipeline/mapping/poetry-resolve.property.test.ts`: generated Poetry_Constraints (parseable) and version lists; compare `resolveRange('pypi', [poetryToPep440 result], versions)` with the highest stable version that the Poetry_Reference accepts. Also assert in this file (one of its tests, titled with `PY-P10`) that every non-`*` translation is accepted by `pepRange`.
    - **Property 10: Translated ranges resolve to the highest accepted version (PY-P10)**
    - **Validates: Requirements 6.11, 10.4**
  - [x] 4.9 Update the manifest stage test
    - In `tests/pipeline/scan/stage-manifests.test.ts` add a nested `sub/pyproject.toml` that is fetched and parsed with the Pyproject_Parser (format taken from the last path segment), and a root pair `pyproject.toml` and `requirements.txt` that are both fetched in code point order.
    - _Requirements: 9.3, 9.7_
  - [x] 4.10 Write the scripted scan test
    - Create `tests/pipeline/scan/run-scan-pyproject.test.ts` in the style of `tests/pipeline/scan/run-scan-cases.test.ts` (scripted sources): a repository with a root `pyproject.toml` (PEP 621 runtime, an extra, a Poetry-style caret, a git entry, a bare Poetry version) and a root `requirements.txt` listing one of the same packages with a pin. Assert: one Lookup_Target for the shared package and the pin wins (`versionBasis` `pinned`), the caret range resolves (`resolved`), a `*` dependency has `default` and no `range-unresolved` note, the git entry is unassessed with `non-registry-source`, and `manifests[].warnings` carries the parser warnings unchanged. Include the `CACHE_KEY_VERSION` effect: the scan cache key of the same repository differs from the version 2 key.
    - _Requirements: 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_
  - [x] 4.11 Zero-pad candidates for PEP 440 prefix matches
    - Fixes the defect that PY-P10 found in task 4.8 (task 4.8 is blocked on this fix and is re-run after 4.11). In `pepSatisfies` of `pipeline/mapping/range-pep440.ts`, when a specifier clause is a prefix match (`==V.*` or `!=V.*`) and the candidate's release segment has fewer parts than `V`, pad the candidate's release with zeros before matching. Inspect the specifier text by splitting at commas and by linear scans, with no new regex with nested quantifiers. Keep `@renovatebot/pep440` confined to this file. The rule applies to every pypi range. Cite Requirement 10.9 in a comment above the rule.
    - Create `tests/pipeline/mapping/range-pep440.test.ts` (no test file for `range-pep440` exists) with these cases: `1` vs `==1.0.*` is true; `1` vs `!=1.0.*` is false; `1.1` vs `==1.0.*` is false; `1.0.0` vs `==1.0.*` is true; prereleases are unchanged; npm and cargo are untouched.
    - _Requirements: 10.9_
  - [x] 4.12 Zero-pad candidates for every PEP 440 clause
    - Fixes the second zero-padding defect that the deep run of PY-P10 found in task 12.2: `satisfies('2.0', '~=2.0.0.0')` is false in `@renovatebot/pep440`, although PEP 440 treats `2.0` as `2.0.0.0` (shrunk counterexample: Poetry term `~=2.0.0.0`, versions `["2.0"]`, seed 1855169442, path `263:6:9`). In `pepSatisfies` of `pipeline/mapping/range-pep440.ts`, before the clauses are evaluated through the library, zero-pad the candidate's release segment to the longest release length among the versions of the specifier's clauses. Keep the candidate's epoch, pre, post, dev and local parts. Use the padded form only for the check; return and select the original candidate string. Do not pad when the specifier contains `===`. Keep the prefix logic of task 4.11. Use splitting at commas and linear scans, with no new regex with nested quantifiers. Cite Requirement 10.10 in a comment above the rule.
    - Extend `tests/pipeline/mapping/range-pep440.test.ts` (created by task 4.11) with these cases: `2.0` vs `~=2.0.0.0` is true; `2` vs `>=2.0.0` is true; `2` vs `<2.0.1` is true; `1.9` vs `~=2.0.0.0` is false; `2.0` vs `===2.0.0.0` is false; `2.0rc1` keeps the prerelease rules; the selected version string stays the original (`resolveRange('pypi', ['~=2.0.0.0'], ['2.0'])` returns `2.0`, not `2.0.0.0`).
    - Re-run note: after 4.12, task 12.2 re-runs the ten deep property runs.
    - _Requirements: 10.10_

- [x] 5. Copy and documentation text
  - [x] 5.1 Update the user-visible lists of formats
    - Edit `.kiro/steering/product.md` (line "The app reads dependency manifests") to list `package.json, requirements.txt, pyproject.toml, Cargo.toml`. In `tests/e2e/support/bodies.ts` and `tests/e2e/notes.spec.ts` change the repeated `no-manifests` text to the new message. Run `Select-String -Path app,components,view-model,README.md -Pattern "requirements\.txt|Cargo\.toml" -Recurse` and record that the landing copy, legend and how-it-decides copy list no formats; if a list is found, add `pyproject.toml` to it and update its test, without any change of art, palette or layout.
    - _Requirements: 9.5, 9.6_

- [x] 6. Checkpoint - Pipeline and copy
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 6.1 Commit and push the pipeline group (orchestrator-only)
    - Stage by name the files of groups 4 and 5 and commit with the subject `pyproject: discovery, cache key 3, pypi * rule, scan test (groups 4-5)`. Push. Record the hash for the report.
    - _Requirements: 15.6_

- [x] 7. Probe, fixture and end-to-end test
  - [x] 7.1 Extend the live report script
    - In `scripts/live-report.ts` add the arguments `--title "<text>"` (default `Scan accuracy live report`, used for the `#` heading) and `--per-package <owner/repo>` (default `request/request`, replaces the constant `PER_PACKAGE_REPO`), and a section `### Manifests read` per repository (path, format, dependency count from `result.manifests` and `result.dependencies`). Keep all existing output, the token guard and the `GRAVEKEEPER_LIVE_TESTS=1` gate. Update `tests/scripts` only if a test covers the script (none did when this plan was written).
    - _Requirements: 14.1, 14.2, 14.5_
  - [x] 7.2 Extend the recorder for one repository and the flag
    - In `scripts/fixtures/fixture-set.ts` add the optional boolean `requiresFlaggedDependency` to `FixtureMetadata`. In `scripts/record-fixtures.ts` add the argument `--only <owner/repo>` (records that repository only, no supplementary set, other sets untouched), the optional `requiresFlagged` of `RepoSpec`, writing `requiresFlaggedDependency: false` into the metadata when it is false, and a `replayCheck` that requires only `ok` and at least one dependency in that case (otherwise unchanged). Update or add the unit tests of the recorder helpers (find them with `Select-String -Path tests -Pattern "fixture-set|record-fixtures" -Recurse`).
    - _Requirements: 12.3, 12.4_
  - [x] 7.3 Run the Probe (orchestrator-only)
    - With `GRAVEKEEPER_LIVE_TESTS=1` and `GITHUB_TOKEN` in the process environment, run `npm run live:report -- psf/requests revmic/canopy --out docs/pyproject-probe.md --title "pyproject probe" --per-package psf/requests`. Verify in the output that `pyproject.toml` is listed under "Manifests read" for `psf/requests` with at least one dependency and that the scan is not an error. If not, run the same command for `pallets/flask`, then `encode/httpx`, then `tiangolo/fastapi` and take the first that meets this check (Requirement 12.2). Note from the per-package table whether any dependency of the chosen repository is archived or deprecated (the recorder replay check is the final authority). Never print the token. If the probe fails because of rate limits, wait and repeat; do not weaken any check.
    - _Requirements: 12.1, 12.2_
  - [x] 7.4 Record the fixture set (orchestrator-only)
    - Set `requiresFlagged: false` in the new `REPOS` entry of `scripts/record-fixtures.ts` only when the probe showed no archived or deprecated dependency; add the entry with `kind: 'python'`. Run `GRAVEKEEPER_LIVE_TESTS=1 npm run fixtures:record -- --only <owner>/<repo>` with the token in the environment. Check that the set `tests/fixtures/<owner>__<repo>/` exists (lower case), is at most `FIXTURE_SET_MAX_BYTES`, has `manifestPaths` `["pyproject.toml"]`, and that `git status` shows no change in the three existing sets. If the recorder refuses (size or replay), report the exact message and stop this task. Never write the token to a file.
    - _Requirements: 12.3, 12.4_
  - [x] 7.5 Update the fixture tests, the export and the samples
    - Update `tests/pipeline/fixtures-scan.test.ts` (honor `requiresFlaggedDependency`; for the new set require two equal replays, `ok`, at least one dependency, and a dependency whose manifest path ends in `pyproject.toml`), `tests/pipeline/fixtures-coverage.test.ts` and `tests/fixtures/fixtures-hygiene.test.ts` / `fixtures-size.test.ts` if they enumerate sets, `tests/ui/view-model/fixtures-replay.test.ts` (add the set with its row count), `scripts/export-scan-fixtures.ts` (add `{ dir, file: 'scan-<name>.json' }`) and `tests/ui/export-scan-fixtures.test.ts` (expected row count), and `tests/e2e/support/fixtures.ts` (the fixture name). Copy the recorded `pyproject.toml` text out of the set into `tests/fixtures/sample-pyproject.toml`, add a Poetry-style `tests/fixtures/sample-poetry-pyproject.toml` (a hand-written file with caret, tilde, wildcard, group, `optional` and git entries), and create `tests/core/parsers/pyproject-sample.test.ts` that parses both and compares the exact dependency list and warnings.
    - _Requirements: 12.3, 12.5, 12.6, 12.8_
  - [x] 7.6 Write the end-to-end test
    - Create `tests/e2e/pyproject.spec.ts` in the style of `tests/e2e/results.spec.ts` (mocked `POST /api/scan` with the exported body of the new set through `tests/e2e/support/mock-scan.ts`): the results page shows the dependency rows, opening a dependency shows `pyproject.toml` among its manifest paths, and when the body has manifest warnings the "Manifest warnings" section shows them. Add an axe check as the other results specs do. Do not change art or layout.
    - _Requirements: 12.7_
  - [x] 7.7 Add the repository to the live smoke list
    - In `tests/live/smoke-scan.live.test.ts` add the chosen repository to `REPOS`. The test stays skipped without `GRAVEKEEPER_LIVE_TESTS=1` (`tests/live/live-gating.test.ts` still passes).
    - _Requirements: 12.9_

- [x] 8. Checkpoint - Fixture
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 8.1 Commit and push the fixture group (orchestrator-only)
    - Stage by name the files of groups 7 and 9 and commit with the subject `pyproject: fixture set, export, e2e test, featured decision (groups 7, 9)`. Push. Record the hash for the report.
    - _Requirements: 15.6_

- [x] 9. Featured graveyards
  - [x] 9.1 Compare and decide
    - Read `docs/pyproject-probe.md`. Append a section `## Featured decision` to that file with a table of the chosen repository and `revmic/canopy`: ALIVE, HAUNTED, DEAD, unassessed, DEAD plus HAUNTED, grade. Apply Requirement 13.1: the chosen repository is a Convincing_Graveyard when its DEAD plus HAUNTED is strictly larger, or equal and its grade is worse (order A, B, C, D, F). Write one sentence that states which repository stays featured and why, naming the numbers. This task edits only `docs/pyproject-probe.md`.
    - _Requirements: 13.1, 13.3, 13.4_
  - [x] 9.2 Replace the featured entry (only when 9.1 says Convincing_Graveyard)
    - Skip this task, and say so in the task note, when 9.1 keeps `revmic/canopy`. Otherwise replace `https://github.com/revmic/canopy` by the chosen repository URL at the same position in `FEATURED_GRAVEYARDS` of `view-model/constants.ts` and in `ECOSYSTEM_BY_URL` of `components/featured-graveyards.tsx` (`pypi`), and update `tests/ui/view-model/constants.test.ts`, `tests/ui/components/landing-page.test.tsx`, `tests/ui/components/graveyard-app.test.tsx` if it names the list, `tests/e2e/landing.spec.ts` and `tests/e2e/live-scan.spec.ts`. Keep three entries, keep `revmic/canopy` as a fixture set and in its other tests, and change no art, palette or layout.
    - _Requirements: 13.2, 13.5, 13.6_

- [x] 10. Traceability
  - [x] 10.1 Write the traceability test
    - Create `tests/ui/py-traceability.test.ts` in the pattern of `tests/ui/art-traceability.test.ts` (tag regex `Feature:\s*pyproject,\s*Property\s+PY-P(\d+)`, property count 10, three tests titled `PY-trace ...`): each number 1 to 10 appears in exactly one tag, every tagged file has a `// Validates:` line, every test title of a tagged file starts with its `PY-P` number.
    - _Requirements: 15.1_
  - [x] 10.2 Update the traceability document
    - In `docs/property-traceability.md` add a section `## pyproject (PY-P1 to PY-P10)` with one row per property (requirements, test file, test title, status from a full `npx vitest --run`), update the header sentence (spec list and the counts of tests and files) and add `### pyproject (0 of 10)` to "Properties without a test", with the sentence that all ten properties have a passing test (or list those without one). Add a line under "Notes" that PY-P8 compares with the requirements.txt parser and that the Pyproject_Writer is test-only.
    - _Requirements: 15.2_

- [x] 11. Final checkpoint - All checks and end-to-end
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Then run `npm run test:e2e` (it exports the fixtures and runs Playwright) and ensure it passes. Ask the user if questions arise.
  - [x] 11.1 Run the end-to-end suite
    - Run `npm run test:e2e` after the full vitest run is green. Fix only failures caused by this spec (a changed message, a changed featured list, the new fixture), without any change of art, palette or header layout.
    - _Requirements: 15.3, 15.4, 15.5, 15.6_
  - [x] 11.2 Commit and push the traceability group (orchestrator-only)
    - Stage by name the files of group 10 and any fix of task 11.1 and commit with the subject `pyproject: traceability test and document (group 10)`. Push. Record the hash for the report.
    - _Requirements: 15.6_

- [ ] 12. Report
  - [x] 12.1 Run the live scan and write the report (orchestrator-only)
    - With `GRAVEKEEPER_LIVE_TESTS=1` and `GITHUB_TOKEN` in the environment, run `npm run live:report -- <owner>/<repo> --out docs/pyproject-report.md --title "pyproject live report" --per-package <owner>/<repo>` for the chosen repository. Check that the file states the grade and counts, the manifests read, the HAUNTED packages with advisory ids, the `versionBasis` counts, the notes by code, the duration and the cache header values, and that it holds no token. Append the section `## Featured comparison` copied from `docs/pyproject-probe.md` (Requirement 13.1 table and decision sentence) and a short `## Findings` list of what the scan showed about the feature (for example a `range-unresolved` note count, warnings of the parser, unassessed git entries).
    - _Requirements: 14.1, 14.2, 14.5, 13.1, 13.4_
  - [x] 12.2 Run the deep property tests and append them (orchestrator-only)
    - Run `npm run test:deep -- <file>` for each of the ten property files (`tests/core/formats/poetry-constraint.property.test.ts`, `tests/core/parsers/pyproject-never-throws.property.test.ts`, `pyproject-roundtrip.property.test.ts`, `pyproject-determinism.property.test.ts`, `pyproject-names.property.test.ts`, `pyproject-scopes.property.test.ts`, `pyproject-include-group.property.test.ts`, `pep508.property.test.ts`, `tests/pipeline/mapping/pyproject-discovery.property.test.ts`, `poetry-resolve.property.test.ts`). Never set `FC_NUM_RUNS` in the shell. Append to `docs/pyproject-report.md` the section `## Properties` with one row per property: number, title, test file, result and, for a failure, the shrunk counterexample and seed from the output (or the text "no counterexample found"). A failing property is reported, not hidden; fix the cause in a separate commit if it is a code defect.
    - _Requirements: 14.3, 11.5_
  - [x] 12.3 Remove the probe file, commit and push the report (orchestrator-only)
    - Delete `docs/pyproject-probe.md` (only that file), stage `docs/pyproject-report.md` and the deletion, commit with the subject `pyproject: live report`, push, and record the hash.
    - _Requirements: 14.6, 14.5_
  - [-] 12.4 Append the commits with their CI status (orchestrator-only)
    - Collect the commits of this spec (the hashes recorded in tasks 3.1, 6.1, 8.1, 11.2 and 12.3, plus any fix commit) with `git log --oneline`, and their CI run status with `gh run list --limit 20` (workflow `ci.yml`, status and conclusion per commit; `pending` for a run that has not finished). Append the section `## Commits and CI` to `docs/pyproject-report.md` as a table (hash, subject, CI status), commit it with the subject `pyproject: report commits and CI status` and push. The CI status of this last commit is written as `pending`.
    - _Requirements: 14.4, 14.5_

- [~] 13. STOP
  - Stop here. Report to the user: the grade and counts of the chosen repository, the HAUNTED packages with advisory ids, the `versionBasis` counts, the notes and duration, the properties with any counterexample, the commits with CI status, and which repository stays featured. Do not start any other work, spec or refactor.

## Notes

- Every task, including the property-based tests, is required. Nothing is marked optional.
- Tasks 7.3, 7.4, 12.1, 12.2, 12.3 and 12.4 need the network, the user-approved `GITHUB_TOKEN` or `git push`; the orchestrator does them. The token is passed only through the process environment and is never printed or written.
- Task 9.2 is conditional on the decision of task 9.1. When it is skipped, the dependency graph still lists it.
- `.kiro/specs/dependency-graveyard-core`, `scan-pipeline`, `scan-accuracy`, `graveyard-ui` and `graveyard-art` task lists and `tasks.meta.json` files are not edited. Task 4.3 edits one table cell in the `scan-pipeline` requirements because a test reads that table.
- The spec adds no package. `smol-toml` stays confined to `core/parsers/toml-tree.ts`, and `@renovatebot/pep440` to `pipeline/mapping/range-pep440.ts`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.5", "4.1", "4.3", "4.5", "7.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.6", "1.7", "2.1", "4.2", "4.4", "4.6", "4.11", "5.1", "7.2"] },
    { "id": 2, "tasks": ["1.8", "2.2", "4.7", "4.8", "4.12"] },
    { "id": 3, "tasks": ["2.3"] },
    { "id": 4, "tasks": ["2.4", "2.5", "2.12", "4.9", "4.10"] },
    { "id": 5, "tasks": ["2.6", "2.7", "2.8", "2.9", "2.10", "2.11"] },
    { "id": 6, "tasks": ["3.1", "7.3", "10.1"] },
    { "id": 7, "tasks": ["6.1", "7.4", "10.2"] },
    { "id": 8, "tasks": ["7.5", "7.7", "9.1"] },
    { "id": 9, "tasks": ["7.6", "9.2"] },
    { "id": 10, "tasks": ["8.1"] },
    { "id": 11, "tasks": ["11.1"] },
    { "id": 12, "tasks": ["11.2"] },
    { "id": 13, "tasks": ["12.1"] },
    { "id": 14, "tasks": ["12.2"] },
    { "id": 15, "tasks": ["12.3"] },
    { "id": 16, "tasks": ["12.4"] }
  ]
}
```
