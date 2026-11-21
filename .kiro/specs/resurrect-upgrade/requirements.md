# Requirements Document

## Introduction

This spec is a small follow-up to the `resurrect` spec. The Resurrect slot of the Detail_Panel is honest but silent in one common case: a package whose checked version is deprecated while a newer, healthy version exists. `uuid@3.4.0` and `rimraf` before v4 are the examples. Their deprecation text lives on the npm document of that exact version, which the scan does not fetch, so the slot shows the generic paragraph "No notice ... is on record". The registry already knows a newer, non-deprecated default version, and the slot never says so.

The work has three parts, plus verification.

1. **Version-specific notices** (pipeline). When the checked version of an npm package is deprecated and is not the version of the `/latest` document that the scan already fetches, the scan fetches the npm document of the checked version and uses its `deprecated` string as the hint. One extra request, only for such packages. `CACHE_KEY_VERSION` goes from 4 to 5.
2. **Upgrade suggestion** (pipeline, view-model, component). When the checked version is deprecated and the registry's default version is not deprecated and is higher, the scan result carries `upgrade: {version, basis}` and the slot shows "Upgrade to <version>", labelled "From the registry", with the ecosystem command, ahead of the hints and the curated suggestions. This is a newer version of the same package, not a replacement.
3. **Curated sources** (data, loader, live test). Each curated entry shows a human page as its link (`source`) and keeps the machine-checkable URL in a new field `evidence`, which the live contract test fetches.
4. **Verification** (properties RU-P1 to RU-P8, end-to-end, one fixture re-recording, report, screenshots, live smoke).

The decisions below are final (user brief of the session that created this spec). The spec phase writes no code.

### Decisions this document fixes

| Topic | Decision |
|---|---|
| How "the checked version is deprecated" is known before the extra fetch | From the deps.dev package document that stage S5 already fetches: the entry of the checked version has `isDeprecated` equal to `true`. No packument fetch is needed. |
| Which hint shows | The hint of the checked version's own document replaces the `/latest` document hint. When no version-specific hint exists, the `/latest` hint behaves as before. |
| Upgrade for HAUNTED packages | Not offered. The pipeline queries OSV only for the checked version, so it cannot know whether the registry default is free of the advisories. Only the deprecated case is offered. |
| Fallback paragraph when an upgrade exists | Suppressed. The fallback says "no recommended replacement is on record", which would contradict the upgrade section. |
| PEP 621 upgrade form | Change the dependency entry to `<name>>=<version>` and run `pip install "<name>>=<version>"`. |
| Version ordering | The existing `semverCompare` (npm, cargo) and `pepCompare` (PyPI) of `pipeline/mapping/range-*.ts`. |
| `evidence` | Required for every curated entry, an https URL without credentials. `source` is the human page. |
| Fixture plan | Re-record `request/request` only (`npm run fixtures:record -- --only request/request`). The other three sets stay byte-identical. |

### Out of Scope

- Upgrade suggestions for packages whose checked version is not deprecated, including HAUNTED packages with open advisories (see the decision above).
- PyPI and crates.io notice texts. Only the npm `deprecated` string is fetched per version.
- Using the `deprecatedReason` text of the deps.dev package document as a hint. The brief requires the npm document.
- Patching a manifest file, opening a pull request, any request sent by the slot.
- A change of the art, the palette, the scene or the header layout.
- Re-recording the `revmic/canopy`, `ajeetdsouza/zoxide` or `psf/requests` fixture sets.

### Changes to other specs

| Place | Change |
|---|---|
| `resurrect` Requirement 2.4 (latest document only) | Replaced by Requirement 1 and 2 of this spec for the checked version; the `/latest` hint remains for a checked version equal to the latest. |
| `resurrect` Requirement 6 (curated schema) | Five keys become six (`evidence` added); `source` becomes the human page. |
| `resurrect` Requirement 8 (live contract) | Gains the evidence checks (Requirement 8 of this spec). |
| `resurrect` Requirement 9.4 and 9.11 | The slot order gains the upgrade section; the fallback is also suppressed by an upgrade. RS-P11 stays green because its generators contain no upgrade; RU-P6 covers the new order. |
| `scan-pipeline` constant `CACHE_KEY_VERSION` | 4 to 5. |
| `scan-pipeline` port `NpmSource` | Gains `getVersion`. |
| `scan-pipeline` Scan_Result | Gains the optional dependency field `upgrade`. |
| `scripts/live-report.ts` | The npm endpoint pattern table separates `/{package}/latest` from `/{package}/{version}`. |

### Conventions

- Criteria tagged **[PBT]** are verified with fast-check in files named `<module>.property.test.ts`. Untagged criteria use example-based tests.
- Property numbers are `RU-P1` to `RU-P8`. Each property test file carries `// Feature: resurrect-upgrade, Property RU-P<n>: <title>`, a `// Validates:` line, and test titles that start with `RU-P<n>`. The traceability test is `tests/ui/ru-traceability.test.ts`. Property tests use `cfg()` from `tests/support/fc-config.ts`. Deep runs use `npm run test:deep`. `FC_NUM_RUNS` is never set in the shell.
- The property `RS-P5` of the `resurrect` spec ("a package is never suggested as its own replacement") stays as it is. The upgrade is not a replacement and has its own property RU-P3.
- Source code cites the requirement number in a comment above each rule (steering rule).

## Glossary

- **Pipeline**: The scan pipeline of `pipeline/`, including stage S6 (`pipeline/scan/stage-versions.ts`).
- **Checked_Version**: The version that the scan looked up for a dependency, stored as `lookupVersion` (null when none).
- **Depsdev_Document**: The deps.dev package document (EF-1) of a target, with `versions[]` entries that carry `isDefault`, `isDeprecated` and `deprecatedReason`.
- **Checked_Deprecated**: The state in which the Depsdev_Document entry of the Checked_Version has `isDeprecated` equal to `true`.
- **Latest_Document**: The npm document `https://registry.npmjs.org/<name>/latest` that stage S5 already fetches for every npm target.
- **Latest_Version**: The string `version` of the Latest_Document when that document was fetched and has a non-empty string `version`; otherwise the default version of the Depsdev_Document; otherwise unknown.
- **Version_Document**: The npm document `https://registry.npmjs.org/<name>/<version>` of one version.
- **Version_Doc_Plan**: The pure function that decides whether a target needs a Version_Document request (Requirement 1).
- **NPM_VERSION_DOCS_MAX**: The constant in `pipeline/constants.ts` that bounds the Version_Document requests of one scan (value 40).
- **Version_Hint**: The `deprecation-notice` Upstream_Hint built from the `deprecated` string of a Version_Document.
- **Hint_Combiner**: The pure function that merges the Version_Hint and the Latest_Document hint into the hint list of an npm target (Requirement 2).
- **Upgrade_Target**: The version with `isDefault` equal to `true` in the Depsdev_Document.
- **Upgrade_Suggestion**: The record `{version, basis}` with `basis` equal to `registry-default`, stored as the optional field `upgrade` of a scan dependency.
- **Upgrade_Chooser**: The pure function `chooseUpgrade` in `pipeline/mapping/upgrade.ts` (Requirement 4).
- **Version_Comparator**: `semverCompare` for npm and cargo, `pepCompare` for PyPI, from `pipeline/mapping/range-semver.ts` and `range-pep440.ts`.
- **Strict_Version**: A version string that passes `isStrictVersion(ecosystem, version)` of `core/versions/strict-version.ts` (Requirement 5.4).
- **Upgrade_Section**: The part of the Resurrect_Slot with the title "Upgrade to <version>" and the label "From the registry".
- **Upgrade_Command**: One Command_Line of an Upgrade_Section, built by `buildUpgradeBlocks` in `view-model/resurrect-commands.ts`.
- **Resurrect_Slot**, **Resurrect_Model**, **Slot_Package**, **Restless_Ghost**, **Command_Builder**, **Fixed_Words**, **Validated_Name**, **Command_Safe**, **Copy_Button**, **Copy_Status**, **Curated_List**, **Curated_Entry**, **Curated_Loader**, **Live_Contract_Test**, **Upstream_Hint**, **Manifest_Origin**: As defined in `.kiro/specs/resurrect/requirements.md`.
- **Human_Page**: A page meant for a person: `https://www.npmjs.com/package/<name>`, `https://pypi.org/project/<name>/`, `https://crates.io/crates/<name>`, a README, an issue or an advisory page.
- **Machine_Endpoint**: A URL that answers data, not a page: any URL on host `registry.npmjs.org` or `api.osv.dev` or `api.deps.dev`, a path starting `/pypi/` on `pypi.org` that ends in `/json`, or a path starting `/api/` on `crates.io`.
- **Evidence_URL**: The https URL in the field `evidence` of a Curated_Entry, fetched by the Live_Contract_Test.
- **Fixture_Re_Recording**: The orchestrator task that records `request/request` again with the flag-gated recorder.
- **Report**: The file `docs/resurrect-upgrade-report.md`.

## Requirements

### Requirement 1: Fetch the document of a deprecated checked version

**User Story:** As a visitor, I want the deprecation message of the version my project actually uses, so that I read what the maintainers said about that version and not about the latest one.

#### Acceptance Criteria

1. WHEN an npm Lookup_Target has a Checked_Version that is Checked_Deprecated and differs from the Latest_Version and passes Strict_Version, THE Pipeline SHALL fetch the Version_Document of the Checked_Version through the npm source.
2. THE Version_Doc_Plan SHALL require no Version_Document request for a target that is not npm, has no Checked_Version, is not Checked_Deprecated (including `isDeprecated` false, absent or not a boolean), has a Checked_Version equal to the Latest_Version, or has a Checked_Version that fails Strict_Version [PBT].
3. IF the Latest_Version is unknown, THEN THE Version_Doc_Plan SHALL treat the Checked_Version as differing from the Latest_Version.
4. THE Version_Doc_Plan SHALL be pure, total for any Depsdev_Document body (including bodies that throw on read) and independent of the order of the `versions[]` entries [PBT].
5. THE Pipeline SHALL start the Version_Document requests in stage S6, after the Checked_Version is chosen, because the Checked_Version is unknown in stage S5.
6. THE Pipeline SHALL send at most NPM_VERSION_DOCS_MAX Version_Document requests in one scan, choosing targets in ascending code point order of the package name, and SHALL give the remaining targets no Version_Document request.
7. WHEN several dependencies share one Lookup_Target, THE Pipeline SHALL send one Version_Document request for that target.
8. THE Pipeline SHALL send each Version_Document request through the npm source, so that the npm concurrency limit of 8, the per-request timeout, the retry policy, the scan deadline and the L1 upstream cache apply as for the Latest_Document, and SHALL NOT store the Version_Document in L2.
9. THE Pipeline SHALL record each Version_Document request as one Work_Unit of source `npm`, so that a failed request makes the status of the source `npm` partial in the same way as a failed Latest_Document request.
10. IF the Version_Document request answers 404, fails or is cut off by the deadline, THEN THE Pipeline SHALL continue the scan, SHALL build no Version_Hint, and SHALL use the Latest_Document hint as before.
11. THE Pipeline SHALL build the URL of a Version_Document only from the package name and a Checked_Version that passed Strict_Version, each percent-encoded as one path segment.

### Requirement 2: Hint precedence

**User Story:** As a visitor, I want one clear deprecation notice, so that I am not shown two notices that disagree about which version they describe.

#### Acceptance Criteria

1. WHEN a Version_Document has a `deprecated` string that is non-empty after normalization, THE Hint_Combiner SHALL return exactly one Upstream_Hint of kind `deprecation-notice` whose text is that string normalized by `normalizeHintText` and whose `sourceUrl` is null, and SHALL return no hint from the Latest_Document.
2. IF the Version_Document is absent, unavailable, not an object, or has no `deprecated` string that is non-empty after normalization, THEN THE Hint_Combiner SHALL return the hint of the Latest_Document, which is the behavior of `resurrect` Requirement 2.1.
3. WHEN the Checked_Version equals the Latest_Version, THE Pipeline SHALL send no Version_Document request and THE Hint_Combiner SHALL return the hint of the Latest_Document.
4. THE Hint_Combiner SHALL return at most one `deprecation-notice` for an npm target and at most HINTS_MAX_PER_PACKAGE hints in total [PBT].
5. THE Hint_Combiner SHALL NOT throw for any input value, including getters that throw [PBT].
6. THE Resurrect_Slot SHALL show the Version_Hint under the existing label "From the package's deprecation notice", with the registry page link built by `registryLink`.

### Requirement 3: Cache version, request accounting and request report

**User Story:** As a maintainer, I want the extra request counted and the cache invalidated, so that the request budget stays visible and old results are never mixed with new ones.

#### Acceptance Criteria

1. THE Pipeline SHALL use `CACHE_KEY_VERSION` 5 in the Scan_Cache key, so that scans cached before Version_Hints and upgrades existed are not reused.
2. THE `NpmSource` port SHALL declare `getVersion(name, version, ctx)` that sends `GET https://registry.npmjs.org/<name>/<version>`, treats 404 as absent, and applies the same cache policy as `getLatest` (L1 only, `l2Kind` null).
3. THE endpoint pattern table of `scripts/live-report.ts` SHALL show `GET registry.npmjs.org/{package}/latest` and `GET registry.npmjs.org/{package}/{version}` as two different rows, so that the extra request is counted separately.
4. THE unit tests of the pipeline SHALL assert, with scripted sources, the exact number of Version_Document requests for these scans: none deprecated (0), one deprecated differing version (1), the same target in two manifests (1), a deprecated checked version equal to the latest (0), and more than NPM_VERSION_DOCS_MAX deprecated targets (NPM_VERSION_DOCS_MAX).
5. THE Report SHALL state the cold-scan request counts of `request/request` before and after this spec, taken from `npm run live:report`, with the added `{package}/{version}` row.
6. WHEN the Version_Document request of a target is answered from the L1 upstream cache, THE Pipeline SHALL send no network request for it.

### Requirement 4: Choose the upgrade

**User Story:** As a visitor with a deprecated version, I want to know which newer version of the same package is healthy, so that I can upgrade instead of leaving the package.

#### Acceptance Criteria

1. WHEN the Checked_Version is Checked_Deprecated, and the Upgrade_Target exists in the version list of the Depsdev_Document, and the Upgrade_Target does not have `isDeprecated` equal to `true`, and the Version_Comparator ranks the Upgrade_Target higher than the Checked_Version, THE Upgrade_Chooser SHALL return the Upgrade_Suggestion `{version: <Upgrade_Target>, basis: "registry-default"}`.
2. THE Upgrade_Chooser SHALL return null in every other case, including a Checked_Version that is not Checked_Deprecated, a missing Upgrade_Target, a deprecated Upgrade_Target, an Upgrade_Target equal to or lower than the Checked_Version, and a version that the Version_Comparator cannot parse [PBT].
3. WHERE the ecosystem is `npm` and the Latest_Document has a non-empty `deprecated` string and its `version` equals the Upgrade_Target, THE Upgrade_Chooser SHALL return null, so that a deprecation that deps.dev has not yet reported is respected.
4. THE Upgrade_Chooser SHALL use `semverCompare` for npm and cargo and `pepCompare` for PyPI, so that no new comparator exists.
5. THE Upgrade_Chooser SHALL NOT offer an upgrade for a package that is HAUNTED because of advisories, because the Pipeline queries OSV only for the Checked_Version and cannot know whether the Upgrade_Target is free of those advisories.
6. THE Upgrade_Chooser SHALL return the same result for every ordering of the `versions[]` entries and for repeated calls, and SHALL NOT throw for any Depsdev_Document body [PBT].
7. THE Pipeline SHALL set the Upgrade_Suggestion on every scan dependency of the target and SHALL omit the key `upgrade` when the Upgrade_Chooser returns null.
8. THE Upgrade_Chooser SHALL cite in its source comment that `isDeprecated` is the deps.dev flag, which deps.dev sets for npm deprecation and as it reports it for PyPI and crates.io, and SHALL decide only from that flag.

### Requirement 5: Upgrade in the scan result, the validator and the client boundary

**User Story:** As a maintainer of the app, I want the upgrade stored without breaking stored results or recorded fixtures, and checked before it reaches a command, so that old data stays valid and no hostile string becomes a command.

#### Acceptance Criteria

1. THE `ScanDependency` type SHALL declare `upgrade` as an optional field, so that fixtures, e2e bodies and results built before this spec stay valid.
2. WHEN a stored result has no `upgrade` field on a dependency, THE `isScanResult` validator SHALL accept it.
3. IF a stored result has an `upgrade` field that is not a record with exactly the keys `version` and `basis`, with `version` a non-empty string of at most 64 code points and `basis` equal to `registry-default`, THEN THE `isScanResult` validator SHALL reject the result, so that it is a cache miss.
4. THE Core SHALL export a pure function `isStrictVersion(ecosystem, version)` that accepts, for npm and cargo, a semantic version `MAJOR.MINOR.PATCH` with numeric parts without leading zeros and an optional pre-release of dot-separated identifiers of letters, digits and `-`, without build metadata, and for PyPI a release of dot-separated digits with an optional `a`, `b` or `rc` number, an optional `.post` number and an optional `.dev` number, without epoch and without local version; and that rejects every string of more than 64 code points and every non-string.
5. THE function `isStrictVersion` SHALL accept no string that contains a character outside letters, digits, `.` and `-` [PBT].
6. WHEN the client parses a scan response, THE client boundary SHALL narrow each dependency's `upgrade` to null when the field is absent, is not a record with exactly the keys `version` and `basis`, has an unknown `basis`, has a version that fails `isStrictVersion` for the ecosystem of the dependency, or has a version equal to the `lookupVersion` of the dependency [PBT].
7. THE client narrowing SHALL return the same value when applied to its own output [PBT].
8. FOR ALL scan results that the Pipeline produces with generated dependencies and upgrades, serializing to JSON and parsing again SHALL give a value that `isScanResult` accepts and that equals the original (round-trip property) [PBT].

### Requirement 6: The Upgrade_Section of the slot

**User Story:** As a visitor, I want the slot to say "Upgrade to <version>" with a command I can copy, so that I fix a deprecated version in one step.

#### Acceptance Criteria

1. WHEN a Slot_Package has a valid upgrade after narrowing, THE Resurrect_Model SHALL contain an Upgrade_Section with the title "Upgrade to <version>", the label "From the registry" and the sentence "The registry lists this newer version as its default and does not mark it deprecated."
2. THE Resurrect_Slot SHALL show its sections in this order: the urgent sentence (Restless_Ghost only), the Upgrade_Section, the Upstream_Hints, the Curated_Entries, and the fallback paragraph [PBT].
3. WHEN a package is declared in a `package.json`, THE Command_Builder SHALL build the line `npm install <name>@<version>`, with `--save-dev`, `--save-optional` or `--save-peer` inserted after `install` for the scopes `dev`, `optional` and `peer`.
4. WHEN a package is declared in a `requirements.txt`, THE Command_Builder SHALL produce the sentence "Change the line for <name> in <path> to <name>==<version>, then run:" and the line `pip install "<name>==<version>"`.
5. WHEN a package is declared in a `pyproject.toml` whose Pyproject_Tool is `poetry`, THE Command_Builder SHALL build the line `poetry add <name>@<version>` and the block SHALL carry the Poetry group sentence of the `resurrect` spec.
6. WHEN a package is declared in a `pyproject.toml` whose Pyproject_Tool is `pep621`, THE Command_Builder SHALL produce the sentence "Change the entry for <name> in the dependencies of <path> to <name>>=<version>, then run:" and the line `pip install "<name>>=<version>"`.
7. WHEN a package is declared in a `pyproject.toml` whose Pyproject_Tool is `mixed` or unknown, THE Resurrect_Slot SHALL show the Poetry block and the PEP 621 block, each introduced by its tool name, as in `resurrect` Requirement 10.6.
8. WHEN a package is declared in a `Cargo.toml`, THE Command_Builder SHALL build the line `cargo add <name>@<version>`, with `--dev`, `--build` or `--optional` inserted after `add` for the scopes `dev`, `build` and `optional`.
9. WHEN a package is declared in several manifests that need different commands, THE Resurrect_Slot SHALL show one Upgrade_Command block per distinct (origin, scope) pair, each introduced by its manifest path.
10. THE Command_Builder SHALL build every Upgrade_Command only from Fixed_Words, one Validated_Name, one Strict_Version and the fixed characters `@`, `==`, `>=` and the double quote, in the order of the templates above, with single spaces; the double quotes SHALL be fixed text of the template and SHALL NOT come from data [PBT].
11. IF the package name is not Command_Safe for the ecosystem of an origin, or the version is not a Strict_Version, THEN THE Command_Builder SHALL build no Upgrade_Command for that origin, and the Resurrect_Slot SHALL still show the title and the sentence of the Upgrade_Section, and for a version that is not a Strict_Version the Resurrect_Model SHALL contain no Upgrade_Section.
12. WHILE the Resurrect_Model contains an Upgrade_Section, THE Resurrect_Slot SHALL show no fallback paragraph, because the fallback states that no recommended replacement is on record [PBT].
13. THE Resurrect_Model SHALL NOT list the package itself as an Alternative of a Curated_Entry, as before (`resurrect` Requirement 7.7); the Upgrade_Section is separate and names the same package at a newer version.
14. THE Resurrect_Slot SHALL render one Copy_Button per Upgrade_Command block with the accessible name "Copy commands to upgrade <name>", and WHEN the clipboard write succeeds, THE Resurrect_Slot SHALL set the Copy_Status to "Copied the commands for <name>"; the Copy_Status, its 3000-millisecond reset, the failure sentence and the focus rule are those of `resurrect` Requirement 11.
15. THE copied text of an Upgrade_Command block SHALL equal its displayed lines joined by line breaks [PBT].
16. THE Resurrect_Slot SHALL send no network request, SHALL add no animation, and SHALL meet WCAG 2.1 AA with the existing tokens only; THE change SHALL NOT alter the art, the palette, the scene or the header layout.

### Requirement 7: Curated sources and evidence

**User Story:** As a visitor, I want the link of a curated suggestion to open a page I can read, so that I am not sent to a JSON document.

#### Acceptance Criteria

1. THE Curated_List SHALL consist of entries with exactly the six keys `ecosystem`, `from`, `to`, `why`, `source`, `evidence`.
2. THE `source` field SHALL be an https URL without credentials that is a Human_Page and not a Machine_Endpoint.
3. THE `evidence` field SHALL be required for every entry and SHALL be an https URL without credentials.
4. WHERE the evidence of an entry is a registry document (a Machine_Endpoint), THE `source` field SHALL be the registry Human_Page of the `from` package: `https://www.npmjs.com/package/<from>`, `https://pypi.org/project/<from>/` or `https://crates.io/crates/<from>`.
5. WHERE the evidence of an entry is already a Human_Page, THE `source` field MAY equal the `evidence` field.
6. IF an entry has a missing or extra key, an `evidence` or `source` value that is not https, has credentials, or a `source` that is a Machine_Endpoint, THEN THE Curated_Loader SHALL drop that entry and keep the others, without throwing [PBT].
7. THE Resurrect_Model SHALL use `source` as the only curated link, and no `href` of the Resurrect_Model SHALL equal the `evidence` of an entry unless that URL is also the `source` of the same entry [PBT].
8. THE data test `tests/ui/view-model/resurrections-data.test.ts` SHALL check, for every entry of the real file, the six keys, both URLs https without credentials, `source` not a Machine_Endpoint, the registry-page rule of criterion 4, and that the loader keeps every entry.
9. THE other rules of `resurrect` Requirement 6 (names, `why`, sorting, one entry per normalized `from`, at least 8 entries per ecosystem, no `uuid` as `from`) SHALL continue to hold.
10. ONE task SHALL update the curated tables of `docs/resurrect-report.md` so that they list `source` and `evidence` in separate columns.

### Requirement 8: Live contract test of the evidence

**User Story:** As a maintainer, I want each evidence URL fetched and checked, so that the list stays honest when a page moves or changes.

#### Acceptance Criteria

1. WHERE `GRAVEKEEPER_LIVE_TESTS` is set to `1`, THE Live_Contract_Test SHALL fetch the Evidence_URL of every entry and SHALL require an answer with status 200 after at most 3 redirects.
2. WHERE `GRAVEKEEPER_LIVE_TESTS` is set to `1`, THE Live_Contract_Test SHALL require that the first 1 MiB of the evidence body contains at least one `to` name of the entry, compared case-insensitively, so that the page still states the replacement or the deprecation.
3. WHEN `GRAVEKEEPER_LIVE_TESTS` is not `1`, THE Live_Contract_Test SHALL skip every evidence case and send no request.
4. THE Live_Contract_Test SHALL send a User-Agent that names the project, SHALL run at most 4 requests at a time, SHALL NOT print, log or write the token, and SHALL name only the ecosystem, the package and the failed check in a failure message.
5. THE existing `to` target checks of `resurrect` Requirement 8.2 to 8.4 SHALL stay unchanged.
6. IF the evidence check of an entry fails, THEN THE orchestrator SHALL replace the Evidence_URL by a working URL that states the replacement, or drop the entry, and SHALL record the change in `docs/resurrect-report.md`.

### Requirement 9: Fixtures, verification and report

**User Story:** As a maintainer, I want the new behavior shown on real recorded data and documented, so that I can trust it without running it.

#### Acceptance Criteria

1. THE Fixture_Re_Recording SHALL record only `request/request`, with `npm run fixtures:record -- --only request/request` and a token from `gh auth token` inside the command, because the recorded set holds only the `/latest` documents and a replay without the Version_Documents of the checked versions of `uuid` and `rimraf` ends with "replay missed a request".
2. THE Fixture_Re_Recording SHALL leave the sets `revmic/canopy`, `ajeetdsouza/zoxide`, `psf/requests` and `_supplementary` byte-identical, which a check of `git status` and `git diff --stat` before the commit SHALL confirm.
3. THE replay test of the `request/request` set SHALL show that the dependency `uuid` carries a Version_Hint, that `uuid` and `rimraf` carry an upgrade whose version is the deps.dev default and is higher than their `lookupVersion`, and that a target whose checked version is the latest carries no extra request.
4. THE properties RU-P1 to RU-P8 SHALL each have one property test, tagged as in Conventions, and `tests/ui/ru-traceability.test.ts` SHALL check the tags, and `docs/property-traceability.md` SHALL list them.
5. THE end-to-end suite SHALL cover the Upgrade_Section for `uuid` and `rimraf` of the `request/request` fixture (title, label, command, copy), the absence of the Upgrade_Section and of the fallback conflict for `har-validator`, and axe on each opened panel with no violation.
6. THE Report SHALL show, for `uuid`, `rimraf`, `har-validator` and a synthetic `request` row (labelled synthetic), the text that the slot shows now, the properties with any counterexample (or the sentence "no counterexample found"), the commits with their CI status, the request counts of Requirement 3.5, and the live smoke result.
7. THE three screenshots under `docs/screenshots/resurrect/` (`resurrect-buried-har-validator.png`, `resurrect-forgotten-aws-sign2.png`, `resurrect-restless-uuid.png`) SHALL be regenerated with the same file names by `tests/e2e/resurrect-report.spec.ts` with `RS_REPORT=1`.
8. WHEN the commits of this spec are deployed, THE orchestrator SHALL run the live smoke for `request/request` against `https://gravekeeper-chi.vercel.app` and SHALL report the hints and the upgrade of `uuid` and `rimraf` in the Report.
9. THE client JavaScript budget (`npm run check:bundle`, `tests/e2e/js-budget.spec.ts`) and the scene render budgets SHALL stay unchanged and green.
10. EVERY existing test SHALL stay green and SHALL change only where this spec legitimately changes a behavior, as listed in the design.
