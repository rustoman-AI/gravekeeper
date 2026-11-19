# Requirements Document

## Introduction

This spec covers the user interface of Gravekeeper. A visitor pastes a public GitHub repository URL (or picks a featured repository), the UI calls `POST /api/scan`, and the result is shown as an interactive moonlit graveyard: tombstones for DEAD packages, ghosts for HAUNTED packages (a ghost standing over its own tombstone when the HAUNTED package is also archived or deprecated), lit lanterns for ALIVE packages and unmarked graves for packages that could not be assessed. An accessible table, a detail panel, "Caretaker's notes" and themed error screens complete the experience.

The UI reads only the data the API and `/core` already provide. Before these requirements were written, every field the UI will read was checked against the types (`pipeline/scan/types.ts`, `pipeline/api/scan-error.ts`, `pipeline/scan/messages.ts`, `core/model/types.ts`), against `.kiro/specs/scan-pipeline/requirements.md` (Requirement 18, Requirement 21, Scan_Note codes, User-facing messages) and against real `ScanResult` values obtained by replaying the three recorded fixture sets (`request__request`, `revmic__canopy`, `ajeetdsouza__zoxide`) through `runScan` with a throwaway script that was deleted afterwards (no repository change). The outcome is the "Data inventory" and "Data gaps" sections below. No requirement depends on a field that is not in the API, except where it states a derivation (Data gaps) or a fallback.

The UI is a consumer: the scan pipeline, the API and `/core` are used as they are after scan-accuracy, with exactly one additive exception that this revision adds because a data gap cannot be closed by derivation: the field `excluded` of each Advisory_Entry (DG-21, Requirement 22). The additive changes that the first version of this document recommended (advisory entries, `resolved` version basis, a cache header, manifest candidates in errors, exported core merge functions) have been made by the spec `.kiro/specs/scan-accuracy` (requirements 1 to 9, committed before this revision). This revision reads the updated `pipeline/scan/types.ts`, `pipeline/api/scan-error.ts`, `core/index.ts` and `core/model/constants.ts`, and closes the matching Data gaps (each marked "closed by scan-accuracy"). Two scan-accuracy rule changes alter UI-visible text: criterion core 8.3 now uses `COMMIT_ABANDONMENT_DAYS` (730) for the commit age and criterion core 8.4 (dormant releases) is a separate, non-abandoning rule, and the unknown-facts reason `6.3` no longer lists `maxSeverity` when `openVulnerabilityCount` is 0 and uses corrected grammar. The Strongest_Reason priority table is unchanged.

Grave types (user decision, recorded in this revision): a DEAD package is either **buried** (a tombstone: archived, deprecated or flagged unmaintained by an advisory) or **forgotten** (an overgrown, ivy-covered grave: no recent release and no recent commit, but neither archived nor deprecated). Requirement 7 defines both from the `ruleId` values of the merged classification, and Requirement 5 shows the counts in the Headline.

Restless ghosts (user decision, final revision): a HAUNTED package whose merged classification also contains the rule `8.1` (archived) or `8.2` (deprecated) is drawn as a **restless ghost**: a ghost standing over its own tombstone. Its status word is "haunted, buried". The restless ghost is HAUNTED and nothing else: it counts in H (haunted) of the Headline, it does NOT count in B (buried), because B counts DEAD packages only, and it has no Grave_Type. Requirement 7, criterion 20 defines it.

Headline (user decision, final revision): "N of M dependencies are in the graveyard: B buried, F forgotten, H haunted." A part whose count is 0 is omitted (Requirement 5, criterion 2).

This Next.js version has breaking changes (see `AGENTS.md`). The design phase MUST read the relevant guides in `node_modules/next/dist/docs/` (routing and `searchParams` handling, client components, `next/font`, metadata, `next/navigation`) before specifying any page, layout, font or navigation code, and MUST cite the guides it read. The requirements stay framework-neutral where possible.

The steering file `.kiro/steering/ui-design.md` now exists (added in session 14). Its art direction, assets and fonts, voice and accessibility sections agree with Requirements 15 and 16, and Requirements 15 and 16 are kept in line with it (Open question 12, answered). Where `ui-design.md` and this document differ, `ui-design.md` takes precedence.

### Out of Scope

- Resurrect logic: alternative suggestions and manifest patches. Only a marked placeholder slot is in scope (Requirement 12).
- Accounts, login, saved graveyards and history beyond the browser history.
- Private repositories. The UI only forwards what the API accepts.
- Sound of any kind.
- Any change to `/core`, `/pipeline` or `/adapters`, except the single additive field `excluded` of the Advisory_Entry (Requirement 22), which is a listed pipeline task with tests. The UI consumes everything else as it is after scan-accuracy.
- A custom advisory page. Advisory links go to the `url` of each Advisory_Entry (`https://osv.dev/vulnerability/<id>`), nothing else.
- Resolving or explaining a version range in the UI beyond the three version-basis words of Requirement 10.
- Server-side rendering of scan results. The scan is requested by the browser (Open question 3).
- Localization. All copy is English.
- Auto-detection of repository shorthand such as `owner/repo`. The API accepts full URLs only and the UI forwards the URL as typed (Open question 6).
- Export, print and image-download of the graveyard.

### Conventions

- Criteria tagged **[PBT]** are verified with fast-check in files named `<module>.property.test.ts` (steering `structure.md`). Untagged criteria use example-based tests (Vitest, Testing Library or Playwright).
- Every criterion that reads an API field cites the Data inventory row it relies on as `(DI-n)`, and every criterion that relies on a derivation or a fallback cites the Data gaps row as `(DG-n)`.
- Every threshold, limit, size and budget is a named constant in the Constants table. Criteria refer to constants by name.
- "Plain message" means the `message` string of a Scan_Note or Scan_Error exactly as the API returned it, or the `message` string of a core Reason exactly as core returned it. "Themed copy" is UI text that wraps a plain message. Themed copy never replaces, rewrites, truncates or hides a plain message (Requirement 15, criterion 6).
- Source code cites the requirement number in a comment above each rule (steering rule).
- Files use kebab-case, components use PascalCase, one component per file, no default exports except Next.js route files (steering `structure.md`).

## Glossary

- **Gravekeeper_UI**: The whole user interface specified here: pages, components and the View_Model.
- **Scan_API**: `POST /api/scan` as defined in `.kiro/specs/scan-pipeline/requirements.md`, Requirement 21.
- **Scan_Result**: The `ok: true` response body of the Scan_API (type `ScanResult`, `pipeline/scan/types.ts`).
- **Scan_Error**: The `ok: false` response body of the Scan_API (`{ ok: false, error: { code, message, details? } }`, `pipeline/api/scan-error.ts`).
- **Scan_Client**: The browser-side module that sends the request, measures elapsed time, supports cancel, reads the `Retry-After` and `X-Gravekeeper-Cache` headers and returns either a validated Scan_Result with its Cache_Status, a Scan_Error with its HTTP status and `Retry-After` value, or a Client_Failure.
- **Cache_Status**: `hit`, `miss` or `unknown`. `hit` and `miss` are the values of the response header `X-Gravekeeper-Cache` (`CACHE_STATUS_HEADER`, scan-accuracy Requirement 7). Any other value or a missing header is `unknown`.
- **Advisory_Entry**: `{ id, aliases, severity, url, excluded }` of `ScanDependency.advisories` (scan-accuracy Requirement 6, plus `excluded` from Requirement 22 of this spec). `severity` is a Severity or `null`. `url` starts with `https://osv.dev/vulnerability/`. `excluded` is `'withdrawn'`, `'informational'` or `null` (`null` means the entry is counted in `openVulnerabilityCount`).
- **Advisory_Group**: One labelled list of the Detail_Panel's advisory section: "Counted as open", "Informational, not counted", "Withdrawn, not counted", or "Not classified" (Requirement 10, criterion 16).
- **Exclusion**: The parsed classification of one Advisory_Entry: `counted`, `informational`, `withdrawn` or `unknown`. Derived by Requirement 14, criterion 5 from `excluded` and, when `excluded` is absent (a scan result produced before Requirement 22), from the `informational-advisory-excluded` note (DG-21).
- **Version_Basis**: `pinned`, `resolved`, `default` or `null`, the value of `ScanDependency.versionBasis`.
- **Manifest_Candidates**: The list `details.candidates` (paths) of the errors `too-many-manifests` and `manifest-not-found`.
- **Manifest_Picker**: The list of checkboxes with a "Scan selected manifests" button, built from `discovery.candidates` (Requirement 11, criterion 11) or from Manifest_Candidates (Requirement 13, criterion 15).
- **Grave_Type**: Of a Tombstone-class Package_Row (merged status DEAD): `buried` or `forgotten`, defined by Requirement 7, criterion 4. HAUNTED, ALIVE and unassessed Package_Rows have no Grave_Type.
- **Buried_Grave**: Plot of a DEAD Package_Row whose Grave_Type is `buried`: a tombstone.
- **Forgotten_Grave**: Plot of a DEAD Package_Row whose Grave_Type is `forgotten`: an overgrown, ivy-covered grave whose epitaph says the package may be finished or abandoned.
- **Client_Failure**: A failure that the Scan_API did not describe: `network-failure` (fetch rejected), `timeout` (no response within `CLIENT_FETCH_TIMEOUT_MS`), `malformed-response` (the body is not JSON or does not match the Scan_Response contract of Requirement 21).
- **View_Model**: The pure TypeScript module (no React, no DOM, no `Date.now`, no `fetch`, no randomness) that maps a Scan_Result to the Scene_Model, the Table_Model, the Header_Model, the Notes_Model and the Detail_Model, and maps a Scan_Error to the Error_Model.
- **Package_Row**: One unique package of a Scan_Result, identified by the Package_Key. The set of Package_Rows has exactly `summary.total` elements (DI-3).
- **Package_Key**: `(ecosystem, name, sourceKind)` of a Dependency, the same key core uses to build unique packages (`core/model/types.ts`, `PackageKey`).
- **Plot**: The scene element of one Package_Row. A Plot is a Tombstone, an Overgrown_Grave, a Ghost, a Restless_Ghost, a Lantern or an Unmarked_Grave. The six values of `PlotKind` are `tombstone`, `overgrown`, `ghost`, `restless`, `lantern`, `unmarked`.
- **Tombstone**: Plot of a Package_Row whose merged classification status is DEAD and whose Grave_Type is `buried` (Buried_Grave).
- **Overgrown_Grave**: Plot of a Package_Row whose merged classification status is DEAD and whose Grave_Type is `forgotten` (Forgotten_Grave).
- **Ghost**: Plot of a Package_Row whose merged classification status is HAUNTED and whose reasons contain neither `8.1` nor `8.2`.
- **Restless_Ghost**: Plot of a Package_Row whose merged classification status is HAUNTED and whose reasons contain `8.1` or `8.2`: a ghost over its own tombstone. Status word "haunted, buried". It has a Glow_Level like a Ghost, it counts in H (haunted) and not in B (buried), and it has no Grave_Type.
- **Haunted_Count**: H of the Headline: `summary.counts.HAUNTED`, which includes every Ghost and every Restless_Ghost.
- **Lantern**: Plot of a Package_Row whose merged classification status is ALIVE.
- **Unmarked_Grave**: Plot of a Package_Row that has no merged classification: a `git` dependency, a `path` dependency, a registry dependency skipped by the cap, or a registry dependency with no health data (Unassessed_Cause).
- **Unassessed_Cause**: One of `git`, `path`, `cap-skipped`, `no-health-data`, derived by DG-10.
- **Merged_Classification**: The highest-risk Classification among the dependency entries of one Package_Row, as returned by the core function `uniquePackages` (which calls `mergeClassifications` with `compareClassifications`: score descending, then HAUNTED, DEAD, ALIVE, then tie keys). The View_Model calls these core exports and never re-implements the order (DG-1, closed by scan-accuracy).
- **Strongest_Reason**: The Reason of a Merged_Classification chosen by the Reason_Priority table of Requirement 7 (DG-2).
- **Glow_Level**: An integer 1 to 4 of a Ghost or a Restless_Ghost derived from the maximum severity of the package's Advisory_Entries (DG-3, closed by scan-accuracy).
- **Scene**: The graveyard drawing of all Plots.
- **Scene_Model**: The View_Model output for the Scene: the Plot list with label, status, position, size and Glow_Level, plus the Scene dimensions.
- **Table_Model**: The View_Model output for the List_View: one row per Package_Row with sortable columns.
- **List_View**: The table alternative to the Scene.
- **Detail_Panel**: The panel that shows everything known about one Package_Row.
- **Header_Model**: The View_Model output for the results header: owner/repo, Short_SHA, asOf, Headline, status counts, Grade_Line.
- **Headline**: The sentence "N of M dependencies are in the graveyard: B buried, F forgotten, H haunted." where N = DEAD + HAUNTED of the assessed unique packages (equal to `summary.counts.DEAD + summary.counts.HAUNTED`), M = `summary.assessed`, B = the number of DEAD packages with Grave_Type `buried`, F = the number of DEAD packages with Grave_Type `forgotten` and H = `summary.counts.HAUNTED` (Ghosts and Restless_Ghosts). A part whose count is 0 is omitted. A Restless_Ghost counts in H and not in B, so B + F = DEAD, H = HAUNTED and N = B + F + H. The exact text rules are in Requirement 5, criterion 2.
- **Grade_Line**: The grade letter labelled "worst single risk" with a one-line explanation (Requirement 5).
- **Caretakers_Notes**: The section that shows Scan_Notes grouped by kind and the six Source_Statuses.
- **Note_Group**: All Scan_Notes of one `code`, shown under one themed heading.
- **Source_Status**: `ok`, `partial` or `failed` for each of `github`, `depsdev`, `osv`, `npm`, `cratesio`, `pypi` (DI-18).
- **Canonical_Repo_URL**: `https://<repo.host>/<repo.owner>/<repo.repo>`, with `/tree/<repo.branch>` appended when `repo.branch` differs from `repo.defaultBranch` (DG-8).
- **Short_SHA**: The first `SHORT_SHA_LENGTH` characters of `repo.commitSha` (DG-7).
- **Featured_Graveyard**: One of the entries of `FEATURED_GRAVEYARDS`.
- **Scanning_Screen**: The screen shown while a request is in flight.
- **Stage**: One of the four honest labels of the Scanning_Screen (Requirement 4).
- **Error_Screen**: The themed screen for a Scan_Error or a Client_Failure.
- **Error_Model**: The View_Model output for an Error_Screen: themed heading, plain message, next action(s), and the `Retry-After` countdown when present.
- **Resurrect_Slot**: The clearly marked, inert placeholder for the later Resurrect feature.
- **Reduced_Motion**: The state in which the media query `prefers-reduced-motion: reduce` matches.
- **Unknown_Value**: A fact whose value is `null`, absent, or not of the type the fact requires. An Unknown_Value is always shown as the word "unknown" and never as `0`, `false` or empty.
- **Recorded_Fixture**: One of the three Fixture_Sets under `tests/fixtures/` replayed into a Scan_Result.
- **Synthetic_Fixture**: A Scan_Result built by a typed test builder for states the Recorded_Fixtures do not contain (Data gaps, DG-17).

## Data inventory

Each row names a UI element and the exact fields it reads. Paths are relative to the Scan_Result unless stated. "Per package" means the entries of `dependencies` and `assessed` that share a Package_Key (the same index in both arrays, Scan-pipeline Requirement 18, criterion 3). Observations come from the replay of the Recorded_Fixtures. The fixtures were re-recorded by scan-accuracy (task 7.1) after the first version of this table was written, so counts that depend on versions or thresholds (status counts, grade, `versionBasis`) are not repeated here as constants. The tests derive them from the replay at test time (Requirement 19, criterion 6). `docs/scan-accuracy-live-report.md` (live scan of `request/request`, 2026-11-19) shows the post-change shape: 40 unique packages, ALIVE 9, HAUNTED 5, DEAD 26, grade D, `versionBasis` `resolved` for all 40, 8 advisories.

### Header and headline

| ID | UI element | Fields read | Observed in Recorded_Fixtures |
|---|---|---|---|
| DI-1 | Repository name `owner/repo` | `repo.owner`, `repo.repo` (GitHub's spelling) | `request/request`, `revmic/canopy`, `ajeetdsouza/zoxide` |
| DI-2 | Short commit SHA, branch | `repo.commitSha` (40 hex), `repo.branch`, `repo.defaultBranch` | `main`/`master`, equal to default in all three |
| DI-3 | Package count M and unique count | `summary.total` (unique packages), `summary.assessed`, `summary.unassessed` | zoxide has 22 dependency entries but `summary.total` 20 (same crate in several scopes); `capped.total` counts Lookup_Targets, not packages |
| DI-4 | Headline N of M and the counts B, F and H | `summary.counts.DEAD`, `summary.counts.HAUNTED` (H, includes restless ghosts), `summary.assessed`, and for B and F the `reasons[].ruleId` of each DEAD Merged_Classification (DI-12) | replay-derived (see the note above). The `request` live scan has 26 DEAD and 5 HAUNTED, so N = 31 and M = 40 |
| DI-5 | Status counts | `summary.counts.ALIVE`, `summary.counts.HAUNTED`, `summary.counts.DEAD`, `summary.unassessed` | replay-derived |
| DI-6 | Grade and Grade_Line | `summary.grade` (`A`..`F` or `null`), `summary.maxScore`, `summary.maxScorePackage` (`name`, `ecosystem`), `summary.averageScore` | `request` live scan: grade D |
| DI-7 | Grade scale (legend of the Grade_Line) | `GRADE_A_MAX` 19, `GRADE_B_MAX` 39, `GRADE_C_MAX` 59, `GRADE_D_MAX` 79 from `core/model/constants.ts` | not in the Scan_Result |
| DI-8 | "As of" time | `asOf` (ISO 8601 UTC string) | `2026-11-19T02:16:38.764Z` |

### Scene and table (per Package_Row)

| ID | UI element | Fields read | Observed in Recorded_Fixtures |
|---|---|---|---|
| DI-9 | Plot identity and label | `dependencies[i].dependency.name`, `.rawName`, `.ecosystem`, `.sourceKind`, `.scope` | pypi: `flask-script` has `rawName` `Flask-Script` |
| DI-10 | Plot kind and Grave_Type | Merged_Classification `.status` from `uniquePackages(assessed)` (DG-1), the `reasons[].ruleId` of a DEAD classification (Grave_Type), the `reasons[].ruleId` of a HAUNTED classification (ghost or restless ghost) or, when the classification is null, `summary.unassessedItems[].unassessedReason`, `.sourceKind` | all three Recorded_Fixtures have 0 unassessed items |
| DI-11 | Score | Merged_Classification `.score` (integer 0..100) | 0..50 |
| DI-12 | Epitaph (Strongest_Reason) | Merged_Classification `.reasons[].ruleId`, `.reasons[].message` | ruleIds seen: `6.3`, `7.2`, `8.1`, `8.2`, `8.3`, `8.4`, `10.6`, `10.8`. The core order is ascending ruleId, so the first reason is `6.3` whenever a reportable fact is unknown. Since scan-accuracy criterion 2 the `6.3` reason is absent when only `maxSeverity` is unknown and `openVulnerabilityCount` is 0, so the first-reason noise is smaller, but the first reason can still be a `6.3` notice, so the Reason_Priority table stays (DG-2). `8.3` now requires a commit age of at least `COMMIT_ABANDONMENT_DAYS` (730) or an unknown commit age, and `8.4` (dormant releases, recent commits) does not make a package DEAD |
| DI-13 | Ghost and restless ghost glow | `dependencies[i].advisories[].severity` (Severity or `null`), with `facts.maxSeverity` and `facts.openVulnerabilityCount` as the fallback | HAUNTED means `vulnerable` (core `statusOf`), so `openVulnerabilityCount` is above 0 for every Ghost. `advisories` can be longer than `openVulnerabilityCount` (withdrawn and informational entries are listed, scan-accuracy criterion 6.11) and every entry can have `severity` `null` (details not fetched). Then core assumes `MEDIUM` (DG-3). Live example: `form-data` has two advisories, one `HIGH` and one with severity unknown |
| DI-14 | Scopes, manifests | `dependencies[i].dependency.scope`, `dependencies[i].manifestPath`, `manifests[].path` | zoxide scopes runtime 13, dev 4, build 5 |
| DI-15 | Sort columns of the table | name, ecosystem, status, score, scope, version basis, checked version | n/a |

### Detail panel (per Package_Row)

| ID | UI element | Fields read | Observed in Recorded_Fixtures |
|---|---|---|---|
| DI-16 | Status, score, every reason message | Merged_Classification `.status`, `.score`, `.reasons[].message`, `.reasons[].ruleId`, `.reasons[].facts[]` | request `har-validator`: four reasons, `6.3`, `8.2`, `8.4`, `10.8` |
| DI-17 | Facts with values | `dependencies[i].facts.{daysSinceLastRelease, daysSinceLastCommit, archived, deprecated, openVulnerabilityCount, maxSeverity, maintainerCount}`. Typed `RawHealthFacts`, so each value is `unknown` at the type level | canopy: `maintainerCount` null 4 of 6, `archived` null 4 of 6, `daysSinceLastCommit` null 4 of 6; request: `maxSeverity` null 40 of 40, including packages with 0 vulnerabilities |
| DI-18 | Checked version and basis | `dependencies[i].lookupVersion`, `dependencies[i].versionBasis` (`pinned`, `resolved`, `default`, `null`), `dependencies[i].dependency.versionSpec` | live `request`: 40 of 40 `resolved`. `resolved` means the highest published non-prerelease version that satisfies the declared range (scan-accuracy Requirement 3). `default` now means no declared range, or a range that could not be resolved (note `range-unresolved`) |
| DI-19 | Notes about this package | `notes[].code`, `.message`, `.details.ecosystem`, `.details.name` (and `details.sourceRepo`, `details.pinned`, `details.pins`, `details.ids`) | request: 40 `source-repo-unverified` notes, one per package; zoxide: 7 `maintainers-lower-bound`, 1 `unmaintained-advisory`, 1 `informational-advisory-excluded` |
| DI-20 | Registry page link | `dependency.ecosystem`, `dependency.name` (DG-4) | not in the Scan_Result |
| DI-21 | Source repository link | `notes[]` with `code` `source-repo-unverified` and `details.sourceRepo` (format `github.com/owner/repo`) (DG-5) | present for all packages in the three fixtures |
| DI-22 | Advisories and their groups | `dependencies[i].advisories[]` (`id`, `aliases`, `severity`, `url`, and `excluded` after Requirement 22), equal for every entry of one Lookup_Target; `facts.openVulnerabilityCount` for the count (DG-6, closed by scan-accuracy). Informational ids are also in the note `informational-advisory-excluded` (`details.ids`), unmaintained ids in `unmaintained-advisory` (cargo only). Withdrawn ids are in no note and no other field (DG-21) | bincode: `RUSTSEC-2025-0141`. Live `request`: 8 advisories in total |
| DI-23 | Resurrect_Slot visibility | Merged_Classification `.status` equals `DEAD` | n/a |

### Caretaker's notes, sources, manifests

| ID | UI element | Fields read | Observed in Recorded_Fixtures |
|---|---|---|---|
| DI-24 | Note groups and plain messages | `notes[].code` (23 codes in `NoteCode`, including the new `range-unresolved`), `notes[].message`, `notes[].details` | request: 40 notes of one code. The group view must collapse such lists (Requirement 11) |
| DI-25 | Six source statuses | `sources.github`, `sources.depsdev`, `sources.osv`, `sources.npm`, `sources.cratesio`, `sources.pypi` (each `ok`, `partial`, `failed`) | all `ok` in the three fixtures |
| DI-26 | Source named by a source note | `notes[].details.source`, `.reasons`, `.failedUnits`, `.applicableUnits` for `source-partial` and `source-failed` (the `source-failed` message has no `{source}` placeholder) | none in the fixtures |
| DI-27 | Cap banner and cap-skipped packages | `capped.limit`, `capped.total`, `capped.skipped[]` (`ecosystem`, `name`), note `dependency-cap-exceeded` | `skipped` is empty in all three |
| DI-28 | Manifests scanned and manifest picker | `manifests[]` (`path`, `format`, `warnings[]`), `discovery.candidates[]` (`path`, `format`, `depth`, `sizeBytes`), `discovery.truncatedTree`, `discovery.depthLimited`, `discovery.countLimited`. In an error: `error.details.candidates` (paths only, no format or size) of `too-many-manifests` and `manifest-not-found` (DG-20, closed by scan-accuracy) | one manifest each at depth 0 |

### Errors and transport

| ID | UI element | Fields read | Observed |
|---|---|---|---|
| DI-29 | Error screen | `error.code` (9 codes), `error.message`, `error.details` per code (`reason`, `field`, `part`, `limit`, `path`, `candidates`, `branch`, `source`, `resetAt`), HTTP status | from `scan-error.ts`, `types.ts` (`ScanErrorBody`) and `messages.ts` |
| DI-30 | Retry-After | Response header `Retry-After` (integer seconds, present only on 503 `upstream-unavailable`), `error.details.resetAt` | not in the body (DG-12) |
| DI-31 | Cache indicator | Response header `X-Gravekeeper-Cache` (`hit` or `miss`), present only on HTTP 200, never in the body (scan-accuracy Requirement 7) | live `request`: cold scan `miss`, immediate repeat `hit` (DG-9, closed by scan-accuracy) |

## Data gaps

"Derivable" means the UI can compute the value in the View_Model from existing fields with no API change. "API change" and "Core change" mean the value cannot be obtained or can only be obtained at a cost or with a loss. No API change is made by this spec.

| ID | Data the UI needs | Verdict | Detail and recommendation |
|---|---|---|---|
| DG-1 | Merged_Classification for every Package_Row | **Closed by scan-accuracy.** | `core` exports `uniquePackages`, `mergeClassifications` and `compareClassifications` (`core/index.ts`, scan-accuracy Requirement 9). The View_Model calls `uniquePackages(result.assessed)` and joins the facts, advisories and version fields of `dependencies` by Package_Key. It never re-implements the merge order. A property test compares the grouping with `summarize` (Requirement 7, criterion 11). |
| DG-2 | Strongest_Reason ordering | **Derivable.** | The ruleId set is closed (`6.3`, `7.2`, `8.1`, `8.2`, `8.3`, `8.4`, `10.6`, `10.7`, `10.8`, `11.2`, core Requirement 11). Core orders reasons ascending by ruleId, so the first reason can be `6.3` ("unknown facts add no risk points"), a notice and not a cause. Scan-accuracy removed the most frequent `6.3` case (unknown `maxSeverity` with no open vulnerability), but the notice still occurs for other unknown facts. The View_Model applies the Reason_Priority table of Requirement 7. |
| DG-3 | Maximum severity for the Ghost glow | **Closed by scan-accuracy, with a fallback.** | Use the highest `severity` among the `advisories` of the package (the list is equal for every entry of one Lookup_Target, and the View_Model takes the maximum over all entries of the Package_Row). Advisory severities can all be `null` when OSV details were not fetched. Then use the highest `facts.maxSeverity` of the Package_Row, and when that is `null` for a HAUNTED package use `DEFAULT_SEVERITY` (`MEDIUM`), exactly as core assumes in the `7.2` reason text. |
| DG-4 | Registry page URL per ecosystem | **Derivable by convention, partly checked.** | `https://www.npmjs.com/package/<name>` (scoped names keep the `@scope/name` form, each segment encoded), `https://pypi.org/project/<name>/`, `https://crates.io/crates/<name>`. Checked on 2026-11-19: the PyPI and crates.io patterns answer 200, the npm pattern answers 403 to scripted clients and could not be confirmed (Open question 5, answered). |
| DG-5 | Source repository link | **Partly derivable.** | Only the note `source-repo-unverified` carries `details.sourceRepo`. A package without that note has no source link. The link is labelled "unverified, from package metadata" because the note says so. API change optional: a per-package `sourceRepo` field. |
| DG-6 | Advisory IDs and links per package | **Closed by scan-accuracy.** | Every `dependencies[i].advisories` entry has `id`, `aliases`, `severity` and an `osv.dev/vulnerability/<id>` `url` that the pipeline built with percent-encoding. The Detail_Panel lists them with their links (Requirement 10). `openVulnerabilityCount` can be lower than `advisories.length` (withdrawn and informational entries, and entries that are aliases of each other count once), so the panel lists the entries in labelled Advisory_Groups and states the counts of each group (Requirement 10, criterion 16, DG-21). No OSV search URL is used. |
| DG-7 | Short commit SHA | **Derivable.** | First `SHORT_SHA_LENGTH` characters of `repo.commitSha`. The full SHA is shown in the tooltip and detail text. |
| DG-8 | Canonical URL for `/?repo=` | **Derivable.** | `https://<repo.host>/<repo.owner>/<repo.repo>` plus `/tree/<repo.branch>` when `repo.branch` differs from `repo.defaultBranch`. The API echoes GitHub's spelling, so the UI can replace a differently-spelled query value with the canonical one after the first result. |
| DG-9 | Cache-hit indicator | **Closed by scan-accuracy.** | The route sets `X-Gravekeeper-Cache: hit` or `miss` on every HTTP 200 and never in the body. The Scan_Client reads it into Cache_Status. The UI shows an optional "from the caretaker's records" indicator for `hit` (Requirement 3, criterion 10). It still shows the age of `asOf`. A missing or unrecognised header value is `unknown` and shows no indicator. |
| DG-10 | Unassessed cause | **Derivable.** | `summary.unassessedItems[].sourceKind` is `git` or `path` for `non-registry-source`. For `no-health-data`, the cause is `cap-skipped` when `(ecosystem, name)` is in `capped.skipped`, otherwise `no-health-data`, with the `package-not-found` note (`details.ecosystem`, `details.name`) as the specific reason when present. |
| DG-11 | Version basis pinned, resolved or latest | **Closed by scan-accuracy.** | `versionBasis` is `pinned`, `resolved`, `default` or `null` and is equal for all entries of one Lookup_Target. The Detail_Panel shows "pinned", "resolved from range" and "latest" (Requirement 10, criterion 6). The reason a pin or a range was not used is derivable from the notes `pin-not-found`, `conflicting-pins`, `range-unresolved` and `no-default-version`. |
| DG-12 | Retry-After | **Derivable from the response.** | Not in the body. The Scan_Client reads the `Retry-After` header (same origin). `error.details.resetAt` is a second source. The 502 variant has no header and no `resetAt`. |
| DG-13 | Scopes and manifests per package | **Derivable.** | Union of `dependency.scope` and `manifestPath` over the entries of a Package_Row, sorted by core `SCOPE_ORDER` and by path. |
| DG-14 | Notes per package | **Derivable.** | Notes whose `details.ecosystem` and `details.name` equal the package. Notes without those keys are repository-level. |
| DG-15 | Typed facts | **Boundary validation needed.** | `facts` is typed `RawHealthFacts` (every value `unknown`). The Scan_Client boundary narrows each value: number (finite, integer, 0 or more) for counts and days, boolean for `archived` and `deprecated`, `LOW`/`MEDIUM`/`HIGH`/`CRITICAL` for `maxSeverity`, anything else becomes an Unknown_Value. |
| DG-16 | Grade explanation data | **Available.** | `maxScore`, `maxScorePackage`, `averageScore`, `grade` and the grade thresholds (DI-7). |
| DG-17 | Recorded_Fixture coverage | **Test gap, not an API gap.** | The Recorded_Fixtures contain no HAUNTED package without severity, no unassessed item, no `capped.skipped`, no `partial` or `failed` source, no `no-manifests` or `no-root-manifest` note, no ghost in `request` or `zoxide`, and no error. Synthetic_Fixtures built by typed builders are required for these states (Requirement 19). |
| DG-18 | Core message wording | **Closed by scan-accuracy.** | Core reason `6.3` now reads "This health fact is unknown and adds no risk points: <name>." or "These health facts are unknown and add no risk points: <names>." (scan-accuracy criteria 2.4 and 2.5), and omits `maxSeverity` when `openVulnerabilityCount` is 0. The UI still shows core messages unchanged. |
| DG-19 | Number of unique packages can exceed `SCENE_MAX_PLOTS` | **Not capped by the API.** | `SCAN_MAX_DEPENDENCIES` caps registry Lookup_Targets. `git` and `path` packages and packages across ecosystems are not capped separately, so `summary.total` can exceed 300 (Open question 2). |
| DG-20 | Manifest candidates inside an error | **Closed by scan-accuracy.** | `too-many-manifests` and `manifest-not-found` carry `details.candidates` (paths in discovery order, at most `DISCOVERY_MAX_MANIFESTS`, possibly empty). The Error_Screen shows the manifest picker built from them (Requirement 13). Format and size are not in the error, so the picker shows the path only. |
| DG-21 | Which advisory entries are withdrawn or informational | **Data gap for withdrawn entries. Partly derivable for informational entries. Resolved by one additive API field (Requirement 22).** | Checked against `pipeline/mapping/types.ts` (`AdvisoryEntry` is `{ id, aliases, severity, url }`), `pipeline/mapping/advisories.ts` (`buildAdvisoryEntries` lists one entry per OSV id, without the record flags), `pipeline/mapping/osv-advisory.ts` (`AdvisoryRecord.withdrawn`, `.informational`, `.unmaintained` exist inside the pipeline) and `pipeline/mapping/assemble.ts` (which writes the notes). **Informational:** the note `informational-advisory-excluded` carries `details.ids` (non-withdrawn informational ids), and `unmaintained-advisory` (cargo only) carries a subset. These ids can be matched to the entries, so informational entries are derivable. **Withdrawn:** `aggregateAdvisories` skips a withdrawn record before anything else, `assembleFacts` writes no note for it and `AdvisoryEntry` has no flag, so NO field of the Scan_Result says which entries are withdrawn. A withdrawn entry looks exactly like a counted one, so a panel that lists all entries under "open" would contradict `openVulnerabilityCount`. **Resolution:** the smallest addition is one field per entry, `excluded: 'withdrawn' | 'informational' | null`, set from the `AdvisoryRecord` that the pipeline already holds (Requirement 22, an explicit pipeline task with tests). The UI uses `excluded` when present. For a Scan_Result without the field (an entry of the scan cache written before the change) the UI falls back to the note ids for informational entries and puts every remaining entry in the group "Not classified", with the sentence that this scan result does not say which of them are withdrawn. No guess is ever shown as a fact. |

## Constants

All constants are exported from `/view-model/constants.ts` (pure, no React) unless the "Home" column says otherwise, and are the single source of truth. Criteria refer to them by name. Values are proposals for review.

| Constant | Value | Home | Meaning |
|---|---|---|---|
| `SCENE_MAX_PLOTS` | 300 | view-model | Number of Plots for which the render budget applies. Equals `SCAN_MAX_DEPENDENCIES` from `/pipeline/constants.ts`. |
| `SCENE_RENDER_BUDGET_MS` | 100 | view-model | Maximum time from a ready Scene_Model to the Scene committed to the DOM, for `SCENE_MAX_PLOTS` Plots, measured with `SCENE_PERF_CPU_THROTTLE`. |
| `SCENE_PERF_CPU_THROTTLE` | 4 | tests | CPU slowdown factor applied in Chromium by the performance test to stand for a mid-range laptop. |
| `SCENE_PERF_RUNS` | 5 | tests | Number of timed renders; the median is compared with `SCENE_RENDER_BUDGET_MS`. |
| `CLIENT_JS_BUDGET_BYTES` | 256000 | view-model | Maximum total client JavaScript for the route `/`, gzip-compressed, summed over all chunks loaded on first view of the Results_Page. Proposal; the Next.js baseline is measured in design. |
| `RESULTS_CLS_MAX` | 0.01 | tests | Maximum cumulative layout shift from the end of the Scanning_Screen to the first fully rendered results. |
| `PLOT_CELL_WIDTH_PX` | 96 | view-model | Width of one Scene cell. |
| `PLOT_CELL_HEIGHT_PX` | 120 | view-model | Height of one Scene cell. |
| `PLOT_JITTER_MAX_PX` | 8 | view-model | Maximum horizontal and vertical offset of a Plot inside its cell, derived from the Package_Key hash. A Plot's box is at most `PLOT_CELL_WIDTH_PX - 2 * PLOT_JITTER_MAX_PX` wide so that Plots in different cells cannot overlap. |
| `SCENE_MIN_COLUMNS` | 2 | view-model | Minimum number of Scene columns. |
| `SCENE_MAX_COLUMNS` | 20 | view-model | Maximum number of Scene columns. |
| `EPITAPH_MAX_CHARS` | 48 | view-model | Maximum characters of the visible epitaph text on a Plot before it is cut with an ellipsis. The full text stays in the accessible name and the tooltip. |
| `GLOW_LEVELS` | `LOW` 1, `MEDIUM` 2, `HIGH` 3, `CRITICAL` 4 | view-model | Glow_Level by severity. |
| `SHORT_SHA_LENGTH` | 7 | view-model | Characters of the Short_SHA. |
| `REPO_QUERY_PARAM` | `repo` | view-model | Query parameter that holds the Canonical_Repo_URL. |
| `MANIFEST_QUERY_PARAM` | `manifest` | view-model | Repeatable query parameter that holds a manifest path chosen by the user (Open question 4). |
| `FEATURED_GRAVEYARDS` | `https://github.com/request/request`, `https://github.com/revmic/canopy`, `https://github.com/ajeetdsouza/zoxide` | view-model | Featured_Graveyards, in this order. |
| `SCAN_STAGES` | four Stages, see Requirement 4 | view-model | Stage ids and labels. |
| `SCAN_STAGE_START_MS` | 0, 2000, 6000, 10000 | view-model | Elapsed time at which each Stage becomes the current Stage. |
| `SCAN_SLOW_NOTICE_MS` | 15000 | view-model | Elapsed time after which the Scanning_Screen adds the long-scan notice. |
| `CLIENT_FETCH_TIMEOUT_MS` | 30000 | view-model | Time after which the Scan_Client aborts and reports `timeout`. Equals `ROUTE_MAX_DURATION_SECONDS` of `/pipeline/constants.ts` times 1000. |
| `RETRY_FALLBACK_COOLDOWN_SECONDS` | 10 | view-model | Time before Retry is enabled for a retryable error without `Retry-After` (Open question 7). |
| `SCAN_MAX_MANIFESTS` | 10 | pipeline | Maximum manifests the manifest picker accepts. Imported from `/pipeline/constants.ts`, not redefined. |
| `TEXT_CONTRAST_MIN` | 4.5 | tests | Minimum contrast ratio of text (WCAG 2.2 AA). |
| `NONTEXT_CONTRAST_MIN` | 3 | tests | Minimum contrast ratio of focus rings, borders of controls and Plot shapes (WCAG 2.2 AA). |
| `PBT_MIN_RUNS` | 100 | tests | Minimum fast-check runs per property. |
| `SCREENSHOT_DIR` | `docs/screenshots` | tests | Folder of saved screenshots. |
| `SCREENSHOT_VIEWPORTS` | desktop 1280x800, mobile 390x844 | tests | Viewports of every screenshot. |
| `E2E_RECORDED_FIXTURES` | `request__request`, `revmic__canopy`, `ajeetdsouza__zoxide` | tests | Fixture sets replayed into the mocked `/api/scan`. |

Constants consistency rules: `SCENE_MAX_PLOTS` equals `SCAN_MAX_DEPENDENCIES`; `CLIENT_FETCH_TIMEOUT_MS` is greater than `SCAN_DEADLINE_MS + SCAN_RESPONSE_MARGIN_MS` (26500); `SCAN_STAGE_START_MS` is strictly increasing and every value is below `SCAN_SLOW_NOTICE_MS`; `PLOT_JITTER_MAX_PX * 2` is less than `PLOT_CELL_WIDTH_PX`; `SCENE_MIN_COLUMNS` is at most `SCENE_MAX_COLUMNS`. A unit test asserts all five.

## Requirements

### Requirement 1: Landing page

**User Story:** As a visitor, I want to understand what Gravekeeper does and start a scan at once, so that I can audit a repository without reading instructions.

#### Acceptance Criteria

1. THE Landing_Page SHALL show the product name "Gravekeeper" and a one-line pitch in a single `h1` and one adjacent paragraph.
2. THE Landing_Page SHALL show a labelled text input for the repository URL and a button whose visible text is "Dig up".
3. WHEN the visitor activates "Dig up" with a non-empty input, THE Gravekeeper_UI SHALL navigate to `/?repo=<value>` with the trimmed input as typed and SHALL start the scan of Requirement 3.
4. WHEN the visitor presses Enter in the input, THE Gravekeeper_UI SHALL behave as if "Dig up" had been activated.
5. IF the input is empty or contains only whitespace when "Dig up" is activated, THEN THE Landing_Page SHALL show an inline message "Enter a repository URL" associated with the input through `aria-describedby`, announce the message in a polite live region, move focus to the input, and send no request.
6. THE Gravekeeper_UI SHALL leave the validation of the URL form to the Scan_API and SHALL show the `invalid-url` Error_Screen for a rejected URL (Requirement 13).
7. THE Landing_Page SHALL show a legend with six entries, each with a drawing and a visible text label: "Tombstone: DEAD and buried, archived or deprecated", "Overgrown grave: DEAD and forgotten, no recent release or commit, may be finished or abandoned", "Ghost: HAUNTED, has open vulnerabilities", "Restless ghost: HAUNTED and buried, has open vulnerabilities and is also archived or deprecated", "Lantern: ALIVE, no risk signal strong enough to matter", "Unmarked grave: not assessed".
8. THE Landing_Page SHALL state in one sentence that the grade is the worst single risk and not an average.
9. THE Landing_Page SHALL use no more than one `h1`, headings in order, and the landmarks `header`, `main` and `footer`.

### Requirement 2: Featured graveyards

**User Story:** As a visitor, I want to open an example graveyard with one click, so that I can see the result without finding a repository.

#### Acceptance Criteria

1. THE Landing_Page SHALL show a "Featured graveyards" row with one link per entry of `FEATURED_GRAVEYARDS`, in the order of the constant.
2. THE Gravekeeper_UI SHALL show each Featured_Graveyard link with the text `owner/repo` and the ecosystem name (npm, pypi or cargo).
3. WHEN the visitor activates a Featured_Graveyard link, THE Gravekeeper_UI SHALL navigate to `/?repo=<Featured_Graveyard URL>` and SHALL start the scan of Requirement 3 without further input.
4. THE Featured_Graveyard links SHALL be real anchors (`href` set), so that they work with the context menu, with keyboard activation and with a new tab.
5. THE Featured_Graveyard links SHALL NOT bypass the Scan_API. Fixture data SHALL NOT ship in the production client bundle.

### Requirement 3: Scan request, URL state and reload

**User Story:** As a visitor, I want the address bar to identify the result, so that I can share it and reload it.

#### Acceptance Criteria

1. WHEN the page loads at `/` with no `repo` query value, THE Gravekeeper_UI SHALL show the Landing_Page.
2. WHEN the page loads at `/?repo=<value>` (`REPO_QUERY_PARAM`), THE Scan_Client SHALL send `POST /api/scan` with `Content-Type: application/json` and the body `{ "repoUrl": <value> }`, adding `"manifests": [<paths>]` when `MANIFEST_QUERY_PARAM` values are present, and SHALL show the Scanning_Screen.
3. THE Scan_Client SHALL send no other field than `repoUrl` and `manifests`, so that the Scan_API cannot answer `unknown-field` or `branch-conflict` for a request the UI built.
4. WHEN a Scan_Result arrives, THE Gravekeeper_UI SHALL replace the query value of `repo` with the Canonical_Repo_URL of the result without adding a history entry (DG-8), and SHALL keep the `manifest` values unchanged.
5. THE Results_Page SHALL be reloadable and shareable: opening the same URL in a new browser session SHALL issue a new `POST /api/scan` with the same body, and the Scan_API cache answers it when the scan cache holds the entry (the UI never reads or writes a scan cache itself).
6. IF a reload happens while the Scan_API does not cache the scan (a scan with a non-`ok` source or without a GitHub token is not scan-cached, pipeline Open question 11), THEN THE Gravekeeper_UI SHALL run a full scan and SHALL show the Scanning_Screen again.
7. WHEN the visitor activates "Dig up" or a Featured_Graveyard link, THE Gravekeeper_UI SHALL add one history entry, so that the browser Back button returns to the previous screen.
8. WHEN the visitor navigates with Back or Forward to a URL with a different `repo` value, THE Gravekeeper_UI SHALL abort the request in flight and SHALL start the scan for the new URL.
9. WHILE a request is in flight, THE Gravekeeper_UI SHALL allow exactly one request per `repo` value at a time, so that a double activation sends one request.
10. THE Results_Page SHALL show the age of `asOf` relative to the browser clock (for example "scanned 3 hours ago") (DG-9). WHERE the Cache_Status of the result is `hit`, THE Results_Page SHALL add the text "from the caretaker's records" next to the age, and WHERE the Cache_Status is `miss` or `unknown`, THE Results_Page SHALL show no cache wording (DI-31).
11. [PBT] FOR ALL Scan_Results, THE View_Model SHALL satisfy: building the Canonical_Repo_URL, placing it in the `repo` query value, reading it back and building the request body yields a `repoUrl` equal to the Canonical_Repo_URL (round trip, DG-8).
12. [PBT] FOR ALL lists of manifest path strings (including empty strings, `&`, `=`, `%`, `+`, `#`, spaces and non-ASCII characters), THE View_Model SHALL satisfy: encoding the list into `manifest` query values and decoding them yields the same list in the same order.

### Requirement 4: Scanning state

**User Story:** As a visitor, I want honest feedback while the scan runs, so that I know the app is working and can stop it.

#### Acceptance Criteria

1. WHILE a request is in flight, THE Scanning_Screen SHALL show four Stages in this order, with these labels: "Reading the repository", "Checking the registries", "Consulting the vulnerability records", "Asking GitHub about the living".
2. THE Scanning_Screen SHALL choose the current Stage only from the elapsed time since the request started and from `SCAN_STAGE_START_MS`: the current Stage is the last Stage whose start time is at most the elapsed time.
3. THE Scanning_Screen SHALL show earlier Stages as passed, the current Stage as active and later Stages as pending, each with a text state ("done", "in progress", "waiting") and not by colour or shape alone.
4. THE Scanning_Screen SHALL show no percentage, no progress bar with a numeric value, no estimated remaining time and no count of packages, because the Scan_API sends no progress information.
5. THE Scanning_Screen SHALL state in one sentence that the stages are approximate because the sources are queried in parallel.
6. WHEN the elapsed time reaches `SCAN_SLOW_NOTICE_MS`, THE Scanning_Screen SHALL add a notice that large repositories can take up to 25 seconds, without changing the Stage states.
7. THE Scanning_Screen SHALL expose the current Stage to assistive technology through one polite live region that announces a Stage change once and announces nothing else.
8. THE Scanning_Screen SHALL show a "Cancel" button that is the first focusable element inside the Scanning_Screen.
9. WHEN the visitor activates "Cancel", THE Scan_Client SHALL abort the request, THE Gravekeeper_UI SHALL show the Landing_Page with the input holding the last submitted value and focus on the input, and THE URL SHALL return to `/`.
10. WHILE Reduced_Motion is active, THE Scanning_Screen SHALL show the Stages as a static list with no animated element, with the same text states as criterion 3.
11. WHILE Reduced_Motion is not active, THE Scanning_Screen SHALL show a drifting-fog and lantern animation that moves independently of the Stage states and carries no information.
12. THE Stage selection SHALL be a pure function `stageAt(elapsedMs)` in the View_Model, and the elapsed time SHALL be passed in, never read inside the function.
13. [PBT] FOR ALL non-negative elapsed times, `stageAt` SHALL return a Stage index in 0..3 that is non-decreasing in the elapsed time and equals the index of the last `SCAN_STAGE_START_MS` entry that is at most the elapsed time.

### Requirement 5: Results header and headline

**User Story:** As a maintainer, I want the key facts of the scan at the top, so that I can judge the repository at a glance.

#### Acceptance Criteria

1. THE Results_Page SHALL show the repository as `repo.owner/repo.repo` (DI-1), the Short_SHA with the full SHA as its accessible description (DI-2, DG-7), the branch, and `asOf` as an absolute UTC time inside a `time` element with the ISO value in `dateTime` (DI-8).
2. THE Header_Model SHALL build the Headline text as `"<N> of <M> dependencies are in the graveyard"` followed by the part list and a full stop, with N equal to `summary.counts.DEAD + summary.counts.HAUNTED`, M equal to `summary.assessed`, B equal to the number of unique packages with Grave_Type `buried`, F equal to the number of unique packages with Grave_Type `forgotten` and H equal to `summary.counts.HAUNTED` (DI-4, Requirement 7, criterion 15). The part list is built from the three parts `"<B> buried"`, `"<F> forgotten"` and `"<H> haunted"` in this order, keeping only the parts whose count is above 0. WHEN at least one part is kept, THE Header_Model SHALL write `": "` and then the kept parts joined with `", "`. WHEN no part is kept (N equals 0 and M is above 0), THE Header_Model SHALL write no colon and no part. The text always ends with one `"."` and the words "dependencies are" are used for every M, so there are no singular forms. Examples: B 26, F 0, H 5, M 40 gives "31 of 40 dependencies are in the graveyard: 26 buried, 5 haunted."; B 0, F 0, H 1, M 6 gives "1 of 6 dependencies are in the graveyard: 1 haunted."; B 2, F 3, H 4, M 20 gives "9 of 20 dependencies are in the graveyard: 2 buried, 3 forgotten, 4 haunted."; N 0, M 6 gives "0 of 6 dependencies are in the graveyard.". A Restless_Ghost is HAUNTED, so it is counted in H and N, and it is NOT counted in B, because B counts DEAD packages only. B + F equals `summary.counts.DEAD`, H equals `summary.counts.HAUNTED` and N equals B + F + H.
3. THE Header_Model SHALL show the status counts DEAD, HAUNTED, ALIVE and the unassessed count from `summary.counts` and `summary.unassessed`, each with its text label, and SHALL split the DEAD count into "buried" and "forgotten" with the same B and F as the Headline, and SHALL show the HAUNTED count with the same H as the Headline (DI-5). The shown HAUNTED count includes Restless_Ghosts.
4. IF `summary.assessed` equals 0, THEN THE Header_Model SHALL show the sentence "No dependencies could be assessed" instead of the Headline, and SHALL show the grade as "no grade". This sentence is the only text shown when M is 0, and the Headline of the case N equals 0 with M above 0 is the one defined in criterion 2.
5. THE Header_Model SHALL show the grade letter labelled "worst single risk" with a one-line explanation of the form "Graded on the riskiest package, <name> (score <maxScore>), not on the average (<averageScore>)" built from `summary.maxScorePackage`, `summary.maxScore` and `summary.averageScore` (DI-6, DG-16).
6. THE Header_Model SHALL show the grade scale (A to F with the score bounds of DI-7) in a disclosure that is closed by default.
7. THE Headline SHALL count unique packages. IF the Scan_Result has more dependency entries than `summary.total`, THEN THE Results_Page SHALL show the sentence "<entries> dependency entries across <manifests> manifests, <total> unique packages" (DI-3).
8. WHEN `repo.branch` differs from `repo.defaultBranch`, THE Results_Page SHALL show the branch name with the text "(not the default branch)".
9. [PBT] FOR ALL Scan_Results, THE Header_Model SHALL satisfy: N equals `summary.counts.DEAD + summary.counts.HAUNTED`, M equals `summary.assessed`, and `summary.counts.ALIVE + summary.counts.HAUNTED + summary.counts.DEAD` equals M, and the shown status counts equal the summary counts, so that the numbers of the Headline equal the numbers of the summary.
10. [PBT] FOR ALL Scan_Results (including results with B, F or H equal to 0, with every combination of the three, with N equal to 0, and with Restless_Ghosts), THE Header_Model SHALL satisfy: B + F equals `summary.counts.DEAD`, H equals `summary.counts.HAUNTED`, N equals B + F + H, B, F and H are non-negative integers, the Restless_Ghosts are counted in H and not in B, and the Headline text equals the text of criterion 2 built independently from N, M, B, F and H (a part with count 0 is absent, the separator is `", "` between kept parts, the text ends with one `"."`, and the colon is present exactly when a part is kept).

### Requirement 6: View-model architecture

**User Story:** As a developer, I want the mapping from data to screen to be a pure module, so that I can property test it and keep components thin.

#### Acceptance Criteria

1. THE View_Model SHALL live in `/view-model`, SHALL export pure functions only, and SHALL import no React, no `next/*` module, no DOM type and no `/adapters` module. It MAY import types and the exported pure functions and constants of `/core` (from `core/index.ts` only), types of `/pipeline`, and the constants file `pipeline/constants.ts` (pure values, no I/O).
2. THE View_Model SHALL NOT read the clock, the random source, the network, the DOM or the environment. Time, viewport columns and the user's sort choice SHALL be passed in as arguments.
3. THE View_Model SHALL export at least: `parseScanResponse(status, headers, body)`, `buildHeaderModel(result)`, `buildPackageRows(result)`, `buildSceneModel(rows, columns)`, `buildTableModel(rows, sort)`, `buildDetailModel(result, packageKey)`, `buildNotesModel(result)`, `buildErrorModel(error, status, retryAfter)`, `stageAt(elapsedMs)`, `formatFact(field, value)`.
4. THE components SHALL contain no branching on Scan_Result data beyond choosing which model field to render. A component SHALL NOT compute counts, sort, filter, group, derive labels or derive URLs.
5. THE repository architecture check (`scripts/check-architecture.ts`) SHALL be extended so that `/view-model` fails the check on any import of `react`, `react-dom`, `next` or `/adapters`, on any use of `Date.now`, `new Date()`, `Math.random`, `fetch` or `window`, and so that `/components` fails the check on any import of `/pipeline` runtime code (types only).
6. THE View_Model SHALL be total: for any input of the declared types it SHALL return a value and SHALL NOT throw.
7. [PBT] FOR ALL Scan_Results, `buildSceneModel`, `buildTableModel`, `buildHeaderModel` and `buildNotesModel` SHALL return values that are JSON-serializable without loss and that contain no `undefined`, `NaN` or infinite number.
8. THE View_Model SHALL obtain every Merged_Classification from the core function `uniquePackages` and SHALL order classifications only through `compareClassifications` where it needs a risk order. THE View_Model SHALL NOT contain a second implementation of the merge order, the status precedence or the tie key that choose one classification per package (DG-1, closed by scan-accuracy). The scene order of Requirement 7, criterion 9 is a presentation order of already chosen classifications and is not a merge.

### Requirement 7: Package rows, plot kinds and epitaphs

**User Story:** As a visitor, I want one clear marker per package with the main reason on it, so that I see what is wrong without opening anything.

#### Acceptance Criteria

1. THE View_Model SHALL build exactly one Package_Row per distinct Package_Key of `dependencies`, so that the number of Package_Rows equals `summary.total` (DI-3, DI-9).
2. THE View_Model SHALL set the kind of each Package_Row to Tombstone when the Merged_Classification status is DEAD and the Grave_Type is `buried`, Overgrown_Grave when the status is DEAD and the Grave_Type is `forgotten`, Restless_Ghost when HAUNTED and the reasons contain `8.1` or `8.2` (criterion 20), Ghost for every other HAUNTED status, Lantern when ALIVE, and Unmarked_Grave when the Merged_Classification is null (DI-10, DG-1, criterion 15).
3. THE View_Model SHALL set the Unassessed_Cause of an Unmarked_Grave by DG-10 and SHALL set the label of each cause: "git dependency, not checked", "path dependency, not checked", "skipped, scan limit reached", "no health data found".
4. THE View_Model SHALL choose the Strongest_Reason of a Merged_Classification as the Reason whose `ruleId` comes first in the Reason_Priority table: `7.2`, `8.1`, `8.2`, `8.3`, `8.4`, `10.7`, `10.8`, `10.6`, `6.3`, `11.2` (DG-2).
5. THE View_Model SHALL build the epitaph of a Tombstone, Ghost, Restless_Ghost or Lantern as the package name, then the Strongest_Reason in short form (for a Restless_Ghost with the addition of criterion 20). The short form is the ruleId's short label: `7.2` "N open vulnerabilities (SEVERITY)", `8.1` "archived", `8.2` "deprecated", `8.3` "no release or commit for a long time, may be finished or abandoned", `8.4` "dormant releases", `10.7` "no maintainers", `10.8` "single maintainer", `10.6` "stale release", `6.3` "some facts unknown", `11.2` "no risk signals found". The numbers come from the package's facts. The short form of `8.2` is the same when core set `deprecated` because of an unmaintained advisory (the `unmaintained-advisory` note of the package explains it in the Detail_Panel).
6. THE View_Model SHALL build the accessible label of every Plot as `<name>, <ecosystem>, <status word>, <Strongest_Reason short form or Unassessed_Cause label>`, where the status word is one of "dead, buried", "dead, forgotten", "haunted", "haunted, buried" (Restless_Ghost), "alive", "not assessed". The six values of `StatusWord` are exactly these six strings, in one-to-one correspondence with the six `PlotKind` values.
7. THE View_Model SHALL set the Glow_Level of a Ghost or a Restless_Ghost from `GLOW_LEVELS` using the highest non-null `severity` among the `advisories` of the Package_Row, then, when every advisory severity is `null` or the list is empty, the highest `facts.maxSeverity` of the Package_Row, and `MEDIUM` (`DEFAULT_SEVERITY`) when no severity is known (DG-3).
8. THE View_Model SHALL show the display name of a pypi package as `rawName` of its first entry in manifest order and SHALL keep `name` as the identity.
9. THE View_Model SHALL order Package_Rows by the scene order: status rank HAUNTED (Ghosts and Restless_Ghosts share the rank), DEAD, ALIVE, unassessed; then score descending; then ecosystem; then name, compared by Unicode code point.
10. [PBT] FOR ALL Scan_Results, the Package_Rows SHALL satisfy: every Package_Key of `dependencies` appears in exactly one Package_Row, no other Package_Row exists, and the Package_Row count equals `summary.total`.
11. [PBT] FOR ALL Scan_Results, the kind of every Package_Row SHALL equal the kind given by its Merged_Classification status and Grave_Type, and the number of Tombstones plus Overgrown_Graves SHALL equal `summary.counts.DEAD`, the number of Ghosts plus Restless_Ghosts SHALL equal `summary.counts.HAUNTED`, the number of Lanterns SHALL equal `summary.counts.ALIVE`, and the number of Unmarked_Graves SHALL equal `summary.unassessed`. The Merged_Classification of every Package_Row SHALL equal the one of the same Package_Key in `uniquePackages(result.assessed)`.
12. [PBT] FOR ALL Classifications with a non-empty `reasons` list, the Strongest_Reason SHALL be an element of `reasons`, SHALL NOT have the ruleId `6.3` or `11.2` when another Reason exists, and, for a Classification of status DEAD, SHALL have a ruleId in `8.1`, `8.2`, `8.3`.
13. [PBT] FOR ALL Package_Rows, the accessible label SHALL be non-empty, SHALL contain the package name and the status word, and SHALL be unique among the labels of one Scan_Result, or SHALL differ only after the ecosystem when two Package_Rows share a name.
14. [PBT] FOR ALL severity pairs `a`, `b` with `a` not higher than `b`, the Glow_Level of `a` SHALL be at most the Glow_Level of `b`.
15. THE View_Model SHALL derive the Grave_Type only from the set of `ruleId` values of the Merged_Classification, as follows. WHERE the status is DEAD and the set contains `8.1` or `8.2`, the Grave_Type SHALL be `buried`. WHERE the status is DEAD, the set contains `8.3` and the set contains neither `8.1` nor `8.2`, the Grave_Type SHALL be `forgotten`. WHERE the status is DEAD and the set contains none of `8.1`, `8.2`, `8.3` (a value that core never produces, handled so that the function stays total), the Grave_Type SHALL be `forgotten`. WHERE the status is HAUNTED, ALIVE or there is no Merged_Classification, the Grave_Type SHALL be `null`. A DEAD package with a `8.2` reason caused by an unmaintained advisory is therefore `buried`, because the pipeline sets `deprecated` for it.
16. THE View_Model SHALL NOT assign a Grave_Type to a HAUNTED package, even when its reasons contain `8.1`, `8.2` or `8.3`, because core status precedence makes a package with an open vulnerability HAUNTED, and the Ghost or Restless_Ghost represents that package. A Restless_Ghost is therefore not counted in B and not counted in F.
17. [PBT] FOR ALL Classifications (every status, every subset and every order of `ruleId` values, including the empty subset and `null`), the Grave_Type and the PlotKind SHALL be functions of the status and the set of `ruleId` values only: both SHALL be equal for two Classifications with the same status and the same set. The Grave_Type SHALL be `null` exactly when the status is not DEAD, `buried` exactly when the status is DEAD and the set contains `8.1` or `8.2`, and `forgotten` for every other DEAD Classification. The PlotKind SHALL be `restless` exactly when the status is HAUNTED and the set contains `8.1` or `8.2`, `ghost` for every other HAUNTED Classification, `tombstone` exactly when the Grave_Type is `buried`, `overgrown` exactly when the Grave_Type is `forgotten`, `lantern` for ALIVE and `unmarked` for `null`.
18. [PBT] FOR ALL Scan_Results, the number of Package_Rows with Grave_Type `buried` plus the number with Grave_Type `forgotten` SHALL equal `summary.counts.DEAD`, the number of Package_Rows of kind Ghost plus the number of kind Restless_Ghost SHALL equal `summary.counts.HAUNTED`, no Package_Row of kind Ghost, Restless_Ghost, Lantern or Unmarked_Grave SHALL have a Grave_Type, and no Restless_Ghost SHALL be counted in `buried`.
19. THE View_Model SHALL build the epitaph of an Overgrown_Grave as the package name followed by "may be finished or abandoned" and, WHERE the `daysSinceLastRelease` fact of the `8.3` reason is a valid number, ", last release <n> days ago". The epitaph SHALL NOT state a cause that the Reason does not contain.
20. THE View_Model SHALL set the kind of a Package_Row to Restless_Ghost WHERE the Merged_Classification status is HAUNTED and the set of `ruleId` values contains `8.1` or `8.2`, and SHALL NOT set it for a HAUNTED classification that contains only `8.3` (an abandoned release is not a burial). The `8.2` reason caused by an unmaintained advisory qualifies, because the pipeline sets `deprecated` for it. A Restless_Ghost keeps the Strongest_Reason of the Reason_Priority table, which is `7.2` because it is HAUNTED. Its epitaph is the package name, the `7.2` short form, then `", also archived"` for `8.1`, `", also deprecated"` for `8.2`, and `", also archived and deprecated"` when both are present. Its status word is "haunted, buried" and its Glow_Level follows criterion 7.
21. [PBT] FOR ALL Scan_Results, every Package_Row of kind Restless_Ghost SHALL have status HAUNTED in `uniquePackages(result.assessed)` and a reason with ruleId `8.1` or `8.2`, every HAUNTED Package_Row with such a reason SHALL be a Restless_Ghost, every Restless_Ghost SHALL have a non-null Glow_Level and status word "haunted, buried", and the Headline counts SHALL satisfy Requirement 5, criterion 10 for every generated mix of Ghosts and Restless_Ghosts.

### Requirement 8: Graveyard scene layout and rendering

**User Story:** As a visitor, I want a graveyard that looks the same every time I open it and stays smooth with many packages, so that the picture is trustworthy and usable.

#### Acceptance Criteria

1. THE View_Model SHALL compute the Scene_Model from the Package_Rows and a column count only: the column count is `clamp(floor(containerWidth / PLOT_CELL_WIDTH_PX), SCENE_MIN_COLUMNS, SCENE_MAX_COLUMNS)`, and the container width is passed in by the component.
2. THE View_Model SHALL place Plot number `i` (in the scene order of Requirement 7, criterion 9) in the cell at column `i mod columns` and row `floor(i / columns)`, and SHALL offset the Plot inside its cell by two values in the range `-PLOT_JITTER_MAX_PX` to `PLOT_JITTER_MAX_PX` derived from a hash of the Package_Key.
3. THE View_Model SHALL compute the Scene height as `rows * PLOT_CELL_HEIGHT_PX` plus fixed padding, as a pure function of the Plot count and the column count, so that the Scene container can be sized before the Plots render.
4. THE Scene SHALL draw Tombstones in stone grey, Overgrown_Graves as a leaning stone covered by ivy and moss in mossy green with no inscription of a cause, Ghosts in spectral cyan with a glow that grows with the Glow_Level, Restless_Ghosts as the same spectral ghost drifting over a stone-grey tombstone (the tombstone drawn like a Tombstone, the ghost drawn like a Ghost, one Plot), Lanterns as lit amber lanterns and Unmarked_Graves as bare mounds with no inscription, each with a visible text label of the package name (Requirement 16, criterion 3).
5. THE Scene SHALL use original SVG and CSS only, with no raster image, no external image and no third-party illustration.
6. WHILE Reduced_Motion is not active, THE Scene SHALL animate fog drift, ghost drift and a glow pulse on Ghosts and Lanterns, using only `transform` and `opacity`.
7. WHILE Reduced_Motion is active, THE Scene SHALL show no fog drift, no ghost drift and no glow pulse, and the static glow strength SHALL still reflect the Glow_Level.
8. THE Scene SHALL render each Plot as a single element with its own accessible name from Requirement 7, criterion 6, and SHALL NOT render hidden duplicates of Plots.
9. WHEN the number of Plots is above `SCENE_MAX_PLOTS`, THE Scene SHALL render each Plot in a simplified form (flat shape, no filter, no animation) and SHALL still render every Plot (DG-19, Open question 2).
10. THE Scene SHALL commit to the DOM within `SCENE_RENDER_BUDGET_MS` for `SCENE_MAX_PLOTS` Plots under `SCENE_PERF_CPU_THROTTLE` (Requirement 17).
11. [PBT] FOR ALL Scan_Results and column counts, the Scene_Model Plot boxes SHALL not overlap: for any two distinct Plots, their rectangles (position plus the Plot's width and height) SHALL have an empty intersection.
12. [PBT] FOR ALL Scan_Results and column counts, every Plot rectangle SHALL lie inside the Scene dimensions of the Scene_Model, and the Scene height SHALL equal `rows * PLOT_CELL_HEIGHT_PX` plus padding.
13. [PBT] FOR ALL Scan_Results and column counts, building the Scene_Model twice SHALL give deeply equal values (determinism), and building it from the same Scan_Result with `dependencies` and `assessed` rotated by any offset together SHALL give an equal Scene_Model (independence of input order).
14. [PBT] FOR ALL Scan_Results and column counts, every Package_Row SHALL appear in the Scene_Model exactly once, and every Plot SHALL have a non-empty text label that contains the package name.

### Requirement 9: Scene interaction (tooltip, keyboard, selection)

**User Story:** As a visitor using a mouse or a keyboard, I want to inspect a package from the scene, so that I can reach its details without a different input device.

#### Acceptance Criteria

1. WHEN the pointer hovers over a Plot, THE Scene SHALL show a tooltip with the package name, ecosystem, status word, score and the epitaph (or Unassessed_Cause label).
2. WHEN a Plot receives keyboard focus, THE Scene SHALL show the same tooltip content as for hover.
3. WHEN the visitor presses Escape while a tooltip is shown, THE Scene SHALL hide the tooltip and keep focus on the Plot.
4. THE tooltip text SHALL stay available while the pointer moves from the Plot onto the tooltip (WCAG 1.4.13), and SHALL NOT hide before the pointer leaves both.
5. WHEN the visitor activates a Plot with click, Enter or Space, THE Gravekeeper_UI SHALL open the Detail_Panel for that Package_Row (Requirement 10).
6. THE Scene SHALL be one composite widget with a single tab stop: Tab moves focus into the Scene once, the arrow keys move focus between Plots by row and column of the Scene_Model, Home and End move to the first and last Plot of the row, and Tab leaves the Scene.
7. THE Scene SHALL show a visible focus ring on the focused Plot with a contrast ratio of at least `NONTEXT_CONTRAST_MIN` against the adjacent colours.
8. THE Scene SHALL give each Plot an accessible name as in Requirement 7, criterion 6, and SHALL show a skip link "Skip the graveyard scene" before the Scene that moves focus to the view toggle.
9. [PBT] FOR ALL Scene_Models and moves from the set {up, down, left, right, home, end}, THE View_Model keyboard-navigation function `nextFocus(sceneModel, currentIndex, move)` SHALL return an index of an existing Plot, SHALL return `currentIndex` when no Plot exists in that direction, and moving right then left from a Plot with a right neighbour SHALL return to the same Plot.

### Requirement 10: Detail panel

**User Story:** As a maintainer, I want every fact and reason for one package, so that I can verify the verdict myself.

#### Acceptance Criteria

1. WHEN a Plot or table row is activated, THE Gravekeeper_UI SHALL open the Detail_Panel as a modal dialog (`role="dialog"`, `aria-modal="true"`) labelled by the package name, move focus into the dialog, trap Tab inside it, close on Escape and on a "Close" button, and return focus to the element that opened it.
2. THE Detail_Panel SHALL show the status word and the score (DI-16) for an assessed package, and the Unassessed_Cause label (Requirement 7, criterion 3) for an Unmarked_Grave.
3. THE Detail_Panel SHALL show every Reason of the Merged_Classification with its plain `message` unchanged and its `ruleId`, in the core order, and SHALL mark the Strongest_Reason with the text "main reason" (DI-16).
4. THE Detail_Panel SHALL list the seven facts with their names and values (DI-17): `daysSinceLastRelease` and `daysSinceLastCommit` as "<n> days", `archived` and `deprecated` as "yes" or "no", `openVulnerabilityCount` as a number, `maxSeverity` as a severity word, `maintainerCount` as a number. Each Unknown_Value SHALL be shown as "unknown".
5. WHEN `maxSeverity` is `null` and `openVulnerabilityCount` is 0, THE Detail_Panel SHALL show `maxSeverity` as "none (no open vulnerabilities)". WHEN `maxSeverity` is `null` and `openVulnerabilityCount` is above 0, THE Detail_Panel SHALL show "unknown, MEDIUM assumed". WHEN `openVulnerabilityCount` is unknown, THE Detail_Panel SHALL show `maxSeverity` as "unknown".
6. THE Detail_Panel SHALL show the checked version and its basis: "<lookupVersion> (pinned)" for `versionBasis` `pinned`, "<lookupVersion> (resolved from range)" for `resolved`, "<lookupVersion> (latest)" for `default`, and "not looked up" when `versionBasis` is `null`. THE Detail_Panel SHALL show the version as written in the manifest (`versionSpec`) next to it (DI-18, DG-11).
7. WHEN a note `pin-not-found`, `conflicting-pins`, `range-unresolved` or `no-default-version` exists for the package, THE Detail_Panel SHALL show that note's plain message beside the version line.
8. THE Detail_Panel SHALL show the scopes and manifest paths of the package (DG-13) and, for a pypi package, the manifest spelling `rawName`.
9. THE Detail_Panel SHALL show every Scan_Note about the package with its plain message, grouped under the themed heading of the note's Note_Group (DG-14, DI-19).
10. THE Detail_Panel SHALL show a link to the registry page (DG-4) and a link to the source repository when a `source-repo-unverified` note exists (DG-5) labelled "source repository (unverified)".
11. THE Detail_Panel SHALL open every external link in a new browsing context with `rel="noopener noreferrer"` and SHALL show each link's destination host as text.
12. THE Detail_Panel SHALL render every string that comes from an upstream source (package names, manifest paths, `sourceRepo`, `warnings`, advisory ids) as text and never as HTML, and SHALL build link targets only from values that match the expected `https` patterns of Requirement 21, criterion 4.
13. WHILE a Package_Row has the kind Tombstone or Overgrown_Grave (merged status DEAD), THE Detail_Panel SHALL show the Resurrect_Slot (Requirement 12). THE Detail_Panel SHALL NOT show it for a Restless_Ghost, because the merged status of a Restless_Ghost is HAUNTED.
14. [PBT] FOR ALL fact values (including `null`, `undefined`, `0`, `false`, negative numbers, `NaN`, non-integers and strings), `formatFact` SHALL return "unknown" for every Unknown_Value and SHALL return a string that is not "unknown" and not empty for every valid value, and SHALL return "0 days" for the number `0` and "no" for `false`.
15. [PBT] FOR ALL Package_Rows, the Detail_Model SHALL contain every Reason message of the Merged_Classification verbatim and in order, and SHALL contain all seven fact names exactly once.
16. WHERE the Package_Row has at least one Advisory_Entry, THE Detail_Panel SHALL list the Advisory_Entries in labelled Advisory_Groups, in this order: "Counted as open" (Exclusion `counted`), "Informational, not counted" (`informational`), "Withdrawn, not counted" (`withdrawn`), and "Not classified" (`unknown`). A group with no entry SHALL NOT be shown, except that "Counted as open" is shown whenever `openVulnerabilityCount` is above 0. Inside a group the entries keep the order of the API. Each entry shows its `id` as a link to the validated `url` (Requirement 21, criterion 3), its aliases as text, and its severity word or "severity unknown". The heading of each group SHALL state its own entry count as "<k> listed". The heading of "Counted as open" SHALL also state "<openVulnerabilityCount> counted" and the sentence "Advisories that are aliases of each other count once", so that a list that is longer than the count is explained, and the other groups SHALL state "not part of the <openVulnerabilityCount> open vulnerabilities". The panel SHALL NOT show any group heading that adds the entries of different groups into one number (DI-22, DG-6, DG-21).
17. WHERE the Package_Row has no Advisory_Entry and the `openVulnerabilityCount` fact is above 0, THE Detail_Panel SHALL show the sentence "No advisory list is available for this version" and no advisory link.
18. [PBT] FOR ALL Package_Rows (every mix of `excluded` values, including an absent `excluded`, informational ids named by the note, hostile ids and urls), the Detail_Model SHALL list every Advisory_Entry of the package in exactly one Advisory_Group, in the order of the API inside the group, with the id and url unchanged when the url passes the pattern of Requirement 21, criterion 3, and without a link otherwise, and the sizes of the groups SHALL add up to `advisories.length`.
19. [PBT] FOR ALL Package_Rows whose every Advisory_Entry has an `excluded` value (`null`, `'informational'` or `'withdrawn'`), the Detail_Model SHALL put each entry in the group that its `excluded` value names, SHALL have no "Not classified" group, and, WHERE the counts come from a consistent pipeline result (the group "Counted as open" has at least `openVulnerabilityCount` entries), the "Counted as open" group SHALL have at least `openVulnerabilityCount` entries. FOR ALL Package_Rows with an absent `excluded` on at least one entry, an entry whose id is named by the `informational-advisory-excluded` note of the package SHALL be in "Informational, not counted" and every other entry with an absent `excluded` SHALL be in "Not classified", and the Detail_Panel SHALL show the sentence "This scan result does not say which of these advisories are withdrawn" next to that group.

### Requirement 11: Caretaker's notes and source statuses

**User Story:** As a user who wants to trust the result, I want to see what the scan could not know, so that I do not mistake missing data for good news.

#### Acceptance Criteria

1. THE Results_Page SHALL show a "Caretaker's notes" section with the six Source_Statuses (DI-25) and the Note_Groups (DI-24).
2. THE Notes_Model SHALL list the six sources in the fixed order `github`, `depsdev`, `osv`, `npm`, `cratesio`, `pypi`, each with a human name (GitHub, deps.dev, OSV, npm registry, crates.io, PyPI) and its status word "ok", "partial" or "failed", shown as text and with a distinct symbol, never by colour alone.
3. WHEN a source is `partial` or `failed`, THE Results_Page SHALL show an alert-styled line "<source name>: <status word>, some facts that depend on it are unknown" and SHALL link it to the matching `source-partial` or `source-failed` note when present (DI-26).
4. THE Notes_Model SHALL group Scan_Notes by `code` into Note_Groups, each with a themed heading (Requirement 15, criterion 6), a count, and the plain message of each note, in the order of the API (`code`, then details text).
5. WHEN a Note_Group has more than 5 notes, THE Caretakers_Notes SHALL show the first 5 and a button "Show all <count>" that reveals the rest, and the heading SHALL always show the full count.
6. THE Caretakers_Notes SHALL show the plain message of the first note of every Note_Group without a click, so that every plain message kind is visible or one click away.
7. THE Notes_Model SHALL assign each Note_Group to one of these themed sections, by `code`: "The caretaker's own limits" (`github-token-missing`, `github-budget-low`, `dependency-cap-exceeded`, `scan-deadline-reached`, `source-partial`, `source-failed`, `batch-fallback`), "Missing records" (`package-not-found`, `no-default-version`, `pin-not-found`, `conflicting-pins`, `range-unresolved`, `advisory-details-incomplete`, `osv-pagination-ignored`, `maintainers-lower-bound`), "Unverified links and special cases" (`source-repo-unverified`, `informational-advisory-excluded`, `unmaintained-advisory`), "The plot map" (`tree-truncated`, `no-manifests`, `no-root-manifest`, `manifest-too-large`, `manifest-fetch-failed`).
8. IF a note has a `code` that the UI does not know, THEN THE Notes_Model SHALL show it in a section "Other notes" with its plain message.
9. WHEN `capped.skipped` is not empty, THE Results_Page SHALL show a cap banner with the plain message of the `dependency-cap-exceeded` note and the count `capped.skipped.length` (DI-27).
10. WHEN the note `no-manifests` is present, or `manifests` is empty, THE Results_Page SHALL show an empty graveyard with the plain message of the note, and no Scene.
11. WHEN the note `no-root-manifest` is present, THE Results_Page SHALL show a manifest picker built from `discovery.candidates` (DI-28): a list of checkboxes with path, format and size, at most `SCAN_MAX_MANIFESTS` selectable, and a "Scan selected manifests" button that navigates to `/?repo=<canonical>&manifest=<path>...` (MANIFEST_QUERY_PARAM, Open question 4).
12. WHEN `discovery.truncatedTree`, `discovery.depthLimited` or `discovery.countLimited` is true, THE Results_Page SHALL show the matching plain note when present, and the text "The manifest list may be incomplete" otherwise.
13. WHEN a manifest in `manifests` has a non-empty `warnings` list, THE Caretakers_Notes SHALL show each warning as text under the manifest path.
14. [PBT] FOR ALL Scan_Results, every Scan_Note SHALL appear in exactly one Note_Group, the sum of the Note_Group counts SHALL equal `notes.length`, and each plain `message` SHALL appear verbatim in the Notes_Model.
15. [PBT] FOR ALL Scan_Results, the Notes_Model source list SHALL contain exactly the six sources once each, with the status taken from `sources`.

### Requirement 12: Resurrect placeholder

**User Story:** As a maintainer, I want to see where the later "Resurrect" action will appear, so that the interface already shows the full journey.

#### Acceptance Criteria

1. WHILE the Detail_Panel shows a Tombstone or an Overgrown_Grave, THE Detail_Panel SHALL show a Resurrect_Slot with the heading "Resurrect" and the text "Coming soon: suggest a maintained alternative and a manifest patch".
2. THE Resurrect_Slot SHALL be marked as a placeholder in markup (`data-slot="resurrect"` and `data-placeholder="true"`) and in text, and SHALL contain a disabled button "Resurrect" with `aria-disabled="true"` and an accessible description "Not available yet".
3. THE Resurrect_Slot SHALL NOT send any request, SHALL NOT contain any alternative package name, and SHALL NOT be shown for Ghosts, Restless_Ghosts, Lanterns or Unmarked_Graves (the Resurrect_Slot is shown for every DEAD package, buried or forgotten, and for no HAUNTED package).
4. THE Resurrect_Slot SHALL live in its own component file with a documented prop interface (package key and display name), so that the later spec replaces the component body without changing the Detail_Panel.

### Requirement 13: Error screens

**User Story:** As a visitor whose scan failed, I want to know what went wrong and what to do next, so that I can recover.

#### Acceptance Criteria

1. WHEN the Scan_API returns an error, THE Gravekeeper_UI SHALL show an Error_Screen that contains a themed heading, the plain `error.message` unchanged and always visible, the error code as text, and the next action(s) of the table in criterion 2.
2. THE Error_Model SHALL map every Scan_Error to these themed headings and next actions:

| Code (details) | Themed heading | Next action |
|---|---|---|
| `invalid-url` (`part` any) | "That is not a grave we can find" | Edit the URL: the input is shown, prefilled with the submitted value, focused, with the part named in text (url, host, path, owner, repository, branch) |
| `repo-not-found` | "No such graveyard" | Edit the URL, and the text "The repository must exist and be public" |
| `branch-not-found` (`branch`) | "That branch has no graves" | Button "Scan the default branch" (rescan with the `/tree/<branch>` part removed) and Edit the URL |
| `too-many-manifests` (`limit`, `candidates`) | "Too many plots at once" | The Manifest_Picker built from `details.candidates` (criterion 15), and the button "Scan the repository root" (rescan without `manifest` values) |
| `manifest-not-found` (`path`, `candidates`) | "That manifest is not here" | The Manifest_Picker built from `details.candidates` (criterion 15), and the button "Scan the repository root" (rescan without `manifest` values) |
| `upstream-unavailable` (`source`, `resetAt`?) | "The gates are shut for now" | Button "Try again", disabled until the Retry-After time (Requirement 13, criterion 4) |
| `deadline-exceeded` | "The night ran out" | Button "Try again" |
| `internal-error` | "The gravedigger tripped" | Button "Try again" |
| `invalid-request` (`reason` any) | "The request was not understood" | Button "Try again", and a line "This is a fault in Gravekeeper, not in your URL" |

3. THE Error_Screen SHALL show the HTTP status next to the error code, and SHALL show the `details` values that the plain message already names (branch, path, limit) only through the plain message. The only `details` value that the Error_Screen shows outside the plain message is `candidates`, in the Manifest_Picker.
4. WHEN the error is `upstream-unavailable` and the response has a `Retry-After` header with an integer of at least 1, THE Error_Screen SHALL show a countdown "You can try again in <time>" computed from the header value and the time of arrival, SHALL keep the Retry button disabled until the countdown ends, SHALL announce the end of the countdown once in a polite live region, and SHALL enable the button when it ends (DG-12).
5. WHEN the error is `upstream-unavailable` and the response has no `Retry-After` header (HTTP 502), THE Error_Screen SHALL enable the Retry button after `RETRY_FALLBACK_COOLDOWN_SECONDS`, and SHALL show the plain message.
6. WHEN the error is `deadline-exceeded` or `internal-error`, THE Error_Screen SHALL enable the Retry button after `RETRY_FALLBACK_COOLDOWN_SECONDS`.
7. WHEN the visitor activates a Retry button after the cooldown, THE Gravekeeper_UI SHALL send the same request again and show the Scanning_Screen.
8. WHEN the Scan_Client reports a Client_Failure, THE Gravekeeper_UI SHALL show an Error_Screen with a themed heading ("The road is washed out" for `network-failure`, "The night ran out" for `timeout`, "The records are garbled" for `malformed-response`), a plain sentence ("The server could not be reached.", "The server did not answer in time.", "The server sent an answer that Gravekeeper could not read."), and a Retry button enabled at once.
9. THE Error_Screen for `invalid-url` SHALL leave the URL input editable and SHALL put the error text in an element referenced by the input's `aria-describedby`.
10. THE Error_Screen SHALL move focus to its heading on display, and SHALL announce itself through the heading focus and not through a second live region.
11. THE Error_Screen SHALL offer a link "Back to the gate" that navigates to `/`, on every error.
12. THE themed heading and next action SHALL never replace the plain message: the plain message element SHALL be in the DOM, visible, and not truncated, on every Error_Screen of an API error.
13. [PBT] FOR ALL Scan_Errors (every code, every `details` shape allowed by `ScanErrorBody`, arbitrary `message` strings, every HTTP status of `ApiStatus`, `Retry-After` absent or any non-negative integer or arbitrary string), `buildErrorModel` SHALL return an Error_Model with a non-empty themed heading, a plain message equal to `error.message` exactly, at least one next action, and a Retry cooldown that is `null` or a non-negative integer.
14. [PBT] FOR ALL integers `s` from 0 to 86400 and elapsed times `t` from 0 to `s * 1000 + 10000`, the countdown function SHALL return a remaining time that is non-increasing in `t`, never negative, equal to 0 for `t` at least `s * 1000`, and SHALL enable Retry exactly when the remaining time is 0.
15. WHEN the error is `too-many-manifests` or `manifest-not-found` and `details.candidates` is not empty, THE Error_Screen SHALL show a Manifest_Picker: a labelled group of checkboxes, one per candidate path in the order of the API, at most `SCAN_MAX_MANIFESTS` selectable (further checkboxes are disabled with the text "limit reached"), and a button "Scan selected manifests" that is disabled while no path is selected and that navigates to `/?repo=<canonical>&manifest=<path>...` (DI-28, DG-20, Requirement 11, criterion 11).
16. WHEN the error is `too-many-manifests` or `manifest-not-found` and `details.candidates` is empty, THE Error_Screen SHALL show no picker and SHALL show the button "Scan the repository root" only.
17. [PBT] FOR ALL `details.candidates` lists (any length, any strings, duplicates, paths with `&`, `=`, `%`, `+`, `#`, spaces and non-ASCII characters) and all subsets of at most `SCAN_MAX_MANIFESTS` selected paths, THE View_Model SHALL return a picker model that lists every candidate once in the given order, and the URL built for a selection SHALL decode (Requirement 3, criterion 12) to the selected paths in the order of the candidate list.

### Requirement 14: Response boundary

**User Story:** As a user, I want the UI to survive unexpected data, so that a surprising response shows an explained error and not a blank page.

#### Acceptance Criteria

1. THE Scan_Client SHALL pass the status, headers and parsed body of every response to `parseScanResponse`, which SHALL return one of: a validated Scan_Result with its Cache_Status, a Scan_Error with HTTP status and parsed `Retry-After`, or a Client_Failure of kind `malformed-response`.
2. THE `parseScanResponse` function SHALL accept a body as a Scan_Result only when `ok` is `true` and the fields `asOf`, `repo`, `discovery`, `manifests`, `dependencies`, `assessed`, `summary`, `sources`, `capped` and `notes` exist with the types of `ScanResult`, every `dependencies` entry has an `advisories` array, `dependencies.length` equals `assessed.length`, and `sources` has exactly the six keys.
3. THE `parseScanResponse` function SHALL accept a body as a Scan_Error only when `ok` is `false`, `error.code` is one of the nine codes, and `error.message` is a string.
4. IF the response has an HTTP status other than 200 and the body is a Scan_Result, or the HTTP status is 200 and the body is a Scan_Error, THEN THE `parseScanResponse` function SHALL return `malformed-response`.
5. THE `parseScanResponse` function SHALL narrow each fact value of each dependency to a valid value or to an Unknown_Value (DG-15), SHALL keep an Advisory_Entry only when `id` is a non-empty string, `aliases` is a list of strings, `severity` is a Severity or `null`, and `url` is a string, SHALL narrow the `excluded` field of each kept entry to the Exclusion `counted` (value `null`), `informational` or `withdrawn`, and to `unknown` when the field is absent or has any other value (DG-21; an absent field is valid and is not a reason for `malformed-response`), and SHALL narrow `versionBasis` to `pinned`, `resolved`, `default` or `null` (any other value becomes `null`).
6. THE `parseScanResponse` function SHALL parse `Retry-After` as a decimal integer from 1 to 86400 and SHALL return `null` for any other value.
7. [PBT] FOR ALL JSON values (arbitrary, including deeply nested, huge strings, wrong types and missing keys) and all status codes, `parseScanResponse` SHALL return one of the three outcomes and SHALL NOT throw.
8. [PBT] FOR ALL generated valid Scan_Results, `parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)))` SHALL return a Scan_Result equal to the input after fact narrowing (round trip), and narrowing SHALL leave every valid fact value unchanged.
9. THE `parseScanResponse` function SHALL read the header `X-Gravekeeper-Cache` (`CACHE_STATUS_HEADER`, case-insensitive name) of a Scan_Result response into the Cache_Status: `hit` for the value `hit`, `miss` for the value `miss`, and `unknown` for any other value or an absent header. IF the header is present on a response that is not an HTTP 200 Scan_Result, THEN THE function SHALL ignore it.
10. [PBT] FOR ALL header values (any string, absent, mixed case, with whitespace) on an HTTP 200 Scan_Result response, THE `parseScanResponse` function SHALL return a Cache_Status of `hit` exactly when the value equals `hit`, `miss` exactly when it equals `miss`, and `unknown` otherwise, and the Scan_Result SHALL be identical for every header value.

### Requirement 15: Theme and copy

**User Story:** As a visitor, I want the gothic mood, so that the audit is memorable, and as a maintainer I want the data to stay exact.

#### Acceptance Criteria

1. THE Gravekeeper_UI SHALL present a moonlit Victorian cemetery with a blue-black night palette, bone-white text, amber lanterns for ALIVE, spectral cyan ghosts for HAUNTED, stone-grey tombstones for DEAD, mossy-green accents and a slowly drifting fog layer, and SHALL show no gore, blood, body parts or skulls with realistic detail.
2. THE Gravekeeper_UI SHALL define the palette as design tokens (CSS custom properties) in one place, and components SHALL use tokens and not literal colour values.
3. THE Gravekeeper_UI SHALL load exactly one display font, "IM Fell English SC" (a Victorian-era old-style small-capitals face, user decision replacing Pirata One), and one readable sans font, "Atkinson Hyperlegible", through `next/font/google`, both under the SIL Open Font License 1.1 (licence evidence in design.md, "Font licence evidence"), self-hosted at build time, and SHALL use the display font only for headings and the product name.
4. THE Gravekeeper_UI SHALL use original SVG and CSS for all illustration, and SHALL contain no third-party artwork, stock image or icon font.
5. THE Gravekeeper_UI SHALL show status through text as well as drawing (Requirement 16, criterion 3).
6. THE Gravekeeper_UI SHALL wrap each plain message in themed copy (heading, lead-in or caption), and the plain message SHALL appear in the DOM as its own element, visible or inside a disclosure that opens with one click or key press, and unchanged from the API or core value.
7. THE themed copy SHALL describe only what the data says: no copy SHALL state a fact that the Scan_Result does not contain (for example a cause of death or a cache hit).
8. THE Gravekeeper_UI SHALL replace the default Next.js starter page, metadata title and description with Gravekeeper's own, and SHALL set `lang="en"` on the document.

### Requirement 16: Accessibility

**User Story:** As a visitor who uses a keyboard or a screen reader, I want the full experience, so that the audit does not depend on sight or a mouse.

#### Acceptance Criteria

1. THE Gravekeeper_UI SHALL meet WCAG 2.2 level AA for every screen: Landing_Page, Scanning_Screen, Results_Page (Scene view and List view), Detail_Panel open, and every Error_Screen.
2. THE Gravekeeper_UI SHALL give text a contrast ratio of at least `TEXT_CONTRAST_MIN` and non-text indicators (focus ring, Plot shapes, control borders, status symbols) at least `NONTEXT_CONTRAST_MIN`, in both the resting and the focus and hover states.
3. THE Gravekeeper_UI SHALL give every status a text label next to its drawing, and SHALL NOT convey status, glow level or source health by colour alone or by shape alone.
4. THE Gravekeeper_UI SHALL be fully operable with the keyboard: every control, Plot, table row action, dialog and disclosure SHALL be reachable and operable, with a logical Tab order and no keyboard trap other than the intended modal focus trap.
5. THE Gravekeeper_UI SHALL show a visible focus indicator on every focusable element.
6. WHILE Reduced_Motion is active, THE Gravekeeper_UI SHALL disable fog drift, ghost drift and glow pulse, and SHALL replace any scroll or transition animation with an instant change.
7. THE Gravekeeper_UI SHALL give screen readers a real `table` (Requirement 18) as the equivalent of the Scene, and SHALL mark the Scene drawing so that the Plots are not announced twice (the Scene's decorative layers carry `aria-hidden="true"`).
8. THE Gravekeeper_UI SHALL not rely on pointer hover for any information: every tooltip content SHALL also be in the Detail_Panel and the table.
9. THE Gravekeeper_UI SHALL support zoom to 200 percent and a viewport width of 320 CSS pixels without loss of content or two-dimensional scrolling, except for the Scene, which MAY scroll horizontally inside its own region (WCAG 1.4.10 exception does not apply, so the Scene SHALL reflow by reducing its column count to `SCENE_MIN_COLUMNS` instead).
10. THE Gravekeeper_UI SHALL pass an axe-core scan with zero violations of WCAG 2.2 A and AA rules on every screen named in criterion 1, in the Playwright tests of Requirement 20.

### Requirement 17: Performance and layout stability

**User Story:** As a visitor, I want the graveyard to appear smoothly without jumping, so that the page feels solid even for large repositories.

#### Acceptance Criteria

1. THE Scene SHALL render `SCENE_MAX_PLOTS` Plots and commit them to the DOM within `SCENE_RENDER_BUDGET_MS`, measured as the median of `SCENE_PERF_RUNS` renders in Chromium with the CPU slowed by `SCENE_PERF_CPU_THROTTLE`, from the call that provides a ready Scene_Model to the next animation frame after commit.
2. THE total client JavaScript of the route `/`, gzip-compressed and summed over every chunk loaded on first view of the Results_Page, SHALL be at most `CLIENT_JS_BUDGET_BYTES`, and a build-time check SHALL fail when the budget is exceeded, naming the constant.
3. THE Gravekeeper_UI SHALL reserve the space of the results before they render: the header, the view toggle and the Scene container SHALL have their final height from the Scene_Model (Requirement 8, criterion 3) at the first paint of the results, so that the cumulative layout shift from the end of the Scanning_Screen to the fully rendered results is at most `RESULTS_CLS_MAX`.
4. THE Scene SHALL animate only `transform` and `opacity`, and SHALL use CSS animation, not JavaScript timers, for fog, drift and pulse.
5. THE Scene SHALL render Plots from a memoised list keyed by Package_Key, so that opening or closing the Detail_Panel, hovering or changing the view toggle does not re-render all Plots.
6. THE Gravekeeper_UI SHALL load fonts through `next/font` with the fallback metric adjustment, so that font loading adds no layout shift above `RESULTS_CLS_MAX`.
7. THE Gravekeeper_UI SHALL load the Detail_Panel, the List_View and the manifest picker in code-split chunks that are not part of the first load of the Scanning_Screen.

### Requirement 18: List view

**User Story:** As a screen-reader user or a visitor who prefers a table, I want the same data as a sortable list, so that I get the full result without the drawing.

#### Acceptance Criteria

1. THE Results_Page SHALL show a view toggle with two options, "Scene" and "List", as a group of two buttons with `aria-pressed`, the Scene being the default, and the choice SHALL be stored in the URL query value `view` (`scene` or `list`) so that a reload keeps it.
2. THE List_View SHALL render a native `table` with a `caption`, `th scope="col"` column headers and one `tr` per Package_Row, and SHALL contain the same Package_Rows as the Scene.
3. THE Table_Model SHALL provide the columns: Package (display name), Ecosystem, Status (text), Score, Main reason (Strongest_Reason short form or Unassessed_Cause label), Scopes, Checked version with basis.
4. THE List_View SHALL make each column header a button that sorts the table by that column, SHALL set `aria-sort` on the sorted header, and SHALL toggle ascending and descending order on repeated activation.
5. THE Table_Model SHALL sort by the chosen column with the scene order of Requirement 7, criterion 9, as the stable tiebreaker, and SHALL sort numbers numerically and text by Unicode code point.
6. THE List_View SHALL open the Detail_Panel when the visitor activates the package name button of a row.
7. THE List_View SHALL show an Unknown_Value in a cell as the word "unknown" and an Unmarked_Grave's score cell as "not assessed", never as 0.
8. THE List_View SHALL render all rows of `SCENE_MAX_PLOTS` Packages without pagination and within the same render budget as the Scene (`SCENE_RENDER_BUDGET_MS`).
9. [PBT] FOR ALL Scan_Results, the Table_Model SHALL contain every Package_Row exactly once, and for each sortable column and direction the sorted rows SHALL be a permutation of the unsorted rows ordered non-decreasingly by that column's sort key.
10. [PBT] FOR ALL Scan_Results, the set of Package_Keys in the Table_Model SHALL equal the set of Package_Keys in the Scene_Model, and each row's status word and score SHALL equal those of the matching Plot.
11. [PBT] FOR ALL Scan_Results and column choices, sorting the Table_Model twice by the same column and direction SHALL give the same row order as sorting once (idempotence).

### Requirement 19: Component and view-model tests

**User Story:** As a developer, I want fast tests at each layer, so that a regression is caught before the end-to-end suite runs.

#### Acceptance Criteria

1. THE test suite SHALL contain property tests for the View_Model in files named `<module>.property.test.ts`, each with at least `PBT_MIN_RUNS` runs, each tagged with the comment `Feature: graveyard-ui, Property <n>: <text>`, and each implementing one property.
2. THE property tests SHALL use generators that produce structurally valid Scan_Results, including HAUNTED without `maxSeverity` and without advisory severities, DEAD packages of each Grave_Type (reasons with `8.1`, `8.2`, `8.3` in every combination), HAUNTED packages that also carry `8.1`, `8.2` or `8.3` in every combination (Ghosts and Restless_Ghosts), every Headline combination with a part equal to 0 (B, F or H) and N equal to 0, advisories with every `excluded` value and with `excluded` absent, advisories with and without `aliases` and `severity`, every Version_Basis, unassessed items of each Unassessed_Cause, repeated Package_Keys across scopes and manifests, `capped.skipped` entries, every Note code, and `partial` and `failed` sources, up to 300 Package_Rows (and up to 1000 for the properties of Requirement 8).
3. THE test suite SHALL contain Testing Library component tests (Vitest with a DOM environment) for: Landing_Page (input, button, empty-input message, legend, featured links), Scanning_Screen (stage text states for given elapsed times with fake timers, cancel, reduced-motion variant), Results header, Scene (focus, tooltip, keyboard navigation, selection), List_View (sorting, `aria-sort`), Detail_Panel (focus trap, Escape, focus return, Unknown_Value text, Resurrect_Slot only on DEAD packages), Caretakers_Notes (groups, "Show all", source statuses), and one test per Error_Screen code.
4. THE component tests SHALL use accessible queries (`getByRole`, `getByLabelText`) and SHALL not query by CSS class.
5. THE test suite SHALL contain Synthetic_Fixtures built by typed builders for every state that Recorded_Fixtures lack (DG-17), and each builder SHALL return a value that satisfies the `ScanResult` type.
6. THE test suite SHALL replay the Recorded_Fixtures through the View_Model and assert, for each, that N, M, B, F and H of the Headline equal the values computed independently from `summary.counts` and from the `ruleId` values of the DEAD packages of `uniquePackages(result.assessed)`, that B + F equals `summary.counts.DEAD`, that H equals `summary.counts.HAUNTED`, and that `summary.total` Plots exist (40 for request, 6 for canopy, 20 for zoxide, unchanged by scan-accuracy because the unique package count does not depend on versions).
7. THE test suite SHALL contain unit tests of the Constants consistency rules.
8. THE test suite SHALL add its dependencies (Testing Library, a DOM environment, axe-core integration, Playwright) as pinned devDependencies, and SHALL run the unit, property and component tests with `npx vitest --run`.

### Requirement 20: End-to-end tests, accessibility scans and screenshots

**User Story:** As a developer and as a hackathon author, I want the real UI tested in a browser and screenshots saved, so that I can trust the app and show it.

#### Acceptance Criteria

1. THE Playwright suite SHALL mock `POST /api/scan` with `page.route`, replying with the Recorded_Fixture Scan_Results for the three Featured_Graveyards (replayed into JSON files by a script that reuses the wiring of `tests/pipeline/fixtures-scan.test.ts`), and with Synthetic_Fixtures and Scan_Errors for the other cases, and SHALL send no request to a real upstream host.
2. THE Playwright suite SHALL cover these flows: landing page; typing a URL and activating "Dig up"; each Featured_Graveyard link; the Scanning_Screen with a delayed mock (stage text changes with elapsed time, Cancel returns to the landing page); the results of each Recorded_Fixture in Scene and List view; opening and closing the Detail_Panel by mouse and keyboard; reload of `/?repo=...` giving the same result; Back and Forward between two results.
3. THE Playwright suite SHALL cover every API error code with at least one mocked response, and, for `invalid-url`, every `details.part`, and for `invalid-request`, every `details.reason`, and for `upstream-unavailable`, both the 503 with `Retry-After` and the 502 without; and for `too-many-manifests` and `manifest-not-found`, a response with candidates (the Manifest_Picker selects paths and rescans with `manifest` values) and one with an empty candidate list; the countdown SHALL be tested with the Playwright clock.
4. THE Playwright suite SHALL cover the Client_Failures `network-failure`, `timeout` and `malformed-response`.
5. THE Playwright suite SHALL run an axe-core scan (WCAG 2.2 A and AA tags) on the Landing_Page, the Scanning_Screen, the Results_Page (Scene view, List view and Detail_Panel open) for each Recorded_Fixture, and every Error_Screen state of criteria 3 and 4, and SHALL fail on any violation.
6. THE Playwright suite SHALL run each flow of criterion 2 with `reducedMotion: 'reduce'` at least once, and SHALL assert that no CSS animation is running in the Scene.
7. THE Playwright suite SHALL assert the `RESULTS_CLS_MAX` layout-shift budget with a `PerformanceObserver` on the results of the largest Synthetic_Fixture and of each Recorded_Fixture.
8. THE Playwright suite SHALL assert the `SCENE_RENDER_BUDGET_MS` budget with a Synthetic_Fixture of `SCENE_MAX_PLOTS` Package_Rows under `SCENE_PERF_CPU_THROTTLE`, using the median of `SCENE_PERF_RUNS` runs.
9. THE Playwright suite SHALL assert `CLIENT_JS_BUDGET_BYTES` by summing the gzip size of the JavaScript responses loaded for `/?repo=...` after a production build.
10. THE Playwright suite SHALL save a screenshot of each screen into `SCREENSHOT_DIR` for each viewport of `SCREENSHOT_VIEWPORTS`: landing, scanning (each of the four stages), results Scene and List for each Recorded_Fixture, Detail_Panel of a Tombstone, an Overgrown_Grave, a Ghost, a Restless_Ghost and a Lantern, Caretaker's notes, and every Error_Screen, with names `<screen>-<variant>-<viewport>.png`, and SHALL overwrite earlier files of the same name.
11. THE screenshots SHALL be produced with `reducedMotion: 'reduce'` and a fixed clock, so that two runs on the same build give the same images, and SHALL be committed (they are inputs to the write-up).

### Requirement 21: Security of rendered data

**User Story:** As a user, I want the UI to treat repository data as untrusted, so that a hostile repository cannot attack the page.

#### Acceptance Criteria

1. THE Gravekeeper_UI SHALL render every string from the Scan_Result and from the Scan_Error as text through React text nodes, and SHALL NOT use `dangerouslySetInnerHTML` or `innerHTML` anywhere.
2. THE Gravekeeper_UI SHALL treat the `repo` query value as untrusted input: the value SHALL be sent only as the JSON field `repoUrl` and shown only as text, and SHALL NOT be used as a link target.
3. THE Gravekeeper_UI SHALL build every external link target from validated parts only: the registry page of DG-4 from `ecosystem` and `name`, the source repository of DG-5 from a `details.sourceRepo` that matches `^github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`, an advisory link from the Advisory_Entry `url` only when it matches `^https://osv\.dev/vulnerability/[A-Za-z0-9._:%-]+$` (the pipeline percent-encodes every other byte), and the Canonical_Repo_URL from `repo.host`, `repo.owner` and `repo.repo`.
4. THE View_Model SHALL encode every path segment of a built URL with `encodeURIComponent` and SHALL return no link for a value that fails its pattern.
5. THE Gravekeeper_UI SHALL send no cookie, token or credential, and SHALL call only the same-origin `/api/scan`.
6. THE Gravekeeper_UI SHALL send a Content-Security-Policy header on every response with `default-src 'self'`, `script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`, `font-src 'self'`, `img-src 'self' data:`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and `frame-ancestors 'none'` (Open question 9, answered).
7. [PBT] FOR ALL package names, manifest paths, advisory `url` and `id` strings and `sourceRepo` strings (including `javascript:` and `data:` prefixes, quotes, angle brackets, `%` sequences, newlines and very long strings), every link built by the View_Model SHALL be `null` or a string that starts with `https://` and whose host is one of `www.npmjs.com`, `pypi.org`, `crates.io`, `github.com`, `osv.dev` or the configured `repo.host`.

### Requirement 22: Advisory exclusion kind (additive pipeline change)

**User Story:** As a maintainer reading the Detail_Panel, I want to know which listed advisories are withdrawn or informational, so that the list never looks inconsistent with the number of open vulnerabilities.

This requirement is the only change outside `/view-model`, `/client`, `/components` and `/app` that this spec makes (DG-21). It is additive: one new field per Advisory_Entry, no field removed or renamed, no change to any count, note, message or score. It is implemented by an explicit pipeline task with tests.

#### Acceptance Criteria

1. THE Advisory_Entry type (`AdvisoryEntry` in `pipeline/mapping/types.ts`) SHALL have the additional field `excluded` of type `'withdrawn' | 'informational' | null`, and `buildAdvisoryEntries` SHALL set it for every entry.
2. WHEN the `AdvisoryRecord` of an entry has `withdrawn` equal to `true`, THE pipeline SHALL set `excluded` to `'withdrawn'`, whether or not the record is also informational.
3. WHEN the `AdvisoryRecord` of an entry has `withdrawn` equal to `false` and `informational` equal to `true`, THE pipeline SHALL set `excluded` to `'informational'`.
4. WHEN the `AdvisoryRecord` of an entry has `withdrawn` and `informational` equal to `false`, or WHEN the entry has no record because its details were not fetched, THE pipeline SHALL set `excluded` to `null`.
5. THE pipeline SHALL leave `openVulnerabilityCount`, `maxSeverity`, every Scan_Note, every message, every score and every other field of the Scan_Result unchanged, so that the Scan_Result differs from the previous one by the new field only.
6. THE Scan_API response of an HTTP 200 SHALL carry `excluded` on every Advisory_Entry of every `dependencies` entry, and no other response SHALL be affected.
7. [PBT] FOR ALL generated sets of advisory records and unfetched ids, THE `excluded` value of each entry SHALL equal the value defined by criteria 2 to 4, the entries with `excluded` equal to `null` SHALL be exactly the entries that `aggregateAdvisories` considers for `openVulnerabilityCount` (not withdrawn, not informational) plus the unfetched ids, the number of entries with `excluded` equal to `null` SHALL be at least `openVulnerabilityCount`, the ids of the entries with `excluded` equal to `'informational'` SHALL equal the ids of the note `informational-advisory-excluded` (or no such note exists when there is none), and the entry list, its order, its ids, aliases, severities and urls SHALL be identical to the list built without the field.

## Open questions

All questions are answered. Questions 1 to 13 were answered in the previous revision and are **accepted by the user in the final revision** (marked "accepted" below). Questions 14 to 16 are the user decisions of the final revision. Each answer is the option that is most consistent with the steering files (`product.md`, `structure.md`, `tech.md`, `ui-design.md`) and with the scope rule (no unrequested features, YAGNI, accessibility first). Answers are final.

**Final revision decisions (user, final):**

14. **Headline and restless ghosts.** Accepted decision: the Headline reads "N of M dependencies are in the graveyard: B buried, F forgotten, H haunted." with parts of count 0 omitted (Requirement 5, criterion 2). H is `summary.counts.HAUNTED` and **includes restless ghosts**, because a restless ghost is HAUNTED. B counts DEAD packages only and **does not include restless ghosts**, so B + F = DEAD and N = B + F + H. A restless ghost is a HAUNTED package with `8.1` or `8.2` (Requirement 7, criterion 20), status word "haunted, buried", no Resurrect_Slot.
15. **Withdrawn and informational advisories.** Accepted decision: the Detail_Panel lists advisories in labelled groups (Requirement 10, criterion 16). Withdrawn entries are not identifiable in the current API (DG-21), so the pipeline gains the additive field `excluded` (Requirement 22) as an explicit task with tests. Informational entries are derived from the note ids when the field is absent.
16. **Display font.** Accepted decision: IM Fell English SC replaces Pirata One. Its availability in the installed `next/font` data and its OFL 1.1 licence are verified and recorded in design.md ("Font licence evidence"). Atkinson Hyperlegible stays. The word "gothic" of `ui-design.md` is read as "period display face" for this font, and the task that adds the font updates that one sentence of `ui-design.md`.

**Previous revision, accepted by the user:**

1. **UI home directory.** Answered and accepted: `/view-model` (pure, no React) next to `/core`, with the architecture check of Requirement 6, criterion 5. Reason: `tech.md` lets `/core` depend only on pure parsing libraries, and the View_Model needs `/pipeline` types.
2. **More than `SCENE_MAX_PLOTS` packages.** Answered and accepted: render every Plot in a simplified form (Requirement 8, criterion 9) and keep the table complete. Reason: an "ossuary" Plot is an unrequested feature and would break the "exactly once" properties.
3. **Client-side or server-side data loading.** Answered and accepted: the Results_Page is a client component that calls `/api/scan` through the Scan_Client, inside a `Suspense` boundary under a synchronous server `page.tsx`. Reason: cancel, elapsed-time Stages and the `Retry-After` and `X-Gravekeeper-Cache` headers need the browser, and the Next.js Vitest guide says Vitest cannot run async Server Components.
4. **Manifest selection in the URL.** Answered and accepted: the repeatable query value `manifest` (`MANIFEST_QUERY_PARAM`). Reason: a reload, a shared link and Back/Forward keep the selection, and a URL is the simplest accessible state.
5. **Unverified link patterns.** Answered and accepted: keep the three registry page patterns of DG-4 and drop the OSV search URL (advisory links now come from `Advisory_Entry.url`, DG-6). Reason: checked on 2026-11-19 with live requests: `https://pypi.org/project/flask-script/` answers 200 and `https://crates.io/crates/serde` answers 200 to a browser-like GET; `https://www.npmjs.com/package/request` answers 403 to every scripted client (bot protection), so the npm pattern could not be confirmed by a request. It is the canonical form of npm's own pages and a visitor opens it in a real browser, so the link stays and the residual risk is recorded in the design.
6. **Repository shorthand.** Answered and accepted: forward the input as typed and show the `invalid-url` screen. Reason: the API is the single validator (Requirement 1, criterion 6) and expanding `owner/repo` is an unrequested feature.
7. **Retry cooldown without `Retry-After`.** Answered and accepted: `RETRY_FALLBACK_COOLDOWN_SECONDS` = 10 for 502, 504 and 500. Reason: it stops rapid repeat requests without locking a keyboard or screen-reader user out for a minute, and the plain message still says what the API recommends.
8. **Core wording defects.** Answered and accepted: show core messages unchanged. Reason: scan-accuracy criteria 2.4 and 2.5 fixed the grammar and the `maxSeverity` noise in core, and `product.md` requires explainable results, so the UI never rewrites a reason.
9. **Content-Security-Policy under this Next.js version.** Answered and accepted: set one static policy in `next.config.ts` `headers()` using the "Without Nonces" form of the CSP guide (`script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`), and record the residual risk. Reason: the guide says a nonce policy needs dynamic rendering of every page, which would remove the static shell that `cacheComponents` and `partialPrefetching` give the landing page, and hash-based SRI is marked experimental. Cross-site scripting is prevented by React text rendering and the `innerHTML` ban of Requirement 21, criterion 1.
10. **Merged classification source (DG-1).** Answered and accepted: use the core exports `uniquePackages`, `mergeClassifications` and `compareClassifications`, which exist since scan-accuracy Requirement 9. Reason: one implementation of the merge order, no drift from core.
11. **Scene order.** Answered and accepted: keep the risk order of Requirement 7, criterion 9. Reason: the Headline counts risk, and "districts" by ecosystem or manifest are an unrequested feature.
12. **`ui-design.md`.** Answered and accepted: closed. The file `.kiro/steering/ui-design.md` exists and was read for this revision. Its "Art direction" matches Requirement 15, criteria 1 and 2 (including "glow intensity follows the max severity" and "unassessed dependencies appear as unmarked graves"), its "Assets and fonts" matches Requirement 15, criteria 3 and 4, its "Voice" matches Requirement 15, criterion 6, and its "Accessibility" matches Requirement 16. No conflict was found. The Overgrown_Grave is an addition to its tombstone art direction that the user decided, and `ui-design.md` stays the steering authority for any later conflict.
13. **Client JS budget value.** Answered and accepted: keep `CLIENT_JS_BUDGET_BYTES` = 256000 gzip as the enforced limit. Reason: no UI exists to measure, and the build check of Requirement 17, criterion 2 fails when the limit is exceeded, so a measured baseline can only lead to a recorded change of the constant, never to a silent one.
