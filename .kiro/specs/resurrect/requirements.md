# Requirements Document

## Introduction

This spec fills the Resurrect slot of the Detail_Panel. Today the slot is a disabled placeholder ("Coming soon") that appears for DEAD packages only (graveyard-ui Requirement 12). After this spec the slot appears for every DEAD package (buried or forgotten) and for every restless ghost (HAUNTED with an archived or deprecated reason), and it shows honest, sourced next steps. Nothing is invented and no language model is used. Every sentence in the slot comes from one of four places: a fixed template, an upstream notice that the scan already fetched, a curated entry whose source URL states the recommendation, or the facts of the scan.

The work has five parts.

1. **Upstream hints** (pipeline). The npm `deprecated` string of the latest version document becomes a hint of kind `deprecation-notice`. The details text of a RustSec advisory that marks a crate unmaintained, already fetched through OSV, becomes a hint of kind `advisory-notice`. Hints are stored on each scan dependency next to `advisories`, and `CACHE_KEY_VERSION` goes from 3 to 4.
2. **Pyproject tool detection** (core and pipeline). The scan records, per `pyproject.toml`, whether its dependencies are declared for Poetry, for PEP 621, or both, so that the slot shows the right commands.
3. **Curated replacements** (data). A repository file `data/resurrections.json` lists about 30 well-known replacements for npm, PyPI and crates.io, each with a source URL that states the recommendation. A task checks every URL live; entries whose source does not state the recommendation are dropped and listed in the report.
4. **Slot content** (view-model and component). The slot shows the hint, then the curated suggestions with copyable commands, or an honest paragraph when neither exists. Restless ghosts first say that the open vulnerabilities make the matter urgent.
5. **Verification** (properties, end-to-end, axe, live contract test, report). Twelve correctness properties RS-P1 to RS-P12, an end-to-end and axe check on a buried, a forgotten and a restless package, a live contract test of the curated targets, and `docs/resurrect-report.md` with 1440x900 screenshots.

The decisions of this document are final (user brief of the session that created this spec). The spec writes no code in the spec phase.

### Out of Scope

- Any language model, any web search at scan time, any suggestion that does not come from a hint, a curated entry or a fixed template.
- Patching a manifest file, opening a pull request, or any request sent by the Resurrect slot. The slot sends no request.
- Hints for PyPI. The PyPI JSON documents that the pipeline reads carry no deprecation text; PyPI packages receive curated suggestions or the fallback paragraphs only.
- Reading the per-version npm document. The `deprecated` text of an older version (for example `uuid@3.4.0`) is not fetched (Requirement 2.4 explains the consequence).
- A change of the art, the palette, the scene or the header layout.
- Ghosts that are not restless (HAUNTED without an archived or deprecated reason), ALIVE packages and unassessed packages. They get no slot.

### Changes to other specs

| Place | Change |
|---|---|
| `graveyard-ui` Requirement 10.13 and Requirement 12 | The slot also appears for restless ghosts; the placeholder text, the disabled button and the sentence "names no alternative package" are replaced by this spec. |
| `scan-pipeline` constant `CACHE_KEY_VERSION` | Goes from 3 to 4 (Requirement 4.1). |
| `scan-pipeline` Scan_Result | Gains the optional field `hints` on each dependency and the optional field `pyprojectTool` on each manifest entry (Requirements 4 and 5). |
| `graveyard-art` Requirement 10.1 | The Resurrect slot is no longer "unchanged"; the art, the palette and the header layout still are. |

### Conventions

- Criteria tagged **[PBT]** are verified with fast-check in files named `<module>.property.test.ts`. Untagged criteria use example-based tests.
- Property numbers are `RS-P1` to `RS-P12`. Each property test file carries the tag comment `// Feature: resurrect, Property RS-P<n>: <title>`, a `// Validates:` line, and test titles that start with `RS-P<n>`. The design document lists the properties. The traceability test is `tests/ui/rs-traceability.test.ts`.
- Property tests use `cfg()` from `tests/support/fc-config.ts`. Deep runs use `npm run test:deep`. `FC_NUM_RUNS` is never set in the shell.
- Source code cites the requirement number in a comment above each rule (steering rule).

## Glossary

- **Resurrect_Slot**: The section of the Detail_Panel with the heading "Resurrect", rendered by `components/resurrect-slot.tsx`.
- **Resurrect_Model**: The view-model value built by `buildResurrectModel` in `view-model/resurrect.ts` from a package row, the scan result and the curated list. The component renders it and computes nothing else.
- **Slot_Package**: A package row whose merged status is DEAD, or whose plot kind is `restless`.
- **Restless_Ghost**: A package whose status is HAUNTED and whose classification holds the reason 8.1 (archived) or 8.2 (deprecated). Its plot kind is `restless`.
- **Buried_Package**: A DEAD package whose classification holds the reason 8.1 or 8.2 (grave type `buried`).
- **Forgotten_Package**: A DEAD package whose classification holds neither 8.1 nor 8.2 (grave type `forgotten`).
- **Upstream_Hint**: The record `{kind, text, sourceUrl}`. `kind` is `deprecation-notice` or `advisory-notice`. `text` is the Hint_Text. `sourceUrl` is a string or null.
- **Hint_Text**: The plain, trimmed, bounded text of an Upstream_Hint produced by the Hint_Normalizer.
- **Hint_Normalizer**: The pure function `normalizeHintText` in `pipeline/mapping/hint-text.ts`. It turns an upstream string into a Hint_Text, or into null when nothing is left.
- **HINT_TEXT_MAX_LENGTH**: The constant in `pipeline/constants.ts` that bounds a Hint_Text in code points, ellipsis included (value 600).
- **HINTS_MAX_PER_PACKAGE**: The constant in `pipeline/constants.ts` that bounds the hints of one dependency (value 3).
- **Hint_Extractor**: The pure functions in `pipeline/mapping/hints.ts` that build Upstream_Hints from an npm latest-version document and from advisory records.
- **Curated_List**: The file `data/resurrections.json`, shaped `{"entries": [Curated_Entry, ...]}`.
- **Curated_Entry**: The record `{ecosystem, from, to, why, source}`. `to` is a list of 1 to 4 package names (Alternatives). `why` is one plain sentence. `source` is an https URL that documents the recommendation.
- **Curated_Loader**: The module `view-model/resurrections.ts` that reads the Curated_List, drops invalid entries and answers lookups.
- **Name_Rules**: The per-ecosystem name checks of `view-model/resurrect-names.ts` (Requirement 7.2).
- **Validated_Name**: A package name that passes the Name_Rules for its ecosystem and the Command_Safe check.
- **Command_Safe**: A name that contains only letters, digits, `.`, `_`, `-`, and in an npm scoped name one leading `@` and one `/`; it never starts with `~`, `-` or `.`.
- **Command_Line**: One line of text of the form fixed words followed by Validated_Names, as built by the Command_Builder.
- **Command_Builder**: The pure functions of `view-model/resurrect-commands.ts`.
- **Fixed_Words**: The closed set of words that a Command_Line may contain besides Validated_Names: `npm`, `uninstall`, `install`, `--save-dev`, `--save-optional`, `--save-peer`, `pip`, `poetry`, `remove`, `add`, `cargo`, `--dev`, `--build`, `--optional`.
- **Pyproject_Tool**: The value `poetry`, `pep621` or `mixed` that the pipeline records for a `pyproject.toml` (Requirement 5).
- **Manifest_Origin**: The record `{path, format, pyprojectTool}` of a manifest that declares a package, built from `result.manifests` and the dependency's `manifestPath`.
- **Copy_Button**: The button of the Resurrect_Slot that copies the text of one command block to the clipboard.
- **Copy_Status**: The polite live region of the Resurrect_Slot that announces the result of a copy.
- **Live_Contract_Test**: The test `tests/live/resurrections.live.test.ts`, gated by `GRAVEKEEPER_LIVE_TESTS`.
- **Source_Check**: The orchestrator task that fetches every Curated_Entry source URL and decides whether the page states the recommendation.
- **Scan_Cache**: The cache of scan results of `scan-pipeline`.
- **Detail_Panel**: The modal dialog of graveyard-ui that shows one package.

## Requirements

### Requirement 1: Hint record, bounds and normalization

**User Story:** As a visitor, I want upstream notices shown as plain bounded text, so that nothing from an upstream source can mislead me, link me away or flood the panel.

#### Acceptance Criteria

1. THE Hint_Normalizer SHALL return, for every input string, either null or a text that is trimmed, contains no control character, no bidirectional control character and no line break, and has at most HINT_TEXT_MAX_LENGTH code points.
2. WHEN the input of the Hint_Normalizer contains runs of whitespace or line breaks, THE Hint_Normalizer SHALL replace each run with one space before trimming and measuring.
3. WHEN the normalized text is longer than HINT_TEXT_MAX_LENGTH code points, THE Hint_Normalizer SHALL cut it so that the result, including one final ellipsis character `…`, has at most HINT_TEXT_MAX_LENGTH code points and does not end in a space before the ellipsis.
4. WHEN the normalized text is not longer than HINT_TEXT_MAX_LENGTH code points, THE Hint_Normalizer SHALL return it without an ellipsis.
5. IF the input is not a string, or is empty after normalization, THEN THE Hint_Normalizer SHALL return null.
6. THE Hint_Normalizer SHALL return the same output when applied to its own output [PBT].
7. THE Hint_Normalizer SHALL define HINT_TEXT_MAX_LENGTH as the single named constant of `pipeline/constants.ts`, with the value 600, and HINTS_MAX_PER_PACKAGE with the value 3.
8. THE Hint_Normalizer SHALL leave markup, Markdown and URLs in the text unchanged, so that they are shown as the literal characters that the upstream source sent.
9. THE Hint_Normalizer SHALL take no token, no header and no request as input, so that a token cannot appear in a Hint_Text.

### Requirement 2: npm deprecation hint

**User Story:** As a visitor, I want the npm deprecation message of a dead package, so that I can read what the maintainers recommend.

#### Acceptance Criteria

1. WHEN the npm latest-version document of a package has a non-empty string `deprecated`, THE Hint_Extractor SHALL return one Upstream_Hint of kind `deprecation-notice` whose text is the normalized `deprecated` string and whose `sourceUrl` is null.
2. IF the `deprecated` field is absent, empty after normalization or not a string, THEN THE Hint_Extractor SHALL return no hint for that package.
3. IF the body is not an object, or reading a field throws, THEN THE Hint_Extractor SHALL return no hint and SHALL NOT throw [PBT].
4. THE Hint_Extractor SHALL read only the latest-version document that the scan already fetches, so that a deprecation text that exists only on an older version document (for example `uuid@3.4.0`) gives no hint, and the slot then shows the fallback paragraph of Requirement 9.
5. THE Hint_Extractor SHALL use `sourceUrl` null for `deprecation-notice`, and the Resurrect_Model SHALL offer the registry page link of the package, built by `registryLink`, as the place where the notice can be read.
6. WHERE the ecosystem is `pypi`, THE Hint_Extractor SHALL return no hint.

### Requirement 3: Cargo advisory hint

**User Story:** As a visitor, I want the text of a RustSec "unmaintained" advisory, so that I can see why the crate is marked dead and what the advisory suggests.

#### Acceptance Criteria

1. WHEN a fetched, non-withdrawn advisory record of a cargo package has an affected entry with `informational` equal to `unmaintained`, THE Hint_Extractor SHALL return one Upstream_Hint of kind `advisory-notice` for that advisory.
2. THE Hint_Extractor SHALL take the text of an `advisory-notice` from the advisory `details` field, and from the `summary` field when `details` is empty after normalization.
3. THE Hint_Extractor SHALL set the `sourceUrl` of an `advisory-notice` to `advisoryUrl(id)` of the advisory.
4. WHEN a package has several unmaintained advisories, THE Hint_Extractor SHALL return one hint per advisory in ascending code point order of the advisory ids, at most HINTS_MAX_PER_PACKAGE hints.
5. IF an advisory has neither `details` nor `summary` text after normalization, THEN THE Hint_Extractor SHALL return no hint for that advisory.
6. WHERE the ecosystem is `npm` or `pypi`, THE Hint_Extractor SHALL return no `advisory-notice`, so that a non-cargo `unmaintained` marker is never reported as a hint.
7. IF an advisory body is not an object, or reading a field throws, THEN THE Hint_Extractor SHALL skip that advisory and SHALL NOT throw [PBT].
8. THE compact L2 cache entry of an OSV advisory SHALL keep its own string fields `summary` and `details`, so that the mapper output is equal on compact and full text (scan-pipeline Requirement 19.31).

### Requirement 4: Hints in the Scan_Result, validator, client boundary and cache version

**User Story:** As a maintainer of the app, I want hints stored in the scan result without breaking stored results or recorded fixtures, so that old data stays valid and new data is checked.

#### Acceptance Criteria

1. THE Scan_Cache key SHALL use `CACHE_KEY_VERSION` 4, so that results cached before hints existed are not reused.
2. THE pipeline SHALL set `hints` on every scan dependency to the list of Upstream_Hints of its Lookup_Target (an empty list when none), equal for every dependency of the same target.
3. THE `ScanDependency` type SHALL declare `hints` as an optional field, so that fixtures, e2e bodies and results built before this spec stay valid.
4. WHEN a stored result has no `hints` field on a dependency, THE `isScanResult` validator SHALL accept it.
5. WHEN a stored result has a `hints` field that is not an array of records with exactly the keys `kind`, `text`, `sourceUrl`, with `kind` one of the two kinds, `text` a string of at most HINT_TEXT_MAX_LENGTH code points and `sourceUrl` a string or null, THE `isScanResult` validator SHALL reject the result, so that it is a cache miss.
6. FOR ALL scan results that the pipeline produces, serializing to JSON and parsing again SHALL give a value that `isScanResult` accepts and that equals the original (round-trip property) [PBT].
7. WHEN the client parses a scan response, THE client boundary SHALL narrow each dependency's `hints` to a list of valid hints, dropping every entry that is malformed, has an unknown kind, has empty or over-long text, or has a `sourceUrl` that fails the validator of its kind, and SHALL treat an absent `hints` field as the empty list [PBT].
8. THE client narrowing SHALL return the same list when applied to its own output [PBT].
9. IF the `sourceUrl` of an `advisory-notice` does not match the advisory URL pattern of `view-model/urls.ts`, THEN THE client boundary SHALL keep the hint and set its link to null.
10. IF the `sourceUrl` of a `deprecation-notice` is not null, THEN THE client boundary SHALL set its link to null.

### Requirement 5: Pyproject tool detection

**User Story:** As a visitor with a `pyproject.toml`, I want commands for the tool that my project uses, so that I do not run `poetry add` in a project that does not use Poetry.

#### Acceptance Criteria

1. THE Core SHALL export a pure function `detectPyprojectTool(text)` that returns `poetry` when the text defines a Poetry dependency table and no PEP 621 or PEP 735 dependency table, `pep621` when the reverse holds, `mixed` when both kinds are defined, and null otherwise.
2. THE function SHALL NOT throw for any string, and SHALL return null for text that is not valid TOML.
3. THE function SHALL reuse the TOML reader of `core/parsers/toml-tree.ts`, and SHALL add no package and no field to the Dependency model.
4. WHEN the pipeline parses a manifest of format `pyproject.toml`, THE pipeline SHALL set the optional field `pyprojectTool` of that manifest entry to the detected value when it is not null.
5. WHEN a manifest entry has a `pyprojectTool` value other than `poetry`, `pep621` or `mixed`, THE `isScanResult` validator SHALL reject the result.
6. WHEN a manifest entry has no `pyprojectTool` field, THE `isScanResult` validator SHALL accept the result.
7. WHEN the Resurrect_Model builds Manifest_Origins for a package declared in a `pyproject.toml` whose `pyprojectTool` is absent or `mixed`, THE Resurrect_Model SHALL treat the origin as `mixed`, so that the slot shows both command variants (Requirement 10.6).

### Requirement 6: Curated replacement data

**User Story:** As a visitor, I want a small list of well-known replacements from a named source, so that a suggestion is never the opinion of the app.

#### Acceptance Criteria

1. THE Curated_List SHALL be the file `data/resurrections.json` with the top-level shape `{"entries": [...]}`.
2. THE Curated_List SHALL hold about 30 Curated_Entries across `npm`, `pypi` and `cargo`, with at least 8 entries for each ecosystem, after the Source_Check has dropped the entries that fail it.
3. THE Curated_List SHALL include an entry for each DEAD package of the `request/request` fixture that has a widely documented successor, and for the Source_Check to keep an entry, the page at its `source` URL must state the recommendation (the replacement, or the deprecation with the named successor).
4. THE Curated_List SHALL NOT include an entry whose `source` URL does not state the recommendation, and the Source_Check SHALL list every dropped candidate with its reason in `docs/resurrect-report.md`.
5. THE Curated_List SHALL NOT include `uuid` as a `from` name, because a package is never its own replacement; the old majors of `uuid` appear in the slot through the fallback paragraph of Requirement 9.6 (and through the deprecation notice only when the latest document carries one).
6. THE `why` field of each Curated_Entry SHALL be one sentence of at most 200 characters, ending with a period, holding no URL and no line break.
7. THE `source` field of each Curated_Entry SHALL be an `https` URL without credentials.
8. THE `to` field of each Curated_Entry SHALL be a list of 1 to 4 distinct names, each a Validated_Name for the ecosystem of the entry.
9. THE Curated_List SHALL keep its entries sorted by ecosystem (`npm`, `pypi`, `cargo`), then by `from` in code point order, with no two entries sharing an ecosystem and a normalized `from`.

### Requirement 7: Curated data validation and lookup

**User Story:** As a maintainer, I want the curated data checked by tests, so that a bad entry can never reach the slot.

#### Acceptance Criteria

1. THE unit test `tests/ui/view-model/resurrections-data.test.ts` SHALL validate the schema of every entry: exactly the five keys, `ecosystem` in the three ecosystems, `from` a string, `to` a list, `why` and `source` strings.
2. THE Name_Rules SHALL accept an npm name that matches the optional scope and the name pattern of lower-case letters, digits, `.`, `_`, `-` (at most 214 characters), a PyPI name only in PEP 503 normalized form (`^[a-z0-9]+(-[a-z0-9]+)*$`), and a crate name that matches `^[A-Za-z][A-Za-z0-9_-]{0,63}$`.
3. THE unit test SHALL check that no `to` name of an entry is the `from` name of any entry of the same ecosystem, that no `to` name equals the `from` name of its own entry after normalization, that every `source` URL is an `https` URL, and that every `from` and `to` name passes the Name_Rules.
4. THE Curated_Loader SHALL compare `from` names after normalization: PyPI names by PEP 503 normalization, crate names by lower-casing and replacing `_` with `-`, npm names exactly.
5. FOR ALL names and their equivalent spellings (case, runs of `-`, `_` and `.` for PyPI; case and `-` versus `_` for crates), THE Curated_Loader SHALL return the same entry as for the normalized name [PBT].
6. IF a Curated_Entry fails the Name_Rules, the schema or the https rule at load time, THEN THE Curated_Loader SHALL drop that entry and keep the others, without throwing.
7. IF the package that the slot describes has the same normalized name as an Alternative of its entry, THEN THE Resurrect_Model SHALL drop that Alternative, and SHALL omit the entry when no Alternative remains [PBT].

### Requirement 8: Live verification of the curated list

**User Story:** As a maintainer, I want each curated source and target verified against the real world, so that the list is honest on the day it ships.

#### Acceptance Criteria

1. WHEN the Source_Check runs, THE orchestrator SHALL fetch each `source` URL with a fetch tool, SHALL keep the entry only if the page text names the replacement or states the deprecation with its successor, and SHALL record each dropped entry and the reason.
2. WHERE `GRAVEKEEPER_LIVE_TESTS` is set to `1`, THE Live_Contract_Test SHALL check, for each npm `to` name, that `GET https://registry.npmjs.org/<name>` answers 200, that the `dist-tags.latest` version document has no `deprecated` field, and, when its `repository` is a GitHub repository, that the GitHub repository is not archived.
3. WHERE `GRAVEKEEPER_LIVE_TESTS` is set to `1`, THE Live_Contract_Test SHALL check, for each PyPI `to` name, that `GET https://pypi.org/pypi/<name>/json` answers 200, that `info.yanked` is false, that the classifiers hold no `Development Status :: 7 - Inactive`, and that the `project-status` of the Simple JSON page, when present, is `active`.
4. WHERE `GRAVEKEEPER_LIVE_TESTS` is set to `1`, THE Live_Contract_Test SHALL check, for each crate `to` name, that `GET https://crates.io/api/v1/crates/<name>` answers 200, that the newest non-yanked version exists, that an OSV query for the crate returns no non-withdrawn advisory with `informational` equal to `unmaintained`, and, when the repository is a GitHub repository, that it is not archived.
5. WHEN `GRAVEKEEPER_LIVE_TESTS` is not `1`, THE Live_Contract_Test SHALL skip every case and send no request, as the other live tests do.
6. THE Live_Contract_Test SHALL take the GitHub token from the process environment only, SHALL work without it (the archived check is then skipped with a note), and SHALL NOT print, log or write the token.
7. IF a check of the Live_Contract_Test fails for a `to` name, THEN THE orchestrator SHALL drop that `to` name (and the entry when no name remains) from the Curated_List and record the reason in `docs/resurrect-report.md`.

### Requirement 9: Slot visibility, order and fallbacks

**User Story:** As a visitor, I want the slot only where it helps, with the most specific information first, so that I can decide what to do about a dead package.

#### Acceptance Criteria

1. THE Resurrect_Model SHALL be non-null exactly for a Slot_Package, and null for every other row, including ghosts that are not restless, ALIVE packages and unassessed packages [PBT].
2. THE Detail_Panel SHALL render the Resurrect_Slot exactly when the Resurrect_Model of the package is non-null.
3. WHEN the package is a Restless_Ghost, THE Resurrect_Slot SHALL begin with one sentence that the open vulnerabilities make the matter urgent, using the open vulnerability count when it is known and at least 1.
4. THE Resurrect_Slot SHALL show its sections in this order: the urgent sentence (Restless_Ghost only), the Upstream_Hints, the Curated_Entries, and the fallback paragraph [PBT].
5. WHEN the package has at least one Upstream_Hint, THE Resurrect_Slot SHALL show each hint under the label "From the package's deprecation notice" for kind `deprecation-notice`, and under the label "From an advisory that marks this crate unmaintained" for kind `advisory-notice`.
6. WHEN the package has no Upstream_Hint and no Curated_Entry, and is a Buried_Package or a Restless_Ghost, THE Resurrect_Slot SHALL show one paragraph that says the package is marked archived, deprecated or both (by its reasons 8.1 and 8.2), that no notice text and no recommended replacement is on record, and that the visitor should read the package page and the repository and look for a maintained alternative, and SHALL name no package.
7. WHEN the package has no Upstream_Hint and no Curated_Entry, and is a Forgotten_Package, THE Resurrect_Slot SHALL show one paragraph that says no notice and no recommended replacement is on record, that the package may be finished and need no change, that the visitor should check the repository for recent activity and open issues, and that pinning the version or vendoring the code is an option, and SHALL name no package.
8. WHEN a fallback paragraph is shown, THE Resurrect_Slot SHALL show the registry page link of the package when `registryLink` is non-null.
9. WHEN a fallback paragraph is shown and the package has a source repository link from a `source-repo-unverified` note, THE Resurrect_Slot SHALL show two links built by `sourceRepoLink`: "Source repository (listed by the package, not verified)" and "Issues (listed by the package, not verified)", where the second link is the first with the path `/issues` appended.
10. IF the package has no source repository link, THEN THE Resurrect_Slot SHALL show no repository link and no sentence about one.
11. WHEN the package has at least one Upstream_Hint or at least one Curated_Entry, THE Resurrect_Slot SHALL NOT show a fallback paragraph [PBT].
12. THE Resurrect_Slot SHALL keep the heading "Resurrect" as a level-3 heading and `data-slot="resurrect"` on its section, and SHALL remove the disabled button, the text "Coming soon" and the text "Not available yet".

### Requirement 10: Curated suggestions and commands

**User Story:** As a visitor, I want the exact commands to switch to a documented replacement, so that I can copy them instead of typing names.

#### Acceptance Criteria

1. WHEN the Curated_Loader finds an entry for the package, THE Resurrect_Slot SHALL show under the label "From the caretaker's list" the `why` sentence, a link to the `source` URL, and for each remaining Alternative one command block.
2. WHEN a package is declared in a `package.json`, THE Command_Builder SHALL build the lines `npm uninstall <from>` and `npm install <to>`, with `--save-dev`, `--save-optional` or `--save-peer` added to the install line for the scopes `dev`, `optional` and `peer`.
3. WHEN a package is declared in a `requirements.txt`, THE Command_Builder SHALL produce the sentence "Replace the line for <from> in <path> with <to>, then run:" and the line `pip install <to>`.
4. WHEN a package is declared in a `pyproject.toml` whose Pyproject_Tool is `poetry`, THE Command_Builder SHALL build the lines `poetry remove <from>` and `poetry add <to>`, and the block SHALL carry the sentence "Add --group <group> to the poetry add line if the old package was in a dependency group."
5. WHEN a package is declared in a `pyproject.toml` whose Pyproject_Tool is `pep621`, THE Command_Builder SHALL produce the sentence "Replace the entry for <from> in the dependencies of <path> with <to>, then run:" and the line `pip install <to>`.
6. WHEN a package is declared in a `pyproject.toml` whose Pyproject_Tool is `mixed` or unknown, THE Resurrect_Slot SHALL show the Poetry block and the PEP 621 block, each introduced by its tool name, so that no tool is guessed.
7. WHEN a package is declared in a `Cargo.toml`, THE Command_Builder SHALL build the lines `cargo remove <from>` and `cargo add <to>`, with `--dev` for the scope `dev`, `--build` for `build` and `--optional` for `optional` added to the add line.
8. WHEN a package is declared in several manifests that need different commands, THE Resurrect_Slot SHALL show one block set per distinct (origin, scope) pair, each introduced by its manifest path.
9. THE Command_Builder SHALL build every Command_Line only from Fixed_Words and Validated_Names, in the order of the templates above, with single spaces [PBT].
10. IF the `from` name of the package or the `to` name of an Alternative is not a Validated_Name, THEN THE Command_Builder SHALL build no Command_Line for it, and the Resurrect_Slot SHALL show the Alternative and its source as text without a command block.
11. THE Command_Builder SHALL give the same output for the same input [PBT].
12. THE Resurrect_Slot SHALL show each Alternative name only as text in a `code` element and never as a link.

### Requirement 11: Copy button and confirmation

**User Story:** As a visitor, I want to copy a command with one press and be told that it worked, so that I do not have to select text by hand.

#### Acceptance Criteria

1. THE Resurrect_Slot SHALL render one Copy_Button for each command block, with the accessible name "Copy commands for <to>" where `<to>` is the Alternative name.
2. WHEN the visitor activates a Copy_Button and the clipboard write succeeds, THE Resurrect_Slot SHALL write the lines of that block joined by line breaks to the clipboard and SHALL set the text of the Copy_Status to "Copied the commands for <to>".
3. IF the clipboard is unavailable or the write fails, THEN THE Resurrect_Slot SHALL set the text of the Copy_Status to "Copying failed. Select the commands and copy them by hand."
4. THE Copy_Status SHALL be one element with `role="status"` that exists in the DOM before any copy happens, so that screen readers announce the change.
5. WHEN 3000 milliseconds have passed since the last copy result, THE Resurrect_Slot SHALL clear the Copy_Status text.
6. THE Resurrect_Slot SHALL keep the focus on the Copy_Button after a copy.
7. THE copied text SHALL equal the displayed lines of the block, joined by line breaks [PBT].
8. THE Resurrect_Slot SHALL send no network request.

### Requirement 12: Text-only hints and links from validated builders

**User Story:** As a visitor, I want upstream text shown as text and every link built from a checked value, so that a hostile notice cannot send me anywhere.

#### Acceptance Criteria

1. THE Resurrect_Slot SHALL render each Hint_Text as plain text in one element, and SHALL create no link, image or markup from it.
2. FOR ALL Hint_Texts, including texts that hold URLs, Markdown links, HTML tags and `javascript:` strings, THE Resurrect_Model SHALL contain every `href` only from `registryLink`, `advisoryLink`, `sourceRepoLink` (with `/issues` appended) or the `source` of a Curated_Entry that passed the https rule, and no `href` SHALL contain any part of a Hint_Text [PBT].
3. THE Resurrect_Slot SHALL open each external link through the existing `ExternalLink` component with its existing safe attributes.
4. WHEN a hint has a `sourceUrl` that passes `advisoryLink`, THE Resurrect_Slot SHALL show a link "Read the advisory" to it.
5. WHEN a hint is of kind `deprecation-notice` and `registryLink` is non-null, THE Resurrect_Slot SHALL show a link "Read it on the registry page" to the registry page.
6. THE Resurrect_Model SHALL contain no token and no value that the pipeline marked as secret, and the exported fixtures and the report SHALL be checked for the token prefixes `ghp_`, `gho_` and `github_pat_`.

### Requirement 13: Accessibility, motion, budgets and unchanged design

**User Story:** As a visitor using assistive technology or a slow device, I want the slot to meet the same standards as the rest of the panel, so that it works for me.

#### Acceptance Criteria

1. THE Resurrect_Slot SHALL pass the axe check with the tags of `tests/e2e/support/a11y.ts` on a buried, a forgotten and a restless package.
2. THE Resurrect_Slot SHALL meet WCAG 2.1 AA contrast with the existing color tokens, and SHALL introduce no new color value, font or breakpoint.
3. THE Resurrect_Slot SHALL use no animation, so that reduced-motion settings need no special case, and its focus styles SHALL be the existing focus styles.
4. THE new CSS SHALL consist of one delimited block in `app/globals.css` that uses only existing custom properties.
5. THE change SHALL keep the art, the palette, the scene and the header layout unchanged.
6. THE change SHALL keep the client JavaScript budget of `scripts/check-client-js-budget.ts` and the scene render budgets of the existing e2e tests, and the Curated_List SHALL load only in the code of the detail panel.
7. THE Resurrect_Slot SHALL be reachable and operable by keyboard alone, with the Copy_Buttons in the DOM order of the commands.

### Requirement 14: Properties and traceability

**User Story:** As a maintainer, I want the correctness properties numbered, tagged and traced, so that every claim of this spec has a test.

#### Acceptance Criteria

1. THE spec SHALL define properties RS-P1 to RS-P12 in `design.md`, each tagged `// Feature: resurrect, Property RS-P<n>: <title>` in exactly one property test file with a `// Validates:` line and titles that start with `RS-P<n>`.
2. THE test `tests/ui/rs-traceability.test.ts` SHALL check that each number from 1 to 12 appears in exactly one tag, that every tagged file has a `// Validates:` line, and that every test title of a tagged file starts with its number.
3. THE file `docs/property-traceability.md` SHALL gain a section `## resurrect (RS-P1 to RS-P12)` with one row per property.
4. THE property tests SHALL use `cfg()` from `tests/support/fc-config.ts` and SHALL NOT set `FC_NUM_RUNS`.
5. THE existing tests and the properties of the other specs SHALL stay green, and a test SHALL change only where this spec legitimately changes a behavior: the cache key version, the placeholder slot, the `resurrect` field of the detail model and the scan dependency shape.

### Requirement 15: End-to-end and axe checks

**User Story:** As a maintainer, I want the slot exercised in a real browser on the three kinds of package, so that wiring errors are caught.

#### Acceptance Criteria

1. THE end-to-end test `tests/e2e/resurrect.spec.ts` SHALL open the Detail_Panel of a buried package (`har-validator` of the `request/request` fixture), a forgotten package (`aws-sign2`) and a restless package (`uuid`), with `/api/scan` mocked from the exported fixture, and SHALL check the slot content of each.
2. WHEN the buried package `har-validator` is opened, THE slot SHALL show the deprecation notice text and its label, and SHALL show a curated suggestion only when the data file holds one for it.
3. WHEN the forgotten package `aws-sign2` is opened, THE slot SHALL show the forgotten paragraph and no command block.
4. WHEN the restless package `uuid` is opened, THE slot SHALL begin with the urgent sentence and SHALL show the buried fallback paragraph.
5. THE test SHALL open the Detail_Panel of the crate `bincode` of the zoxide fixture and check that the advisory text is shown as text with no link inside the text element, and that the cargo commands appear for a curated suggestion.
6. THE test SHALL run the axe check on each opened panel with the slot visible and expect no violation.
7. THE test SHALL check that activating a Copy_Button sets the Copy_Status text and that the clipboard holds the displayed lines, using the browser's clipboard permission.
8. WHEN the Detail_Panel of an ALIVE package or of a ghost that is not restless is opened, THE test SHALL check that no Resurrect_Slot is present.

### Requirement 16: Report and delivery

**User Story:** As a reviewer, I want one report that shows what the slot does on a real repository, what was dropped and what was found, so that I can judge the feature without running it.

#### Acceptance Criteria

1. THE report `docs/resurrect-report.md` SHALL state, for `request`, `har-validator`, `phantomjs-prebuilt`, `aws-sign2` and `uuid` in the `request/request` fixture, what the slot shows: the sections, the hint text and its label, the curated suggestions and the commands.
2. WHEN a package of that list is not a dependency of the scanned repository (`request` is not a dependency of `request/request`), THE report SHALL say so and SHALL show the slot content from the view-model for a synthetic row, labelled as synthetic.
3. THE report SHALL list the curated entries that were kept (with their sources), the entries that were dropped with the reason, and the `to` names that the Live_Contract_Test removed.
4. THE report SHALL list properties RS-P1 to RS-P12 with the result of a deep run (`npm run test:deep`) and, for a failure, the shrunk counterexample and the seed.
5. THE report SHALL embed three 1440x900 screenshots of Detail_Panels with the slot visible, taken by `tests/e2e/resurrect-report.spec.ts` into `docs/screenshots/resurrect/`, and that spec SHALL run only when `RS_REPORT=1` is set.
6. THE report SHALL list the commits of this spec with their CI status, and the orchestrator SHALL commit and push after each green group.
7. THE report SHALL contain no token, and no task SHALL print a token; live tasks obtain `GITHUB_TOKEN` from `gh auth token` inside the command.
