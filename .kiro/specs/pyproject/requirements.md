# Requirements Document

## Introduction

This spec adds `pyproject.toml` as a fourth supported manifest format. Today a Python repository that declares its dependencies in `pyproject.toml` (for example `psf/requests`) scans as 0 dependencies with a `no-root-manifest` note, because only `requirements.txt` is read (KIRO_LOG, live smoke scan of `psf/requests`). After this spec the Core parses three dependency layouts that a `pyproject.toml` can hold, and the Pipeline discovers, selects, fetches and scans it like every other manifest.

1. **PEP 621** `[project].dependencies` and `[project].optional-dependencies`.
2. **PEP 735** `[dependency-groups]`.
3. **Poetry** `[tool.poetry.dependencies]`, `[tool.poetry.group.<name>.dependencies]` and the legacy `[tool.poetry.dev-dependencies]`, including the translation of Poetry version constraints (`^`, `~`, wildcards, comma lists, table forms) into PEP 440 ranges, so that the range resolution of scan-accuracy works unchanged.

The parser produces the normalized model of `dependency-graveyard-core` with ecosystem `pypi`. It adds no field to the model. It adds no package: `smol-toml` is already pinned and allowed in `/core` (`CORE_ALLOWED_PACKAGES`, checked by `npm run check:core`), and the PEP 440 range code stays in `pipeline/mapping/range-pep440.ts`.

The decisions of this document are final (user brief of the session that created this spec). The three related specs keep their text, except for the three places listed under "Changes to other specs".

### Out of Scope

- A production serializer for `pyproject.toml`. Requirement 1 explains why and Requirement 11 gives the test-only alternative.
- Resolving `{include-group = "..."}` entries, `[build-system].requires`, `[tool.poetry.extras]`, environment markers, extras of a dependency, and Poetry `source` entries (alternative package indexes). Such text is skipped or ignored as the requirements below state.
- `uv`, `pdm`, `hatch` and `flit` tool tables other than the PEP 621 and PEP 735 standard tables.
- Lockfiles (`poetry.lock`, `uv.lock`). A version is never read from a lockfile.
- Any change of the art, the palette or the header layout. The user sends art changes separately. Only copy that lists manifest formats changes.

### Changes to other specs

| Place | Change |
|---|---|
| `scan-pipeline` requirements, table "User-facing messages", row `no-manifests` | The text lists `pyproject.toml` (Requirement 9.5). |
| `scan-pipeline` constants `DISCOVERY_MANIFEST_NAMES` and `CACHE_KEY_VERSION` | `pyproject.toml` is added, and the key version goes from 2 to 3 (Requirements 9.1, 10.1). |
| `dependency-graveyard-core` Manifest_Format list | `pyproject.toml` is added, with no change of the Dependency model (Requirement 1). |
| `scan-accuracy` criterion 3.1 (`chooseVersion`) | For the ecosystem `pypi`, a `versionSpec` of `*` counts as no Declared_Range, so it gives the default version and no `range-unresolved` note (Requirement 10.5). Today `pepRange('*')` is null and every unconstrained `pypi` dependency gets a note. |

### Conventions

- Criteria tagged **[PBT]** are verified with fast-check in files named `<module>.property.test.ts`. Untagged criteria use example-based tests.
- Property numbers are `PY-P1` to `PY-P10`. Each property test file carries the tag comment `// Feature: pyproject, Property PY-P<n>`, a `// Validates:` line, and test titles that start with `PY-P<n>`. The design document lists the properties.
- "Core spec" means `.kiro/specs/dependency-graveyard-core`. "Pipeline spec" means `.kiro/specs/scan-pipeline`. "Accuracy spec" means `.kiro/specs/scan-accuracy`.
- Source code cites the requirement number in a comment above each rule (steering rule).

## Glossary

- **Core**: The pure module in `/core`.
- **Pyproject_Parser**: The Core function `parseManifest(text, 'pyproject.toml')` and the format parser behind it, `core/parsers/pyproject-toml.ts`.
- **Pyproject_Text**: The text of one `pyproject.toml` file, at most `MAX_MANIFEST_LENGTH` characters.
- **Pyproject_Table**: One of the six dependency locations that the Pyproject_Parser reads: `[project].dependencies`, `[project.optional-dependencies].<extra>`, `[dependency-groups].<group>`, `[tool.poetry.dependencies]`, `[tool.poetry.group.<name>.dependencies]` and `[tool.poetry.dev-dependencies]`.
- **Dependency_Table_Present**: True when the Pyproject_Text defines at least one Pyproject_Table (the key exists, with any value type, even empty), or when `[project].dynamic` lists `"dependencies"`.
- **PEP_508_Entry**: A string element of a PEP 621 list or a PEP 735 group, such as `"requests[socks]>=2.0 ; python_version >= '3.8'"` or `"pkg @ git+https://example.org/p.git"`.
- **Include_Entry**: An element of a PEP 735 group that is a table with the key `include-group`.
- **Self_Reference**: A PEP_508_Entry whose PEP 503 normalized name equals the PEP 503 normalized `[project].name` of the same file.
- **Poetry_Constraint**: The version string of a Poetry dependency, for example `^1.2.3`, `~1.2`, `1.*`, `>=1.2,<2.0`, `1.2.3` or `*`.
- **Poetry_Translator**: The Core function `poetryToPep440(constraint)` in `core/formats/poetry-constraint.ts`. It returns a PEP 440 specifier text or the outcome `unsupported`.
- **Poetry_Reference**: The independent evaluator of Poetry semantics in `tests/support/oracles/poetry-reference.ts`. It is written without calling the Poetry_Translator.
- **Alternatives_Constraint**: A Poetry_Constraint that uses `||` or a single `|` between terms.
- **Table_Rank**: The tuple `[tableOrdinal, groupIndex, entryIndex]` that orders candidates before deduplication (design: Table ranks).
- **Pyproject_Writer**: The test-only function in `tests/support/oracles/pyproject-writer.ts` that serializes a generated Dependency list to Pyproject_Text in the PEP 621 style or in the Poetry style.
- **Root_Manifests**: The discovered manifests whose path has no `/` (pipeline R5.1).
- **Probe**: The live run of `npm run live:report` that compares candidate repositories before recording (Requirement 12).
- **Pyproject_Fixture_Set**: The Fixture_Set under `tests/fixtures/<owner>__<repo>/` of the repository chosen by the Probe.
- **Convincing_Graveyard**: A repository for which DEAD plus HAUNTED is the larger count, and for equal counts the grade is worse (Requirement 13).

## Constants

| Constant | Value | Meaning |
|---|---|---|
| `DISCOVERY_MANIFEST_NAMES` (pipeline, changed) | `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml` | Was three names. File names compared exactly (case-sensitive). |
| `CACHE_KEY_VERSION` (pipeline, changed) | 3 | Was 2. Bumped because a repository that scanned as 0 dependencies now scans with dependencies, and cached results of the old reading must not be served. |

No other constant is added. Constant consistency rules of the pipeline spec stay valid (`CACHE_KEY_VERSION` is a positive integer greater than 1).

## Requirements

### Requirement 1: The pyproject.toml manifest format

**User Story:** As a maintainer, I want `pyproject.toml` to be a first-class manifest format of the Core, so that every layer that handles manifests handles it the same way.

#### Acceptance Criteria

1. THE Core SHALL add the value `pyproject.toml` to the type `ManifestFormat` and to the list `MANIFEST_FORMATS` in `core/formats/manifest-format.ts`.
2. THE Core SHALL map the format `pyproject.toml` to the ecosystem `pypi` in `ecosystemOf`.
3. THE Core SHALL return the scopes `runtime`, `dev` and `optional`, in that order, from `supportedScopes('pyproject.toml')`.
4. WHEN `parseManifest(text, 'pyproject.toml')` is called, THE Core SHALL dispatch to the Pyproject_Parser and return the result through the same `finish` step (deduplication and sorting) as the other formats.
5. THE Core SHALL leave the types `Dependency`, `Scope`, `SourceKind`, `Ecosystem` and `ParseResult` unchanged, so that no field for an extra name or a group name exists.
6. THE Core SHALL read TOML only through `parseToml` in `core/parsers/toml-tree.ts`, so that `npm run check:core` finds no new import of `smol-toml` and no other package import in `/core`.
7. WHEN `serializeManifest(dependencies, 'pyproject.toml')` is called, THE Core SHALL return the error `{ kind: 'unsupported-format', format: '"pyproject.toml"' }` and SHALL NOT throw.
8. WHEN the Pyproject_Text is longer than `MAX_MANIFEST_LENGTH` characters, THE Core SHALL return no dependencies and the existing warning of core criterion 4.4 (`parseManifest` behavior is unchanged).
9. THE Core SHALL keep the output of `parseManifest` for the formats `package.json`, `requirements.txt` and `Cargo.toml` unchanged for every input.

### Requirement 2: Invalid files and files that are not Python projects

**User Story:** As a user, I want a clear note when a `pyproject.toml` cannot be read or holds no dependencies, so that a result with zero dependencies is explained.

#### Acceptance Criteria

1. IF the Pyproject_Text is not valid TOML, THEN THE Pyproject_Parser SHALL return no dependencies and exactly one warning of the form `pyproject.toml is not valid TOML: <message>`, followed by ` (line <n>)` only when the TOML parser supplies a line number, where `<message>` is at most 200 characters and its first line only.
2. IF the Pyproject_Text is valid TOML and Dependency_Table_Present is false, THEN THE Pyproject_Parser SHALL return no dependencies and exactly one warning with the text `pyproject.toml has no dependency tables ([project], [dependency-groups] or [tool.poetry]); no dependencies were read.`
3. IF `[project]` lists `"dependencies"` in its `dynamic` array and defines no `dependencies` key, THEN THE Pyproject_Parser SHALL add one warning (and, by the definition of Dependency_Table_Present, no warning of criterion 2) with the text `pyproject.toml: [project] declares its dependencies as dynamic; they cannot be read from this file.`
4. IF a Pyproject_Table exists but has the wrong TOML type (for example `dependencies = "x"` instead of an array, or `[tool.poetry.dependencies]` as an array), THEN THE Pyproject_Parser SHALL skip that table and add one warning `pyproject.toml table [<path>] is not a <list or table>; it was skipped.`
5. WHEN a Pyproject_Table exists and is empty, THE Pyproject_Parser SHALL add no warning for it.
6. THE Pyproject_Parser SHALL bound every quoted name, constraint or table path in a warning to 60 code points, ending in an ellipsis when cut, and SHALL NOT include the Pyproject_Text outside such quotes.
7. [PBT] FOR ALL strings and FOR ALL generated TOML-shaped texts (random tables, nested arrays, numbers, dates, hostile keys such as `__proto__`, lone surrogates and values of the wrong type in every Pyproject_Table), THE Pyproject_Parser SHALL return a ParseResult through `parseManifest` and SHALL NOT throw (PY-P1).

### Requirement 3: PEP 621 tables

**User Story:** As a Python developer, I want the dependencies of `[project]` read with the right scope, so that a runtime dependency is not shown as a development one.

#### Acceptance Criteria

1. WHEN `[project].dependencies` is an array, THE Pyproject_Parser SHALL read each string element as a PEP_508_Entry and give the resulting Dependency the scope `runtime`.
2. WHEN `[project.optional-dependencies]` is a table, THE Pyproject_Parser SHALL read each string element of each extra as a PEP_508_Entry and give the resulting Dependency the scope `optional`, whatever the extra name is.
3. THE Pyproject_Parser SHALL NOT store the extra name in the Dependency. WHEN a duplicate warning concerns an entry of an extra, THE Pyproject_Parser SHALL name the table in the warning as `pyproject.toml table [project.optional-dependencies.<extra>]`.
4. THE Pyproject_Parser SHALL read a PEP_508_Entry with the same lexical rules as a `requirements.txt` line: a name token, optional extras in brackets that are skipped, then either a registry specifier (empty, `*` or starting with a comparison operator) or a direct reference `@ <target>` whose target starts with `git+` (sourceKind `git`) or with `file:`, `./`, `../` or `/` (sourceKind `path`), with an environment marker (text after `;`) removed.
5. WHEN a registry PEP_508_Entry has an empty specifier, THE Pyproject_Parser SHALL set `versionSpec` to `*`, as the `requirements.txt` parser does. WHEN it has a specifier, THE Pyproject_Parser SHALL keep the specifier text with its outer whitespace removed and no other change.
6. IF a PEP_508_Entry is not a string, or its text cannot be read by the rules of criterion 4, or it contains a backslash, THEN THE Pyproject_Parser SHALL skip it and add one warning `pyproject.toml table [<path>]: cannot parse requirement "<text>".` (for a backslash: `requirement contains a backslash and was skipped`).
7. IF a PEP_508_Entry is a Self_Reference, THEN THE Pyproject_Parser SHALL skip it and add one warning `pyproject.toml table [<path>]: "<name>" refers to this project itself and was skipped.`
8. THE Pyproject_Parser SHALL treat a PEP 508 text with `#` as ordinary text (TOML strings have no comments), so that `#egg=` is read only as part of a direct-reference target.
9. [PBT] FOR ALL generated registry, git and path PEP_508_Entry lines without whitespace followed by `#`, THE Pyproject_Parser SHALL produce for the entry the same `name`, `rawName`, `versionSpec` and `sourceKind` as the `requirements.txt` parser produces for the same text as a line, apart from the scope (PY-P8).

### Requirement 4: PEP 735 dependency groups

**User Story:** As a Python developer, I want the dependency groups of `[dependency-groups]` read, so that test and lint dependencies appear as development dependencies.

#### Acceptance Criteria

1. WHEN `[dependency-groups]` is a table, THE Pyproject_Parser SHALL read each string element of each group as a PEP_508_Entry (Requirement 3, criteria 4 to 8) and give the resulting Dependency the scope `dev`, whatever the group name is.
2. WHEN a group element is an Include_Entry, THE Pyproject_Parser SHALL skip it, SHALL NOT read the group it names, and SHALL add exactly one warning `pyproject.toml table [dependency-groups.<group>]: include-group "<name>" was skipped; groups are not resolved.`
3. WHEN a group element is a table without the key `include-group`, or an `include-group` whose value is not a string, THE Pyproject_Parser SHALL skip it and add one warning `pyproject.toml table [dependency-groups.<group>]: entry <index> is not a requirement string or an include-group table; it was skipped.`
4. THE Pyproject_Parser SHALL NOT report an error for an Include_Entry that names a missing group or names its own group (a cycle), because no group is resolved.
5. [PBT] FOR ALL generated sets of groups with Include_Entries (including missing targets and cycles), THE Pyproject_Parser SHALL return the same dependencies as for the same input with every Include_Entry removed, and SHALL return exactly one more warning for each removed Include_Entry (PY-P7).

### Requirement 5: Poetry tables

**User Story:** As a Poetry user, I want the three Poetry dependency tables read, so that a Poetry project scans like a PEP 621 project.

#### Acceptance Criteria

1. WHEN `[tool.poetry.dependencies]` is a table, THE Pyproject_Parser SHALL read each entry and give the resulting Dependency the scope `runtime`, except for an entry that is a table with `optional = true`, which gets the scope `optional`.
2. WHEN `[tool.poetry.group.<name>.dependencies]` is a table, THE Pyproject_Parser SHALL read each entry and give the resulting Dependency the scope `dev`, whatever the group name and the value of `optional` are.
3. WHEN `[tool.poetry.dev-dependencies]` is a table, THE Pyproject_Parser SHALL read each entry and give the resulting Dependency the scope `dev`.
4. THE Pyproject_Parser SHALL skip the entry whose key has the PEP 503 normalized form `python` in every Poetry table, without a warning.
5. WHEN an entry value is a string, THE Pyproject_Parser SHALL use it as the Poetry_Constraint (Requirement 6) and set the sourceKind `registry`.
6. WHEN an entry value is a table, THE Pyproject_Parser SHALL read these keys and ignore every other key (`extras`, `markers`, `python`, `platform`, `allow-prereleases`, `source`, `develop`, `optional` beyond criterion 1): `version` (the Poetry_Constraint; a missing `version` means `*`), `git`, `path` and `url`.
7. WHEN an entry table has the key `git`, THE Pyproject_Parser SHALL set the sourceKind `git` and `versionSpec` to the `git` value. WHEN it has no `git` and has `path`, THE Pyproject_Parser SHALL set the sourceKind `path` and `versionSpec` to the `path` value. WHEN it has neither and has `url`, THE Pyproject_Parser SHALL set the sourceKind `git` and `versionSpec` to the `url` value, because the model has no kind for a remote archive and `git` is the non-registry remote kind.
8. WHEN an entry value is an array of tables (Poetry multiple constraints), THE Pyproject_Parser SHALL read each element by criteria 5 to 7 with consecutive ranks, so that the deduplication of Requirement 8 keeps the first element and adds one duplicate warning for each further element.
9. IF an entry value is neither a string, a table nor an array of tables, or a string-valued key (`version`, `git`, `path`, `url`) has another type, THEN THE Pyproject_Parser SHALL skip the entry and add one warning `pyproject.toml table [<path>]: value of "<key>" is not a constraint string, a table or an array of tables; the entry was skipped.`
10. IF an entry key is not a name token (`[A-Za-z0-9][A-Za-z0-9._-]*`), THEN THE Pyproject_Parser SHALL skip the entry and add one warning `pyproject.toml table [<path>]: entry "<key>" is not a valid package name; it was skipped.`
11. THE Pyproject_Parser SHALL read the Poetry tables independently of PEP 621 tables, so that a file that defines both is read twice and merged by Requirement 8.

### Requirement 6: Poetry constraint translation

**User Story:** As a Poetry user, I want caret, tilde and wildcard constraints turned into PEP 440 ranges, so that the scan checks the version my constraint can install.

#### Acceptance Criteria

1. THE Poetry_Translator SHALL accept a Poetry_Constraint made of one or more terms separated by commas or by whitespace, where whitespace between an operator and its version is allowed, and SHALL return the PEP 440 terms joined by `,` with no spaces, in the order written.
2. THE Poetry_Translator SHALL translate a caret term `^V`, where `V` has one to three numeric parts, to `>=V,<U`, where `U` has the same number of parts as `V` and is formed by increasing the first non-zero part of `V` by one (or the last part when every part is zero) and setting every later part to zero. Examples: `^1.2.3` gives `>=1.2.3,<2.0.0`, `^0.2.3` gives `>=0.2.3,<0.3.0`, `^0.0.3` gives `>=0.0.3,<0.0.4`, `^1.2` gives `>=1.2,<2.0`, `^0.0` gives `>=0.0,<0.1`, `^0` gives `>=0,<1`, `^1` gives `>=1,<2`.
3. THE Poetry_Translator SHALL translate a tilde term `~V`, where `V` has one to three numeric parts, to `>=V,<U`, where `U` has the same number of parts as `V` and is formed by increasing the second part of `V` by one and setting every later part to zero when `V` has at least two parts, and by increasing the first part by one when `V` has one part. Examples: `~1.2.3` gives `>=1.2.3,<1.3.0`, `~1.2` gives `>=1.2,<1.3`, `~1` gives `>=1,<2`, `~0` gives `>=0,<1`.
4. THE Poetry_Translator SHALL translate a wildcard term `V.*`, where `V` has one to three numeric parts, to `==V.*`, and SHALL translate the term `*` to no term, so that the constraint `*` gives the `versionSpec` `*`.
5. THE Poetry_Translator SHALL translate a bare version `V` (one to four numeric parts) to `==V`, because Poetry reads a bare version as an exact pin.
6. THE Poetry_Translator SHALL pass the comparison terms `>=V`, `>V`, `<=V`, `<V`, `==V`, `!=V` (`V` with one to four numeric parts) and `==V.*`, `!=V.*` unchanged except for removing whitespace, and SHALL pass `~=V` (two to four numeric parts) unchanged.
7. WHEN a Poetry_Constraint is an Alternatives_Constraint, THE Pyproject_Parser SHALL keep the dependency with `versionSpec` `*` and add one warning `pyproject.toml table [<path>]: constraint "<text>" of "<name>" uses || alternatives that PEP 440 cannot express; the package is checked at any version.` Alternatives are unsupported on purpose: the range resolver intersects the ranges of one package and a union cannot be handed to it.
8. IF a Poetry_Constraint contains a term that is not one of criteria 2 to 6 (an empty term, a leading `v`, `x` or `X` as a wildcard, a wildcard with an operator other than `==` or `!=`, a pre-release or post-release suffix, a version with more parts than the term allows, or any other text), THEN THE Pyproject_Parser SHALL keep the dependency with `versionSpec` `*` and add one warning `pyproject.toml table [<path>]: constraint "<text>" of "<name>" could not be translated to a PEP 440 range; the package is checked at any version.`
9. WHEN the Poetry_Translator returns `*` for a constraint that is exactly `*` or empty after trimming, THE Pyproject_Parser SHALL add no warning.
10. [PBT] FOR ALL generated parseable Poetry_Constraints and FOR ALL generated release versions of one to four numeric parts, THE PEP 440 range returned by the Poetry_Translator SHALL accept the version if and only if the Poetry_Reference accepts the version (PY-P3).
11. [PBT] FOR ALL generated parseable Poetry_Constraints and FOR ALL generated version lists, THE function `resolveRange('pypi', [translated], versions)` SHALL return the highest listed non-prerelease version that the Poetry_Reference accepts, or the unresolved outcome when none is accepted (PY-P10).

### Requirement 7: Names

**User Story:** As a user, I want the same package to get the same name whichever way a project spells it, so that the graveyard lists it once.

#### Acceptance Criteria

1. THE Pyproject_Parser SHALL set `name` of every Dependency to the PEP 503 normalization of its `rawName` (ASCII upper case to lower case, each run of `-`, `_` and `.` to one `-`), using `normalizePypiName`.
2. THE Pyproject_Parser SHALL set `rawName` to the name as written: the name token of a PEP_508_Entry, or the key of a Poetry entry.
3. THE Pyproject_Parser SHALL set `ecosystem` to `pypi` for every Dependency.
4. [PBT] FOR ALL generated names with mixed case and separator runs in every Pyproject_Table, THE Pyproject_Parser SHALL return Dependencies whose `name` equals `normalizePypiName(rawName)`, whose `rawName` equals the written name, and whose `ecosystem` is `pypi` (PY-P5).

### Requirement 8: Scope mapping, duplicates, order and determinism

**User Story:** As a maintainer, I want the result of parsing to be stable and every table to have a defined scope, so that the same file always gives the same graveyard.

#### Acceptance Criteria

1. THE Pyproject_Parser SHALL map each Pyproject_Table to exactly one scope by this table, and SHALL give every Dependency it returns a scope of `runtime`, `dev` or `optional`.

   | Pyproject_Table | Scope |
   |---|---|
   | `[project].dependencies` | `runtime` |
   | `[project.optional-dependencies].<extra>` | `optional` |
   | `[dependency-groups].<group>` | `dev` |
   | `[tool.poetry.dependencies]` | `runtime` (`optional` for an entry with `optional = true`) |
   | `[tool.poetry.group.<name>.dependencies]` | `dev` |
   | `[tool.poetry.dev-dependencies]` | `dev` |

2. THE Pyproject_Parser SHALL rank candidates by Table_Rank so that, for equal Dependency_Keys (normalized name and scope), the entry of the earlier Pyproject_Table wins in this order: `[project].dependencies`, `[project.optional-dependencies]`, `[dependency-groups]`, `[tool.poetry.dependencies]`, `[tool.poetry.group.*]`, `[tool.poetry.dev-dependencies]`; inside a table the order of the TOML keys or array elements decides.
3. WHEN two candidates have the same Dependency_Key, THE Pyproject_Parser SHALL keep the first by Table_Rank and add one warning per discarded candidate through `finish`: `<table>: duplicate dependency "<name>" in scope "<scope>"; the first occurrence was kept.` This covers the same package in a PEP 621 table and a Poetry table of one file.
4. WHEN the same normalized name appears with different scopes, THE Pyproject_Parser SHALL keep one Dependency per scope and add no warning, because the Summarizer merges scopes.
5. THE Pyproject_Parser SHALL return dependencies in Dependency_Order (core criterion 4.8), with no two Dependencies sharing a Dependency_Key, and SHALL return warnings in this order: the warnings of the parser in Table_Rank order, then the duplicate warnings.
6. THE Pyproject_Parser SHALL return deeply equal results for equal Pyproject_Text, and SHALL NOT mutate its input.
7. [PBT] FOR ALL generated Pyproject_Texts, THE Pyproject_Parser SHALL return the same result when called twice, a dependency list sorted by Dependency_Order without repeated Dependency_Keys, and, WHEN the entries inside each table have distinct names, the same dependency list for every permutation of the entries inside the tables (PY-P4).
8. [PBT] FOR ALL generated tables of each kind in the table of criterion 1 and every scope, THE Pyproject_Parser SHALL give every returned Dependency exactly the scope that the table of criterion 1 assigns to its Pyproject_Table, and the scope SHALL be in `supportedScopes('pyproject.toml')` (PY-P6).
9. [PBT] FOR ALL generated Dependency lists with names, sourceKinds and scopes of the format, writing them with the Pyproject_Writer (PEP 621 style, and Poetry style) and parsing the text with the Pyproject_Parser SHALL return a list equal to the input in the five fields of the Dependency_Set, and the same `rawName` where the writer wrote it (PY-P2).

### Requirement 9: Discovery, selection, picker and copy

**User Story:** As a user, I want a repository with a `pyproject.toml` to be found, offered and scanned like any other manifest, so that I do not get "no manifests" for a Python project.

#### Acceptance Criteria

1. THE Pipeline SHALL list `pyproject.toml` in `DISCOVERY_MANIFEST_NAMES`, between `requirements.txt` and `Cargo.toml`.
2. WHEN the recursive tree contains a blob named `pyproject.toml` outside the skip directories and within `DISCOVERY_MAX_DEPTH`, THE Pipeline SHALL list it as a Manifest_Candidate with `format` `pyproject.toml`, and SHALL apply to it every rule of pipeline R4 that applies to the other manifest files (depth, order, caps, `manifest-too-large`).
3. WHEN no manifest is requested, THE Pipeline SHALL select every Root_Manifest, including a root `pyproject.toml` and a root `requirements.txt` together. There is no precedence between the two: both files are fetched and parsed, and their dependencies are merged by the existing Summarizer and the existing Lookup_Target rules (one package, one lookup, scopes merged).
4. WHEN `manifests` names a path that ends in `pyproject.toml` and exists in the tree, THE Pipeline SHALL accept it as pipeline R5.5 accepts any other manifest path, and the picker of the `no-root-manifest` note and of the two manifest errors SHALL list it with its format and size.
5. THE Pipeline SHALL render the message of the note `no-manifests` as `No package.json, requirements.txt, pyproject.toml or Cargo.toml was found in this repository.`
6. THE project SHALL update every user-visible text that lists the supported manifest formats: the `no-manifests` row of the User-facing messages table of the Pipeline spec, the steering file `.kiro/steering/product.md`, and the end-to-end mock bodies that repeat the `no-manifests` text. A text search of `app/`, `components/`, `view-model/` and `README.md` for `requirements.txt` and `Cargo.toml` SHALL find no list of formats in the landing copy, the legend and the how-it-decides copy; if the search finds one, it SHALL gain `pyproject.toml`.
7. THE Pipeline SHALL derive the parser format of a fetched manifest from the last path segment, as before, so that `pyproject.toml` is parsed with the Pyproject_Parser at any depth.
8. [PBT] FOR ALL generated trees with entries named `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml` and other names at generated depths and below generated skip directories, THE discovery SHALL list exactly the entries that have a manifest name, lie outside the skip directories and are within the depth limit, with `format` equal to the file name, and the default selection SHALL be exactly the Root_Manifests in ascending code point order, including the case that `pyproject.toml` and `requirements.txt` are both at the root (PY-P9).

### Requirement 10: Cache key and pipeline integration

**User Story:** As a user, I want a re-scan after this change to read the `pyproject.toml`, so that I never see the stale 0-dependency result.

#### Acceptance Criteria

1. THE Pipeline SHALL set `CACHE_KEY_VERSION` to 3.
2. THE Pipeline SHALL accept `pyproject.toml` as a manifest format when it validates a stored Scan_Result (`isScanResult` in `pipeline/scan/scan-cache.ts`).
3. WHEN a pyproject dependency has the `versionSpec` `==<v>` (an exact pin from a bare Poetry version or a PEP 440 pin), THE Pipeline SHALL treat it as an Exact_Pin of the ecosystem `pypi` (pipeline R7).
4. WHEN a pyproject dependency has a range `versionSpec` (a translated Poetry caret, tilde or wildcard, or a PEP 508 specifier), THE Pipeline SHALL resolve it with the Range_Resolver of the Accuracy spec, with no change to that resolver.
5. WHEN a Lookup_Target of the ecosystem `pypi` has the `versionSpec` `*` (after trimming) and no other Declared_Range, THE Pipeline SHALL select the default version with Version_Basis `default` and no `range-unresolved` note, for every manifest format, so that `requirements.txt` lines without a specifier and unconstrained pyproject entries behave alike. The behavior for `npm` and `cargo` stays unchanged.
6. WHEN a pyproject dependency has the sourceKind `git` or `path`, THE Pipeline SHALL list it as unassessed with the reason `non-registry-source`, as for `requirements.txt`.
7. THE Pipeline SHALL pass the warnings of the Pyproject_Parser to the Scan_Result `manifests[].warnings` unchanged, so that the UI shows them under "Manifest warnings".
8. WHEN a repository has a root `pyproject.toml` and a root `requirements.txt` that list the same package, THE Pipeline SHALL create one Lookup_Target for it, and an Exact_Pin of one manifest SHALL win over a range of the other (existing `chooseVersion` behavior).
9. WHEN a pypi range contains a prefix clause `==V.*` or `!=V.*` and a candidate version has fewer release parts than `V`, THE range evaluation SHALL zero-pad the candidate's release segment before matching (PEP 440 zero padding). This corrects scan-accuracy behavior: `@renovatebot/pep440` returns false for `1` against `==1.0.*`, so `resolveRange('pypi', ['==1.0.*'], ['1'])` was `unresolved`. The rule applies to every pypi range, including those of `requirements.txt`.
10. WHEN a candidate version has fewer release parts than a version in a pypi range clause, THE range evaluation SHALL compare as if the candidate were zero-padded (PEP 440 release padding), except for `===` clauses. This generalises criterion 9: `@renovatebot/pep440` returns false for `2.0` against `~=2.0.0.0`, although PEP 440 treats `2.0` and `2.0.0.0` as equal. The selected version string stays the original candidate.

### Requirement 11: Property tests and the test-only writer

**User Story:** As a maintainer, I want the parser covered by properties, including a round trip, so that tricky TOML and constraint cases are caught.

#### Acceptance Criteria

1. THE project SHALL provide no production serializer for `pyproject.toml`, because the serializer of the Core exists to test parsers by round trip, writing `pyproject.toml` has no product use, and a second PEP 621 and Poetry writer in `/core` would add code that only tests exercise.
2. THE project SHALL provide the Pyproject_Writer in `tests/support/oracles/pyproject-writer.ts`, with the PEP 621 style (runtime to `[project].dependencies`, optional to `[project.optional-dependencies].extra`, dev to `[dependency-groups].dev`, git and path as `name @ target`) and the Poetry style (runtime and optional to `[tool.poetry.dependencies]`, dev to `[tool.poetry.group.dev.dependencies]`, git and path as `{ git = ... }` and `{ path = ... }`).
3. THE project SHALL provide the Poetry_Reference in `tests/support/oracles/poetry-reference.ts`, written from the Poetry documentation semantics (prefix equality for caret, tilde and wildcard terms, zero-padded tuple comparison for comparison terms) and importing neither the Poetry_Translator nor any range package.
4. THE project SHALL provide one property test file for each of the properties PY-P1 to PY-P10 listed in the design document, each with its tag comment, `// Validates:` line and test titles that start with `PY-P<n>`, and each using `cfg()` from `tests/support/fc-config.ts`.
5. THE project SHALL run each property test with `npm run test:deep -- <files>` in the report task, and SHALL NOT set `FC_NUM_RUNS` in the shell.

### Requirement 12: Fixtures and the live check

**User Story:** As a maintainer, I want a recorded real pyproject repository, so that CI replays a real `pyproject.toml` scan offline.

#### Acceptance Criteria

1. THE project SHALL run a Probe of the candidates `psf/requests` and `revmic/canopy` with `npm run live:report`, and SHALL record the grade, the DEAD, HAUNTED and ALIVE counts, the unassessed count and the manifests read for each.
2. THE project SHALL use `psf/requests` as the Pyproject_Fixture_Set repository WHEN the Probe shows that its root `pyproject.toml` is read and yields at least one dependency. THE project SHALL otherwise choose, in this order, `pallets/flask`, `encode/httpx` and `tiangolo/fastapi`, the first whose Probe shows a root `pyproject.toml` read with at least one dependency, and SHALL state in the report which candidate was chosen and why.
3. THE project SHALL record the Pyproject_Fixture_Set with `npm run fixtures:record` and `GRAVEKEEPER_LIVE_TESTS=1`, with the `kind` `python` in its metadata and `["pyproject.toml"]` in `manifestPaths`, keep it at most `FIXTURE_SET_MAX_BYTES`, and keep the existing three Fixture_Sets unchanged.
4. WHEN the chosen repository has no dependency with `archived` true or `deprecated` true at the recorded asOf, THE project SHALL record the set with the metadata field `requiresFlaggedDependency` set to `false`, and the recorder replay check and the fixture scan test SHALL then require `ok` true and at least one dependency instead of an archived or deprecated one. WHEN the field is absent or `true`, THE recorder and the fixture scan test SHALL keep the rule of pipeline R23.2 and R23.4 unchanged.
5. THE fixture scan test SHALL replay the Pyproject_Fixture_Set twice with empty caches and require deeply equal results (pipeline R23.5), and SHALL require that at least one dependency of the set has a manifest path ending in `pyproject.toml`.
6. THE project SHALL export the replayed scan of the Pyproject_Fixture_Set for the end-to-end suite as `tests/e2e/.generated/scan-<name>.json` through `scripts/export-scan-fixtures.ts`, and SHALL update the tests that count the exported files and rows.
7. THE project SHALL add an end-to-end test `tests/e2e/pyproject.spec.ts` that mocks `POST /api/scan` with the exported body and checks that the results page shows the dependencies, the manifest path `pyproject.toml` in the detail panel of one dependency, and the manifest warnings when the body has some.
8. THE project SHALL add the fixture-based unit tests of the Core parser: a recorded real `pyproject.toml` text (from the Pyproject_Fixture_Set, stored as `tests/fixtures/sample-pyproject.toml`) parses to the expected dependency list, and a second sample in the Poetry style (`tests/fixtures/sample-poetry-pyproject.toml`) parses to the expected list with its warnings.
9. THE live tests that list the fixture repositories (`tests/live/smoke-scan.live.test.ts`) SHALL include the chosen repository and SHALL stay skipped without `GRAVEKEEPER_LIVE_TESTS`.

### Requirement 13: Featured graveyards

**User Story:** As a visitor, I want the featured graveyards to show the most convincing examples, so that the first click is a good one.

#### Acceptance Criteria

1. THE project SHALL compare the chosen repository and `revmic/canopy` from the Probe by (a) the sum of DEAD and HAUNTED, (b) the grade, in this order, and SHALL write the comparison table (both repositories, counts of DEAD, HAUNTED and ALIVE, grade) into `docs/pyproject-report.md`.
2. WHEN the chosen repository is a Convincing_Graveyard against `revmic/canopy`, THE project SHALL replace `https://github.com/revmic/canopy` by the chosen repository URL in `FEATURED_GRAVEYARDS` (same position) and in `ECOSYSTEM_BY_URL` of `components/featured-graveyards.tsx` (`pypi`), and SHALL update every test that names the featured list.
3. WHEN the chosen repository is not a Convincing_Graveyard, THE project SHALL leave `FEATURED_GRAVEYARDS` unchanged.
4. THE project SHALL write into the report which repository stays featured and why, naming the compared numbers.
5. THE project SHALL keep `revmic/canopy` as a Fixture_Set whatever the result (it covers `requirements.txt`).
6. THE project SHALL keep the number of featured entries at three, keep `components/featured-graveyards.tsx` free of any art, palette or layout change, and keep graveyard-ui Properties 14 to 16 passing.

### Requirement 14: Live report

**User Story:** As the project owner, I want a report of a real scan of the chosen repository, so that I can see that the feature works on the live system.

#### Acceptance Criteria

1. THE project SHALL run `npm run live:report` for the chosen repository with `GRAVEKEEPER_LIVE_TESTS=1` and the user-approved `GITHUB_TOKEN`, with the L2 cache off and empty L1 caches, and SHALL write `docs/pyproject-report.md`.
2. THE report SHALL state the grade, the counts ALIVE, HAUNTED and DEAD, the number of unassessed packages, the manifests that were read with their dependency counts, the HAUNTED packages each with its advisory ids and severities, the counts by `versionBasis` (`pinned`, `resolved`, `default`, `null`), the notes by code, the duration of the cold scan in milliseconds and the `X-Gravekeeper-Cache` values of the cold and the repeated scan.
3. THE report SHALL list each property PY-P1 to PY-P10 with the test file, the result of `npm run test:deep -- <file>`, and any counterexample (the shrunk example and the seed) or the statement that none was found.
4. THE report SHALL list the commits of this spec with their hash, subject and the status of the continuous integration run of each pushed commit (from `gh run list`), and SHALL state the status `pending` for a run that has not finished.
5. THE report SHALL NOT contain the token, and the script SHALL abort without writing when the text contains it.
6. THE project SHALL delete the intermediate Probe file `docs/pyproject-probe.md` after the comparison table is in the report.

### Requirement 15: Traceability and regression guard

**User Story:** As a maintainer, I want the new properties traced to their tests and the existing suite to stay green, so that the feature does not weaken what exists.

#### Acceptance Criteria

1. THE project SHALL add `tests/ui/py-traceability.test.ts` in the pattern of `tests/ui/art-traceability.test.ts`: it reads every test file under `tests/`, requires each `PY-P<n>` for n from 1 to 10 in exactly one tag, requires a `// Validates:` line in each tagged file, and requires every test title of a tagged file to start with its `PY-P` number. The folder `tests/ui` is used because the existing traceability tests (`traceability.test.ts` and `art-traceability.test.ts`) live there and scan all of `tests/`.
2. THE project SHALL add a section `pyproject (PY-P1 to PY-P10)` to `docs/property-traceability.md` with one row per property (requirements, test file, test title, status), update the header sentence and the "Properties without a test" list.
3. THE project SHALL keep every existing test passing. A test changes only where `pyproject.toml` legitimately changes a list of formats, a manifest name list, a message text, the cache key version or the featured list.
4. THE project SHALL keep graveyard-ui Properties 14 to 16 and all graveyard-art properties passing without a change of their tests.
5. THE project SHALL NOT change `components/*art*`, `app/globals.css`, the palette tokens or the header layout.
6. THE project SHALL run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run` at each checkpoint, and `npm run test:e2e` at the end.
