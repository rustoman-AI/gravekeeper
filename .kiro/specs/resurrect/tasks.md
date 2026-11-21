# Implementation Plan: resurrect

## Overview

This plan implements `requirements.md` and `design.md` of the spec `resurrect` in fourteen working groups plus a STOP task: (1) pipeline hints, (3) Pyproject tool detection, (5) curated data, loader and live contract test, (6) source and live verification of the curated list, (8) view-model, (9) component and style, (11) fixtures, end-to-end and report specs, (13) traceability, (14) deep runs and report. Checkpoint groups 2, 4, 7, 10 and 12 follow the work groups; each runs `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and group 12 also runs the end-to-end suite. Property-based tests are mandatory sub-tasks and sit next to the code they validate. Unit tests are mandatory too. Requirement numbers are criterion numbers of `.kiro/specs/resurrect/requirements.md`; Property numbers `RS-P1` to `RS-P12` are those of `.kiro/specs/resurrect/design.md`.

Implementation language: TypeScript (strict). The project root is the `gravekeeper` folder. This spec writes no code in the spec phase; the tasks below do.

Rules for every task:

- One owner per file per task: a file named in a task is edited by that task only, and tasks that name the same file are in different waves of the dependency graph.
- Test files follow `<module>.test.ts` and `<module>.property.test.ts` under `/tests`. Every property test uses `cfg()` from `tests/support/fc-config.ts`, carries the tag comment `// Feature: resurrect, Property RS-P<n>: <title>` and a `// Validates: Requirements <list>` line, holds one property per file, and has titles that start with `RS-P<n>`.
- Never set `FC_NUM_RUNS` in the shell. Deep runs use `npm run test:deep -- <files>`.
- Never print, log or write a token. Live tasks get `GITHUB_TOKEN` from `gh auth token` inside the command that runs the test (for example `$env:GITHUB_TOKEN = (gh auth token)` in the same PowerShell command), never echo it, and never write it to a file.
- Tasks marked **orchestrator-only** are done by the orchestrator (they run `git commit` and `git push`, use the network or use the token). A coding sub-agent does not start them.
- Every existing test and the properties of the other specs stay green. A test changes only where this spec legitimately changes a behavior (design, "Test updates that this spec legitimately causes"): the cache key version, the placeholder slot, the `resurrect` field of the detail model, and the dependency or manifest entry shape.
- No change of the art, the palette, the scene or the header layout. The slot uses existing components (`ExternalLink`) and existing tokens; new CSS is one delimited block in `app/globals.css` that uses only existing custom properties.
- Reduced motion and WCAG 2.1 AA apply; the slot has no animation. The client JavaScript budget (`npm run check:bundle`, `tests/e2e/js-budget.spec.ts`) and the scene render budgets stay.
- `AGENTS.md` applies: read the relevant guide in `node_modules/next/dist/docs/` before changing any Next.js code. This plan changes no Next.js API; it edits a client component, a CSS file and view-model code. If a task finds that it must touch a Next.js file, it reads the guide first.
- Source code cites the requirement number in a comment above each rule (steering rule).
- Re-export the e2e fixtures when the scan shape changes (task 11.1); re-record a fixture only if strictly needed (the design shows that none is needed).
- Commit and push after each green group: the orchestrator stages the files of that group by name (no `git add -A`).
- Groups 8 and 9 change `DetailModel.resurrect`; the full `npm run typecheck` is expected to pass only after task 9.2. Tasks of group 8 check themselves with `npx vitest --run <their test files>` and `npx tsc --noEmit` errors limited to their own files.

## Tasks

- [x] 1. Pipeline: hint constants, normalizer, extractors, wiring, validator
  - [x] 1.1 Change the pipeline constants and the constants test
    - In `pipeline/constants.ts` set `CACHE_KEY_VERSION` to 4 (update its comment: "resurrect spec R4.1: bumped to 4 so scans cached before hints are not reused") and add `HINT_TEXT_MAX_LENGTH` = 600 and `HINTS_MAX_PER_PACKAGE` = 3, with one-line comments. Define no other `UPPER_SNAKE` constant. In `tests/pipeline/constants.test.ts` change "CACHE_KEY_VERSION equals 3" to 4, add the two new constants to the list of expected names (the list near line 83 and the list near line 253 if it applies), and test their values. Keep the consistency test (positive integer greater than 1) as its own case. This task owns only these two files.
    - _Requirements: 1.7, 4.1_
  - [x] 1.2 Implement the hint normalizer
    - Create `pipeline/mapping/hint-text.ts` with `normalizeHintText(value: unknown): string | null` by the five steps of the design (non-string gives null; controls, bidirectional controls, line and paragraph separators and lone surrogates become spaces; whitespace runs collapse and trim; empty gives null; cut at `HINT_TEXT_MAX_LENGTH` code points with a final `…`, trailing spaces trimmed before it). Count and cut by code points (`Array.from` or an iterator), never by UTF-16 units. Linear time, no regex with nested quantifiers, never throws. Cite Requirements 1.1 to 1.6 and 1.8 in comments.
    - Create `tests/pipeline/mapping/hint-text.test.ts`: the `bincode` details text of `tests/fixtures/ajeetdsouza__zoxide` (read it from the recorded response, not retyped) normalizes to one line with its Markdown characters unchanged; exactly 600 code points for an input without a space at the cut and a result of at most 600 otherwise; a 599-code-point input has no ellipsis; astral characters (emoji) count as one; `\u202e`, `\u0000`, `\u2028` and tabs are removed; HTML (`<a href="x">y</a>`) and `javascript:alert(1)` strings are kept as characters; non-strings, `''` and whitespace give null; the function has arity 1 (Requirement 1.9).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.8, 1.9_
  - [x] 1.3 Write the property test for the normalizer
    - `tests/pipeline/mapping/hint-text.property.test.ts`: arbitrary strings (`fc.string` with unicode, `fc.fullUnicodeString`, generated controls and bidirectional marks, lone surrogates, runs of whitespace, URLs and Markdown fragments, long strings above 600 code points) and arbitrary non-string values.
    - **Property 6: Hint text is bounded, plain and stable (RS-P6)**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
  - [x] 1.4 Add the hint type and the advisory text fields
    - In `pipeline/mapping/types.ts` add `UpstreamHint` (`kind: 'deprecation-notice' | 'advisory-notice'`, `text: string`, `sourceUrl: string | null`), add `details: string | null` and `summary: string | null` to `AdvisoryRecord`, and add `hints: readonly UpstreamHint[]` to `AssembledFacts`. In `pipeline/mapping/osv-advisory.ts` make `mapOsvAdvisory` read the own string fields `details` and `summary` of the body (null when absent or not a string) through `readOwn`, unnormalized. Update the existing tests that build `AdvisoryRecord` literals or deep-equal a record (find them with `Select-String -Path tests -Pattern "AdvisoryRecord|mapOsvAdvisory" -Recurse`); keep their tags and titles.
    - _Requirements: 3.2_
  - [x] 1.5 Implement the hint extractors
    - Create `pipeline/mapping/hints.ts` with `npmDeprecationHint(latestBody: unknown): UpstreamHint[]` and `advisoryNoticeHints(records: readonly AdvisoryRecord[]): UpstreamHint[]` as in the design: the npm one reads `deprecated` through `readOwn` and `normalizeHintText`, returns one `deprecation-notice` hint with `sourceUrl` null or `[]`; the advisory one keeps non-withdrawn records with `unmaintained`, sorts ids by `compareCodePoints`, text from `details` else `summary` after normalization, `sourceUrl` from `advisoryUrl(id)` of `pipeline/mapping/advisories.ts`, de-duplicates ids, caps at `HINTS_MAX_PER_PACKAGE`. Both are total (try/catch around every read). Cite Requirements 2.1 to 2.3 and 3.1 to 3.5, 3.7.
    - Create `tests/pipeline/mapping/hints.test.ts`: the `har-validator` latest body of the `request__request` fixture gives "this library is no longer supported" with kind `deprecation-notice` and `sourceUrl` null; a body with `deprecated: ''`, `deprecated: false`, no field, an array and `null` give `[]`; an advisory record with details only, with summary only, with neither, a withdrawn one, an informational-but-not-unmaintained one, and four unmaintained ones (only three hints, ascending ids).
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_
  - [x] 1.6 Write the property test for the extractors
    - `tests/pipeline/mapping/hints.property.test.ts`: generated latest-version bodies (objects with `deprecated` of every type, arrays, primitives, objects with throwing getters and proxies) and generated advisory record lists (random ids with surrogates and punctuation, withdrawn and unmaintained flags, details and summary of any string including whitespace-only).
    - **Property 8: Hint extraction is total and well-shaped (RS-P8)**
    - **Validates: Requirements 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.7**
  - [x] 1.7 Wire the hints into `assembleFacts`
    - In `pipeline/mapping/assemble.ts` set `hints` of the result: for `npm` use `npmDeprecationHint` on `bodyOf(raw.npmLatest)` when it exists; for `cargo` use `advisoryNoticeHints(records)` inside the existing OSV block (the same `records` that feed `aggregateAdvisories`); for `pypi` and every other path `[]`. Cite Requirements 2.1, 2.6 and 3.1, 3.6. Create `tests/pipeline/mapping/assemble-hints.test.ts`: npm hint present for a deprecated latest body and absent when `npmLatest` is unavailable; a cargo target with an unmaintained advisory has one `advisory-notice` with the advisory URL; an npm target with an unmaintained-looking advisory body has no `advisory-notice`; a pypi target has no hints; a `uuid`-like npm target whose latest body has no `deprecated` has no hint even when deps.dev marks the version deprecated (Requirement 2.4). Update the existing `assembleFacts` tests that deep-equal the whole result (find them with `Select-String -Path tests/pipeline -Pattern "assembleFacts" -Recurse`); keep their tags and titles.
    - _Requirements: 2.1, 2.4, 2.6, 3.1, 3.6_
  - [x] 1.8 Carry the hints into the scan dependencies
    - In `pipeline/scan/types.ts` add `readonly hints?: readonly UpstreamHint[]` to `ScanDependency` (comment: optional so that results and fixtures built before this spec stay valid; the pipeline always sets it). In `pipeline/scan/assemble-result.ts` add `hints` to `TargetOutcome` (`assembled.hints`; `[]` in the all-null outcome and in the unlooked-target outcome) and set `hints: outcome.hints` on every dependency of a target. Update the pipeline tests that deep-equal a dependency entry (`tests/pipeline/scan/*`, found by running them), keeping tags and titles; add one case to a scripted-scan test file of your choice that is new (`tests/pipeline/scan/run-scan-hints.test.ts`, scripted sources in the style of `run-scan-pyproject.test.ts`): two dependencies of one target carry equal hints, an unlooked git dependency carries `[]`.
    - _Requirements: 4.2, 4.3_
  - [x] 1.9 Check hints in the stored-result validator
    - In `pipeline/scan/scan-cache.ts` add `isHint` (exactly the keys `kind`, `text`, `sourceUrl`; kind in the two; `text` a string with at most `HINT_TEXT_MAX_LENGTH` code points; `sourceUrl` a string or null) and extend the dependency check: `hints` is `undefined` or an array of valid hints (at most `HINTS_MAX_PER_PACKAGE`). Create `tests/pipeline/scan/scan-cache-hints.test.ts`: a result without `hints` is accepted (Requirement 4.4); a result with valid hints is accepted; a table of malformed hints is rejected (wrong kind, extra key, missing key, empty-key object, non-string text, text of 601 code points, numeric `sourceUrl`, `hints` not an array, four hints).
    - _Requirements: 4.4, 4.5_
  - [x] 1.10 Check the fixtures through the changed pipeline
    - Create `tests/pipeline/resurrect-fixtures.test.ts` in the style of `tests/pipeline/fixtures-scan.test.ts` (replay of the recorded sets): in `request__request`, `har-validator`, `phantomjs-prebuilt` and `karma-phantomjs-launcher` carry one `deprecation-notice` hint with the recorded text; `uuid` and `rimraf` carry none; in `ajeetdsouza__zoxide`, `bincode` carries one `advisory-notice` whose `sourceUrl` is `https://osv.dev/vulnerability/RUSTSEC-2025-0141` and whose text is at most 600 code points and starts with "Due to a doxxing"; two replays are equal; no hint text of any set contains `ghp_`, `gho_` or `github_pat_`. Update `tests/pipeline/fixtures-scan.test.ts` only if it deep-equals dependency entries.
    - _Requirements: 2.1, 2.4, 3.1, 4.2, 12.6_
  - [x] 1.11 Keep summary and details in the compact OSV entry
    - Checkpoint 2 failed scan-pipeline Property 71 (`tests/adapters/l2-entries.property.test.ts`, "OSV advisory: Mapper output is equal on compact and full text", scan-pipeline R19.31) with the counterexample `{"summary":"","id":"a"}`, seed 433693239. Task 1.4 made `mapOsvAdvisory` read `details` and `summary`, but `compactOsvAdvisory` keeps only the fields that the mapper read before, so a compact L2 cache entry loses them and cached cargo scans lose the RustSec advisory hint.
    - In `pipeline/ports/l2-entries.ts` make `compactOsvAdvisory` keep the own string fields `summary` and `details` (dropped when absent or not a string). Cite Requirement 3.8 in a comment.
    - In `tests/adapters/l2-entries.test.ts` update the exact compact shape to include the two fields when they are strings, and add a case where they are absent or non-strings and are dropped.
    - P71 in `tests/adapters/l2-entries.property.test.ts` must pass unchanged, also with `npm run test:deep -- tests/adapters/l2-entries.property.test.ts`. This task owns only the first two files named above.
    - _Requirements: 3.8_

- [x] 2. Checkpoint - Pipeline hints
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 2.1 Commit and push the pipeline group (orchestrator-only)
    - After the checkpoint is green, stage by name the files of group 1 and commit with the subject `resurrect: upstream hints, cache key 4 (group 1)`. Push. Record the hash for the report (task 14.4).
    - _Requirements: 16.6_

- [x] 3. Pyproject tool detection
  - [x] 3.1 Implement the detector in Core
    - Create `core/parsers/pyproject-tool.ts` with `detectPyprojectTool(text: string): 'poetry' | 'pep621' | 'mixed' | null` by the design: parse with the TOML reader of `core/parsers/toml-tree.ts`; a Poetry table counts when `tool.poetry.dependencies`, `tool.poetry.group.<g>.dependencies` or `tool.poetry.dev-dependencies` exists as an own object with at least one entry (the `python` key alone does not count); a PEP table counts when `project.dependencies` is a non-empty array, `project.optional-dependencies` or `dependency-groups` is a non-empty object; own-property reads only (`Object.hasOwn`); null for invalid TOML, for text longer than `MAX_MANIFEST_LENGTH`, and for no table. Export it from `core/index.ts`. Update `tests/core/public-api.test.ts` if it lists the exports. Run `npm run check:core`.
    - Create `tests/core/parsers/pyproject-tool.test.ts`: `tests/fixtures/sample-pyproject.toml` (`psf/requests` layout) gives `pep621`, `tests/fixtures/sample-poetry-pyproject.toml` gives `poetry`, a file with both table kinds gives `mixed`, `[tool.ruff]` only and an empty string give null, a Poetry file whose `[project]` has only `name` gives `poetry`, invalid TOML and a 1 MB string give null without throwing, `__proto__` and `constructor` keys do not count as tables.
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 3.2 Carry the tool into the manifest entries and the validator
    - In `pipeline/scan/types.ts` add `readonly pyprojectTool?: 'poetry' | 'pep621' | 'mixed'` to `ScanManifestEntry`. In `pipeline/scan/stage-manifests.ts` (near line 194, where `parseManifest` is called) call `detectPyprojectTool(fetched.body)` when the format is `pyproject.toml` and keep a non-null result on the assembly manifest; in `pipeline/scan/assemble-result.ts` copy it into the manifest entry (line 249) with the key omitted when absent, so that every other manifest entry stays unchanged. In `pipeline/scan/scan-cache.ts` accept `pyprojectTool` that is `undefined` or one of the three values and reject any other value. Create `tests/pipeline/scan/pyproject-tool-plumbing.test.ts`: a scripted scan with a Poetry `pyproject.toml`, a PEP 621 one, a `requirements.txt` and a `package.json` gives `pyprojectTool` on the first two entries only; the validator accepts a result without the field and rejects `pyprojectTool: 'uv'` (Requirements 5.5, 5.6). Update the manifest-stage tests that deep-equal a manifest entry for a `pyproject.toml`.
    - _Requirements: 5.4, 5.5, 5.6_
  - [x] 3.3 Write the property test for the stored result
    - `tests/pipeline/scan/scan-cache-hints.property.test.ts`: generated `ScanResult` values (small generated dependency lists with generated hints, `hints` absent or present, manifests with and without `pyprojectTool`), built from a valid minimal result by a generator in the test file, and mutations that replace one hint or one tool by a malformed value.
    - **Property 12: Scan results with hints survive JSON and the validator (RS-P12)**
    - **Validates: Requirements 4.5, 4.6, 5.5**

- [x] 4. Checkpoint - Pyproject tool detection
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 4.1 Commit and push the detection group (orchestrator-only)
    - Stage by name the files of group 3 and commit with the subject `resurrect: pyproject tool detection, stored-result round trip (group 3)`. Push. Record the hash.
    - _Requirements: 16.6_

- [x] 5. Curated data, names, loader and live contract test
  - [x] 5.1 Add the view-model constants and the name rules
    - In `view-model/constants.ts` add `COPY_STATUS_RESET_MS` (3000), `CURATED_MAX_ALTERNATIVES` (4) and `CURATED_WHY_MAX_LENGTH` (200). Create `view-model/resurrect-names.ts` with `isValidName`, `isCommandSafe` and `normalizeName` exactly as the design table states (npm, pypi and cargo patterns; linear, no nested quantifiers; total for non-strings). Create `tests/ui/view-model/resurrect-names.test.ts`: tables of accepted and rejected names for each function and ecosystem (`@scope/pkg`, `~tilde`, `-rf`, `a b`, `a;b`, `$(x)`, an empty string, a 215-character npm name, `Requests` and `requests_toolkit` for pypi, `serde_json` and `1abc` for cargo), and `normalizeName` examples (`Foo__Bar.baz` gives `foo-bar-baz` for pypi; `Serde_JSON` gives `serde-json` for cargo; npm unchanged).
    - _Requirements: 7.2, 10.10_
  - [x] 5.2 Write the candidate curated file
    - Create `data/resurrections.json` (the folder `data/` does not exist yet) with the shape `{"entries": [...]}` and the 44 candidates of the design table "Curated candidates", sorted by ecosystem (`npm`, `pypi`, `cargo`) then `from` in code point order, each with `to`, a one-sentence `why` of at most 200 characters ending with a period that states only what the expected source says (for example "The maintainers of request deprecated it and list alternatives."), and the expected source URL as an https URL. Use the exact registry names of the design (PyPI names in normalized form, for example `beautifulsoup`, `pil`, `mysql-python`). The file is a candidate list; task 6.1 removes the entries that fail. Write no entry for `uuid`.
    - _Requirements: 6.1, 6.5, 6.6, 6.7, 6.8, 6.9_
  - [x] 5.3 Implement the loader and the data test
    - Create `view-model/resurrections.ts` with `loadCurated(raw: unknown)` (validates schema, `why` rules, https and no credentials, 1 to `CURATED_MAX_ALTERNATIVES` distinct `to` names that pass `isValidName`, `from` that passes `isValidName`, drops failures, drops later duplicates of a normalized `from`; total) and `lookupCurated(ecosystem, name)` over the module-level list built from `data/resurrections.json`, with the normalized-key `Map` of the design. Cite Requirements 7.4, 7.6.
    - Create `tests/ui/view-model/resurrections.test.ts` (loader behavior with hostile raw values: non-object, entries not an array, entry with extra key, `http:` source, `javascript:` source, URL with credentials, `to` of five names, `to` with a duplicate, invalid names, `why` with a URL; each dropped, the valid entries kept, never throws) and `tests/ui/view-model/resurrections-data.test.ts` over the real file: schema of every entry (Requirement 7.1), no `to` that is a `from` of the same ecosystem, no `to` equal to its own `from` after normalization, every `source` an `https` URL, every name valid, sorted order, no duplicate normalized `from`, `why` one sentence of at most 200 characters, at least 8 entries per ecosystem, no entry with `from` `uuid`, and the loaded list has the same length as the file (nothing dropped silently).
    - _Requirements: 6.2, 6.5, 6.6, 6.7, 6.8, 6.9, 7.1, 7.3, 7.4, 7.6_
  - [x] 5.4 Write the property test for the lookup
    - `tests/ui/view-model/resurrections.property.test.ts`: generated curated lists (valid entries) and generated spelling variants of each `from` (PyPI: case changes and runs of `-`, `_`, `.`; crates: case changes and `-` versus `_`; npm: exact), plus generated names that are not a `from`.
    - **Property 10: Curated lookup is invariant under equivalent spellings (RS-P10)**
    - **Validates: Requirements 7.4, 7.5**
  - [x] 5.5 Write the live contract test
    - Create `tests/live/resurrections.live.test.ts` in the style of the other `tests/live/*.live.test.ts` files and `tests/live/live-support.ts` (gating by `GRAVEKEEPER_LIVE_TESTS`, one skipped case without it, no request without it): for each `to` name of the real `data/resurrections.json`, the checks of Requirements 8.2 to 8.4 (npm: 200, `dist-tags.latest`, latest version document without `deprecated`, GitHub repository not archived when the `repository` field is a GitHub URL; PyPI: 200, `info.yanked` false, no `Development Status :: 7 - Inactive`, Simple JSON `project-status.status` `active` when present; crates.io: 200, newest non-yanked version, no non-withdrawn OSV `unmaintained` advisory, GitHub repository not archived when known; send a User-Agent that names the project to crates.io). The GitHub archived check uses `process.env.GITHUB_TOKEN` when set and is skipped with a note when it is not. Concurrency of at most 4 requests; each failure message names the registry, the package and the failed check, never a header. Update `tests/live/live-gating.test.ts` only if it enumerates the live files.
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 6. Source check and live verification of the curated list
  - [x] 6.1 Check every source URL (orchestrator-only)
    - For each entry of `data/resurrections.json` fetch the `source` URL with the fetch tool (`web_fetch`; a GitHub URL may use `gh` instead). Keep an entry only when the page text names every `to` package it lists, or states the deprecation or unmaintained status and names the successor; remove a `to` name that the page does not name and keep the entry when at least one `to` name remains that the page states. When a better page is found for a good candidate, replace the source URL with it and say so. Drop an entry when the page is unreachable, states nothing about the replacement, or contradicts the entry. Keep at least 8 entries per ecosystem after dropping (add well-known entries with a verified source if needed, sorted in place). Create `docs/resurrect-report.md` with the heading `# Resurrect report`, one line of the check date and the section `## Curated list` with a table of kept entries (ecosystem, from, to, source), a table `### Dropped candidates` (ecosystem, from, reason, URL tried) and a line that says `har-validator` was kept or dropped and why. Rewrite `why` sentences only to match what the page says. Edit no file other than `data/resurrections.json` and `docs/resurrect-report.md`. Run `npx vitest --run tests/ui/view-model/resurrections-data.test.ts` afterwards.
    - _Requirements: 6.2, 6.3, 6.4, 8.1_
  - [x] 6.2 Run the live contract test and drop failing targets (orchestrator-only)
    - Run `$env:GRAVEKEEPER_LIVE_TESTS = '1'; $env:GITHUB_TOKEN = (gh auth token); npx vitest --run tests/live/resurrections.live.test.ts` in one command (the token is never printed). For each failing `to` name remove it from its entry in `data/resurrections.json` (remove the entry when none remains) and rerun until the test passes; a failure caused by rate limiting or network is waited out and repeated, not treated as a failed target. Append to the `## Curated list` section of `docs/resurrect-report.md` a table `### Removed by the live contract test` (ecosystem, from, to name, failed check) or the sentence "No target failed the contract test". Run the data test of task 5.3 and the loader tests afterwards.
    - _Requirements: 8.2, 8.3, 8.4, 8.7_

- [x] 7. Checkpoint - Curated data
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 7.1 Commit and push the curated-data group (orchestrator-only)
    - Stage by name the files of groups 5 and 6 and commit with the subject `resurrect: curated replacements, names, loader, live contract test (groups 5-6)`. Push. Record the hash.
    - _Requirements: 16.6_

- [x] 8. View-model: boundary, rows, commands, model
  - [x] 8.1 Add the view-model types
    - In `view-model/types.ts` add `ParsedHint` (`kind`, `text`, `sourceUrl: string | null`, and `link: {href: string, label: string} | null` computed by the narrower), `ManifestOrigin` (`path`, `format`, `pyprojectTool: 'poetry' | 'pep621' | 'mixed' | null`), `hints: readonly ParsedHint[]` on `ParsedDependency` (and omit `hints` from the `Omit` of the scan dependency type, as `advisories` is), `hints` and `manifestOrigins` on `PackageRow`, the `ResurrectModel` family of the design ("ResurrectModel" table: `heading`, `urgent`, `hints`, `suggestions`, `fallback`, and the block record with `heading`, `lead` segments, `lines`, `note`, `copyLabel`, `copyText`), and change `DetailModel.resurrect` from `boolean` to `ResurrectModel | null`. Types only.
    - _Requirements: 9.1, 10.1, 11.1_
  - [x] 8.2 Narrow hints at the response boundary
    - In `view-model/narrow.ts` add `narrowHints(value: unknown): readonly ParsedHint[]` by the design (non-array gives `[]`; each entry a record with a known `kind`, a non-empty `text` of at most `HINT_TEXT_MAX_LENGTH` code points with none of the characters that `normalizeHintText` removes, at most `HINTS_MAX_PER_PACKAGE` entries kept, link from `advisoryLink` labelled "Read the advisory" for `advisory-notice` and null for `deprecation-notice`, `sourceUrl` kept as received only when it passes the link validator, otherwise null; total, order kept, idempotent). In `view-model/parse-response.ts` set `hints: narrowHints(entry['hints'])` on each dependency and do not require the field. Create `tests/ui/view-model/narrow-hints.test.ts`: absent field, valid hints, a hint with a `javascript:` `sourceUrl` (kept, link null), a deprecation hint with a non-null `sourceUrl` (link null), unknown kind, empty text, 601-code-point text, a `\n` in the text, a fifth entry; and a parse-response case where the body has no `hints` anywhere (results recorded before this spec still parse). Cite Requirements 4.7, 4.9, 4.10.
    - _Requirements: 4.7, 4.9, 4.10_
  - [x] 8.3 Write the property test for the narrowing
    - `tests/ui/view-model/narrow-hints.property.test.ts`: `fc.anything()` values, arrays of generated hint-like records (valid and invalid fields), and outputs fed back in.
    - **Property 9: Client narrowing of hints is total, valid and idempotent (RS-P9)**
    - **Validates: Requirements 4.7, 4.8**
  - [x] 8.4 Add hints and manifest origins to the package rows
    - In `view-model/package-rows.ts` fill `PackageRow.hints` (from the first dependency entry of the row in manifest order that has hints) and `PackageRow.manifestOrigins` (one `ManifestOrigin` per distinct manifest path of the row, in the order of `manifestPaths`, with `format` and `pyprojectTool` read from `result.manifests`; `pyprojectTool` null when the entry has none). Update the existing row tests that deep-equal a whole row (find them by running `tests/ui/view-model`), keeping tags and titles, and create `tests/ui/view-model/package-rows-origins.test.ts`: a package declared in `package.json` and `Cargo.toml`-free results; a pypi package declared in `requirements.txt` and a Poetry `pyproject.toml` has two origins in path order with the tool on the second only; a result without `pyprojectTool` gives null.
    - _Requirements: 5.7, 10.8_
  - [x] 8.5 Implement the Command_Builder
    - Create `view-model/resurrect-commands.ts` with the templates of the design table (the only place that holds Fixed_Words): `buildCommandBlocks(input)` for an origin (`package.json`, `requirements.txt`, `pyproject.toml` with tool `poetry`, `pep621`, `mixed` or null, `Cargo.toml`), the scopes of the row, the `from` name, the `to` name and the manifest path. It returns blocks (`heading`, `lead` as segments of text and code names, `lines`, `note`, `copyLabel` "Copy commands for <to>", `copyText` = lines joined by `\n`); `pyproject.toml` with `mixed` or null gives the Poetry block headed "If this project uses Poetry" and the PEP 621 block headed "If this project uses another tool (PEP 621)"; one block per distinct (origin, scope) with the manifest path as heading when more than one block exists; flags by scope as in Requirements 10.2 and 10.7 (npm `--save-dev`, `--save-optional`, `--save-peer`; cargo `--dev`, `--build`, `--optional`; none for pip and poetry); returns no block when `from` or `to` fails `isCommandSafe`; never builds a line from any other string. Cite Requirements 10.2 to 10.7, 10.9, 10.10.
    - Create `tests/ui/view-model/resurrect-commands.test.ts`: every template with exact lines (`npm uninstall request` / `npm install got`; the dev, optional and peer flags; `pip install got`-style lead sentences with the path; `poetry remove` / `poetry add` plus the `--group` note; PEP 621 lead and `pip install`; `cargo remove` / `cargo add --dev`), `mixed` and null show two blocks, two scopes give two blocks, hostile names (`-rf`, `a;b`, `~x`, `$(x)`) give no block.
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10_
  - [x] 8.6 Write the property test for the commands
    - `tests/ui/view-model/resurrect-commands.property.test.ts`: generated origins (every format, every tool value and null), scope lists, `from` and `to` names (valid names plus hostile strings with spaces, quotes, `;`, `$`, backticks, `~`, leading `-`, unicode) and paths.
    - **Property 4: Commands contain only Fixed_Words and Validated_Names, and the copy text equals the lines (RS-P4)**
    - **Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.9, 10.10, 11.7**
  - [x] 8.7 Implement the Resurrect_Model builder and the generators
    - Create `view-model/resurrect.ts` with `buildResurrectModel(row, result, curated)` where `curated` is the lookup function (default `lookupCurated`, injectable for tests) exactly as the design lists its six steps: null unless DEAD or `row.kind === 'restless'`; the urgent sentence (count from `facts.openVulnerabilityCount` when a finite integer of at least 1, singular for 1, otherwise the generic sentence); hints with labels "From the package's deprecation notice" and "From an advisory that marks this crate unmaintained" and links (advisory link "Read the advisory", registry link "Read it on the registry page"); curated suggestions under "From the caretaker's list" with the self-replacement filter by `normalizeName`, the source link labelled "Source for this suggestion", and command blocks from task 8.5 per distinct origin and scope; the fallback only when there are no hints and no suggestions, with the fixed texts of Requirements 9.6 and 9.7 (reason words "archived", "deprecated", "archived and deprecated" from the reasons 8.1 and 8.2), the registry link, and the repository and issues links labelled "Source repository (listed by the package, not verified)" and "Issues (listed by the package, not verified)" built from the `source-repo-unverified` note through `sourceRepoLink` (omitted when null); every href from `registryLink`, `advisoryLink`, `sourceRepoLink` or the curated `source`. Pure, no clock, no random. Cite Requirements 9.1 to 9.11, 10.1, 12.4, 12.5.
    - Create `tests/support/arbitraries/resurrect.ts` (generators of package rows of every plot kind and classification, hints with hostile texts and `sourceUrl` values, manifest origins and scopes, curated lists with valid and self-referencing entries) and `tests/ui/view-model/resurrect.test.ts`: unit cases for the `request/request` rows from `tests/e2e/.generated/scan-request.json` (the file is generated by task 11.1; until then build the rows from `tests/fixtures` replay or from synthetic rows): `har-validator` shows the hint and no fallback; `aws-sign2` shows the forgotten paragraph and the unverified repository links; `uuid` shows the urgent sentence and the buried paragraph and names no package; `bincode` shows the advisory hint and the cargo commands for `wincode`; a synthetic `request` row shows the curated entry and `npm uninstall request` / `npm install got`; a ghost, an ALIVE package and an unassessed package give null.
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 10.1, 12.4, 12.5_
  - [x] 8.8 Write the property test for determinism
    - `tests/ui/view-model/resurrect-determinism.property.test.ts`, with the generators of `tests/support/arbitraries/resurrect.ts`.
    - **Property 1: The Resurrect_Model is deterministic (RS-P1)**
    - **Validates: Requirements 10.11**
  - [x] 8.9 Write the property test for slot visibility
    - `tests/ui/view-model/resurrect-visibility.property.test.ts`.
    - **Property 2: The slot exists exactly for DEAD packages and restless ghosts (RS-P2)**
    - **Validates: Requirements 9.1, 9.2**
  - [x] 8.10 Write the property test for validated names
    - `tests/ui/view-model/resurrect-names.property.test.ts`, with curated lists that are injected after loading and hold hostile names.
    - **Property 3: Every suggested name is validated (RS-P3)**
    - **Validates: Requirements 7.2, 7.6, 10.1, 10.10**
  - [x] 8.11 Write the property test for the self-replacement rule
    - `tests/ui/view-model/resurrect-self.property.test.ts`, with entries whose `to` holds the `from` name, differently spelled forms of it and the name of the row.
    - **Property 5: A package is never suggested as its own replacement (RS-P5)**
    - **Validates: Requirements 7.7**
  - [x] 8.12 Write the property test for links
    - `tests/ui/view-model/resurrect-links.property.test.ts`, with hint texts that hold URLs, Markdown links, HTML and `javascript:` strings and `sourceUrl` values of every kind.
    - **Property 7: Links come only from validated builders, never from hint text (RS-P7)**
    - **Validates: Requirements 12.2, 4.9, 4.10**
  - [x] 8.13 Write the property test for order and fallback
    - `tests/ui/view-model/resurrect-order.property.test.ts`, with every combination of hints and curated entries over rows with a slot.
    - **Property 11: Section order is fixed and the fallback is exclusive (RS-P11)**
    - **Validates: Requirements 9.3, 9.4, 9.6, 9.7, 9.11**
  - [x] 8.14 Wire the model into the detail model
    - In `view-model/detail.ts` replace `resurrect: classification !== null && classification.status === 'DEAD'` by `resurrect: buildResurrectModel(row, result, lookupCurated)`; export the new types and functions from `view-model/index.ts` where the other detail items are exported. Update `tests/ui/view-model/detail.test.ts` lines 104 to 118 ("Resurrect_Slot (R10.13)"): a buried and a forgotten row give a model, a restless row gives a model, ghost, ALIVE and unassessed rows give null.
    - _Requirements: 9.1, 9.2_

- [x] 9. Component and style
  - [x] 9.1 Rewrite the slot component
    - Rewrite `components/resurrect-slot.tsx` with props `{ model: ResurrectModel }` (the old `packageKey` and `displayName` props are replaced; the section keeps `data-slot="resurrect"` and an `aria-labelledby` heading `Resurrect` of level 3, and drops `data-placeholder`, the disabled button, "Coming soon" and "Not available yet"). Render in the order of the design layout: urgent paragraph, hint blocks (label paragraph, text paragraph with the hint text as one text node, link through `ExternalLink`), the "From the caretaker's list" blocks (why, source link, per Alternative the name in a `code` element, the lead sentence with names in `code`, the lines in `pre > code`, the note, the Copy_Button with `aria-label` from `copyLabel`), the fallback paragraph with its links, and one `p role="status"` Copy_Status that is always present. Copy: `navigator.clipboard.writeText(copyText)` in the click handler; success sets "Copied the commands for <to>", absence or rejection sets "Copying failed. Select the commands and copy them by hand."; the status clears after `COPY_STATUS_RESET_MS` through a `setTimeout` cleared on unmount and on the next copy; focus stays on the button. No request, no `fetch`, no animation. Read `components/external-link.tsx` and reuse it for every link. Cite Requirements 9.12, 10.12, 11.1 to 11.6, 11.8, 12.1, 12.3.
    - Rewrite `tests/ui/components/resurrect-slot.test.tsx` (the placeholder tests are replaced): heading and attributes (9.12), no disabled button and no "Coming soon", hint text rendered as one text node and no `a` element inside it for the `bincode` text and for `<a href="https://evil.example">x</a>` and `javascript:alert(1)` texts, names in `code`, links rendered through `ExternalLink` (`rel` and `target` as the existing component sets them), Copy_Status present before any copy with `role="status"`, copy success with a mocked clipboard (text equals the lines joined by `\n`, status text, focus stays), copy failure for a rejecting clipboard and for no clipboard, reset after 3000 ms with fake timers, no `fetch` call (spy), no command block for an Alternative whose names failed validation.
    - _Requirements: 9.12, 10.12, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.8, 12.1, 12.3_
  - [x] 9.2 Render the slot from the detail panel
    - In `components/detail-panel.tsx` (near line 185) render `<ResurrectSlot model={model.resurrect} />` when `model.resurrect !== null` and nothing otherwise; update the comment to cite Requirements 9.1 and 9.2. Update `tests/ui/components/detail-panel.test.tsx` lines 264 to 289 ("shows the Resurrect_Slot only for buried and forgotten packages"): buried, forgotten and restless show the slot, ghost, lantern and unmarked do not, there is no "Resurrect" button, and `queryByText(/coming soon/i)` is null. Update `tests/ui/components/graveyard-app.test.tsx` and `tests/ui/components/lazy-detail-panel.test.tsx` only if they reference the placeholder (find them with `Select-String -Path tests -Pattern "resurrect|Coming soon" -Recurse`).
    - _Requirements: 9.1, 9.2_
  - [x] 9.3 Add the slot style block
    - Append one block to `app/globals.css`, introduced by `/* resurrect slot (resurrect spec R13.4) */`, with the rules for the classes that task 9.1 uses (spacing between the sections, the label style, the `pre` and `code` look, the Copy_Button, the Copy_Status text). Use only existing custom properties for color, spacing, border and font (read how the neighboring detail-panel rules do it); add no custom property, no color literal, no font, no media query, no animation or transition; keep the existing focus styles. Change no existing rule.
    - _Requirements: 13.2, 13.3, 13.4, 13.5_
  - [x] 9.4 Verify the client budgets
    - Run `npm run build` and `npm run check:bundle`, and `npx playwright test tests/e2e/js-budget.spec.ts --project=desktop` if the budget spec runs against the build. Record the numbers (initial client JS before and after, from the output) in the final message of the task; do not write them to a file. If a budget is exceeded, find the cause (for example the JSON imported into an eager chunk) and fix it in the files of tasks 8.14 or 9.2 only after reporting; do not raise a budget.
    - _Requirements: 13.6_

- [x] 10. Checkpoint - Slot
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 10.1 Commit and push the slot group (orchestrator-only)
    - Stage by name the files of groups 8 and 9 and commit with the subject `resurrect: slot model, commands, component, style (groups 8-9)`. Push. Record the hash.
    - _Requirements: 16.6_

- [x] 11. Fixtures, end-to-end and report specs
  - [x] 11.1 Re-export the e2e fixtures
    - Run `npm run e2e:fixtures` and check that `tests/e2e/.generated/scan-request.json` now holds `hints` for `har-validator`, `phantomjs-prebuilt` and `karma-phantomjs-launcher`, `scan-zoxide.json` holds the `advisory-notice` of `bincode`, and the manifests of the pyproject set hold `pyprojectTool`. In `scripts/export-scan-fixtures.ts` add one `deprecation-notice` hint (a short plain text) to the synthetic restless scan for the dependency `buried-one` so that the synthetic body exercises the slot, and keep every other synthetic value unchanged. Update `tests/ui/export-scan-fixtures.test.ts` (the export has the hints; a scan of every exported file contains none of the prefixes `ghp_`, `gho_`, `github_pat_`) and `tests/ui/view-model/fixtures-replay.test.ts` only where they deep-equal exported values. Re-record no fixture.
    - _Requirements: 4.2, 12.6_
  - [x] 11.2 Write the end-to-end test
    - Create `tests/e2e/resurrect.spec.ts` in the style of `tests/e2e/detail.spec.ts` and `tests/e2e/results.spec.ts` (mock `/api/scan` through `tests/e2e/support/mock-scan.ts` with the exported fixture, helpers of `tests/e2e/support/*`, axe through `AXE_TAGS`): open `har-validator` (buried: the deprecation text "this library is no longer supported", its label, and a curated block only if the data file has an entry for it), `aws-sign2` (forgotten: the forgotten paragraph, no `pre`, no Copy_Button), `uuid` of `request/request` (restless: the urgent sentence first, then the buried paragraph) and `bincode` of the zoxide fixture (advisory text shown as text, no `a` element inside the text element, the cargo commands for the curated entry when the data file has one); an ALIVE package and a non-restless ghost show no slot (Requirement 15.8); for each opened panel axe reports no violation; a keyboard check (Tab reaches the Copy_Button, Enter copies); copy with `context.grantPermissions(['clipboard-read', 'clipboard-write'])` on the desktop project: the clipboard text equals the displayed lines and the Copy_Status text appears. Make assertions about curated content depend on the real `data/resurrections.json` by reading the file in the test (for example the entry for the package, when present), never on a hard-coded list.
    - _Requirements: 13.1, 13.7, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_
  - [x] 11.3 Write the report spec
    - Create `tests/e2e/resurrect-report.spec.ts` in the pattern of `tests/e2e/m3-report.spec.ts`, running only when `RS_REPORT=1` is set and only in the `desktop` project (viewport 1440x900, reduced motion): for `har-validator` (buried), `aws-sign2` (forgotten) and `uuid` (restless) of the `request/request` fixture, open the Detail_Panel, scroll the slot into view, and save `docs/screenshots/resurrect/resurrect-buried-har-validator.png`, `resurrect-forgotten-aws-sign2.png` and `resurrect-restless-uuid.png` with the slot visible in the frame; write the inner text of the slot for `har-validator`, `phantomjs-prebuilt`, `aws-sign2`, `uuid` and (from the synthetic body, labelled synthetic) a `request` row into `test-results/resurrect-slot-text.json`; run axe on each opened panel and write the violation counts into the same file. `/api/scan` is always mocked. No token is read or written.
    - _Requirements: 16.1, 16.2, 16.5_

- [x] 12. Final checkpoint - All checks and end-to-end
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Then run `npm run test:e2e` and ensure it passes. Ask the user if questions arise.
  - [x] 12.1 Run the end-to-end suite
    - Run `npm run test:e2e` after the full vitest run is green. Fix only failures caused by this spec (the slot, the hints, the changed cache key) without any change of art, palette or header layout, and without lowering an assertion or a budget.
    - _Requirements: 13.5, 13.6, 14.5, 15.1, 15.6_
  - [x] 12.2 Commit and push the end-to-end group (orchestrator-only)
    - Stage by name the files of group 11 and any fix of task 12.1 and commit with the subject `resurrect: fixtures re-export, end-to-end and report specs (group 11)`. Push. Record the hash.
    - _Requirements: 16.6_

- [x] 13. Traceability
  - [x] 13.1 Write the traceability test
    - Create `tests/ui/rs-traceability.test.ts` in the pattern of `tests/ui/py-traceability.test.ts` (tag regex `Feature:\s*resurrect,\s*Property\s+RS-P(\d+)`, property count 12, three tests titled `RS-trace ...`): each number 1 to 12 appears in exactly one tag, every tagged file has a `// Validates:` line, every test title of a tagged file starts with its `RS-P` number.
    - _Requirements: 14.1, 14.2_
  - [x] 13.2 Update the traceability document
    - In `docs/property-traceability.md` add a section `## resurrect (RS-P1 to RS-P12)` with one row per property (requirements, test file, test title, status from a full `npx vitest --run`), update the header sentence (spec list and the counts of tests and files) and add `### resurrect (0 of 12)` to "Properties without a test" with the sentence that all twelve properties have a passing test (or list those without one). Add a note that RS-P4 and RS-P7 run on view-model values without a DOM.
    - _Requirements: 14.3_
  - [x] 13.3 Commit and push the traceability group (orchestrator-only)
    - Stage by name the files of group 13 and commit with the subject `resurrect: traceability test and document (group 13)`. Push. Record the hash.
    - _Requirements: 16.6_

- [x] 14. Deep runs and report
  - [x] 14.1 Run the deep property tests (orchestrator-only)
    - Run `npm run test:deep -- <file>` for each of the twelve property files (`tests/pipeline/mapping/hint-text.property.test.ts`, `tests/pipeline/mapping/hints.property.test.ts`, `tests/pipeline/scan/scan-cache-hints.property.test.ts`, `tests/ui/view-model/narrow-hints.property.test.ts`, `resurrections.property.test.ts`, `resurrect-commands.property.test.ts`, `resurrect-determinism.property.test.ts`, `resurrect-visibility.property.test.ts`, `resurrect-names.property.test.ts`, `resurrect-self.property.test.ts`, `resurrect-links.property.test.ts`, `resurrect-order.property.test.ts`). Never set `FC_NUM_RUNS` in the shell. Append to `docs/resurrect-report.md` the section `## Properties` with one row per property: number, title, test file, result and, for a failure, the shrunk counterexample, seed and path from the output (or the text "no counterexample found"). A failing property is reported, not hidden; fix the cause in a separate commit if it is a code defect and rerun.
    - _Requirements: 16.4_
  - [x] 14.2 Take the screenshots and write the slot sections of the report (orchestrator-only)
    - Run `$env:RS_REPORT = '1'; npx playwright test tests/e2e/resurrect-report.spec.ts --project=desktop` (after `npm run e2e:fixtures`). Check that the three 1440x900 PNGs exist under `docs/screenshots/resurrect/` and that each shows the slot (open the images). Append to `docs/resurrect-report.md` the section `## What the slot shows` with one subsection each for `request` (stating that it is not a dependency of `request/request` and showing the synthetic row, labelled synthetic), `har-validator`, `phantomjs-prebuilt`, `aws-sign2` and `uuid`, taking the text from `test-results/resurrect-slot-text.json` (sections, hint text and label, curated suggestions, commands; the uuid subsection says that the notice of `uuid@3.4.0` is on its own version document and therefore not shown, Decision D3), the section `## Screenshots` that embeds the three PNGs, the axe counts, and the section `## Findings` (client budget numbers from task 9.4, the number of kept and dropped curated entries, hints present in each fixture, anything surprising). The report holds no token; grep it for `ghp_`, `gho_` and `github_pat_`.
    - _Requirements: 16.1, 16.2, 16.3, 16.5, 16.7_
  - [x] 14.3 Commit and push the report (orchestrator-only)
    - Stage `docs/resurrect-report.md` and `docs/screenshots/resurrect/*.png` by name, commit with the subject `resurrect: report and screenshots`, push, and record the hash.
    - _Requirements: 16.5, 16.6_
  - [x] 14.4 Append the commits with their CI status (orchestrator-only)
    - Collect the commits of this spec (the hashes recorded in tasks 2.1, 4.1, 7.1, 10.1, 12.2, 13.3 and 14.3, plus any fix commit) with `git log --oneline`, and their CI run status with `gh run list --limit 20` (workflow `ci.yml`, status and conclusion per commit; `pending` for a run that has not finished). Append the section `## Commits and CI` to `docs/resurrect-report.md` as a table (hash, subject, CI status), commit it with the subject `resurrect: report commits and CI status` and push. The CI status of this last commit is written as `pending`.
    - _Requirements: 16.6_

- [x] 15. STOP
  - Stop here. Report to the user: the five slots of `request`, `har-validator`, `phantomjs-prebuilt`, `aws-sign2` and `uuid` in short form, the number of kept and dropped curated entries and what the live contract test removed, the properties with any counterexample, the client budget numbers, the commits with CI status, and the path of `docs/resurrect-report.md`. Do not start any other work, spec or refactor.

## Notes

- Every task, including the property-based tests, is required. Nothing is marked optional.
- Tasks 2.1, 4.1, 6.1, 6.2, 7.1, 10.1, 12.2, 13.3, 14.1, 14.2, 14.3 and 14.4 need the network, `git push`, the fetch tool or the token; the orchestrator does them. The token is passed only through the process environment of one command and is never printed or written.
- The data file is created by task 5.2 as a candidate list and reduced by tasks 6.1 and 6.2 (different waves, one owner at a time). The data test of task 5.3 holds the minimum of 8 entries per ecosystem, so a source check that drops too many entries fails loudly.
- Tasks 8.7 and 11.1 depend on each other only through test data: task 8.7 builds its unit rows from the fixture replay, and task 11.1 later adds the exported files.
- No fixture is re-recorded: the recorded sets already hold the npm `deprecated` strings and the RustSec details (design, "Recorded fixtures").
- `.kiro/specs/*` task lists and `tasks.meta.json` files of other specs are not edited.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.4"] },
    { "id": 1, "tasks": ["1.3", "1.5"] },
    { "id": 2, "tasks": ["1.6", "1.7"] },
    { "id": 3, "tasks": ["1.8"] },
    { "id": 4, "tasks": ["1.9", "1.10", "1.11"] },
    { "id": 5, "tasks": ["2.1"] },
    { "id": 6, "tasks": ["3.1"] },
    { "id": 7, "tasks": ["3.2"] },
    { "id": 8, "tasks": ["3.3"] },
    { "id": 9, "tasks": ["4.1"] },
    { "id": 10, "tasks": ["5.1", "5.2"] },
    { "id": 11, "tasks": ["5.3", "5.5"] },
    { "id": 12, "tasks": ["5.4"] },
    { "id": 13, "tasks": ["6.1"] },
    { "id": 14, "tasks": ["6.2"] },
    { "id": 15, "tasks": ["7.1"] },
    { "id": 16, "tasks": ["8.1"] },
    { "id": 17, "tasks": ["8.2", "8.4", "8.5"] },
    { "id": 18, "tasks": ["8.3", "8.6", "8.7"] },
    { "id": 19, "tasks": ["8.8", "8.9", "8.10", "8.11", "8.12", "8.13", "8.14"] },
    { "id": 20, "tasks": ["9.1", "9.3"] },
    { "id": 21, "tasks": ["9.2"] },
    { "id": 22, "tasks": ["9.4"] },
    { "id": 23, "tasks": ["10.1"] },
    { "id": 24, "tasks": ["11.1"] },
    { "id": 25, "tasks": ["11.2", "11.3"] },
    { "id": 26, "tasks": ["12.1"] },
    { "id": 27, "tasks": ["12.2"] },
    { "id": 28, "tasks": ["13.1"] },
    { "id": 29, "tasks": ["13.2"] },
    { "id": 30, "tasks": ["13.3"] },
    { "id": 31, "tasks": ["14.1"] },
    { "id": 32, "tasks": ["14.2"] },
    { "id": 33, "tasks": ["14.3"] },
    { "id": 34, "tasks": ["14.4"] }
  ]
}
```
