# Requirements Document

## Introduction

This spec improves the accuracy and the visibility of Gravekeeper scans. It changes three things that the specs `dependency-graveyard-core` and `scan-pipeline` fixed earlier, and it adds data that the UI needs.

1. Abandonment is judged on a commit age of its own (`COMMIT_ABANDONMENT_DAYS`), and the unknown-facts Reason stops listing a severity that cannot exist (core, criteria 6.3, 8.3 and 8.4).
2. A dependency that is not pinned exactly is checked at the highest published, non-prerelease version that satisfies its declared range, instead of at the latest release (pipeline, Requirement 7).
3. The Scan_Result lists the advisories behind each vulnerability count, the route tells the caller whether a result came from the cache, the two manifest-selection errors list the discovered manifests, and the core exports the pure merge functions that the UI needs.

The decisions in this document are final (user decision, recorded in the session that created this spec). The other two specs carry the same changes, each marked "(changed by scan-accuracy)".

### Out of Scope

- UI. This spec only produces data, headers and exported functions.
- Lockfiles. A version is never read from a lockfile.
- Filtering yanked or deprecated versions during range resolution. Only prereleases are excluded.
- Resolving `npm` dist-tags (`latest`, `next`), aliases (`npm:`), protocols (`workspace:`, `git+`, `file:`) and URLs. Such a `versionSpec` is unresolvable and falls back to the default version with a note.
- Resolving environment markers in PyPI requirement lines. The core parser removes them before the pipeline sees a `versionSpec`.
- New upstream requests. Range resolution uses the version list that the deps.dev package request already returns (EF-1).

### Conventions

- Criteria tagged **[PBT]** are verified with fast-check in files named `<module>.property.test.ts`. Untagged criteria use example-based tests.
- "Core spec" means `.kiro/specs/dependency-graveyard-core`. "Pipeline spec" means `.kiro/specs/scan-pipeline`. A criterion written as `core 8.3` or `pipeline R7.7` names a criterion of one of them.
- Source code cites the requirement number in a comment above each rule (steering rule).

## Glossary

- **Core**: The pure module in `/core`.
- **Classifier**: The core function `classify` that maps Health_Facts to a Classification.
- **Pipeline**: The scan orchestrator in `/pipeline` and its Mappers in `/pipeline/mapping`.
- **Scan_Route**: The route handler of `POST /api/scan`, implemented by `handleScanRequest` in `/pipeline/api` and `app/api/scan/route.ts`.
- **Scan_Result**: The success body of `POST /api/scan` (pipeline R18).
- **Reportable_Unknown_Fact**: An Unknown_Fact that the Reason with `ruleId` `6.3` lists. Every Unknown_Fact is reportable except `maxSeverity` when `openVulnerabilityCount` is a Valid_Fact equal to 0.
- **COMMIT_ABANDONMENT_DAYS**: The new core constant, 730. A `daysSinceLastCommit` at or above it counts as no recent commit activity for criteria core 8.3 and 8.4.
- **Declared_Range**: A `versionSpec` of a Lookup_Target that is not an Exact_Pin and is not empty after removing leading and trailing whitespace, taken after that trimming.
- **Version_Candidate**: An entry of the deps.dev `versions[]` list (EF-1) with a non-empty string `versionKey.version` that is valid in the version grammar of the ecosystem (strict semver for `npm` and `cargo`, PEP 440 for `pypi`) and is not a Prerelease.
- **Prerelease**: For `npm` and `cargo`, a semver version with a non-empty prerelease list. For `pypi`, a PEP 440 version with a pre-release segment (`a`, `b`, `rc`) or a dev-release segment. A post-release is not a Prerelease.
- **Resolved_Version**: The Selected_Version chosen from the Declared_Ranges by this spec. Its Version_Basis is `resolved`.
- **Range_Resolver**: The pure Mapper that parses Declared_Ranges and chooses the Resolved_Version. Its only third-party code is `semver` (for `npm` and `cargo`) and `@renovatebot/pep440` (for `pypi`).
- **Cargo_Range_Mapper**: The pure function that converts a Cargo version requirement into a semver range string (Requirement 4).
- **Advisory_Entry**: The record `{ id, aliases, severity, url }` in the `advisories` list of a `dependencies` entry of the Scan_Result (Requirement 6).
- **Scan_Outcome**: The success value of `runScan`: `{ result, fromCache }`, where `result` is the Scan_Result and `fromCache` is a boolean.
- **Cache_Status_Header**: The HTTP response header `X-Gravekeeper-Cache`, with the value `hit` or `miss`.
- **Manifest_Candidates_Detail**: The list `details.candidates` of the errors `too-many-manifests` and `manifest-not-found` (Requirement 8).

## Constants

New and changed constants. Core constants live in `core/model/constants.ts`. Pipeline constants live in `pipeline/constants.ts` and are added to the Constants table of the pipeline spec.

| Constant | Value | Meaning |
|---|---|---|
| `COMMIT_ABANDONMENT_DAYS` (core) | 730 | Commit-age threshold of criteria core 8.3 and 8.4. `STALE_DAYS` (365) keeps only criterion core 10.6. |
| `RANGE_MAX_LENGTH` (pipeline) | 256 | Maximum length in UTF-16 code units of a Declared_Range that the Range_Resolver parses. A longer value is unresolvable. Equals the length limit of the `semver` package. |
| `ADVISORY_URL_PREFIX` (pipeline) | `https://osv.dev/vulnerability/` | Prefix of the `url` of every Advisory_Entry. |
| `CACHE_STATUS_HEADER` (pipeline) | `X-Gravekeeper-Cache` | Name of the Cache_Status_Header. |
| `CACHE_KEY_VERSION` (pipeline, changed) | 2 | Was 1. Bumped because the stored Scan_Result gains `advisories` and the `versionBasis` value `resolved`, and the resolved versions change cached facts. |

Constant consistency rules (verified by unit tests):

- `COMMIT_ABANDONMENT_DAYS` is a positive integer and is at least `STALE_DAYS`.
- `RANGE_MAX_LENGTH` is a positive integer.
- `CACHE_KEY_VERSION` is a positive integer greater than 1.

## Requirements

### Requirement 1: Commit-age threshold for abandoned and dormant packages

**User Story:** As a maintainer, I want a package marked abandoned only when it has had no commits for two years, so that a package with last-year commits is not called dead.

#### Acceptance Criteria

1. THE Core SHALL export the constant `COMMIT_ABANDONMENT_DAYS` with the value 730, in the `CONSTANTS` object and as a named export of `core/model/constants.ts`.
2. WHEN `daysSinceLastRelease` is a Valid_Fact greater than or equal to `ABANDONMENT_DAYS` and `daysSinceLastCommit` is either a Valid_Fact greater than or equal to `COMMIT_ABANDONMENT_DAYS` or an Unknown_Fact, THE Classifier SHALL set `abandoned` to true and add one Reason with `ruleId` `8.3`.
3. WHEN `daysSinceLastRelease` is a Valid_Fact greater than or equal to `ABANDONMENT_DAYS` and `daysSinceLastCommit` is a Valid_Fact less than `COMMIT_ABANDONMENT_DAYS`, THE Classifier SHALL set `dormant` to true and add one Reason with `ruleId` `8.4`.
4. WHEN `daysSinceLastRelease` is a Valid_Fact greater than or equal to `ABANDONMENT_DAYS` and `daysSinceLastCommit` equals `STALE_DAYS`, THE Classifier SHALL add one Reason with `ruleId` `8.4` and no Reason with `ruleId` `8.3`.
5. WHEN `daysSinceLastRelease` is a Valid_Fact greater than or equal to `ABANDONMENT_DAYS` and `daysSinceLastCommit` equals `COMMIT_ABANDONMENT_DAYS` minus 1, THE Classifier SHALL add one Reason with `ruleId` `8.4` and no Reason with `ruleId` `8.3`; WHEN `daysSinceLastCommit` equals `COMMIT_ABANDONMENT_DAYS` under the same release condition, THE Classifier SHALL add one Reason with `ruleId` `8.3` and no Reason with `ruleId` `8.4`.
6. THE Classifier SHALL use `STALE_DAYS` only for criterion core 10.6 and SHALL NOT use it for `daysSinceLastCommit`.
7. THE Classifier SHALL write the Reason of criterion core 8.3 so that it names `COMMIT_ABANDONMENT_DAYS` and its value instead of `STALE_DAYS`, and, when `daysSinceLastCommit` is an Unknown_Fact, states that the commit age is unknown and assumed to show no recent activity.
8. [PBT] FOR ALL Health_Facts values, THE Classifier SHALL satisfy that `abandoned` is true if and only if `archived` is true, or `deprecated` is true, or `daysSinceLastRelease` is a Valid_Fact at least `ABANDONMENT_DAYS` and `daysSinceLastCommit` is a Valid_Fact at least `COMMIT_ABANDONMENT_DAYS` or an Unknown_Fact; that `dormant` is true if and only if `daysSinceLastRelease` is a Valid_Fact at least `ABANDONMENT_DAYS` and `daysSinceLastCommit` is a Valid_Fact less than `COMMIT_ABANDONMENT_DAYS`; and that a Reason with `ruleId` `8.3` and a Reason with `ruleId` `8.4` never occur together.
9. THE Core SHALL keep the Risk_Score rules of criteria core 10.5, 10.6, 10.20 and 10.23 unchanged except that their reference to criterion 8.3 and 8.4 conditions uses the thresholds of criteria 2 and 3 above.

### Requirement 2: Unknown severity is not reported when no vulnerability is open

**User Story:** As a user, I want the list of unknown facts to omit a severity that cannot exist, so that a package with no vulnerabilities does not look like it has missing data.

#### Acceptance Criteria

1. WHEN `openVulnerabilityCount` is a Valid_Fact equal to 0, THE Classifier SHALL treat `maxSeverity` as not applicable and SHALL NOT list `maxSeverity` in the Reason with `ruleId` `6.3`, whatever the value of `maxSeverity`.
2. IF `maxSeverity` is the only Unknown_Fact and `openVulnerabilityCount` is a Valid_Fact equal to 0, THEN THE Classifier SHALL add no Reason with `ruleId` `6.3`.
3. WHEN `openVulnerabilityCount` is an Unknown_Fact or a Valid_Fact greater than or equal to 1 and `maxSeverity` is an Unknown_Fact, THE Classifier SHALL list `maxSeverity` in the Reason with `ruleId` `6.3`.
4. WHEN exactly one Reportable_Unknown_Fact exists, THE Classifier SHALL set the `message` of the Reason with `ruleId` `6.3` to exactly `This health fact is unknown and adds no risk points: <name>.`, where `<name>` is the field name (for example `This health fact is unknown and adds no risk points: daysSinceLastCommit.`).
5. WHEN two or more Reportable_Unknown_Facts exist, THE Classifier SHALL set the `message` of the Reason with `ruleId` `6.3` to exactly `These health facts are unknown and add no risk points: <names>.`, where `<names>` lists the field names in Health_Facts field order, joined as `a and b` for two names and `a, b and c` for three or more (for example `These health facts are unknown and add no risk points: daysSinceLastCommit, archived and maintainerCount.`).
6. IF every Health_Facts field is an Unknown_Fact, THEN THE Classifier SHALL list all seven field names in the Reason with `ruleId` `6.3`, and the message SHALL be at most 200 characters.
7. WHEN no risk rule fires and no Reportable_Unknown_Fact exists, THE Classifier SHALL add exactly one Reason with `ruleId` `11.2`, including when `maxSeverity` is an Unknown_Fact and `openVulnerabilityCount` is 0.
8. [PBT] FOR ALL raw facts values, THE Classifier SHALL return exactly one Reason with `ruleId` `6.3` whose listed names equal the set of Reportable_Unknown_Facts, in Health_Facts field order, when that set is non-empty, and no Reason with `ruleId` `6.3` when it is empty.
9. [PBT] FOR ALL raw facts values with a non-empty set of Reportable_Unknown_Facts, THE Classifier SHALL return a `6.3` message equal to the singular text of criterion 4 when the set has one element and equal to the plural text of criterion 5 otherwise.

### Requirement 3: Version resolution from declared ranges

**User Story:** As a developer, I want a dependency declared as `^4.17.0` checked at the newest 4.x release, so that vulnerabilities are reported for a version my manifest can actually install.

#### Acceptance Criteria

1. WHEN a Lookup_Target has no Exact_Pin (pipeline R7.7) and has no Declared_Range, THE Pipeline SHALL select the default version, SHALL set Version_Basis to `default` and SHALL add no Scan_Note with code `range-unresolved`.
2. WHEN a Lookup_Target has no Exact_Pin and at least one Declared_Range, THE Range_Resolver SHALL select as Selected_Version the highest Version_Candidate that satisfies every Declared_Range of that Lookup_Target, and THE Pipeline SHALL set Version_Basis to `resolved`.
3. THE Range_Resolver SHALL form the Version_Candidates from the `versionKey.version` strings of the `versions[]` list of the deps.dev package document (EF-1) and SHALL ignore every entry whose version string is not valid in the version grammar of the ecosystem, and every Prerelease, without adding a Scan_Note for them.
4. THE Range_Resolver SHALL order Version_Candidates by semver precedence for `npm` and `cargo` and by PEP 440 ordering for `pypi`, and WHEN two Version_Candidates compare equal, THE Range_Resolver SHALL select the one that comes first in the `versions[]` list.
5. THE Range_Resolver SHALL parse a Declared_Range with the `semver` package for `npm`, with the Cargo_Range_Mapper followed by the `semver` package for `cargo`, and with the `@renovatebot/pep440` package for `pypi`.
6. IF a Declared_Range is longer than `RANGE_MAX_LENGTH`, or cannot be parsed for its ecosystem, or no Version_Candidate satisfies every Declared_Range of the Lookup_Target, THEN THE Pipeline SHALL select the default version, SHALL set Version_Basis to `default`, and SHALL add one Scan_Note with code `range-unresolved` for that Lookup_Target.
7. THE Pipeline SHALL set the `details` of the `range-unresolved` Scan_Note to `{ ecosystem, name, ranges }`, where `ranges` lists the distinct Declared_Ranges of the Lookup_Target in ascending Unicode code point order, each cut to its first `RANGE_MAX_LENGTH` code points.
8. WHEN a Lookup_Target has exactly one distinct Exact_Pin or several distinct Exact_Pins, THE Pipeline SHALL apply pipeline R7.4, R7.5 and R7.12 unchanged and SHALL NOT resolve any Declared_Range of that Lookup_Target.
9. WHEN the Resolved_Version is selected, THE Pipeline SHALL add none of the Scan_Notes `pin-not-found`, `conflicting-pins` and `range-unresolved` for that Lookup_Target.
10. THE Pipeline SHALL use the Resolved_Version as the Selected_Version for every request and fact that pipeline R7 ties to the Selected_Version: the deps.dev version document (EF-2, EF-3), the OSV query (EF-5), the PyPI per-version document (EF-22), `deprecated` (EF-1) and the advisory facts.
11. IF the default version is needed by criterion 6 and the versions list has no default version, THEN THE Pipeline SHALL apply pipeline R7.8 (`no-default-version`) in addition to the `range-unresolved` note.
12. THE Pipeline SHALL send no upstream request for range resolution.
13. [PBT] FOR ALL generated version lists and generated satisfiable Declared_Ranges of each ecosystem, THE Range_Resolver SHALL return a Resolved_Version that is an element of the version list and satisfies every Declared_Range.
14. [PBT] FOR ALL generated version lists and Declared_Ranges, THE Range_Resolver SHALL return a Resolved_Version such that no listed, valid, non-prerelease version that satisfies every Declared_Range is higher, and such that the Resolved_Version is never a Prerelease.
15. [PBT] FOR ALL generated lists of `versionSpec` values of one Lookup_Target and every permutation of that list, THE Pipeline SHALL select the same Selected_Version, Version_Basis and notes.
16. [PBT] FOR ALL generated strings (including empty, whitespace-only, longer than `RANGE_MAX_LENGTH` and arbitrary Unicode) as Declared_Range, in each ecosystem, THE Range_Resolver SHALL return a Resolved_Version or the unresolved outcome, SHALL add exactly one `range-unresolved` note in the unresolved case, and SHALL NOT throw.

### Requirement 4: Cargo version requirement mapping

**User Story:** As a Rust developer, I want Cargo version requirements read the way Cargo reads them, so that the resolved version matches what `cargo update` would pick.

#### Acceptance Criteria

1. WHEN the ecosystem is `cargo`, THE Cargo_Range_Mapper SHALL split the requirement at each comma, remove whitespace around each part, and convert each part to a semver comparator by the mapping below, so that a comma-separated requirement is the intersection of its parts.
2. THE Cargo_Range_Mapper SHALL map a part with no operator and a version with no wildcard (`1`, `1.2`, `1.2.3`) to the caret comparator `^<version>`, because Cargo reads a bare version as a caret requirement.
3. THE Cargo_Range_Mapper SHALL map the operators `^`, `~`, `=`, `>`, `>=`, `<` and `<=` to the same operator of the `semver` package followed by the version, and SHALL remove whitespace between the operator and the version.
4. THE Cargo_Range_Mapper SHALL map a wildcard part without an operator (`*`, `1.*`, `1.2.*`) to the same text, and SHALL NOT add a caret to it.
5. THE Cargo_Range_Mapper SHALL accept a version of one, two or three decimal parts without leading zeros, and SHALL accept a prerelease list and a build list only after a full `MAJOR.MINOR.PATCH`.
6. THE Cargo_Range_Mapper SHALL join the converted comparators with one space, which is the AND of the `semver` package.
7. IF a part is empty, uses `||`, uses a hyphen range, has a leading `v`, uses `x` or `X` as a wildcard, combines a wildcard with an operator other than `=`, or is not one of the forms of criteria 2 to 5, THEN THE Cargo_Range_Mapper SHALL report the requirement as unparseable.
8. THE Cargo_Range_Mapper SHALL document the mapping in `pipeline/mapping/range-cargo.ts` as a table of the Cargo form, the `semver` form and an example, where the `semver` partial-version rules agree with Cargo: `>1.2` means `>=1.3.0`, `<=1.2` means `<1.3.0`, `~1` means `>=1.0.0 <2.0.0`, `^0` means `>=0.0.0 <1.0.0`, `^0.0.3` means `=0.0.3`, and `=1.2` means `>=1.2.0 <1.3.0`.
9. [PBT] FOR ALL generated Cargo versions `X` (one to three parts) and generated version lists, THE Range_Resolver SHALL return the same Resolved_Version for the requirement `X` as for the requirement `^X`.
10. [PBT] FOR ALL generated lists of valid Cargo comparators and generated version lists, THE Range_Resolver SHALL return a Resolved_Version for the comma-joined requirement that satisfies each comparator alone, and SHALL return the same Resolved_Version for every permutation of the comparators.
11. [PBT] FOR ALL generated strings, THE Cargo_Range_Mapper SHALL return a semver range string or the unparseable outcome, and SHALL NOT throw.

### Requirement 5: Range libraries and their architecture rules

**User Story:** As a maintainer, I want the two range libraries pinned and fenced, so that a library update cannot change scan results silently and no other code depends on them.

#### Acceptance Criteria

1. THE project SHALL list `semver` and `@renovatebot/pep440` as dependencies and `@types/semver` as a development dependency in `package.json`, each with an exact version string (no `^`, `~`, range, tag or `*`).
2. THE project SHALL use `@renovatebot/pep440` at version 5.0.1 and `semver` at version 7.8.6, chosen in the design phase, and SHALL record the evidence for the choice in the design document of this spec.
3. THE Architecture_Test SHALL fail WHEN any file other than `pipeline/mapping/range-semver.ts` imports `semver`, and WHEN any file other than `pipeline/mapping/range-pep440.ts` imports `@renovatebot/pep440`, in any layer.
4. THE Architecture_Test SHALL keep failing on every other package import in `/pipeline/mapping` (pipeline R22.2, R13.1).
5. THE wrapper functions in `range-semver.ts` and `range-pep440.ts` SHALL catch every exception of the library and return null or false instead, so that no Mapper throws (pipeline R13.10).
6. THE unit tests SHALL check that `package.json` pins both packages exactly, and that the installed `semver` and `@renovatebot/pep440` have no runtime dependencies and no native build step.
7. THE Core SHALL NOT import `semver` or `@renovatebot/pep440` (core `CORE_ALLOWED_PACKAGES` stays `smol-toml`).

### Requirement 6: Advisory entries in the Scan_Result

**User Story:** As a UI developer, I want the advisories behind each vulnerability count, so that the UI can show what was found and link to it.

#### Acceptance Criteria

1. THE Pipeline SHALL include in every `dependencies` entry of the Scan_Result the field `advisories`, a list of Advisory_Entry, always present and never `undefined`.
2. WHEN a Lookup_Target has a Selected_Version and its OSV query result is usable (EF-5), THE Pipeline SHALL create one Advisory_Entry for each distinct non-empty string `vulns[].id` of that result, so that the number of entries equals the number of those distinct ids, including ids of advisories that are withdrawn, informational or merged into one vulnerability by an Alias_Group.
3. THE Pipeline SHALL set the `id` of an Advisory_Entry to the OSV id unchanged.
4. WHEN the OSV detail of an id was fetched (EF-6), THE Pipeline SHALL set `aliases` to the distinct non-empty string items of its `aliases` array that differ from `id`, in ascending Unicode code point order.
5. WHEN the OSV detail of an id was not fetched (the request failed, ended with HTTP 404, was cut by the deadline, or was left out by `OSV_MAX_ADVISORY_DETAILS`), THE Pipeline SHALL set `aliases` to the empty list and `severity` to null for that Advisory_Entry.
6. WHEN the OSV detail of an id was fetched, THE Pipeline SHALL set `severity` to the Severity that the ordered rules of pipeline R10, criterion 5 give for that Advisory, or to null when those rules give no Severity.
7. THE Pipeline SHALL set `url` to `ADVISORY_URL_PREFIX` followed by `id` in which every UTF-8 byte outside the characters `A-Z`, `a-z`, `0-9`, `.`, `_`, `:` and `-` is percent-encoded, so that the `url` has no `/`, `?` or `#` after the prefix.
8. THE Pipeline SHALL order the `advisories` list by ascending `id` in Unicode code point order, with pairwise distinct ids.
9. THE Pipeline SHALL set `advisories` to the empty list for a Dependency that is not looked up (`git` or `path`, or skipped by the dependency cap), for a Lookup_Target without a Selected_Version, for a Lookup_Target whose OSV query failed or whose result is not usable, and for a result without ids.
10. THE Pipeline SHALL give every Dependency of one Lookup_Target an equal `advisories` list.
11. THE Pipeline SHALL leave the rules of `openVulnerabilityCount` and `maxSeverity` (pipeline R9) unchanged, so that `openVulnerabilityCount` can be lower than the length of `advisories`.
12. THE Pipeline SHALL keep the Scan_Result JSON-serializable without loss with the new field (pipeline R18.10), and SHALL keep the `advisories` field out of the compact L2_Cache entries of advisory details (pipeline R19.27).
13. [PBT] FOR ALL generated OSV query results, advisory details and fetch outcomes, THE Pipeline SHALL return `advisories` whose length equals the number of distinct non-empty string ids of the OSV result for the Selected_Version, whose ids are pairwise distinct and ascending, and whose every `url` equals `ADVISORY_URL_PREFIX` plus the percent-encoded id.
14. [PBT] FOR ALL generated advisory ids (including ids with `/`, `?`, `#`, `%`, spaces and non-ASCII characters), THE Pipeline SHALL build a `url` from which `decodeURIComponent` of the part after `ADVISORY_URL_PREFIX` returns the id, and which has no `/`, `?` or `#` after the prefix.
15. [PBT] FOR ALL generated advisory ids that were not fetched, THE Pipeline SHALL return `severity` null and `aliases` equal to the empty list for each of them.

### Requirement 7: Cache visibility

**User Story:** As a developer, I want to see whether a response came from the cache, so that I can tell a fresh scan from a stored one without the body changing.

#### Acceptance Criteria

1. THE Pipeline SHALL return from `runScan`, on success, a Scan_Outcome `{ result, fromCache }`, where `fromCache` is true if and only if `result` is the Scan_Result read unchanged from the Scan_Cache (pipeline R19.6).
2. THE Pipeline SHALL NOT put `fromCache`, or any other cache indication, in the Scan_Result, so that the body of a cache hit equals the body of a fresh scan run at the cached `asOf` (pipeline R19.21).
3. WHEN the Scan_Route returns HTTP 200, THE Scan_Route SHALL set the Cache_Status_Header to `hit` when `fromCache` is true, and to `miss` otherwise, including for a Scan_Result assembled by the response-margin path (pipeline R16, criterion 12).
4. THE Scan_Route SHALL NOT set the Cache_Status_Header on a response with a status other than 200. This covers every error, including an error produced before the Scan_Cache lookup.
5. THE Scan_Route SHALL keep `Cache-Control: no-store` on every response, including a response that carries the Cache_Status_Header.
6. THE Scan_Route SHALL set no other header that depends on the cache, and the Cache_Status_Header SHALL hold only the value `hit` or `miss`.
7. [PBT] FOR ALL generated requests, THE Scan_Route SHALL return a Cache_Status_Header if and only if the status is 200, with the value `hit` if and only if the Scan_Result came from the Scan_Cache.
8. [PBT] FOR ALL generated request spelling variants of one repository, THE Scan_Route SHALL return for a Scan_Cache hit a body equal, as JSON text, to the body of a fresh scan with empty caches run at the cached `asOf`, whatever the Cache_Status_Header value (pipeline P68 stays valid).

### Requirement 8: Manifest candidates in manifest-selection errors

**User Story:** As a UI developer, I want the discovered manifests in the two manifest-selection errors, so that the UI can offer the valid choices.

#### Acceptance Criteria

1. IF `manifests` contains more than `SCAN_MAX_MANIFESTS` distinct paths, THEN THE Pipeline SHALL return the error `too-many-manifests` with `details.limit` equal to `SCAN_MAX_MANIFESTS` and `details.candidates` equal to the list of the discovered Manifest_Candidate paths.
2. IF a listed path is not a manifest of the tree (pipeline R5, criterion 5), THEN THE Pipeline SHALL return the error `manifest-not-found` with `details.path` as before and `details.candidates` equal to the list of the discovered Manifest_Candidate paths.
3. THE Pipeline SHALL list the paths in `details.candidates` in the order of pipeline R4, criterion 7, with at most `DISCOVERY_MAX_MANIFESTS` entries, and SHALL set `details.candidates` to the empty list when discovery found no Manifest_Candidate.
4. THE Pipeline SHALL keep the messages of both errors unchanged and SHALL NOT render `details.candidates` in any message.
5. THE Scan_Route SHALL allow the `details` fields `limit` and `candidates` for `too-many-manifests`, and `path` and `candidates` for `manifest-not-found`, and no other fields (pipeline R21.6).
6. [PBT] FOR ALL generated trees and generated `manifests` lists that trigger one of these two errors, THE Pipeline SHALL return `details.candidates` equal to the `path` list of the Discovery_Result candidates of the same tree, with a length of at most `DISCOVERY_MAX_MANIFESTS`.

### Requirement 9: Core exports for merging classifications

**User Story:** As a UI developer, I want the core merge functions exported, so that the UI never re-implements the rules that pick one classification per package.

#### Acceptance Criteria

1. THE Core SHALL export `mergeClassifications`, `compareClassifications` and `uniquePackages` from `core/index.ts`, together with the types they use.
2. THE Core SHALL define `uniquePackages(items)` as the grouping of Assessed_Dependencies into Unique_Packages by Package_Key with the Merged_Classification of each group, in first-seen order, exactly as the Summarizer builds them.
3. THE Summarizer SHALL obtain its Unique_Packages by calling `uniquePackages`, so that the UI and the Summarizer share one implementation.
4. THE Core SHALL keep `uniquePackages`, `mergeClassifications` and `compareClassifications` pure, total and free of clock, network and file-system access (core R13).
5. [PBT] FOR ALL lists of Assessed_Dependencies, THE Core SHALL return from `uniquePackages` a list whose length equals `summarize(items).total`, whose assessed members equal the packages that `summarize` ranks, and whose result is equal for every permutation of the input after sorting by Package_Key.
6. [PBT] FOR ALL non-empty lists of Classifications, THE Core SHALL return from `mergeClassifications` a member of the list that is not greater under `compareClassifications` than any other member.

### Requirement 10: Compatibility, regression and documentation

**User Story:** As a maintainer, I want the changes to keep the existing guarantees and tests honest, so that nothing breaks silently.

#### Acceptance Criteria

1. THE Pipeline SHALL set `CACHE_KEY_VERSION` to 2, so that Scan_Cache and L2_Cache entries of the earlier shape are never read.
2. THE Pipeline SHALL record `lookupVersion` and `versionBasis` (`pinned`, `default`, `resolved` or null) for every Dependency as in pipeline R7, criterion 9, extended with the value `resolved`.
3. WHEN the fixture scan tests run with the recorded asOf, THE test suite SHALL pass with Fixtures that contain the requests of the resolved versions, and every Fixture_Set SHALL stay at most `FIXTURE_SET_MAX_BYTES` (pipeline R23, criteria 4, 5, 13 and 16).
4. THE test suite SHALL update the existing classifier example tests and property tests for core criteria 6.3, 8.3, 8.4 and the Properties 14, 15, 16 and 24 of the core design.
5. THE test suite SHALL update the version-selection tests (pipeline P14 and P15), the Scan_Result tests for `lookupVersion`, `versionBasis` and `advisories` (pipeline P57 and P58), the route tests (pipeline P64), the cache-hit test (pipeline P68), the Mapper registry test, the assembly tests, the notes and messages tests including the completeness test that parses the User-facing messages table, and the architecture tests.
6. THE project SHALL update `docs/property-traceability.md` with the properties of this spec and the changed properties of the other two specs.
7. THE design documents and requirement documents of `dependency-graveyard-core` and `scan-pipeline` SHALL carry every change of this spec, each marked "(changed by scan-accuracy)".

### Requirement 11: User-facing message for unresolved ranges

**User Story:** As a user, I want a plain note when my declared range could not be used, so that I know the latest release was checked instead.

#### Acceptance Criteria

1. THE Pipeline SHALL add the Scan_Note code `range-unresolved` to the Scan_Note codes table with the `details` keys `ecosystem`, `name` and `ranges`, defined by Requirement 3, criteria 6 and 7.
2. THE Pipeline SHALL build the `message` of a `range-unresolved` note from the row `range-unresolved` of the User-facing messages table, with the text `The version range declared for {name} could not be matched to a published release, so the latest release was checked instead.`
3. THE Pipeline SHALL interpolate only `{name}` into that message, and SHALL NOT interpolate `ranges`, because the range is raw manifest text and not a validated value (pipeline User-facing messages, style rule 7).
4. THE Pipeline SHALL order `range-unresolved` notes by the rule of pipeline R18, criterion 5, with `details` keys in ascending code point order.
5. [PBT] FOR ALL generated Declared_Ranges (including text with a U+2014 character, request-like text and `{name}`-like text), THE Pipeline SHALL render a `range-unresolved` message that contains none of the Declared_Range text, and contains no U+2014 character (pipeline P76).
