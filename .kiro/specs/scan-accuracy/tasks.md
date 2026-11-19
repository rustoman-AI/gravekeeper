# Implementation Plan: scan-accuracy

## Overview

This plan implements `requirements.md` and `design.md` of the spec `scan-accuracy` in four groups: (1) the core changes (commit threshold, unknown-facts Reason, exported merge functions), (2) version resolution from declared ranges (packages, architecture rules, wrappers, Cargo mapping, resolver, wiring), (3) advisory entries, the scan outcome with the cache header, and manifest candidates in two errors, (4) fixtures, the traceability document and the live report. Each group ends with a checkpoint that runs `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`. Property-based tests are mandatory and sit directly after the code task they validate. Unit tests are mandatory too. Requirement numbers are criterion numbers of `.kiro/specs/scan-accuracy/requirements.md`; Property numbers are from `.kiro/specs/scan-accuracy/design.md` unless a task names another spec.

Implementation language: TypeScript (strict). The project root is the `gravekeeper` folder. Test files follow `<module>.test.ts` and `<module>.property.test.ts` under `/tests`. Every property test uses `cfg()` from `tests/support/fc-config.ts`, carries the tag comment `// Feature: scan-accuracy, Property <n>: <title>` (a test that also checks a changed property of another spec adds that spec's tag comment), and its title starts with `P<n>`. `AGENTS.md` applies: read the relevant guide in `node_modules/next/dist/docs/` before changing any Next.js code. Source code cites the requirement number in a comment above each rule.

This spec changes `/core`, which the tasks of `scan-pipeline` and `dependency-graveyard-core` did not. The task lists and `tasks.meta.json` of those two specs are not edited.

## Tasks

- [x] 1. Core: commit threshold, unknown-facts Reason, exported merge functions
  - [x] 1.1 Add `COMMIT_ABANDONMENT_DAYS` and apply it to rules 8.3 and 8.4
    - In `core/model/constants.ts` add `COMMIT_ABANDONMENT_DAYS: 730` to `CONSTANTS`, to `ConstantsShape` and to the named exports. In `core/facts/predicates.ts` use it in `isReleaseAbandoned` and `isDormant` (the unknown commit case stays on the abandoned side) and keep `STALE_DAYS` in `isStaleRelease` only. In `core/classifier/rules/release-abandoned.ts` name `COMMIT_ABANDONMENT_DAYS` in the message and word the null commit age as `daysSinceLastCommit is unknown and assumed to show no recent activity`. Check the `8.4` message of `release-dormant.ts` still names the commit age. Keep every message at most 200 characters. Run `npm run check:core`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9_
  - [x] 1.2 Write unit tests for the constant and the release rules
    - Update `tests/core/model/constants.test.ts` (value 730, named export, `COMMIT_ABANDONMENT_DAYS` is a positive integer and at least `STALE_DAYS`), `tests/core/facts/predicates.test.ts` and `tests/core/classifier/rules.test.ts`: release 730 with commit 364, 365, 729 gives `8.4` and no `8.3`; commit 730 and null give `8.3` and no `8.4`; release 729 gives neither; the `8.3` text names `COMMIT_ABANDONMENT_DAYS (730)` for a known and an unknown commit age; `STALE_DAYS` still drives `10.6`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  - [x] 1.3 Update the facts oracle and the facts arbitraries
    - In `tests/support/oracles/facts-oracle.ts` change the `abandoned` and `dormant` oracles to `COMMIT_ABANDONMENT_DAYS` and add the reportable Unknown_Fact set (`maxSeverity` removed when the count is a Valid_Fact equal to 0) with an independent formatter for the singular and plural `6.3` texts. In `tests/support/arbitraries/facts.ts` and `facts-metamorphic.ts` add 729, 730 and 731 to the day boundaries and bias `daysSinceLastCommit` to 364, 365, 729, 730 and null.
    - _Requirements: 1.8, 2.8, 2.9, 10.4_
  - [x] 1.4 Update the existing classifier and scoring property tests
    - Update `tests/core/classifier/classify.property.test.ts` for core Properties 14, 15, 16 and 24 (reportable set, commit threshold, the `6.3` removal in the unknown-severity pair when the count is 0) and `tests/core/scoring/scoring.property.test.ts` for criteria 10.15, 10.18 and 10.20 (the "abandonment condition removed" case sets `daysSinceLastCommit` to 0, the straddle pairs include the new boundaries). Keep their tags and add a `(changed by scan-accuracy)` comment.
    - _Requirements: 1.8, 1.9, 2.8, 10.4_
  - [x] 1.5 Write the property test for the commit threshold
    - `tests/core/classifier/commit-threshold.property.test.ts`.
    - **Property 1: Abandoned and dormant follow the commit threshold**
    - **Validates: Requirements 1.2, 1.3, 1.5, 1.8**
  - [x] 1.6 Change the unknown-facts rule
    - In `core/classifier/rules/unknown-facts.ts` build the reportable list from `unknownFields` (each once, field order), drop `maxSeverity` when `openVulnerabilityCount` is a Valid_Fact equal to 0, return null for an empty list, and write the exact singular text `This health fact is unknown and adds no risk points: <name>.` and the plural text `These health facts are unknown and add no risk points: <names>.` through `sentence()` and `listNames()`. Keep the all-unknown result (seven names, at most 200 characters). Leave `11.2` to the existing fallback.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [x] 1.7 Write unit tests for the unknown-facts rule and update the old assertions
    - Create `tests/core/classifier/unknown-facts.test.ts`: one name (`This health fact is unknown and adds no risk points: daysSinceLastCommit.`), two names (`a and b`), three names (`a, b and c`), all seven names within 200 characters, count 0 with only `maxSeverity` unknown gives no `6.3` and one `11.2`, count null and count 1 with `maxSeverity` unknown list it, a negative or fractional count does not trigger the exception. Update the old text assertions in `tests/core/classifier/classify.test.ts` and `tests/core/classifier/rules.test.ts`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [x] 1.8 Write the property test for the unknown-facts Reason
    - `tests/core/classifier/unknown-facts.property.test.ts`, with the oracle of task 1.3.
    - **Property 2: Unreportable severity and the exact text of the unknown-facts Reason**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.8, 2.9**
  - [x] 1.9 Extract and export the merge functions
    - Create `core/summarizer/unique-packages.ts` with `uniquePackages(items)` (`groupAssessed` plus `mergeClassifications` per group, first-seen order, wrapped by `guard` with fallback `[]`), make `summarizeUnguarded` call it, and export `uniquePackages`, `mergeClassifications` and `compareClassifications` from `core/summarizer/index.ts` and `core/index.ts`. Run `npm run check:core`.
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 1.10 Write unit tests for the exported merge functions
    - Create `tests/core/summarizer/unique-packages.test.ts` (two scopes of one package merge to one entry, `git` and `path` entries stay, null classifications, order of first sight, input not mutated) and update `tests/core/public-api.test.ts` for the three new exports and `tests/core/summarizer/summarize.test.ts` so that its result stays equal.
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 1.11 Write the property test for the exported merge functions
    - `tests/core/summarizer/unique-packages.property.test.ts`. Add the tag `// Feature: dependency-graveyard-core, Property 47` next to the scan-accuracy tag.
    - **Property 12: Exported merge functions agree with the Summarizer**
    - **Validates: Requirements 9.2, 9.5, 9.6**

- [x] 2. Checkpoint - Core
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [x] 3. Version resolution from declared ranges
  - [x] 3.1 Install and pin the range libraries
    - Run `npm install --save-exact semver@7.8.6 @renovatebot/pep440@5.0.1` and `npm install --save-dev --save-exact @types/semver@7.8.0`. Check that `package.json` shows no `^` or `~` for the three packages and that `package-lock.json` is updated. Do not install anything else.
    - _Requirements: 5.1, 5.2_
  - [x] 3.2 Write the package pin test
    - Create `tests/packages.test.ts`: `package.json` pins the three packages exactly (no `^`, `~`, range, tag or `*`); the installed `semver` and `@renovatebot/pep440` have no `dependencies`, no `scripts.install` and no `gypfile`; `core/` has no import of either package (reads source text).
    - _Requirements: 5.1, 5.2, 5.6, 5.7_
  - [x] 3.3 Add the architecture rules for the range packages
    - In `scripts/architecture/rules.ts` add `RANGE_PACKAGE_WRAPPERS` (`semver` to `pipeline/mapping/range-semver.ts`, `@renovatebot/pep440` to `pipeline/mapping/range-pep440.ts`), let `mapping-import-not-allowed` skip exactly those two file and package pairs, add the rule `range-package-not-allowed` (any other file importing either package, including `semver/*` subpaths) and the rule `range-package-version-exact` (checked by `scripts/check-architecture.ts` from `package.json`, so `checkArchitecture` stays pure). Add both ids to `RuleId`.
    - _Requirements: 5.3, 5.4, 5.1_
  - [x] 3.4 Write the architecture tests for the range packages
    - Update `tests/architecture/architecture.test.ts`: the real tree reports zero violations; a snippet importing `semver` from `pipeline/mapping/version-select.ts`, from `pipeline/scan/x.ts` and from `adapters/x.ts` reports `range-package-not-allowed`; the two wrapper files report nothing; any other package in `pipeline/mapping` still reports `mapping-import-not-allowed`; `package.json` with `"semver": "^7.8.6"` reports `range-package-version-exact`. Update `tests/architecture/architecture.property.test.ts` so the generated specifier set includes the two packages and its oracle knows the two allowed pairs (pipeline Property 66 stays valid).
    - _Requirements: 5.3, 5.4_
  - [x] 3.5 Add the new pipeline constants and bump the cache key version
    - In `pipeline/constants.ts` add `RANGE_MAX_LENGTH` (256), `ADVISORY_URL_PREFIX` (`https://osv.dev/vulnerability/`) and `CACHE_STATUS_HEADER` (`X-Gravekeeper-Cache`), and set `CACHE_KEY_VERSION` to 2. Define no other `UPPER_SNAKE` constant.
    - _Requirements: 10.1, 3.6, 6.7, 7.3_
  - [x] 3.6 Update the constants tests
    - Update `tests/pipeline/constants.test.ts`: the embedded name list gains the three names, the rules `RANGE_MAX_LENGTH` is a positive integer and `CACHE_KEY_VERSION` is a positive integer greater than 1 are separate test cases, and the "no constant outside the requirements table" check still passes. Update any test that asserts the key prefix `gravekeeper:v1`.
    - _Requirements: 10.1, 3.6_
  - [x] 3.7 Implement the two range wrappers
    - Create `pipeline/mapping/range-semver.ts` (`semverRange`, `semverVersion` with the strict regex of pipeline R7.2 plus `semver.parse`, `semverIsPrerelease`, `semverCompare`, `semverSatisfies`) and `pipeline/mapping/range-pep440.ts` (`pepRange`, `pepVersion` with `isPrerelease` equal to `pre !== null || dev !== null`, `pepCompare`, `pepSatisfies`). Every function catches every exception and returns null, false or 0. These are the only two files that import the packages. Do not export them from `pipeline/mapping/index.ts`.
    - _Requirements: 5.5, 3.3, 3.5_
  - [x] 3.8 Write unit tests for the wrappers
    - Create `tests/pipeline/mapping/range-wrappers.test.ts`: `semverVersion` accepts `1.2.3`, `1.0.0+build` and `1.0.0-rc.1` and rejects `v1.2.3`, `=1.2.3`, `1.2` and empty; prerelease flags (`1.5.0a1`, `2.1.0.dev1` are prereleases, `2.2.post1` is not); `pepRange` rejects `badrange` and `*`; a mocked library that throws (`vi.mock`) gives null or false from every function.
    - _Requirements: 5.5, 3.3, 3.5_
  - [x] 3.9 Implement the Cargo range mapper
    - Create `pipeline/mapping/range-cargo.ts` with `cargoToSemverRange(requirement: string): string | null` and the mapping table of the design as a block comment at the top of the file. Pure string work, no package import, total.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
  - [x] 3.10 Write unit tests for the Cargo range mapper
    - Create `tests/pipeline/mapping/range-cargo.test.ts`: one example per row of the table (`1.2.3` to `^1.2.3`, `0.2` to `^0.2`, `~1.2` to `~1.2`, `=1.2` to `=1.2`, `>= 1.2, <1.5` to `>=1.2 <1.5`, `1.*`, `*`) and the rejected forms (empty part, trailing comma, `||`, hyphen range, `v1.2`, `1.x`, `>=1.*`, space-separated comparators without a comma, `01.2`); a test that the first lines of the file contain the table header.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
  - [x] 3.11 Implement `resolveRange`
    - Create `pipeline/mapping/range-resolve.ts` with `resolveRange(ecosystem, ranges, versions)` as in the design: length check against `RANGE_MAX_LENGTH`, per-ecosystem range compilation (`semverRange`; `cargoToSemverRange` then `semverRange`; `pepRange`), candidate filtering (valid, not Prerelease, distinct), highest satisfying candidate with the first listed winning a tie, `unresolved` otherwise. Total for any input.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_
  - [x] 3.12 Write unit tests for `resolveRange`
    - Create `tests/pipeline/mapping/range-resolve.test.ts`: npm `^4.17.0`, `~1.2`, `>=1 <2`, `1.x`, `||`, hyphen range, `*`; cargo bare `1.3.1` (stays in 1.x), `0.0.3`, `>=1.2, <1.5`; pypi `>=1.4,<2`, `~=1.4.0`, `==1.*`, `!=1.4.5,>=1.0`; prereleases and junk strings in the list are never chosen; a PyPI tie (`1.0` and `1.0.0`) keeps the first listed; two ranges intersect; a range longer than `RANGE_MAX_LENGTH`, an unparseable range and a range that matches nothing give `unresolved`.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 4.2_
  - [x] 3.13 Write the property tests for resolution
    - `tests/pipeline/mapping/range-resolve.property.test.ts` with generators for version lists (stable, prerelease and junk strings) and satisfiable ranges per ecosystem; the maximum of simple numeric ranges is also computed by an independent integer comparison.
    - **Property 3: The resolved version is listed and satisfies every range**
    - **Property 4: The resolved version is the highest non-prerelease match**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.13, 3.14**
  - [x] 3.14 Write the property test for the Cargo mapping
    - `tests/pipeline/mapping/range-cargo.property.test.ts`.
    - **Property 6: Cargo mapping is caret by default and an intersection for commas**
    - **Validates: Requirements 4.9, 4.10**
  - [x] 3.15 Implement `chooseVersion` and the new selection types
    - Create `pipeline/mapping/version-choose.ts` with `chooseVersion(ecosystem, specs, versions, defaultVersion)` as in the design (pins first through `exactPin` and `selectVersion`, then Declared_Ranges through `resolveRange`, the default selection plus one `range-unresolved` note on failure, ranges cut to `RANGE_MAX_LENGTH` code points). In `pipeline/mapping/types.ts` set `VersionBasis` to `'pinned' | 'resolved' | 'default'` and add the `range-unresolved` member to `VersionSelection.notes`. Export `chooseVersion`, `resolveRange` and `cargoToSemverRange` from `pipeline/mapping/index.ts`.
    - _Requirements: 3.1, 3.6, 3.7, 3.8, 3.9, 3.11_
  - [x] 3.16 Write unit tests for `chooseVersion`
    - Create `tests/pipeline/mapping/version-choose.test.ts`: no specs and whitespace specs give the default with no note; one range gives `resolved`; an exact pin plus a range gives `pinned` and no resolution; a pin that is not found gives the default and `pin-not-found`; two distinct pins give `conflicting-pins`; an unresolvable range gives the default plus one `range-unresolved` note with sorted, cut `ranges`; no default version after an unresolved range adds `no-default-version`; an unknown ecosystem is total.
    - _Requirements: 3.1, 3.6, 3.7, 3.8, 3.9, 3.11_
  - [x] 3.17 Write the property tests for version choice
    - `tests/pipeline/mapping/version-choose.property.test.ts` with generators that mix exact pins, ranges, empty strings and arbitrary Unicode strings.
    - **Property 5: Version choice does not depend on spec order**
    - **Property 7: Resolution is total and falls back with one note**
    - **Validates: Requirements 3.6, 3.7, 3.8, 3.9, 3.15, 3.16, 4.11**
  - [x] 3.18 Add the `range-unresolved` note and message row
    - In `pipeline/scan/notes.ts` add `rangeUnresolvedNote(ecosystem, name, ranges)` (details keys in code point order, each range cut to `RANGE_MAX_LENGTH` code points, ranges ascending and distinct) and the `NoteCode` member; in `pipeline/scan/messages.ts` add the row `range-unresolved` with the text `The version range declared for {name} could not be matched to a published release, so the latest release was checked instead.`, `NOTE_CODES` and the placeholder list (only `{name}`).
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 3.7_
  - [x] 3.19 Update the notes and messages tests
    - Update `tests/pipeline/scan/notes.test.ts`: `ALLOWED_KEYS` gains `range-unresolved: ['ecosystem', 'name', 'ranges']`; the completeness test that parses the User-facing messages table of `.kiro/specs/scan-pipeline/requirements.md` finds the new row and checks that every code has exactly one row, that the placeholders of the row are keys of its code and that the text has no em dash; a test that `ranges` is never rendered. Update `tests/pipeline/scan/messages.property.test.ts` so its generator also produces `range-unresolved` notes with hostile range text.
    - **Property 8: The unresolved-range message contains no range text**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**
  - [x] 3.20 Wire `chooseVersion` into the version stage
    - In `pipeline/scan/stage-versions.ts` replace the call of `selectVersion` by `chooseVersion` with `LookupTarget.versionSpecs`, the ecosystem and the deps.dev version list, add the `range-unresolved` note through `rangeUnresolvedNote`, and record `versionBasis` `resolved` where `lookupVersion` and `versionBasis` are assembled. The deps.dev version, OSV query and PyPI per-version requests keep using the Selected_Version. Add no request.
    - _Requirements: 3.2, 3.6, 3.9, 3.10, 3.12, 10.2_
  - [x] 3.21 Update the version-selection tests
    - Update `tests/pipeline/mapping/version-select.test.ts` and `tests/pipeline/mapping/version-select.property.test.ts`: pipeline P14 (`exactPin`) keeps its assertions and gains the comment that a non-pin string is a Declared_Range; pipeline P15 now drives `chooseVersion` with spec lists that include ranges, empty strings and arbitrary strings.
    - _Requirements: 3.8, 3.15, 10.5_
  - [x] 3.22 Update the mapper registry
    - In `tests/support/mapper-registry.ts` register `chooseVersion`, `resolveRange` and `cargoToSemverRange` with validators of their declared output types, and update `tests/pipeline/mapping/mapper-registry.test.ts` and the totality property (pipeline P16) so every new export of `pipeline/mapping/index.ts` is covered.
    - _Requirements: 3.16, 4.11, 10.5, 5.5_
  - [x] 3.23 Update the version stage and assembly tests
    - Update `tests/pipeline/scan/stage-versions.test.ts` (a ranged dependency is looked up at the resolved version: the deps.dev version document path, the OSV query version and the PyPI per-version path use it; the `range-unresolved` note and the fallback to the default version; no extra request) and `tests/pipeline/mapping/assemble.test.ts` and `assemble.property.test.ts` (selection notes include `range-unresolved`, `versionBasis` `resolved`, pipeline P37 and P38 still hold).
    - _Requirements: 3.6, 3.10, 3.12, 10.2, 10.5_

- [x] 4. Checkpoint - Version resolution
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [x] 5. Advisory entries, scan outcome with cache header, manifest candidates
  - [x] 5.1 Implement advisory entries and add them to the assembled facts
    - Create `pipeline/mapping/advisories.ts` with `advisoryUrl(id)` (`ADVISORY_URL_PREFIX` plus the id with every UTF-8 byte outside `A-Za-z0-9._:-` percent-encoded, a lone surrogate encoded as `%EF%BF%BD`, never throws) and `buildAdvisoryEntries(ids, records)` (distinct non-empty string ids sorted by `compareCodePoints`; with a record: sorted distinct aliases other than the id and the record severity; without: `aliases` empty and `severity` null). Add `AdvisoryEntry` to `pipeline/mapping/types.ts`, add `advisories` to `AssembledFacts`, build it in `pipeline/mapping/assemble.ts` from the same query ids and advisory records as the counts (empty when the Selected_Version is unset, the query result is unusable or has no ids), export from `pipeline/mapping/index.ts`, and register the new exports in `tests/support/mapper-registry.ts`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
  - [x] 5.2 Write unit tests for advisory entries
    - Create `tests/pipeline/mapping/advisories.test.ts` (normal ids give `https://osv.dev/vulnerability/GHSA-xxxx`, an id with `:` keeps it, ids with `/`, `?`, `#`, `%`, spaces and non-ASCII are encoded, a lone surrogate, duplicates and empty strings dropped, unfetched ids, aliases exclude the id, a withdrawn and an informational advisory are listed while `openVulnerabilityCount` excludes them) and update `tests/pipeline/mapping/assemble.test.ts` for the `advisories` field.
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.11_
  - [x] 5.3 Write the property test for advisory entries
    - `tests/pipeline/mapping/advisories.property.test.ts`, and update `tests/pipeline/mapping/assemble.property.test.ts` so that the assembled output includes `advisories`, stays deterministic (pipeline P38) and non-mutating.
    - **Property 10: Advisory entries mirror the OSV ids**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.13, 6.14, 6.15**
  - [x] 5.4 Carry advisories into the Scan_Result and accept the new shape in the cache
    - In `pipeline/scan/types.ts` and `pipeline/scan/assemble-result.ts` add `advisories` to `ScanDependency` (equal list for every Dependency of a Lookup_Target, `[]` for git, path and capped entries), allow `versionBasis` `resolved`, and update `isScanResult` in `pipeline/scan/scan-cache.ts` to validate `advisories` (array of `{ id, aliases, severity, url }`) and `versionBasis` in `pinned`, `resolved`, `default` or null. Keep the Scan_Result JSON-serializable.
    - _Requirements: 6.1, 6.9, 6.10, 6.12, 10.2_
  - [x] 5.5 Update the Scan_Result and cache tests
    - Update `tests/pipeline/scan/assemble-result.test.ts` and the scan-cache tests (a stored result with `advisories` is read back; an entry without `advisories` is rejected by `isScanResult`), and `tests/pipeline/scan/run-scan.property.test.ts` for pipeline P57 (every entry has an `advisories` list, `[]` when not looked up) and P58 (`versionBasis` in `pinned`, `resolved`, `default` or null; equal `lookupVersion`, `versionBasis` and `advisories` per Lookup_Target).
    - _Requirements: 6.1, 6.9, 6.10, 6.12, 10.2, 10.5_
  - [x] 5.6 Write the scan-level property test for advisories
    - `tests/pipeline/scan/advisories.property.test.ts`: scripted sources with generated OSV results, detail outcomes (ok, 404, failed, deadline, cap) and targets with and without a Selected_Version; the Scan_Result `advisories` length equals the distinct OSV id count and entries of one target are equal.
    - **Property 10: Advisory entries mirror the OSV ids**
    - **Validates: Requirements 6.2, 6.5, 6.9, 6.10, 6.13, 6.15**
  - [x] 5.7 Return a Scan_Outcome from `runScan`
    - In `pipeline/scan/run-scan.ts` return `ok({ result, fromCache })` with `fromCache` true only on the Scan_Cache hit branch and false for a fresh scan and for the margin path; store only `result` in the Scan_Cache; export `ScanOutcome` from `pipeline/scan/types.ts` and `pipeline/index.ts`. Adjust every internal caller (`pipeline/api/handle-scan-request.ts` compiles against the new type, the cache header itself is task 5.9).
    - _Requirements: 7.1, 7.2_
  - [x] 5.8 Update the tests that call `runScan`
    - Update every test that calls `runScan` or reads its result (find them with a search for `runScan(`): `tests/pipeline/scan/run-scan.test.ts`, `run-scan-cases.test.ts`, `run-scan-cache.test.ts`, `run-scan.property.test.ts`, the deadline, token-leak and scripted-source tests, and the fixture helpers. Assert `fromCache` false for a fresh scan, true for a hit, and the unchanged `result`.
    - _Requirements: 7.1, 7.2, 10.5_
  - [x] 5.9 Set the cache header on 200 responses
    - In `pipeline/api/handle-scan-request.ts` add `cache: 'hit' | 'miss' | null` to `ApiResponse` (non-null only for status 200: `hit` when `fromCache` is true, otherwise `miss`), and make `respond()` write `[CACHE_STATUS_HEADER]` only when it is non-null, keeping `Cache-Control: no-store` on every response. In `app/api/scan/route.ts` copy `ApiResponse.headers` unchanged (read `node_modules/next/dist/docs/` first) and add no scan logic.
    - _Requirements: 7.3, 7.4, 7.5, 7.6_
  - [x] 5.10 Update the route and handler tests
    - Update `tests/pipeline/api/handle-scan-request.test.ts` (header `miss` on a fresh 200, `hit` on a cached 200, no header on 400, 404, 405, 413, 415, 500, 502, 503 and 504), `tests/pipeline/api/handle-scan-request.property.test.ts` for pipeline P64 (cache header iff status 200 with value `hit` or `miss`, the `details` allow-list gains `candidates`, `Cache-Control: no-store` kept) and `tests/app/scan-route.test.ts` (`route.ts` copies headers and holds no cache logic).
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 8.5, 10.5_
  - [x] 5.11 Write the property test for the cache header and update the cache-hit test
    - Create `tests/pipeline/api/cache-header.property.test.ts` and update `tests/pipeline/scan/cache-replay.property.test.ts` (pipeline P68: the body of a hit equals the body of a fresh scan at the cached `asOf` as JSON text for every spelling variant, the body has no `fromCache` text, and the outcome flag differs).
    - **Property 11: The cache header is present on 200 only and never changes the body**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.7, 7.8**
  - [x] 5.12 Add the manifest candidates to the two errors
    - In `pipeline/mapping/selection.ts` return `candidates` (the Discovery_Result paths in discovery order, at most `DISCOVERY_MAX_MANIFESTS`) in the errors `too-many-manifests` and `manifest-not-found`, pass them through `pipeline/scan/stage-manifests.ts`, and write them as `details.candidates` in `pipeline/api/scan-error.ts` (the type `ScanErrorBody` gains the field). Messages stay unchanged and never render `candidates`.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [x] 5.13 Update the unit tests for the two errors
    - Update `tests/pipeline/scan/stage-manifests.test.ts` and the selection tests in `tests/pipeline/mapping/` (`too-many-manifests` carries `limit` and `candidates`, `manifest-not-found` carries `path` and `candidates`, an empty tree gives `[]`, 50 or more candidates are capped at `DISCOVERY_MAX_MANIFESTS`, the message text is unchanged).
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 5.14 Write the property test for the candidates
    - `tests/pipeline/scan/candidates.property.test.ts`.
    - **Property 9: Candidates equal the discovered manifest paths**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.6**

- [x] 6. Checkpoint - Advisories, cache header, candidates
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [ ] 7. Fixtures, traceability and live report
  - [x] 7.1 Re-record the fixtures
    - Run `npm run fixtures:record` for `request/request`, `revmic/canopy` and `ajeetdsouza/zoxide` with `GRAVEKEEPER_LIVE_TESTS=1`. The recorder needs network access and `GITHUB_TOKEN`: ask the orchestrator for the user-approved `gh` CLI token, pass it only through the process environment and never print or store it. The version-specific requests of ranged dependencies change with the Resolved_Version, so the Fixture_Sets under `tests/fixtures/` are replaced. Keep every Fixture_Set at most `FIXTURE_SET_MAX_BYTES` and keep at least one `archived` or `deprecated` fact in each set.
    - _Requirements: 10.3_
  - [~] 7.2 Update the fixture tests
    - Run `tests/pipeline/fixtures-scan.test.ts`, `fixtures-coverage.test.ts`, `tests/fixtures/fixtures-hygiene.test.ts` and `tests/fixtures/fixtures-size.test.ts` against the new recordings and fix expectations that name a version, a request or a count that changed (for example the Resolved_Version of a ranged dependency, the `versionBasis` values, the `advisories` of a dependency with advisories). Rules R23.2 to R23.6, R23.13 and R23.16 stay as they are, and a second scan with empty caches must be deeply equal.
    - _Requirements: 10.3, 10.5_
  - [~] 7.3 Update the traceability document
    - Update `docs/property-traceability.md`: add a `scan-accuracy` section with one row per Property 1 to 12 (requirements, test file, test title, status from a full `npx vitest --run`), update the rows of the changed properties (core 14, 15, 16, 24 and the new 47; pipeline P14, P15, P57, P58, P64, P68), update the header counts, and list properties without a test.
    - _Requirements: 10.6, 10.7_
  - [~] 7.4 Write the live report script
    - Create `scripts/live-report.ts` and the npm script `live:report`. It runs only when `GRAVEKEEPER_LIVE_TESTS` equals `1` and `GITHUB_TOKEN` is set, builds the production stack with a counting `fetch` (requests per Upstream_Source and endpoint pattern, never header or body text), disables the L2_Cache (`GRAVEKEEPER_RUNTIME_CACHE=off`) and starts with empty L1 caches, runs `handleScanRequest` once per repository, runs it a second time to show the `hit` header, and prints and writes Markdown. The token is never printed.
    - _Requirements: 3.12, 7.3, 6.2, 10.3_
  - [~] 7.5 Run the live report
    - Run `npm run live:report` with the user-approved token (ask the orchestrator) and write `docs/scan-accuracy-live-report.md` with (a) the request-by-request table: one row per Upstream_Source and endpoint pattern with the request count for each cold scan, (b) for each of `expressjs/express`, `psf/requests` and `BurntSushi/ripgrep` the cold scan result: HTTP status, `X-Gravekeeper-Cache` value (`miss`, and `hit` for the immediate repeat), duration, dependency count by `versionBasis` (`pinned`, `resolved`, `default`, null), number of `range-unresolved` notes, total advisories and the repo grade and counts of the summary, and (c) a sentence that no request count exceeds the pipeline limits and that no token appears in the file.
    - _Requirements: 3.2, 3.6, 6.2, 7.3, 8.1, 10.3_

- [~] 8. Final checkpoint - Fixtures, traceability and live report
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

## Notes

- Every task, including the property-based tests, is required. Nothing is marked optional.
- Each property test carries the tag comments from `design.md` (`// Feature: scan-accuracy, Property N: ...` and `// Validates: Requirements X.Y`) and uses `cfg()` from `tests/support/fc-config.ts`. Tests of changed properties of the other two specs keep their existing tag comments.
- `.kiro/specs/dependency-graveyard-core/tasks.md`, `.kiro/specs/scan-pipeline/tasks.md` and the two `tasks.meta.json` files are not edited by any task.
- Tasks 7.1, 7.4 and 7.5 need network access and the user's `GITHUB_TOKEN`. Ask the orchestrator before running them and never write the token to any file.
- Task 3.1 installs packages. Pin them exactly and do not run `npm audit fix` or update other dependencies.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.6", "1.9", "3.1", "3.3", "3.5", "3.9"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.10", "3.2", "3.4", "3.6", "3.7", "3.10", "3.18"] },
    { "id": 2, "tasks": ["1.4", "1.5", "1.7", "1.8", "1.11", "3.8", "3.11", "3.19"] },
    { "id": 3, "tasks": ["3.12", "3.13", "3.14", "3.15"] },
    { "id": 4, "tasks": ["3.16", "3.17", "3.20", "3.21", "3.22"] },
    { "id": 5, "tasks": ["3.23", "5.1", "5.7"] },
    { "id": 6, "tasks": ["5.2", "5.3", "5.4", "5.8", "5.9", "5.12"] },
    { "id": 7, "tasks": ["5.5", "5.6", "5.10", "5.11", "5.13", "5.14"] },
    { "id": 8, "tasks": ["7.1", "7.4"] },
    { "id": 9, "tasks": ["7.2"] },
    { "id": 10, "tasks": ["7.3", "7.5"] }
  ]
}
```
