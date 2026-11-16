# Requirements Document

## Introduction

This spec covers the pure logic layer of Gravekeeper in `/core`: manifest parsing, dependency health classification with risk scoring, and a repo-level summary. Every function in this spec is pure, performs zero I/O, and receives time and data as arguments (see `structure.md` and `tech.md`).

The feature has three parts:

1. Parse `package.json`, `requirements.txt` and `Cargo.toml` into one normalized dependency list (including the source kind of each dependency), and serialize that list back to each manifest format.
2. Classify a package as ALIVE, HAUNTED or DEAD from normalized health facts, and return a 0-100 risk score with human-readable reasons.
3. Summarize the classifications of all dependencies in a repo, including a repo-level grade.

### Out of Scope

The following are explicitly out of scope for this spec:

- UI: tombstones, ghosts, lanterns, components, layouts and routes.
- Network adapters: OSV.dev, deps.dev, GitHub API, package registries, caching, rate limiting and fixture loading.
- Resurrect: alternative suggestion and manifest patch generation.
- Fetching or computing the normalized health facts. This spec only consumes them.
- Computing `daysSinceLastRelease` and `daysSinceLastCommit` from timestamps. The caller computes these day counts and passes them in as Health_Facts. The Core never reads the system clock.
- Health assessment of `git` and `path` dependencies. The Summarizer reports them as unassessed.
- Lockfiles (`package-lock.json`, `Cargo.lock`, `poetry.lock`) and other manifest formats.
- Version resolution and semver range evaluation.

### Conventions

- Each classification rule is a numbered requirement. Source code cites the requirement number in a comment above the rule (steering rule).
- Criteria tagged **[PBT]** are suitable for property-based testing with fast-check, in files named `<module>.property.test.ts`. Untagged criteria are verified with example-based unit tests.
- Thresholds and weights are named constants (listed in the Constants table) exported from `/core`. Criteria refer to constants by name.

## Glossary

- **Core**: The `/core` module containing all pure logic in this spec.
- **Manifest_Parser**: The Core function that converts manifest text into a Parse_Result.
- **Manifest_Serializer**: The Core function that converts a list of Dependencies into manifest text for a given Manifest_Format.
- **Manifest_Format**: One of `package.json`, `requirements.txt`, `Cargo.toml`.
- **Ecosystem**: One of `npm`, `pypi`, `cargo`. `package.json` maps to `npm`, `requirements.txt` to `pypi`, `Cargo.toml` to `cargo`.
- **Source_Kind**: One of `registry`, `git`, `path`. It states where a Dependency is fetched from: a package registry, a git repository, or a local path.
- **Dependency**: A normalized record with fields `name` (string), `rawName` (string), `ecosystem` (Ecosystem), `versionSpec` (string), `scope` (one of `runtime`, `dev`, `build`, `optional`, `peer`), and `sourceKind` (Source_Kind). `name` is the normalized package name used for identity, ordering and deduplication. `rawName` is the package name spelled as written in the manifest. For `pypi`, `name` is the PEP503_Normalization of `rawName`. For `npm` and `cargo`, `rawName` equals `name` (no normalization is applied; for a `Cargo.toml` entry with a `package` key, both equal the value of `package`). The Manifest_Parser always sets `rawName`. In Manifest_Serializer input, `rawName` is optional.
- **PEP503_Normalization**: The function `normalize(s)` that maps each ASCII letter `A` to `Z` of `s` to its lowercase letter and replaces each run of one or more `-`, `_` and `.` characters with a single `-`. All other characters are unchanged. `normalize` is idempotent.
- **Name_Token**: A string that matches the regular expression `^[A-Za-z0-9][A-Za-z0-9._-]*$`. It is the form of a package name that the requirements.txt grammar accepts.
- **Written_Name**: For a `pypi` Dependency, the string that the Manifest_Serializer writes as the package name in `requirements.txt`: `rawName` when `rawName` is present and `normalize(rawName)` equals `name`, otherwise `name`.
- **Dependency_Key**: The tuple (`name`, `scope`) that uniquely identifies a Dependency within one Parse_Result, where `name` is the normalized name. The `ecosystem` is fixed by the Manifest_Format and is therefore not part of the key. `rawName`, `sourceKind` and `versionSpec` are not part of the Dependency_Key. The same package in different scopes yields separate Dependencies with different Dependency_Keys. Two spellings of one `pypi` package (for example `Foo_Bar` and `foo.bar`) have the same `name` and therefore the same Dependency_Key.
- **Scope_Order**: The fixed order of scope values `runtime`, `dev`, `build`, `optional`, `peer` (constant `SCOPE_ORDER`).
- **Dependency_Order**: The total order on Dependencies used for all parser output: by `name` ascending in Unicode code point order (not UTF-16 code unit order), then by `scope` ascending in Scope_Order. For Dependencies with equal `name` and `scope` (possible only in Serializer input), ties are broken by `ecosystem`, `versionSpec`, `sourceKind` and then `rawName` ascending in code point order, where an absent `rawName` sorts before any present one. `name` is always the normalized name.
- **First_Occurrence**: Among Dependencies with the same Dependency_Key, the one that is first in the order defined for the Manifest_Format: for `package.json` there is no duplicate to decide (criterion 1.11), for `requirements.txt` the one on the earliest line of the manifest text, and for `Cargo.toml` the one that comes first under the position-free rule of criterion 3.18. First_Occurrence decides only which duplicate is kept; it does not determine output order. The Core records no line or column positions for `Cargo.toml` entries.
- **Dependency_Set**: The unordered set of Dependencies in a Parse_Result, compared by the five fields `name` (normalized), `ecosystem`, `versionSpec`, `scope` and `sourceKind`. `rawName` is not part of the comparison (the comparison is made on the projection of each Dependency without `rawName`).
- **Parse_Result**: The object `{ dependencies: Dependency[], warnings: string[] }` returned by the Manifest_Parser. `dependencies` is always sorted in Dependency_Order.
- **Result**: A value of the form `{ ok: true, value }` or `{ ok: false, error }`. A function that returns a Result never throws.
- **Allowed_Packages**: The allow-list of third-party packages that `/core` may import, exported as `CORE_ALLOWED_PACKAGES`. It contains only `smol-toml`, a pure TOML parsing library with no I/O.
- **Representable**: A Dependency is Representable in a Manifest_Format when the Manifest_Serializer can write it so that the Manifest_Parser recovers the five Dependency_Set fields (`rawName` excluded). Criterion 5.13 defines Representable for each format.
- **Valid_Dependency_List**: A list of Dependencies in which every `name` is non-empty and no two Dependencies of the same `ecosystem` share a `name` and `scope`.
- **Health_Facts**: The input record for classification: `daysSinceLastRelease` (number or null), `daysSinceLastCommit` (number or null), `archived` (boolean or null), `deprecated` (boolean or null), `openVulnerabilityCount` (number or null), `maxSeverity` (Severity or null), `maintainerCount` (number or null). A null value means the fact is unknown. Both day counts are supplied by the caller; the Classifier never computes them.
- **Severity**: One of `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, ordered in that sequence from lowest to highest.
- **Status**: One of `ALIVE`, `HAUNTED`, `DEAD`.
- **Classifier**: The Core function that maps Health_Facts to a Classification.
- **Classification**: The object `{ status, score, reasons, vulnerable, abandoned, dormant }`. `status` is a Status, `score` is an integer risk score, `reasons` is an ordered list of Reasons, and `vulnerable`, `abandoned` and `dormant` are booleans.
- **Abandoned**: The Classification flag `abandoned` is true if and only if at least one of the following holds: `archived` is true; `deprecated` is true; or `daysSinceLastRelease` is a Valid_Fact greater than or equal to `ABANDONMENT_DAYS` and `daysSinceLastCommit` is either a Valid_Fact greater than or equal to `STALE_DAYS` or an Unknown_Fact. `maintainerCount` has no influence on `abandoned`.
- **Dormant**: The Classification flag `dormant` is true if and only if `daysSinceLastRelease` is a Valid_Fact greater than or equal to `ABANDONMENT_DAYS` and `daysSinceLastCommit` is a Valid_Fact less than `STALE_DAYS`. A dormant package has old releases but recent commits. `dormant` and the release-based part of Abandoned are mutually exclusive.
- **Reason**: A record `{ ruleId, message, facts }`. `ruleId` is the number of the criterion that produced the Reason (for example `"7.2"`), `message` is a human-readable sentence, and `facts` lists the Health_Facts field names and values that triggered the rule.
- **Risk_Score**: An integer from 0 (lowest risk) to 100 (highest risk) computed by the Classifier as the sum of the Vulnerability_Component, the Abandonment_Component and the Maintainer_Component.
- **Vulnerability_Component**: The part of the Risk_Score derived from open vulnerabilities, from 0 to `VULNERABILITY_POINTS_CAP`. It is strictly greater than 0 when `vulnerable` is true.
- **Abandonment_Component**: The part of the Risk_Score derived from `archived`, `deprecated` and release age, from 0 to `ABANDONMENT_POINTS_CAP`. It is at least `ABANDONED_AGE_POINTS` when `abandoned` is true.
- **Maintainer_Component**: The part of the Risk_Score derived from `maintainerCount`, from 0 to `MAINTAINER_POINTS_CAP`.
- **Valid_Fact**: A Health_Facts field is a Valid_Fact when it is not null and satisfies its type rule: `daysSinceLastRelease` and `daysSinceLastCommit` are finite numbers greater than or equal to 0; `openVulnerabilityCount` and `maintainerCount` are finite integers greater than or equal to 0; `archived` and `deprecated` are booleans; `maxSeverity` is a Severity. Any other value is an Unknown_Fact.
- **Unknown_Fact**: A Health_Facts field that is null, missing, or not a Valid_Fact. Unknown_Facts are reported by the Reason with `ruleId` `6.3`, which lists every Unknown_Fact field name, including `daysSinceLastCommit`.
- **Summarizer**: The Core function that aggregates Assessed_Dependencies into a Repo_Summary.
- **Assessed_Dependency**: An input record `{ dependency, classification }` where `dependency` is a Dependency (including `sourceKind`) and `classification` is a Classification or null when no Health_Facts were available. The Summarizer receives one Assessed_Dependency per Dependency, so the same package may appear several times with different scopes.
- **Package_Key**: The tuple (`ecosystem`, `name`, `sourceKind`) that identifies a Unique_Package in the Summarizer. `scope` and `versionSpec` are not part of the Package_Key. `ecosystem` is included because one Repo_Summary can cover several manifests.
- **Unique_Package**: The record `{ name, ecosystem, sourceKind, scopes, classification }` that the Summarizer builds for each distinct Package_Key. `scopes` is the set of scopes in which the package appears, as a list without repeats sorted in Scope_Order. `classification` is the Merged_Classification of the Assessed_Dependencies in the group, or null.
- **Merged_Classification**: The Classification chosen for a Unique_Package from its Assessed_Dependencies whose `classification` is not null: the highest-risk one, chosen by the total order of criterion 12.22 (highest Risk_Score, then Status precedence `HAUNTED`, `DEAD`, `ALIVE`, then Classification_Tie_Key ascending, then Classification_Canonical_Key ascending). When every `classification` in the group is null, the Merged_Classification is null.
- **Classification_Tie_Key**: The tuple of the three flags `vulnerable`, `abandoned`, `dormant` (false before true), followed by the `ruleId` list of the Reasons joined by `,` and compared in code point order. It makes the Merged_Classification independent of input order, except between Classifications that share all of these values.
- **Classification_Canonical_Key**: The canonical JSON text of a whole Classification: JSON with no insignificant whitespace in which the keys of every object, at every depth, are in ascending code point order, and the order of array elements (such as `reasons`) is kept. Comparing two Classification_Canonical_Keys in code point order is a deterministic total order over the full Classification. Two Classifications with equal Classification_Canonical_Keys are deeply equal.
- **Assessed_Package**: A Unique_Package that is assessed: its `sourceKind` is `registry` and its Merged_Classification is not null.
- **Unassessed_Reason**: One of `non-registry-source` (the Unique_Package has `sourceKind` `git` or `path`) or `no-health-data` (the Unique_Package has `sourceKind` `registry` and a null Merged_Classification). A non-registry source takes precedence over missing data.
- **Unassessed_Item**: A record `{ name, ecosystem, sourceKind, scopes, unassessedReason }` in `Repo_Summary.unassessedItems`, where `unassessedReason` is an Unassessed_Reason.
- **Ranked_Package**: A record `{ name, ecosystem, sourceKind, scopes, classification }` in `Repo_Summary.worst`, where `classification` is the Merged_Classification of an Assessed_Package.
- **Grade**: One of `A`, `B`, `C`, `D`, `F`, ordered from best (`A`) to worst (`F`).
- **Grade_Function**: The Core function `grade(score)` that maps an integer score from 0 to 100 to a Grade using the single threshold set `GRADE_A_MAX`, `GRADE_B_MAX`, `GRADE_C_MAX` and `GRADE_D_MAX` (criterion 12.15).
- **Average_Grade**: The Grade computed as `grade(averageScore)`.
- **Worst_Grade**: The Grade computed as `grade(maxScore)`.
- **Repo_Summary**: The object `{ total, assessed, unassessed, counts, averageScore, maxScore, maxScorePackage, grade, worst, unassessedItems }` produced by the Summarizer. `total` is the number of Unique_Packages, `assessed` is the number of Assessed_Packages and `unassessed` is `total` minus `assessed`.

## Constants

All constants are exported from `/core` and are the single source of truth for thresholds and weights.

| Constant | Value | Meaning |
|---|---|---|
| `ABANDONMENT_DAYS` | 730 | `daysSinceLastRelease` at or above this value marks the release history as abandoned (abandoned when also commit-stale or commit-unknown, otherwise dormant). |
| `STALE_DAYS` | 365 | For `daysSinceLastCommit`: at or above this value is commit-stale. For `daysSinceLastRelease`: at or above this value and below `ABANDONMENT_DAYS` is stale. |
| `SEVERITY_POINTS` | LOW 10, MEDIUM 20, HIGH 35, CRITICAL 50 | Points for the maximum vulnerability severity. |
| `DEFAULT_SEVERITY` | MEDIUM | Severity assumed when vulnerabilities exist and `maxSeverity` is an Unknown_Fact. |
| `VULN_COUNT_POINTS_EACH` | 2 | Extra points per open vulnerability beyond the first. |
| `VULN_COUNT_POINTS_CAP` | 5 | Maximum extra points from vulnerability count. |
| `VULNERABILITY_POINTS_CAP` | 55 | Cap of the Vulnerability_Component. Equals the highest `SEVERITY_POINTS` (50) plus `VULN_COUNT_POINTS_CAP` (5). |
| `ARCHIVED_POINTS` | 30 | Abandonment points when the package is archived. |
| `DEPRECATED_POINTS` | 25 | Abandonment points when the package is deprecated. |
| `ABANDONED_AGE_POINTS` | 20 | Abandonment points when the release-based abandonment condition holds (criterion 8.3). |
| `DORMANT_RELEASE_POINTS` | 10 | Small abandonment-side penalty when the package is dormant (criterion 8.4). Replaces, and is never added to, `ABANDONED_AGE_POINTS` and `STALE_AGE_POINTS`. |
| `STALE_AGE_POINTS` | 10 | Abandonment points when `daysSinceLastRelease` is at least `STALE_DAYS` and less than `ABANDONMENT_DAYS`. |
| `ABANDONMENT_POINTS_CAP` | 30 | Cap of the Abandonment_Component. |
| `NO_MAINTAINER_POINTS` | 15 | Points when `maintainerCount` is 0. Adds points only; it does not set `abandoned`. |
| `SINGLE_MAINTAINER_POINTS` | 5 | Points when `maintainerCount` is 1. |
| `MAINTAINER_POINTS_CAP` | 15 | Cap of the Maintainer_Component. Equals `NO_MAINTAINER_POINTS`. |
| `GRADE_A_MAX` | 19 | Largest score that earns Grade `A` (scores 0 to 19). |
| `GRADE_B_MAX` | 39 | Largest score that earns Grade `B` (scores 20 to 39). |
| `GRADE_C_MAX` | 59 | Largest score that earns Grade `C` (scores 40 to 59). |
| `GRADE_D_MAX` | 79 | Largest score that earns Grade `D` (scores 60 to 79). A larger score (80 to 100) earns `F`. |
| `MAX_MANIFEST_LENGTH` | 1000000 | Maximum manifest text length in characters that the Manifest_Parser processes. |
| `WORST_LIST_SIZE` | 10 | Maximum number of entries in `Repo_Summary.worst`. |
| `SCOPE_ORDER` | runtime, dev, build, optional, peer | Fixed order of scope values used by Dependency_Order and by `scopes` in Unique_Package. |
| `CORE_ALLOWED_PACKAGES` | smol-toml | Third-party packages that `/core` may import. The version of each is pinned exactly in `package.json` (no `^`, `~` or range). The version of `smol-toml` is the latest stable release at install time (criterion 13.10). |
| `MAX_SERIALIZED_DEPENDENCIES` | 10000 | Maximum number of Dependencies the Manifest_Serializer accepts. |

Constant consistency rules (verified by unit tests in criterion 10.21):

- `VULNERABILITY_POINTS_CAP + ABANDONMENT_POINTS_CAP + MAINTAINER_POINTS_CAP` = 55 + 30 + 15 = 100. The maximum Risk_Score before clamping is therefore 100, and clamping never changes a score.
- `STALE_AGE_POINTS` (10) <= `DORMANT_RELEASE_POINTS` (10) < `ABANDONED_AGE_POINTS` (20). This keeps the score from falling when `daysSinceLastRelease` grows.
- `DORMANT_RELEASE_POINTS` (10) < `ABANDONED_AGE_POINTS` (20) <= `ABANDONMENT_POINTS_CAP` (30), and `DORMANT_RELEASE_POINTS` < `min(ARCHIVED_POINTS, DEPRECATED_POINTS)` (25). The Abandonment_Component of an abandoned package therefore always exceeds that of the same package with abandonment removed.
- `0 <= GRADE_A_MAX < GRADE_B_MAX < GRADE_C_MAX < GRADE_D_MAX < 100`, so that every integer score from 0 to 100 maps to exactly one Grade and `F` is reachable.
- The lowest `SEVERITY_POINTS` value (10) is greater than 0. The Vulnerability_Component of a vulnerable package is therefore always greater than 0.

## Requirements

### Requirement 1: Parse package.json

**User Story:** As a developer, I want `package.json` dependencies extracted into a normalized list, so that npm packages can be assessed like any other ecosystem.

#### Acceptance Criteria

1. WHEN valid `package.json` text is provided, THE Manifest_Parser SHALL return one Dependency with `ecosystem` equal to `npm` for each entry in the `dependencies`, `devDependencies`, `optionalDependencies` and `peerDependencies` objects, with `name` equal to the entry's key exactly as written.
2. WHEN valid `package.json` text is provided, THE Manifest_Parser SHALL set `scope` to `runtime` for `dependencies`, `dev` for `devDependencies`, `optional` for `optionalDependencies` and `peer` for `peerDependencies`.
3. WHEN valid `package.json` text is provided, THE Manifest_Parser SHALL set `versionSpec` to the entry's string value exactly as written in `package.json`, with no trimming, case change or normalization, including when the value is an empty string.
4. IF a dependency entry in `package.json` has a non-string value, THEN THE Manifest_Parser SHALL omit that entry, add exactly one warning naming the package and its section, and continue parsing the remaining entries.
5. IF a dependency section in `package.json` is present but is not a JSON object (including `null`, an array, a string, a number or a boolean), THEN THE Manifest_Parser SHALL omit that section, add exactly one warning naming the section, and continue parsing the remaining sections.
6. IF `package.json` text is not valid JSON, is empty, or its top-level value is not a JSON object, THEN THE Manifest_Parser SHALL return an empty `dependencies` list and exactly one warning describing the failure, without throwing an exception.
7. WHEN valid `package.json` text contains none of the four dependency sections, or contains sections with zero entries, THE Manifest_Parser SHALL return an empty `dependencies` list and zero warnings.
8. WHEN the same package name appears in more than one dependency section, THE Manifest_Parser SHALL return one Dependency for each section in which it appears, each with the `scope` of its own section.
9. WHEN a `package.json` entry value is parsed, THE Manifest_Parser SHALL set `sourceKind` by applying the following checks in order to the exact value string: `path` if the value starts with `file:`, `link:` or `workspace:`; otherwise `git` if the value starts with `git+`, `git://`, `github:`, `gitlab:` or `bitbucket:`, or matches the GitHub shorthand `<user>/<repo>` (one `/`, with `<user>` and `<repo>` each consisting of 1 or more characters from letters, digits, `.`, `_` and `-`, optionally followed by `#<ref>`); otherwise `registry`.
10. THE Manifest_Parser SHALL preserve `git` and `path` entries of `package.json` as Dependencies with the matching `sourceKind` and with `versionSpec` equal to the value as written, and SHALL NOT omit them or add a warning for them.
11. WHEN a `package.json` dependency section contains the same key more than once, THE Manifest_Parser SHALL use the value that the JSON parser assigns to that key (the last value in the text) and add no duplicate warning. This is the only exception to criterion 4.6, because the JSON parser does not expose duplicate keys.
12. WHEN valid `package.json` text is provided, THE Manifest_Parser SHALL set `rawName` of each Dependency equal to `name`, and SHALL NOT normalize `name`.

### Requirement 2: Parse requirements.txt

**User Story:** As a developer, I want `requirements.txt` lines extracted into a normalized list, so that Python packages can be assessed.

#### Acceptance Criteria

1. WHEN `requirements.txt` text is provided, THE Manifest_Parser SHALL return one Dependency with `ecosystem` equal to `pypi` and `scope` equal to `runtime` for each line that parses as a requirement, subject to criterion 4.6 for repeated names.
2. THE Manifest_Parser SHALL set `name` of each `pypi` Dependency to the PEP503_Normalization of the package name as written, and SHALL set `rawName` to the package name exactly as written (for example `Django`, `PyYAML`, `SQLAlchemy`), without rejecting a name because it is not normalized.
3. THE Manifest_Parser SHALL set `versionSpec` of each `registry` Dependency to the version specifier text following the package name (for example `>=2.0,<3`), with extras, environment markers (the text after `;`) and surrounding whitespace removed, or to `*` when no specifier is present.
4. WHEN a requirement line contains an extras list such as `requests[security]`, THE Manifest_Parser SHALL exclude the bracketed extras list from `name` and from `versionSpec`.
5. WHEN a line contains `#` at the start of the line or preceded by whitespace, THE Manifest_Parser SHALL ignore the `#` and all text after it on that line before parsing.
6. WHEN a line ends with a backslash, THE Manifest_Parser SHALL remove the backslash and join the line with the following line before parsing, repeating for consecutive continuation lines, and SHALL count the joined lines as one requirement line.
7. WHEN a line is blank, contains only whitespace, or begins with `-` after leading whitespace is trimmed (option lines such as `-r`, `-e`, `--index-url`), THE Manifest_Parser SHALL skip the line without adding a Dependency and without adding a warning.
8. IF a non-blank line cannot be parsed as a requirement (including a line whose package name is not a Name_Token, a direct reference `<name> @ <target>` whose target is neither a VCS URL nor a local path as defined in criteria 2.10 and 2.11, a bare VCS URL or local path without an `#egg=<name>` fragment, and a registry line whose text after the name and extras is not empty, not `*` and does not start with a comparison operator `==`, `!=`, `<=`, `>=`, `<`, `>`, `~=` or `===`, for example `foo 1.0`), THEN THE Manifest_Parser SHALL skip the line, continue parsing the remaining lines, and add exactly one warning that includes the 1-based number of that line in the original input (the first line of the group for a joined line).
9. IF a line ends with a backslash and no following line exists, THEN THE Manifest_Parser SHALL parse the line without the trailing backslash.
10. WHEN a line is a direct reference `<name> @ <target>` whose trimmed `<target>` starts with `git+`, or is a bare VCS URL starting with `git+` that carries an `#egg=<name>` fragment, THE Manifest_Parser SHALL return a Dependency with `sourceKind` equal to `git`, `rawName` taken as written from `<name>` or from the `egg` fragment, `name` equal to its PEP503_Normalization (criterion 2.2), and `versionSpec` equal to the trimmed `<target>` or the trimmed bare URL exactly as written.
11. WHEN a line is a direct reference `<name> @ <target>` whose trimmed `<target>` starts with `file:`, `./`, `../` or `/`, or is a bare local path starting with `./`, `../` or `/` that carries an `#egg=<name>` fragment, THE Manifest_Parser SHALL return a Dependency with `sourceKind` equal to `path`, `rawName` taken as written from `<name>` or from the `egg` fragment, `name` equal to its PEP503_Normalization (criterion 2.2), and `versionSpec` equal to the trimmed `<target>` or the trimmed bare path exactly as written.
12. WHEN a line parses as a requirement and is neither a git nor a path reference, THE Manifest_Parser SHALL return a Dependency with `sourceKind` equal to `registry`.
13. IF the `versionSpec` of a requirement (of any `sourceKind`: `registry`, `git` or `path`) still contains a backslash after continuation joining (criterion 2.6), THEN THE Manifest_Parser SHALL skip the line, continue parsing the remaining lines, and add exactly one warning that includes the 1-based number of that line in the original input (the first line of the group for a joined line).
14. [PBT] FOR ALL strings `s`, `normalize(normalize(s))` SHALL equal `normalize(s)` (idempotence of PEP503_Normalization), and FOR ALL inputs, every `pypi` Dependency returned by the Manifest_Parser SHALL satisfy `normalize(rawName)` equal to `name`.

### Requirement 3: Parse Cargo.toml

**User Story:** As a developer, I want `Cargo.toml` dependencies extracted into a normalized list, so that Rust crates can be assessed.

#### Acceptance Criteria

1. WHEN valid `Cargo.toml` text is provided, THE Manifest_Parser SHALL return one Dependency with `ecosystem` equal to `cargo` for each entry in the `[dependencies]`, `[dev-dependencies]` and `[build-dependencies]` tables, subject to criteria 3.8 and 4.6.
2. WHEN valid `Cargo.toml` text is provided that contains none of the `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]` or `[target.<cfg>.*]` dependency tables, or contains only empty ones, THE Manifest_Parser SHALL return an empty `dependencies` list and zero warnings.
3. THE Manifest_Parser SHALL set `scope` to `runtime` for `[dependencies]`, `dev` for `[dev-dependencies]` and `build` for `[build-dependencies]`.
4. WHEN a dependency value is a string, THE Manifest_Parser SHALL set `versionSpec` to that string and `sourceKind` to `registry`.
5. WHEN a dependency value is a table with a `version` key whose value is a string and without a `git` key and without a `path` key, THE Manifest_Parser SHALL set `versionSpec` to the value of `version` and `sourceKind` to `registry`.
6. WHEN a dependency value is a table without a `version` key, without a `git` key and without a `path` key, THE Manifest_Parser SHALL set `versionSpec` to `*` and `sourceKind` to `registry`.
7. WHEN a dependency value is a table with a `package` key whose value is a string, THE Manifest_Parser SHALL set `name` to the value of `package` instead of the table key.
8. WHEN dependency tables are declared under `[target.<cfg>.dependencies]`, `[target.<cfg>.dev-dependencies]` or `[target.<cfg>.build-dependencies]`, THE Manifest_Parser SHALL include those entries using the scope of the matching table name (`runtime` for `dependencies`, `dev` for `dev-dependencies`, `build` for `build-dependencies`), regardless of `<cfg>`. A crate that appears in `[dependencies]` and in `[target.<cfg>.dependencies]`, or in two different `<cfg>` tables of the same kind, therefore has the same Dependency_Key and is a duplicate under criterion 4.6, where First_Occurrence is defined by criterion 3.18. A crate that appears in tables of different kinds yields a separate Dependency for each scope.
9. IF `Cargo.toml` text is not valid TOML, THEN THE Manifest_Parser SHALL return an empty `dependencies` list and exactly one warning that identifies the TOML syntax failure, without throwing an exception. The warning includes a line number only when the error reported by `smol-toml` provides one; the Manifest_Parser performs no scan of its own to find a line number, and omits the line number otherwise.
10. IF a dependency entry's `version`, `package`, `git` or `path` value is not a string, THEN THE Manifest_Parser SHALL omit that entry from `dependencies`, add one warning naming the dependency key, and continue processing the remaining entries.
11. WHEN a dependency value is a table with a `git` key whose value is a string, THE Manifest_Parser SHALL set `sourceKind` to `git` and `versionSpec` to the value of `git`, regardless of any `path` or `version` key in the same table.
12. WHEN a dependency value is a table with a `path` key whose value is a string and without a `git` key, THE Manifest_Parser SHALL set `sourceKind` to `path` and `versionSpec` to the value of `path`, regardless of any `version` key in the same table.
13. THE Manifest_Parser SHALL preserve `git` and `path` entries of `Cargo.toml` as Dependencies with the matching `sourceKind`, and SHALL NOT omit them or add a warning for them.
14. IF a dependency value in `Cargo.toml` is neither a string nor a table, or a dependency section is present but is not a table, THEN THE Manifest_Parser SHALL omit that entry or section, add exactly one warning naming the dependency key or the section, and continue processing the remaining entries.
15. THE Manifest_Parser SHALL parse `Cargo.toml` text with `smol-toml`, the accepted TOML parser inside `/core`, and SHALL call `smol-toml` only through one wrapper function that catches every exception and returns a Result, so that no call to `smol-toml` throws. The version of `smol-toml` is the latest stable release at install time and is pinned exactly, as defined in criterion 13.10.
16. IF the `name` or the `versionSpec` of a `Cargo.toml` dependency entry contains a lone (unpaired) UTF-16 surrogate code unit, THEN THE Manifest_Parser SHALL omit that entry, add exactly one warning naming the dependency key, and continue processing the remaining entries.
17. WHEN a `Cargo.toml` dependency entry is returned, THE Manifest_Parser SHALL set `rawName` equal to `name`, and SHALL NOT normalize `name`.
18. WHEN two or more `Cargo.toml` entries have the same Dependency_Key, THE Manifest_Parser SHALL decide the First_Occurrence without line or column positions, in this order: within one scope, the top-level table (`[dependencies]`, `[dev-dependencies]` or `[build-dependencies]`) comes before every `[target.<cfg>.*]` table of that scope; the `[target.<cfg>.*]` tables of that scope are taken in the key enumeration order that `smol-toml` returns for the `target` table; and within one table, the entries are taken in the key enumeration order that `smol-toml` returns for that table. The Manifest_Parser SHALL NOT use the order of table headers in the text.
19. WHEN a `Cargo.toml` warning refers to a dependency entry, THE Manifest_Parser SHALL name the package and the table of the entry, without a line or column (for example `Cargo.toml table [target.'cfg(unix)'.dependencies]: duplicate dependency "serde" in scope "runtime"`).

### Requirement 4: Normalization, Safety and Determinism of Parsing

**User Story:** As a maintainer, I want parsing to be safe on untrusted input and produce consistent output, so that a hostile or malformed manifest cannot break the app.

#### Acceptance Criteria

1. THE Manifest_Parser SHALL accept the Manifest_Format as an explicit argument and SHALL NOT infer the Manifest_Format from the manifest text.
2. [PBT] FOR ALL strings of length 0 to `MAX_MANIFEST_LENGTH` and every Manifest_Format, THE Manifest_Parser SHALL return a Parse_Result and SHALL NOT throw. The property generators may be bounded to 20,000 characters for speed; the boundary at `MAX_MANIFEST_LENGTH` is verified by example-based tests.
3. [PBT] FOR ALL inputs that are not strings (null, undefined, numbers, booleans, arrays, objects) and every Manifest_Format, THE Manifest_Parser SHALL return a Parse_Result with an empty `dependencies` list and exactly one warning indicating that the input is not a string, and SHALL NOT throw.
4. IF the manifest text length exceeds `MAX_MANIFEST_LENGTH`, THEN THE Manifest_Parser SHALL return a Parse_Result with an empty `dependencies` list and exactly one warning stating the value of `MAX_MANIFEST_LENGTH`, and SHALL NOT throw.
5. [PBT] FOR ALL inputs, THE Manifest_Parser SHALL return only Dependencies that have a `name` and a `rawName` of at least 1 character each, an `ecosystem` equal to the requested Manifest_Format, a `scope` that is one of the defined scope values, and a `sourceKind` that is one of `registry`, `git` and `path`.
6. [PBT] FOR ALL inputs, THE Manifest_Parser SHALL return at most one Dependency per Dependency_Key (`name`, `scope`), SHALL keep the First_Occurrence and discard later occurrences regardless of the `sourceKind` of the occurrences, and SHALL add exactly one warning for each discarded occurrence that names the package and the scope. The Dependency_Key uses the normalized `name`, so two spellings of one `pypi` package in the same scope (for example `Foo_Bar` and `foo.bar`) are duplicates: the Manifest_Parser SHALL keep the First_Occurrence (for `requirements.txt` the one that appears first in the text) and add exactly one warning for the other. For `Cargo.toml`, First_Occurrence is defined by criterion 3.18. The exception for duplicate keys in a JSON object is defined in criterion 1.11.
7. [PBT] FOR ALL inputs, THE Manifest_Parser SHALL return deeply equal Parse_Results (same `dependencies`, same order, same warnings) when invoked twice with the same arguments.
8. [PBT] FOR ALL inputs, THE Manifest_Parser SHALL return `dependencies` sorted in Dependency_Order (by normalized `name` ascending in Unicode code point order, then by `scope` in Scope_Order), regardless of the order of the entries in the manifest text.
9. IF a dependency name equals `__proto__`, `constructor` or `prototype`, THEN THE Manifest_Parser SHALL include it in `dependencies` as an ordinary Dependency with that exact name, and SHALL NOT modify `Object.prototype` or the prototype of any returned object.
10. IF a dependency entry has an empty name, THEN THE Manifest_Parser SHALL omit that entry and add exactly one warning naming the section or line.

### Requirement 5: Serialize Manifests and Round Trip

**User Story:** As a developer, I want the normalized list written back to a manifest, so that parsing can be verified by round trip and later features can reuse the writer.

#### Acceptance Criteria

1. WHEN a list of 0 to `MAX_SERIALIZED_DEPENDENCIES` Dependencies and a Manifest_Format are provided, THE Manifest_Serializer SHALL return manifest text in that format containing each Dependency whose `ecosystem` matches the format, whose `scope` is supported by the format, and that is Representable in the format, subject to the deduplication of criterion 5.2.
2. WHEN a list of Dependencies and a Manifest_Format are provided, THE Manifest_Serializer SHALL build the output in this order: first, filter the list, keeping only Dependencies whose `ecosystem` matches the format, whose `scope` is supported by the format and that are Representable in the format; second, sort the remaining Dependencies in Dependency_Order; third, deduplicate by Dependency_Key (`name`, `scope`), keeping the first Dependency of each key in that order. THE Manifest_Serializer SHALL omit every other Dependency from the output text and SHALL NOT raise an error. A Representable Dependency that repeats the Dependency_Key of an earlier non-Representable Dependency therefore survives, and a Dependency is dropped as a duplicate only when an earlier Representable Dependency has the same Dependency_Key.
3. WHEN the provided list is empty or contains no Dependency matching the format, THE Manifest_Serializer SHALL return valid, parseable manifest text in the requested format that parses to an empty Dependency_Set.
4. WHEN the Manifest_Format is `package.json`, THE Manifest_Serializer SHALL write each Dependency into the section matching its `scope`.
5. WHEN the Manifest_Format is `Cargo.toml`, THE Manifest_Serializer SHALL write each Dependency into the table matching its `scope`.
6. WHEN the Manifest_Format is `requirements.txt`, THE Manifest_Serializer SHALL write exactly one requirement per line, with each line terminated by a single newline character and no blank lines between requirements.
7. IF the provided Manifest_Format is not one of the supported formats, THEN THE Manifest_Serializer SHALL return an error indicating the format is unsupported and SHALL NOT return any manifest text.
8. [PBT] FOR ALL Valid_Dependency_Lists, parsing the serialized manifest SHALL return a Dependency_Set (set equality, independent of order) equal to the input Dependency_Set restricted to the Manifest_Format's `ecosystem`, supported scopes and Representable Dependencies, with equality covering the normalized `name`, `versionSpec`, `scope` and `sourceKind` and excluding `rawName` (round-trip property).
9. [PBT] FOR ALL strings and every Manifest_Format, parse(serialize(parse(x))) SHALL equal parse(x) as a Dependency_Set, with equality covering the normalized `name`, `versionSpec`, `scope` and `sourceKind` and excluding `rawName`.
10. [PBT] FOR ALL Valid_Dependency_Lists, serializing the output of a parse of a serialized manifest SHALL return text identical to the first serialized text (idempotence).
11. THE Manifest_Serializer SHALL preserve `versionSpec` character for character, and SHALL preserve the name character for character (`name` for `package.json` and `Cargo.toml`, the Written_Name for `requirements.txt`), escaping characters as required by the target format so that the parser recovers the original values. For `requirements.txt` the Manifest_Serializer SHALL write `rawName` when `rawName` is present and its PEP503_Normalization equals `name`, and otherwise SHALL write `name`; for `package.json` and `Cargo.toml` the Manifest_Serializer SHALL ignore `rawName`.
12. THE Manifest_Serializer SHALL produce byte-identical text for the same input list and Manifest_Format on every invocation, writing Dependencies in Dependency_Order (by normalized `name` ascending in Unicode code point order, then by `scope` in Scope_Order), so that within each section or table the entries are sorted by `name`, and sections or tables appear in Scope_Order. The Manifest_Parser applied to the serialized text therefore returns `dependencies` in the same order as the Dependency_Order of the input restricted per criterion 5.1.
13. THE Manifest_Serializer SHALL treat a Dependency as Representable according to the Manifest_Format: for `package.json`, when the classification of `versionSpec` by criterion 1.9 equals `sourceKind`; for `requirements.txt`, when `versionSpec` starts with `git+` if and only if `sourceKind` is `git`, `versionSpec` starts with `file:`, `./`, `../` or `/` if and only if `sourceKind` is `path`, and neither holds if `sourceKind` is `registry`; for `Cargo.toml`, for every `sourceKind`. In addition, for every format the `name` SHALL be non-empty; for `requirements.txt` the Written_Name SHALL be a Name_Token whose PEP503_Normalization equals `name` (a non-normalized `name` without a matching `rawName` is therefore not Representable, while a parsed Dependency such as `Django` with `name` `django` is), the `versionSpec` SHALL contain no newline and no backslash, `versionSpec` SHALL have no leading or trailing whitespace, a `registry` `versionSpec` SHALL be `*` or start with a comparison operator as defined in criterion 2.8, a `registry` `versionSpec` SHALL contain no `;` and no `#` preceded by whitespace, and a `git` or `path` `versionSpec` SHALL contain no whitespace followed by `;` or `#`; for `Cargo.toml` the `name` and `versionSpec` SHALL contain no lone surrogate code unit.
14. WHEN the Manifest_Format is `Cargo.toml` and a Dependency has `sourceKind` `git`, THE Manifest_Serializer SHALL write the entry as an inline table with a `git` key whose value is `versionSpec`, so that the parser recovers `sourceKind` `git` and the same `versionSpec` (criterion 3.11).
15. WHEN the Manifest_Format is `Cargo.toml` and a Dependency has `sourceKind` `path`, THE Manifest_Serializer SHALL write the entry as an inline table with a `path` key whose value is `versionSpec`, so that the parser recovers `sourceKind` `path` and the same `versionSpec` (criterion 3.12).
16. WHEN the Manifest_Format is `Cargo.toml` and a Dependency has `sourceKind` `registry`, THE Manifest_Serializer SHALL write the entry as a string value equal to `versionSpec`.
17. WHEN the Manifest_Format is `requirements.txt` and a Dependency has `sourceKind` `git` or `path`, THE Manifest_Serializer SHALL write the requirement as `<Written_Name> @ <versionSpec>`, so that the parser recovers `sourceKind` and the same `versionSpec` (criteria 2.10 and 2.11).
18. WHEN the Manifest_Format is `package.json`, THE Manifest_Serializer SHALL write `versionSpec` of every Dependency, including `git` and `path` entries, as the string value of the entry, so that criterion 1.9 recovers `sourceKind`.
19. IF the provided list contains more than `MAX_SERIALIZED_DEPENDENCIES` Dependencies, THEN THE Manifest_Serializer SHALL return an error indicating that the list is too large and SHALL NOT return any manifest text.

### Requirement 6: Classification Inputs and Unknown Facts

**User Story:** As a maintainer, I want classification to tolerate missing or bad data, so that partial results are shown instead of an error.

#### Acceptance Criteria

1. THE Classifier SHALL accept Health_Facts as its only input and SHALL NOT read the system clock, make network requests, or read from or write to the file system during classification.
2. IF a Health_Facts field is an Unknown_Fact, THEN THE Classifier SHALL assign that field 0 points to the Risk_Score and SHALL NOT fire any rule that depends on that field, except that criterion 8.3 SHALL treat an Unknown_Fact `daysSinceLastCommit` as satisfying its commit condition.
3. IF at least one Health_Facts field is an Unknown_Fact, THEN THE Classifier SHALL add exactly one Reason with `ruleId` `6.3` to the Classification, and that Reason SHALL list the name of each Unknown_Fact field exactly once.
4. [PBT] FOR ALL Health_Facts values, including null, undefined, NaN, negative numbers, positive and negative infinity, and fields whose type differs from the expected type, THE Classifier SHALL return a Classification and SHALL NOT throw an exception.
5. IF every Health_Facts field is an Unknown_Fact, THEN THE Classifier SHALL return status `ALIVE`, a Risk_Score of 0, and exactly one Reason, the one with `ruleId` `6.3`.
6. IF a Health_Facts field has a wrong type, or a numeric value that is NaN, infinite, or outside its valid range, THEN THE Classifier SHALL treat that field as an Unknown_Fact.
7. THE Classifier SHALL take every time value (`daysSinceLastRelease` and `daysSinceLastCommit`) as an input fact, SHALL NOT compute a day count from a timestamp, and SHALL NOT read the system clock. Computing day counts from timestamps is the caller's responsibility and is out of scope.

### Requirement 7: HAUNTED Rule

**User Story:** As a maintainer, I want packages with unpatched vulnerabilities flagged, so that I can find supply chain exposure.

#### Acceptance Criteria

1. WHEN `openVulnerabilityCount` is a Valid_Fact that is an integer greater than or equal to 1, THE Classifier SHALL set `vulnerable` to true.
2. WHEN `vulnerable` is true and `maxSeverity` is a Valid_Fact, THE Classifier SHALL add exactly one Reason with `ruleId` `7.2` that states the value of `openVulnerabilityCount` and the value of `maxSeverity`.
3. WHEN `vulnerable` is true and `maxSeverity` is an Unknown_Fact, THE Classifier SHALL use `DEFAULT_SEVERITY` as the maximum severity and add exactly one Reason with `ruleId` `7.2` that states the value of `openVulnerabilityCount`, the value of `DEFAULT_SEVERITY`, and that the severity is assumed.
4. WHEN `openVulnerabilityCount` is a Valid_Fact equal to 0, THE Classifier SHALL set `vulnerable` to false, ignore `maxSeverity`, and add no Reason with `ruleId` `7.2`.
5. IF `openVulnerabilityCount` is an Unknown_Fact, a negative number, or a non-integer value, THEN THE Classifier SHALL set `vulnerable` to false, add no Reason with `ruleId` `7.2`, and leave all other classification results unchanged.

### Requirement 8: DEAD Rule

**User Story:** As a maintainer, I want abandoned packages flagged without false alarms for packages that still receive commits, so that I can plan replacements before problems appear.

#### Acceptance Criteria

1. WHEN `archived` is true, THE Classifier SHALL set `abandoned` to true and add one Reason with `ruleId` `8.1`.
2. WHEN `deprecated` is true, THE Classifier SHALL set `abandoned` to true and add one Reason with `ruleId` `8.2`.
3. WHEN `daysSinceLastRelease` is a Valid_Fact greater than or equal to `ABANDONMENT_DAYS` and `daysSinceLastCommit` is either a Valid_Fact greater than or equal to `STALE_DAYS` or an Unknown_Fact, THE Classifier SHALL set `abandoned` to true and add one Reason with `ruleId` `8.3` that states the value of `daysSinceLastRelease`, the value of `ABANDONMENT_DAYS`, and either the value of `daysSinceLastCommit` or that it is unknown and assumed stale.
4. WHEN `daysSinceLastRelease` is a Valid_Fact greater than or equal to `ABANDONMENT_DAYS` and `daysSinceLastCommit` is a Valid_Fact less than `STALE_DAYS`, THE Classifier SHALL set `dormant` to true and add one Reason with `ruleId` `8.4` that states the value of `daysSinceLastRelease`, the value of `daysSinceLastCommit` and that releases are dormant. The Reason SHALL NOT by itself set `abandoned` to true.
5. WHEN more than one of the conditions in criteria 1 to 3 is met for the same package, THE Classifier SHALL add one Reason for each met condition and SHALL set `abandoned` to true.
6. WHEN none of the conditions in criteria 1 to 3 is met, THE Classifier SHALL set `abandoned` to false and add no Reason with `ruleId` `8.1`, `8.2` or `8.3`.
7. WHEN `daysSinceLastRelease` equals `ABANDONMENT_DAYS` minus 1, THE Classifier SHALL add no Reason with `ruleId` `8.3` and no Reason with `ruleId` `8.4`.
8. WHEN `daysSinceLastRelease` is a Valid_Fact greater than or equal to `ABANDONMENT_DAYS` and `daysSinceLastCommit` equals `STALE_DAYS` minus 1, THE Classifier SHALL add one Reason with `ruleId` `8.4` and no Reason with `ruleId` `8.3`; WHEN `daysSinceLastCommit` equals `STALE_DAYS` under the same condition, THE Classifier SHALL add one Reason with `ruleId` `8.3` and no Reason with `ruleId` `8.4`.
9. WHEN `maintainerCount` is 0 and none of the conditions in criteria 1 to 3 is met, THE Classifier SHALL set `abandoned` to false. The `maintainerCount` fact affects only the Risk_Score through criterion 10.7 and never sets `abandoned`.
10. [PBT] FOR ALL Health_Facts values, THE Classifier SHALL set `abandoned` to true if and only if `archived` is true, or `deprecated` is true, or `daysSinceLastRelease` is a Valid_Fact greater than or equal to `ABANDONMENT_DAYS` and `daysSinceLastCommit` is either a Valid_Fact greater than or equal to `STALE_DAYS` or an Unknown_Fact.
11. [PBT] FOR ALL Health_Facts values, THE Classifier SHALL set `dormant` to true if and only if `daysSinceLastRelease` is a Valid_Fact greater than or equal to `ABANDONMENT_DAYS` and `daysSinceLastCommit` is a Valid_Fact less than `STALE_DAYS`, and `dormant` SHALL be true only when no Reason with `ruleId` `8.3` is present.
12. [PBT] FOR ALL Health_Facts values in which `maintainerCount` is changed and all other fields are unchanged, THE Classifier SHALL return the same `abandoned` and the same `status`.

### Requirement 9: Status Precedence

**User Story:** As a maintainer, I want exactly one status per package with a defined precedence, so that results are unambiguous.

#### Acceptance Criteria

1. WHEN `vulnerable` is true and `abandoned` is false, THE Classifier SHALL return status `HAUNTED`.
2. WHEN `vulnerable` is false and `abandoned` is true, THE Classifier SHALL return status `DEAD`.
3. WHEN `vulnerable` is false and `abandoned` is false, THE Classifier SHALL return status `ALIVE`, including when `dormant` is true.
4. WHEN both `vulnerable` and `abandoned` are true, THE Classifier SHALL return status `HAUNTED`, retain every vulnerability Reason and every abandonment Reason in the returned Classification, and leave `abandoned` set to true.
5. [PBT] FOR ALL Health_Facts values, THE Classifier SHALL return exactly one Status from the set {`HAUNTED`, `DEAD`, `ALIVE`}, and the Status SHALL equal `HAUNTED` if and only if `vulnerable` is true, `DEAD` if and only if `vulnerable` is false and `abandoned` is true, and `ALIVE` if and only if both are false.
6. [PBT] FOR ALL Health_Facts values, THE Classifier SHALL return a Classification equal in Status, Risk_Score, Reasons (same items, same order) and flags (`vulnerable`, `abandoned`, `dormant`) when invoked twice with the same input (determinism).

### Requirement 10: Risk Score

**User Story:** As a maintainer, I want a numeric risk score, so that I can rank packages by urgency.

#### Acceptance Criteria

1. WHEN the Classifier receives Health_Facts, THE Classifier SHALL compute the Risk_Score as the sum of the Vulnerability_Component (criterion 2), the Abandonment_Component (criterion 17) and the Maintainer_Component (criteria 7 and 8), clamped to the integer range 0 to 100 inclusive.
2. WHEN `vulnerable` is true, THE Classifier SHALL set the Vulnerability_Component to the smaller of `VULNERABILITY_POINTS_CAP` and the sum of `SEVERITY_POINTS` for the maximum severity plus the smaller of `VULN_COUNT_POINTS_CAP` and `VULN_COUNT_POINTS_EACH` multiplied by (`openVulnerabilityCount` minus 1), where `openVulnerabilityCount` is an integer of at least 1; WHEN `vulnerable` is false, THE Classifier SHALL set the Vulnerability_Component to 0.
3. WHEN `archived` is true, THE Classifier SHALL add `ARCHIVED_POINTS` to the Abandonment_Component subtotal.
4. WHEN `deprecated` is true, THE Classifier SHALL add `DEPRECATED_POINTS` to the Abandonment_Component subtotal.
5. WHEN the condition of criterion 8.3 holds, THE Classifier SHALL add `ABANDONED_AGE_POINTS` to the Abandonment_Component subtotal; WHEN the condition of criterion 8.4 holds, THE Classifier SHALL add `DORMANT_RELEASE_POINTS` to the Abandonment_Component subtotal instead, and SHALL NOT add `ABANDONED_AGE_POINTS` or `STALE_AGE_POINTS` in that case.
6. WHEN `daysSinceLastRelease` is a Valid_Fact greater than or equal to `STALE_DAYS` and less than `ABANDONMENT_DAYS`, THE Classifier SHALL add `STALE_AGE_POINTS` to the Abandonment_Component subtotal and add one Reason with `ruleId` `10.6` stating `daysSinceLastRelease` as a whole number of days.
7. WHEN `maintainerCount` is 0, THE Classifier SHALL set the Maintainer_Component to `NO_MAINTAINER_POINTS` and add one Reason with `ruleId` `10.7` stating the value of `maintainerCount`, and SHALL NOT change `abandoned` or `status`.
8. WHEN `maintainerCount` is 1, THE Classifier SHALL set the Maintainer_Component to `SINGLE_MAINTAINER_POINTS` and add one Reason with `ruleId` `10.8`.
9. IF a Health_Facts field used in criteria 2 to 8 is an Unknown_Fact, THEN THE Classifier SHALL add 0 points for the rule that uses that field (with the exception stated in criterion 6.2 for `daysSinceLastCommit`) and SHALL still compute the Risk_Score from the remaining fields.
10. [PBT] FOR ALL Health_Facts values, THE Classifier SHALL return a Risk_Score that is an integer from 0 to 100 inclusive.
11. [PBT] FOR ALL Health_Facts values, WHEN `openVulnerabilityCount` is increased by 1 and all other fields are unchanged, THE Classifier SHALL return a Risk_Score greater than or equal to the original Risk_Score (adding a vulnerability never lowers the score).
12. [PBT] FOR ALL Health_Facts values in which `maxSeverity` is a Valid_Fact (a known Severity, ordered `LOW` < `MEDIUM` < `HIGH` < `CRITICAL`), WHEN `maxSeverity` is raised to a higher known Severity and all other fields are unchanged, THE Classifier SHALL return a Risk_Score greater than or equal to the original Risk_Score.
13. [PBT] FOR ALL Health_Facts values, WHEN `daysSinceLastRelease` is increased (both values being Valid_Facts) and all other fields are unchanged, THE Classifier SHALL return a Risk_Score greater than or equal to the original Risk_Score.
14. [PBT] FOR ALL Health_Facts values, WHEN `archived` or `deprecated` changes from false to true and all other fields are unchanged, THE Classifier SHALL return a Risk_Score greater than or equal to the original Risk_Score.
15. [PBT] FOR ALL Health_Facts values with `openVulnerabilityCount` of 0 or an Unknown_Fact and `archived`, `deprecated`, `daysSinceLastRelease` and `daysSinceLastCommit` chosen so that no abandonment criterion 8.1 to 8.3 applies, THE Classifier SHALL return status `ALIVE`.
16. WHEN `vulnerable` is true and `maxSeverity` is `CRITICAL`, THE Classifier SHALL return a Risk_Score of at least 50.
17. THE Classifier SHALL set the Abandonment_Component to the smaller of `ABANDONMENT_POINTS_CAP` and the Abandonment_Component subtotal built by criteria 3 to 6, and SHALL set it to 0 when none of criteria 3 to 6 adds points.
18. [PBT] FOR ALL Health_Facts values in which `vulnerable` is true and `abandoned` is true, THE Classifier SHALL return a Risk_Score strictly greater than the Risk_Score of the same Health_Facts with the vulnerability condition removed, and strictly greater than the Risk_Score of the same Health_Facts with the abandonment condition removed. "Vulnerability condition removed" means `openVulnerabilityCount` set to 0 with all other fields unchanged. "Abandonment condition removed" means `archived` set to false, `deprecated` set to false, and, when the condition of criterion 8.3 holds, `daysSinceLastCommit` set to 0, with all other fields unchanged, so that none of criteria 8.1 to 8.3 holds.
19. [PBT] FOR ALL pairs of Health_Facts values that differ only in `archived`, `deprecated`, `daysSinceLastRelease` and `daysSinceLastCommit`, WHEN `abandoned` is false for the first and true for the second, THE Classifier SHALL return for the second a Risk_Score greater than or equal to the Risk_Score of the first (setting `abandoned` to true never lowers the score).
20. [PBT] FOR ALL Health_Facts values and every pair of Valid_Fact day counts `d1` less than `ABANDONMENT_DAYS` and `d2` greater than or equal to `ABANDONMENT_DAYS`, THE Classifier SHALL return a Risk_Score for `daysSinceLastRelease` equal to `d2` that is greater than or equal to the Risk_Score for `daysSinceLastRelease` equal to `d1`, with all other fields unchanged (crossing `ABANDONMENT_DAYS` never lowers the score, including in the dormant case).
21. THE Core SHALL satisfy the constant consistency rules listed under the Constants table, verified by a unit test that asserts `VULNERABILITY_POINTS_CAP + ABANDONMENT_POINTS_CAP + MAINTAINER_POINTS_CAP` is at most 100, `STALE_AGE_POINTS` is at most `DORMANT_RELEASE_POINTS`, `DORMANT_RELEASE_POINTS` is less than `ABANDONED_AGE_POINTS`, and `DORMANT_RELEASE_POINTS` is less than the smaller of `ARCHIVED_POINTS`, `DEPRECATED_POINTS` and `ABANDONMENT_POINTS_CAP`.
22. [PBT] FOR ALL Health_Facts values, THE Classifier SHALL return a Risk_Score equal to the sum of the Vulnerability_Component, the Abandonment_Component and the Maintainer_Component, so that clamping never changes the Risk_Score.
23. WHEN `dormant` is true, THE Classifier SHALL add exactly `DORMANT_RELEASE_POINTS` as release-age points, and SHALL NOT add `ABANDONED_AGE_POINTS` or `STALE_AGE_POINTS`.
24. [PBT] FOR ALL Health_Facts values in which `maxSeverity` is an Unknown_Fact, THE Classifier SHALL return the same Status, the same Risk_Score, the same flags (`vulnerable`, `abandoned`, `dormant`) and the same sequence of Reason `ruleId` values, after removing the `ruleId` `6.3` entry from both sequences, as for the same Health_Facts with `maxSeverity` set to `DEFAULT_SEVERITY` (`MEDIUM`). Only the wording of the Reason with `ruleId` `7.2`, which states that the severity is assumed, and the presence of the Reason with `ruleId` `6.3` may differ.

### Requirement 11: Human-Readable Reasons

**User Story:** As a user, I want every status to show the rule and data behind it, so that the result is explainable.

#### Acceptance Criteria

1. THE Classifier SHALL return between 1 and 20 Reasons for every Classification.
2. WHEN no risk rule fires and no fact is unknown, THE Classifier SHALL return exactly one Reason with `ruleId` `11.2`, an empty `facts` list, and a `message` stating that no risk signals were found.
3. THE Classifier SHALL set the `ruleId` of every Reason to the number of the criterion that produced the Reason, in the form `<requirement number>.<criterion number>`.
4. THE Classifier SHALL write each Reason `message` as a single English sentence of 1 to 200 characters that includes the name and the value of each fact that triggered the rule.
5. THE Classifier SHALL list Reasons in ascending order of `ruleId`, comparing the requirement number and then the criterion number as integers, with HAUNTED reasons (Requirement 7) before DEAD reasons (Requirement 8).
6. [PBT] FOR ALL Health_Facts values, THE Classifier SHALL return Reasons in which every `facts` entry names a field of Health_Facts and every `ruleId` belongs to the set of defined criterion numbers {`6.3`, `7.2`, `8.1`, `8.2`, `8.3`, `8.4`, `10.6`, `10.7`, `10.8`, `11.2`}.
7. [PBT] FOR ALL Health_Facts values, WHEN the Classifier returns status `HAUNTED`, the Reasons SHALL include a Reason with `ruleId` `7.2`, and WHEN the Classifier returns status `DEAD`, the Reasons SHALL include at least one Reason with `ruleId` in {`8.1`, `8.2`, `8.3`}.

### Requirement 12: Repo-Level Summary

**User Story:** As a developer, I want a single summary for the whole repo, so that I can see overall supply chain health at a glance, and a grade that a single dangerous package cannot hide.

#### Acceptance Criteria

1. WHEN a list of Assessed_Dependencies is provided, THE Summarizer SHALL group the entries by Package_Key, the tuple (`ecosystem`, `name`, `sourceKind`), into Unique_Packages and return a Repo_Summary with `total` equal to the number of Unique_Packages. The same package in several scopes is one Unique_Package, and each Unique_Package carries `scopes`, the set of scopes of its entries sorted in Scope_Order.
2. WHEN a list of Assessed_Dependencies is provided, THE Summarizer SHALL set `unassessed` to the number of Unique_Packages that are not Assessed_Packages (`sourceKind` is not `registry`, or the Merged_Classification is null), and `assessed` to `total` minus `unassessed`.
3. WHEN a list of Assessed_Dependencies is provided, THE Summarizer SHALL set `counts` to an object with exactly the keys `ALIVE`, `HAUNTED` and `DEAD`, each holding the number of Assessed_Packages whose Merged_Classification has that Status, as an integer from 0 to `assessed`.
4. WHEN `assessed` is greater than 0, THE Summarizer SHALL set `averageScore` to the arithmetic mean of the Risk_Scores of the Merged_Classifications of the Assessed_Packages (each Unique_Package counted once), rounded to the nearest integer with halves rounded up.
5. IF `assessed` is 0, THEN THE Summarizer SHALL set `averageScore`, `maxScore`, `maxScorePackage` and `grade` to null, set each of `counts.ALIVE`, `counts.HAUNTED` and `counts.DEAD` to 0, and set `worst` to an empty list.
6. WHEN a list of Assessed_Dependencies is provided, THE Summarizer SHALL set `worst` to at most `WORST_LIST_SIZE` Ranked_Packages, sorted by Risk_Score of the Merged_Classification descending, then by Status precedence `HAUNTED`, `DEAD`, `ALIVE`, then by `name` ascending, then by `ecosystem` ascending, then by `sourceKind` ascending, then by Classification_Tie_Key ascending, using code-point string comparison for every string comparison.
7. WHEN a list of Assessed_Dependencies is provided, THE Summarizer SHALL exclude Assessed_Packages with status `ALIVE` and Risk_Score 0 from `worst`, and SHALL exclude unassessed Unique_Packages from `worst`.
8. [PBT] FOR ALL lists of Assessed_Dependencies, THE Summarizer SHALL return a Repo_Summary in which `counts.ALIVE + counts.HAUNTED + counts.DEAD + unassessed` equals `total` (invariant), where `counts.ALIVE + counts.HAUNTED + counts.DEAD` equals `assessed` and `total` equals the number of distinct Package_Keys in the input.
9. [PBT] FOR ALL lists of Assessed_Dependencies in which `assessed` is greater than 0, THE Summarizer SHALL return an `averageScore` that is an integer from 0 to 100 and is greater than or equal to the minimum and less than or equal to the maximum Risk_Score among Assessed_Packages, and a `maxScore` that is an integer from 0 to 100.
10. [PBT] FOR ALL lists of Assessed_Dependencies, THE Summarizer SHALL return the same Repo_Summary (including `total`, `averageScore`, `maxScore`, `maxScorePackage`, `grade`, `worst` and `unassessedItems`) regardless of input order (confluence).
11. [PBT] FOR ALL lists of Assessed_Dependencies, THE Summarizer SHALL return the same Repo_Summary when invoked twice with the same input (determinism).
12. [PBT] FOR ALL lists of Assessed_Dependencies, THE Summarizer SHALL return a `worst` list sorted according to criterion 12.6 whose length is at most `WORST_LIST_SIZE`.
13. WHEN `assessed` is greater than 0, THE Summarizer SHALL set `maxScore` to the maximum Risk_Score among Assessed_Packages and `maxScorePackage` to the object `{ name, ecosystem }` of the first Assessed_Package in the ordering of criterion 12.6, applied to all Assessed_Packages before truncation to `WORST_LIST_SIZE` and before the exclusion in criterion 12.7. This tie-break picks one package when several share the maximum score.
14. WHEN a list of Assessed_Dependencies is provided, THE Summarizer SHALL set `unassessedItems` to one Unassessed_Item for each unassessed Unique_Package, with `unassessedReason` equal to `non-registry-source` when `sourceKind` is `git` or `path` (even when a classification is present), and `no-health-data` when `sourceKind` is `registry` and the Merged_Classification is null, ordered by `ecosystem`, then `name`, then `sourceKind` ascending using code-point string comparison.
15. WHEN `assessed` is greater than 0, THE Summarizer SHALL set `grade` to the worse of the Average_Grade and the Worst_Grade, where `grade(score)` is the first of `A`, `B`, `C`, `D` whose `GRADE_<G>_MAX` value (`GRADE_A_MAX` 19, `GRADE_B_MAX` 39, `GRADE_C_MAX` 59, `GRADE_D_MAX` 79) is greater than or equal to `score`, or `F` when none is, the Average_Grade is `grade(averageScore)` and the Worst_Grade is `grade(maxScore)`.
16. WHEN a single Assessed_Package has `maxScore` greater than `GRADE_C_MAX` (59), THE Summarizer SHALL set `grade` to `D` or `F`, whatever the `averageScore` of the other Assessed_Packages.
17. [PBT] FOR ALL lists of Assessed_Dependencies, THE Summarizer SHALL return a `grade` that is one of `A`, `B`, `C`, `D`, `F` when `assessed` is greater than 0 and null when `assessed` is 0, and SHALL return the same `grade` when invoked twice with the same input and when the input order is permuted (grade determinism).
18. [PBT] FOR ALL lists of Assessed_Dependencies in which `assessed` is greater than 0, THE Summarizer SHALL return a `grade` that is never better than the Worst_Grade of `maxScore` and never better than the Average_Grade of `averageScore`.
19. [PBT] FOR ALL lists of Assessed_Dependencies in which `assessed` is greater than 0, THE Summarizer SHALL return a `maxScore` equal to the maximum Risk_Score among Assessed_Packages, greater than or equal to `averageScore`, and equal to the Risk_Score of the Unique_Package named by `maxScorePackage`.
20. [PBT] FOR ALL lists of Assessed_Dependencies, THE Summarizer SHALL return `unassessedItems` with a length equal to `unassessed`, in which every entry with `sourceKind` `git` or `path` has `unassessedReason` `non-registry-source`.
21. [PBT] FOR ALL lists of Assessed_Dependencies, THE Summarizer SHALL return the same Repo_Summary when each entry is repeated with a different `scope`, except that `scopes` of the affected Unique_Packages gains that scope (the same package in several scopes is counted once), and every entry of `worst` and `unassessedItems` SHALL have a non-empty `scopes` list sorted in Scope_Order without repeats.
22. WHEN the entries of a Unique_Package have more than one non-null Classification, THE Summarizer SHALL set the Merged_Classification to the highest-risk Classification, chosen by this total order: highest Risk_Score first; then Status precedence `HAUNTED`, `DEAD`, `ALIVE`; then lowest Classification_Tie_Key; then lowest Classification_Canonical_Key in code point order. Classifications with equal Classification_Canonical_Keys are deeply equal, so the choice is independent of input order.

### Requirement 13: Purity and Module Boundaries

**User Story:** As a maintainer, I want `/core` to stay pure and isolated, so that logic is testable without network or clock.

#### Acceptance Criteria

1. THE Core SHALL NOT contain any import or require statement whose resolved path is inside `/adapters`, `/app` or `/components`, as verified by a static check over every source file in `/core` that reports zero violations.
2. THE Core SHALL NOT reference `fetch`, `XMLHttpRequest`, Node.js `fs` or `fs/promises` modules, `Date.now`, `new Date()` without arguments, or `Math.random` in any source file in `/core`, as verified by a static check that reports zero violations.
3. THE Core SHALL NOT mutate its input arguments, where mutation means any change to the value, property, array element or key set of an argument at any nesting depth.
4. THE Core SHALL compile with the TypeScript `strict` compiler option enabled and zero type errors.
5. THE Core SHALL export the types Dependency, Source_Kind, Health_Facts, Classification, Reason, Parse_Result, Assessed_Dependency, Unique_Package, Ranked_Package, Unassessed_Item and Repo_Summary from its public entry point.
6. THE Core SHALL place a comment citing the requirement number (for example, `Requirement 7`) on the line immediately above each classification rule.
7. [PBT] FOR ALL generated inputs (minimum 100 runs per property) to the Manifest_Parser, the Classifier and the Summarizer, THE Core SHALL leave a deep copy of the input, taken before the call, deeply equal to the input after the call.
8. IF the static check in criterion 1, 2 or 10 finds a violation, THEN THE Core build SHALL fail with a non-zero exit code and report the file path and line number of each violation.
9. THE Classifier SHALL receive `daysSinceLastRelease` and `daysSinceLastCommit` only as input facts, SHALL NOT derive them from timestamps, and SHALL NOT read the system clock. Computing day counts from timestamps is the caller's responsibility and is out of scope for the Core.
10. THE Core SHALL import only relative modules inside `/core` and the packages in `CORE_ALLOWED_PACKAGES` (`smol-toml`), and SHALL declare each package in `CORE_ALLOWED_PACKAGES` in `package.json` with an exact version (for `smol-toml`, the latest stable release at install time, pinned exactly; a version string of the form `<major>.<minor>.<patch>` with an optional pre-release suffix, containing no `^`, `~`, `*`, `x`, comparison operator, range or tag), as verified by a static check over every source file in `/core` and over `package.json` that reports zero violations. Any other import specifier, including Node.js built-in modules, is a violation.
11. THE Core SHALL depend only on pure parsing libraries that perform no I/O, and SHALL import `smol-toml` in exactly one module of `/core`, the wrapper of criterion 3.15 that returns a Result and never throws; the static check of criterion 10 SHALL report an import of `smol-toml` from any other module as a violation.
