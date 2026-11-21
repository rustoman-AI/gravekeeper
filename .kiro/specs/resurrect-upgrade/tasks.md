# Implementation Plan: resurrect-upgrade

## Overview

This plan implements `requirements.md` and `design.md` of the spec `resurrect-upgrade`, a small follow-up to `resurrect`. It has nine working groups and eight checkpoints, ending with a STOP task: (1) foundations (strict version validator, constants, npm port and adapter), (3) pipeline mapping (version-document plan, hint combiner, upgrade chooser, assembly), (5) scan wiring (stage S6, run-scan, scan result, validator, request report), (7) the `request/request` fixture re-recording, (9) curated `source` and `evidence`, (11) view-model, (13) component, (15) end-to-end, report spec and traceability, (17) deep runs, screenshots, deploy, live smoke and the report. Checkpoints 2, 4, 6, 8, 10, 12, 14 and 16 follow the groups; each runs `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and checkpoint 16 also runs the end-to-end suite and the bundle check. Property-based tests are mandatory sub-tasks and sit next to the code they validate. Unit tests are mandatory too. Requirement numbers are criterion numbers of `.kiro/specs/resurrect-upgrade/requirements.md`; property numbers `RU-P1` to `RU-P8` are those of `.kiro/specs/resurrect-upgrade/design.md`.

Implementation language: TypeScript (strict). The project root is the `gravekeeper` folder. This spec writes no code in the spec phase; the tasks below do.

Rules for every task:

- One owner per file per task: a file named in a task is edited by that task only, and tasks that name the same file are in different waves of the dependency graph.
- Test files follow `<module>.test.ts` and `<module>.property.test.ts` under `/tests`. Every property test uses `cfg()` from `tests/support/fc-config.ts`, carries the tag comment `// Feature: resurrect-upgrade, Property RU-P<n>: <title>` and a `// Validates: Requirements <list>` line, holds one property per file, and has titles that start with `RU-P<n>`.
- Never set `FC_NUM_RUNS` in the shell. Deep runs use `npm run test:deep -- <files>`.
- Never print, log or write a token. Live tasks get `GITHUB_TOKEN` from `gh auth token` inside the command that runs the test (for example `$env:GITHUB_TOKEN = (gh auth token)` in the same PowerShell command), never echo it, and never write it to a file.
- Tasks marked **orchestrator-only** are done by the orchestrator (they run `git commit` and `git push`, use the network or use the token). A coding sub-agent does not start them.
- Every existing test and the properties of the other specs stay green. A test changes only where this spec legitimately changes a behavior (design, "Test updates that this spec legitimately causes"). The properties RS-P1 to RS-P12 are not edited except RS-P10's generators, which need `evidence` (task 9.1).
- No change of the art, the palette, the scene or the header layout. The slot reuses existing classes and tokens; if a new class is unavoidable, add one delimited block to `app/globals.css` that uses only existing custom properties. Reduced motion and WCAG 2.1 AA apply; the slot has no animation. The client JavaScript budget (`npm run check:bundle`, `tests/e2e/js-budget.spec.ts`) and the scene render budgets stay.
- Re-record a fixture only where task 7.1 says so: the repository `request/request` only. The sets `revmic/canopy`, `ajeetdsouza/zoxide`, `psf/requests` and `_supplementary` stay byte-identical.
- `AGENTS.md` applies: read the relevant guide in `node_modules/next/dist/docs/` before changing any Next.js code. This plan edits a client component, view-model code, pipeline code and data; it uses no new Next.js API. If a task finds that it must touch a Next.js file, it reads the guide first.
- Source code cites the requirement number in a comment above each rule (steering rule).
- Commit and push after each green group: the orchestrator stages the files of that group by name (no `git add -A`).
- Group 3 changes `AssembledFacts` and group 11 changes `ResurrectModel`; the full `npm run typecheck` is expected to pass only after the last task of the group that completes the change (task 3.8 and task 13.1). Tasks in between check themselves with `npx vitest --run <their test files>`.

## Tasks

- [x] 1. Foundations: strict version, constants, npm port and adapter
  - [x] 1.1 Implement the strict version validator in Core
    - Create `core/versions/strict-version.ts` with `isStrictVersion(ecosystem: unknown, version: unknown): boolean` and the module-local constant `STRICT_VERSION_MAX_LENGTH` = 64, by the design table (npm and cargo: semantic version without build metadata; pypi: release with optional `a`/`b`/`rc`, `.post`, `.dev`, no epoch, no local version). Check the type and the length (code points) before the pattern. Total, linear, no throw. Export it from `core/index.ts`. Update `tests/core/public-api.test.ts` if it lists the exports. Run `npm run check:core`.
    - Create `tests/core/versions/strict-version.test.ts`: accepted tables (`1.2.3`, `0.0.1`, `1.2.3-beta.1`, `2.31.0` for pypi, `2020.04.05`, `1.0rc1`, `1.0.post2`, `1.0.dev3`) and rejected tables (`1.2`, `01.2.3`, `1.2.3+build`, `1!2.0`, `1.0+local`, `1.2.3;rm`, `1 2 3`, quotes, backticks, `$(x)`, newline, 65 characters, `null`, a number, an unknown ecosystem).
    - _Requirements: 5.4_
  - [x] 1.2 Change the pipeline constants and the constants test
    - In `pipeline/constants.ts` set `CACHE_KEY_VERSION` to 5 (comment: "resurrect-upgrade R3.1: bumped to 5 so scans cached before version notices and upgrades are not reused") and add `NPM_VERSION_DOCS_MAX` = 40 with a one-line comment. Define no other `UPPER_SNAKE` constant there. In `tests/pipeline/constants.test.ts` change "CACHE_KEY_VERSION equals 4" to 5, add `NPM_VERSION_DOCS_MAX` to the expected name lists and test its value. This task owns only these two files.
    - _Requirements: 1.6, 3.1_
  - [x] 1.3 Add `getVersion` to the npm port and adapter, and to every stub
    - In `pipeline/ports/npm-source.ts` add `getVersion(name: string, version: string, ctx: RequestContext): Promise<SourceResult>` with a comment (EF-20 variant, 404 is absent). In `adapters/npm/npm-source.ts` implement it with the URL `${NPM_REGISTRY_URL}/${encodeURIComponent(name)}/${encodeURIComponent(version)}` and the same request shape as `getLatest` (`notFound: 'absent'`, `ttlSeconds: UPSTREAM_CACHE_TTL_SECONDS`, `extraKey: []`, `storeWhen: 'always'`, `l2Kind: null`).
    - Create `tests/adapters/npm-source.test.ts` (style of the other adapter tests): URL of a plain name and of a scoped name with a pre-release version, the cache policy (L1 only), 404 is absent.
    - Add `getVersion: () => Promise.resolve(absent)` (or the local equivalent) to every stub `NpmSource` in the tests, found with `Select-String -Path tests -Pattern "getLatest" -Recurse` (at least `tests/pipeline/api/cache-header.property.test.ts`, `handle-scan-request.test.ts`, `handle-scan-request.property.test.ts`, `tests/pipeline/scan/advisories.property.test.ts`), add a `getVersion` call to `tests/adapters/composition.test.ts` and its type check to `tests/pipeline/ports.test.ts`. This task owns these test files.
    - _Requirements: 1.8, 1.11, 3.2_

- [x] 2. Checkpoint - Foundations
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 2.1 Commit and push the foundations group (orchestrator-only)
    - Stage by name the files of group 1 and commit with the subject `resurrect-upgrade: strict version, cache key 5, npm getVersion (group 1)`. Push. Record the hash for the report (task 17.5).
    - _Requirements: 9.10_

- [x] 3. Pipeline mapping: plan, combiner, chooser, assembly
  - [x] 3.1 Add the mapping types
    - In `pipeline/mapping/types.ts` add `UpgradeSuggestion` (`version: string`, `basis: 'registry-default'`), the optional `npmVersion?: Fetched<unknown>` on `RawTargetInputs` (comment: optional so existing literals stay valid) and `upgrade: UpgradeSuggestion | null` on `AssembledFacts`. This task is the only owner of `pipeline/mapping/index.ts`: it exports `UpgradeSuggestion`, and also the functions that tasks 3.2, 3.4 and 3.6 create (`needsVersionDocument`, `latestVersionOf` and `versionDeprecated` from `./version-doc-plan`, `combineNpmHints` from `./hints`, `chooseUpgrade` from `./upgrade`). Typecheck errors for these exports are expected until wave 3 is done. Types and exports only.
    - _Requirements: 4.7, 5.1_
  - [x] 3.2 Implement the version-document plan
    - Create `pipeline/mapping/version-doc-plan.ts` with `versionDeprecated`, `latestVersionOf` and `needsVersionDocument` as in the design (reads with `readOwn`, try/catch everywhere, uses `readDepsDevVersions` for the default version, `isStrictVersion('npm', ...)` from Core). Cite Requirements 1.1 to 1.4 and 1.11 in comments.
    - Create `tests/pipeline/mapping/version-doc-plan.test.ts`: a `uuid`-like body (3.4.0 deprecated, default 11.x not deprecated) gives true; checked equal to the latest gives false; not deprecated gives false; `isDeprecated: "true"` (string) gives false; unknown latest gives true; pypi and cargo give false; a selected version with a space or `;` gives false; a body whose `versions` getter throws gives false.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.11_
  - [x] 3.3 Write the property test for the plan
    - `tests/pipeline/mapping/version-doc-plan.property.test.ts`: generated deps.dev bodies (versions with random `isDeprecated` of any type, `isDefault`, shuffled order, hostile getters), generated selected versions (valid, null, with metacharacters, over 64 code points), generated latest bodies (absent, with and without `version`).
    - **Property 1: A version document is requested exactly for a deprecated, differing, strict npm version (RU-P1)**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
  - [x] 3.4 Implement the hint combiner
    - In `pipeline/mapping/hints.ts` add `combineNpmHints(versionBody: unknown, latestBody: unknown): UpstreamHint[]` by the design (version hint first, else the `/latest` hint, never more than one; accept `undefined` for an absent body). Cite Requirements 2.1, 2.2, 2.4, 2.5.
    - Create `tests/pipeline/mapping/hints-combine.test.ts`: the `uuid@3.4.0` text wins over a different `/latest` text; an empty `deprecated` in the version body falls back to the `/latest` hint; both absent gives `[]`; the version hint has `sourceUrl` null.
    - _Requirements: 2.1, 2.2, 2.4, 2.5_
  - [x] 3.5 Write the property test for the combiner
    - `tests/pipeline/mapping/hints-combine.property.test.ts`: generated version and `/latest` bodies (objects with `deprecated` of every type, arrays, primitives, undefined, throwing getters).
    - **Property 2: Hint combination prefers the version notice and stays bounded (RU-P2)**
    - **Validates: Requirements 2.1, 2.2, 2.4, 2.5**
  - [x] 3.6 Implement the upgrade chooser
    - Create `pipeline/mapping/upgrade.ts` with `chooseUpgrade` by the six steps of the design, using `versionDeprecated`, `readDepsDevVersions`, `semverVersion`/`semverCompare` for npm and cargo and `pepVersion`/`pepCompare` for PyPI, `readOwn` and `normalizeHintText` for the npm `/latest` check. Add the source comment of Requirement 4.8 (what `isDeprecated` is, and that only this flag decides). Total.
    - Create `tests/pipeline/mapping/upgrade.test.ts`: uuid-like npm gives the default; `rimraf`-like gives the default; a deprecated default gives null; a default lower than or equal to the checked version gives null; npm `/latest` with a `deprecated` string for the same version gives null; a checked version that is not deprecated but has advisories (HAUNTED case) gives null (Requirement 4.5); PyPI and cargo examples with their comparators (`1.0.0` < `1.0.1`, `1.9` < `1.10` for PyPI); unparsable versions give null.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8_
  - [x] 3.7 Write the property test for the chooser
    - `tests/pipeline/mapping/upgrade.property.test.ts`: generated version lists per ecosystem (semver and PEP 440 generators and unparsable strings), one default, random `isDeprecated`, a checked version from the list or not, `/latest` bodies with and without `deprecated`; an independent oracle in the test; shuffled order of `versions[]`.
    - **Property 3: An upgrade is offered only to an existing, healthy, higher default version of a deprecated checked version (RU-P3)**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.6**
  - [x] 3.8 Wire hints and upgrade into `assembleFacts`
    - In `pipeline/mapping/assemble.ts` replace the `npmDeprecationHint` call by `combineNpmHints(raw.npmVersion === undefined ? undefined : bodyOf(raw.npmVersion), bodyOf(raw.npmLatest))` (only when one body exists), compute `upgrade = chooseUpgrade({...})` after the selection when the deps.dev body is ok, and return `upgrade` in the result (null otherwise). Cite Requirements 2.1, 2.2, 4.1, 4.2. Create `tests/pipeline/mapping/assemble-upgrade.test.ts`: a deprecated checked version with a version document gives the version hint and the upgrade; the same without the version document gives the `/latest` hint and the upgrade; a checked version equal to the latest gives the `/latest` hint and no upgrade; pypi and cargo give an upgrade without any hint. Update the existing `assembleFacts` tests that deep-equal the whole result (`upgrade: null`), keeping their tags and titles.
    - _Requirements: 2.1, 2.2, 2.3, 4.1, 4.2, 4.5_

- [x] 4. Checkpoint - Pipeline mapping
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 4.1 Commit and push the mapping group (orchestrator-only)
    - Stage by name the files of group 3 and commit with the subject `resurrect-upgrade: version-document plan, hint combiner, upgrade chooser (group 3)`. Push. Record the hash.
    - _Requirements: 9.10_

- [x] 5. Scan wiring: stage S6, scan result, validator, request report
  - [x] 5.1 Start the capped version-document requests in stage S6
    - In `pipeline/scan/stage-versions.ts` add `'npm'` to the `sources` pick and `npmLatest: ReadonlyMap<string, RunResult>` to `VersionStageInput`, add `versionUnitKeys.npmVersion(name, version)` (`npmversion:<name>:<version>`), build the npm items (selected npm targets with an ok deps.dev result where `needsVersionDocument` is true, sorted by `compareCodePoints` of the name, first `NPM_VERSION_DOCS_MAX`), run them with `runner.runUnit('npm', ...)` inside the existing `Promise.all`, and return `npmVersions: ReadonlyMap<string, Fetched<unknown>>`. One request per target even when several dependencies share it. Cite Requirements 1.1, 1.5 to 1.10.
    - Update the existing stage-versions tests for the new input (find them with `Select-String -Path tests/pipeline -Pattern "runVersionStage" -Recurse`) and create `tests/pipeline/scan/stage-versions-npm.test.ts` with scripted sources: one deprecated differing target gives one `getVersion` call with the selected version; 45 deprecated targets give exactly `NPM_VERSION_DOCS_MAX` calls for the first 40 names in code point order; an absent and a failed answer give no body and the stage still returns; a target with a checked version equal to the latest gives no call.
    - _Requirements: 1.1, 1.5, 1.6, 1.7, 1.9, 1.10_
  - [x] 5.2 Wire the stage into `run-scan.ts`
    - In `pipeline/scan/run-scan.ts` pass `sources.npm` and `registries.npmLatest` to `runVersionStage` and set `npmVersion` in `rawOf` from `versions?.npmVersions.get(key)` (through `fetchedOf`, undefined when absent). Cite Requirement 1.5.
    - _Requirements: 1.5_
  - [x] 5.3 Carry the upgrade into the scan dependencies
    - In `pipeline/scan/types.ts` add `readonly upgrade?: { readonly version: string; readonly basis: 'registry-default' }` to `ScanDependency` (comment: optional so results built before this spec stay valid). In `pipeline/scan/assemble-result.ts` add `upgrade` to `TargetOutcome` (`assembled.upgrade`; `null` in the all-null and unlooked outcomes) and set the key on each dependency of a target only when it is non-null (spread, so the key is absent otherwise). Update the tests that deep-equal a dependency entry (`tests/pipeline/scan/assemble-result.test.ts` and others found by running them), and add to `tests/pipeline/scan/assemble-result.test.ts` or a new `tests/pipeline/scan/assemble-result-upgrade.test.ts` (new file preferred): two dependencies of one target carry equal upgrades; no key when null.
    - _Requirements: 4.7, 5.1_
  - [x] 5.4 Validate the upgrade in the stored-result validator
    - In `pipeline/scan/scan-cache.ts` add `isUpgrade` (exactly the keys `version` and `basis`; `version` a non-empty string of at most 64 code points; `basis` equal to `registry-default`) and extend the dependency check: `upgrade` is `undefined` or valid. Create `tests/pipeline/scan/scan-cache-upgrade.test.ts`: a result without `upgrade` is accepted; a valid one is accepted; a table of malformed values is rejected (array, extra key, missing key, empty version, 65-code-point version, numeric version, `basis: 'latest'`, `null`).
    - _Requirements: 5.2, 5.3_
  - [x] 5.5 Write the property test for the stored result
    - `tests/pipeline/scan/scan-cache-upgrade.property.test.ts`: generated `ScanResult` values built from a valid minimal result (as in `scan-cache-hints.property.test.ts`) with `upgrade` absent or present, and mutations that replace one `upgrade` by a malformed value.
    - **Property 7: Scan results with upgrades survive JSON and the validator (RU-P7)**
    - **Validates: Requirements 5.2, 5.3, 5.8**
  - [x] 5.6 Test the request counts of whole scans
    - Create `tests/pipeline/scan/run-scan-version-docs.test.ts` with scripted sources in the style of `run-scan-pyproject.test.ts`, counting `getVersion` calls: no deprecated target gives 0; one deprecated differing version gives 1 and the hint is the version-document text; the same target in two manifests gives 1; a deprecated checked version equal to the latest gives 0 and the `/latest` hint; 45 deprecated targets give `NPM_VERSION_DOCS_MAX`; a failing `getVersion` makes the status of the source `npm` partial and the `/latest` hint remains; the request happens after the deps.dev package answer; the result of a deprecated target carries `upgrade`, the result of a healthy one does not.
    - _Requirements: 1.5, 1.6, 1.7, 1.9, 1.10, 3.4, 4.7_
  - [x] 5.7 Split the npm pattern of the request report
    - In `scripts/live-report.ts` change the `npm` case of `patternOf` so that a second segment equal to `latest` gives `/{package}/latest` and any other second segment gives `/{package}/{version}`; export `patternOf` (or move it unchanged into an exported helper in the same file) so that it can be tested. Create `tests/scripts/live-report-pattern.test.ts`: `/left-pad/latest`, `/left-pad/1.3.0`, `/@scope%2Fname/latest` (encoded) and `/@scope/name/1.0.0` (unencoded scope) give the expected patterns; the two npm rows are separate in `requestRows` output. The script must still not run `main()` when imported by a test (guard it with the same check that the other scripts use, or move `main()` behind `if (process.argv[1]?.endsWith('live-report.ts'))`).
    - _Requirements: 3.3_

- [x] 6. Checkpoint - Scan wiring
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. The `request/request` fixture tests are expected to fail with "replay missed a request" until group 7; list them in the report and do not change them here. Ask the user if questions arise.
  - [x] 6.1 Commit and push the wiring group (orchestrator-only)
    - Stage by name the files of group 5 and commit with the subject `resurrect-upgrade: stage S6 version documents, upgrade in the scan result (group 5)`. Push. Record the hash.
    - _Requirements: 9.10_

- [x] 7. Fixture re-recording and replay
  - [x] 7.1 Re-record `request/request` (orchestrator-only)
    - Run in one command: `$env:GRAVEKEEPER_LIVE_TESTS = '1'; $env:GITHUB_TOKEN = (gh auth token); npm run fixtures:record -- --only request/request` (the token is never printed). Then run `git status --short tests/fixtures` and `git diff --stat tests/fixtures`: only paths under `tests/fixtures/request__request/` may change; revert anything else with `git checkout -- <path>`. Check that `tests/fixtures/request__request/index.json` now lists `https://registry.npmjs.org/uuid/<version>` and `https://registry.npmjs.org/rimraf/<version>` (not `latest`) and note the two checked versions for the report. If the recorder fails or the two documents are missing, stop and report; do not edit recorded files by hand.
    - _Requirements: 9.1, 9.2_
  - [x] 7.2 Update and extend the replay tests of the `request/request` set
    - Create `tests/pipeline/resurrect-upgrade-fixtures.test.ts` in the style of `tests/pipeline/resurrect-fixtures.test.ts`: in `request__request`, `uuid` carries one `deprecation-notice` hint (the recorded text of its checked version) and an `upgrade` whose version is the deps.dev default and is higher than its `lookupVersion`; `rimraf` the same; `har-validator` carries its `/latest` hint and no `upgrade`; two replays are equal; no hint text or version contains `ghp_`, `gho_` or `github_pat_`; the number of recorded npm version documents equals the number of replayed `getVersion` calls. Update `tests/pipeline/fixtures-scan.test.ts` and `tests/pipeline/resurrect-fixtures.test.ts` only where they mention recorded facts of this set or the hints of `uuid` and `rimraf` (as-of date, ages, advisory counts, the old assertion that `uuid` and `rimraf` carry no hint), and write each changed assertion and its reason into a list for the report. Run the other three sets' replay tests and confirm they pass unchanged.
    - _Requirements: 9.3, 9.10_
  - [x] 7.3 Re-export the e2e fixtures
    - Run `npm run e2e:fixtures` and check that `tests/e2e/.generated/scan-request.json` holds the `uuid` hint and `upgrade` and the `rimraf` hint and `upgrade`, and that the other generated files are unchanged. Update `tests/ui/export-scan-fixtures.test.ts` and `tests/ui/view-model/fixtures-replay.test.ts` only where they deep-equal exported values or the old behavior of `uuid`. Edit `scripts/export-scan-fixtures.ts` only if the synthetic bodies need an `upgrade` (they do not; leave it unchanged otherwise).
    - _Requirements: 9.3, 9.10_

- [x] 8. Checkpoint - Fixtures
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 8.1 Commit and push the fixtures group (orchestrator-only)
    - Stage by name `tests/fixtures/request__request` (the directory path), the test files of tasks 7.2 and 7.3, and the regenerated files that the repository tracks, and commit with the subject `resurrect-upgrade: re-record request/request fixture set (group 7)`. Confirm with `git show --stat HEAD` that no other fixture set is in the commit. Push. Record the hash.
    - _Requirements: 9.2_

- [x] 9. Curated `source` and `evidence`
  - [x] 9.1 Change the loader and its tests
    - In `view-model/resurrections.ts` add `evidence` to `ENTRY_KEYS` and to `CuratedEntry`, require `isHttpsUrl` (https, no credentials) for `evidence` and `source`, add `isMachineEndpoint(url)` (host `registry.npmjs.org`, `api.osv.dev`, `api.deps.dev`; host `pypi.org` with a path that starts `/pypi/` and ends `/json`; host `crates.io` with a path that starts `/api/`) and drop an entry whose `source` is a Machine_Endpoint. Cite Requirements 7.1 to 7.3, 7.6.
    - Update `tests/ui/view-model/resurrections.test.ts` (entries need `evidence`; add cases: missing `evidence`, `http:` evidence, credentials in either URL, a `source` on `registry.npmjs.org`, `api.osv.dev`, `pypi.org/pypi/x/json` and `crates.io/api/v1/crates/x`, each dropped while valid entries are kept) and `tests/ui/view-model/resurrections.property.test.ts` (RS-P10: its entry generator gains a valid `evidence`; its tag, title and properties stay unchanged).
    - _Requirements: 7.1, 7.2, 7.3, 7.6_
  - [x] 9.2 Migrate the data file and its data test
    - In `data/resurrections.json` add `evidence` to every entry and set `source` by the migration rule of the design: `evidence` is the current `source`; `source` is `https://www.npmjs.com/package/<from>`, `https://pypi.org/project/<from>/` or `https://crates.io/crates/<from>` when the current source is a Machine_Endpoint, and the current source otherwise. Keep the order, the `to` lists and the `why` sentences. Update `tests/ui/view-model/resurrections-data.test.ts`: six keys, both URLs https without credentials, `source` not a Machine_Endpoint, the registry-page rule for entries whose evidence is a Machine_Endpoint, and every entry survives the loader. Keep the other assertions (sorting, names, `why`, minimum 8 entries per ecosystem, no `uuid` as `from`).
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.8, 7.9_
  - [x] 9.3 Extend the live contract test with the evidence checks
    - In `tests/live/resurrections.live.test.ts` read `evidence` and `to` of each entry and add one case per entry (gated like the others, sequential): GET the evidence with at most 3 redirects and require status 200; read the first 1 MiB of the body as text and require that it contains at least one `to` name of the entry, compared case-insensitively. Send the project User-Agent. A failure message names the ecosystem, the package and the check only. The existing target checks stay unchanged. Update `tests/live/live-gating.test.ts` only if it enumerates cases.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [x] 9.4 Run the live contract test and repair the evidence (orchestrator-only)
    - Run `$env:GRAVEKEEPER_LIVE_TESTS = '1'; $env:GITHUB_TOKEN = (gh auth token); npx vitest --run tests/live/resurrections.live.test.ts` in one command. For each failing evidence case replace the `evidence` URL in `data/resurrections.json` by a working machine-checkable URL that names a `to` package (for PyPI entries `https://pypi.org/pypi/<name>/json` of the package whose page states the relationship, the raw README, or the registry document), or drop the entry (keeping at least 8 entries per ecosystem); keep `source` a Human_Page. A failure caused by rate limiting or the network is waited out and repeated. Rerun until the test passes and run the data and loader tests. Write the changes (entry, old evidence, new evidence or drop, reason) into a list for task 9.5.
    - _Requirements: 8.6_
  - [x] 9.5 Update the curated tables of `docs/resurrect-report.md`
    - In `docs/resurrect-report.md` change the curated table of kept entries to the columns ecosystem, from, to, source, evidence (from `data/resurrections.json`, same row order), add the section `### Evidence changes (resurrect-upgrade)` with the list of task 9.4 (or the sentence "No evidence URL needed a change"), and add one sentence that `source` is the page shown in the slot and `evidence` is the URL that the live contract test fetches. Change no other text of the file. This task is the only task that edits this file.
    - _Requirements: 7.10_
  - [x] 9.6 Write the property test for the curated loader
    - `tests/ui/view-model/resurrections-evidence.property.test.ts`: generated raw entry lists (valid entries and entries with a missing or extra key, non-string, non-https, credential-bearing `source` or `evidence`, and Machine_Endpoint `source` values), and generated valid lists run through `buildResurrectModel` with hostile rows from `tests/support/arbitraries/resurrect.ts`.
    - **Property 8: The curated loader enforces the six-key schema and links only the human page (RU-P8)**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.6, 7.7**

- [x] 10. Checkpoint - Curated data
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 10.1 Commit and push the curated group (orchestrator-only)
    - Stage by name the files of group 9 and commit with the subject `resurrect-upgrade: curated source and evidence (group 9)`. Push. Record the hash.
    - _Requirements: 9.10_

- [x] 11. View-model: types, narrowing, rows, commands, model
  - [x] 11.1 Add the view-model types
    - In `view-model/types.ts` add `ParsedUpgrade` (`version`, `basis: 'registry-default'`), `upgrade: ParsedUpgrade | null` on `ParsedDependency` (and in the `Omit` of the scan dependency type, as `hints` is) and on `PackageRow`, `ResurrectUpgrade` (`label: 'From the registry'`, `title`, `sentence`, `version`, `blocks`), `upgrade: ResurrectUpgrade | null` on `ResurrectModel`, and `copyName: string` on `ResurrectBlock`. Types only. Typecheck errors in the files of the next tasks are expected until they are done.
    - _Requirements: 6.1, 6.14_
  - [x] 11.2 Narrow the upgrade at the response boundary
    - In `view-model/narrow.ts` add `narrowUpgrade(value, ecosystem, lookupVersion): ParsedUpgrade | null` by the design (exact keys, `basis` `registry-default`, `isStrictVersion` from Core for the ecosystem, version different from `lookupVersion`; total; idempotent). In `view-model/parse-response.ts` set `upgrade` on each dependency and do not require the field. Create `tests/ui/view-model/narrow-upgrade.test.ts`: absent field gives null; a valid upgrade; version with `;`, a space, `$(x)`, 65 code points; an unknown `basis`; an extra key; a version equal to the `lookupVersion`; a pypi `1.0.post1` accepted and an npm `1.0` rejected; and a parse-response case with no `upgrade` anywhere (results recorded before this spec still parse). Cite Requirements 5.6 and 5.7.
    - _Requirements: 5.6, 5.7_
  - [x] 11.3 Write the property test for the narrowing
    - `tests/ui/view-model/narrow-upgrade.property.test.ts`: `fc.anything()` values, generated upgrade-like records (valid and invalid fields, metacharacters, long versions), the three ecosystems, a generated `lookupVersion`, and outputs fed back in.
    - **Property 5: Client narrowing of the upgrade is total, valid and idempotent (RU-P5)**
    - **Validates: Requirements 5.6, 5.7**
  - [x] 11.4 Add the upgrade to the package rows
    - In `view-model/package-rows.ts` fill `PackageRow.upgrade` from the first dependency entry of the row (manifest order) that has a non-null upgrade, null otherwise. Update the existing row tests that deep-equal a whole row (`upgrade: null`), keeping tags and titles, and the helpers in `tests/support/ui/scan-result-builder.ts` and `tests/support/arbitraries/resurrect.ts` only as far as they must produce `upgrade: null`.
    - _Requirements: 5.6_
  - [x] 11.5 Implement the upgrade command builder
    - In `view-model/resurrect-commands.ts` add `buildUpgradeBlocks({origins, scopes, name, version})` with the templates of the design (npm, pip, poetry, pep621, cargo; scope flags; mixed gives the two blocks with tool headings; heading by path when several blocks exist; `copyLabel` `Copy commands to upgrade <name>`; `copyText` lines joined by `\n`; a block only when `isCommandSafe` and `isStrictVersion` hold for the origin's ecosystem; the double quotes are template text) and add `copyName` to the blocks of the existing `buildCommandBlocks` (the `to` name). Share the grouping code through local helpers; do not change any existing output. Cite Requirements 6.3 to 6.11.
    - Create `tests/ui/view-model/resurrect-upgrade-commands.test.ts`: every template and every scope flag, requirements.txt and pep621 sentences with the exact text of Requirements 6.4 and 6.6, mixed gives both blocks, two manifests give two blocks with path headings, an unsafe name and a non-strict version give no block. The existing `resurrect-commands` tests stay unchanged except for `copyName`.
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11_
  - [x] 11.6 Write the property test for the commands
    - `tests/ui/view-model/resurrect-upgrade-commands.property.test.ts`: all origin formats and Pyproject_Tool values, scopes, names and versions including hostile ones (spaces, quotes, `;`, `$`, backticks, `!`, `+`, newlines, Unicode), and arbitrary strings for `isStrictVersion`. One describe with two tests: the alphabet of accepted versions, and the token grammar with `copyText`.
    - **Property 4: Strict versions are shell-safe and upgrade commands follow the fixed grammar (RU-P4)**
    - **Validates: Requirements 5.5, 6.3, 6.4, 6.5, 6.6, 6.8, 6.10, 6.11, 6.15**
  - [x] 11.7 Build the Upgrade_Section in the model
    - In `view-model/resurrect.ts` add `upgrade` to `buildResurrectModel`: non-null when `row.upgrade !== null` and `isStrictVersion(row.ecosystem, version)`; title `Upgrade to <version>`, label `From the registry`, the sentence of Requirement 6.1, blocks from `buildUpgradeBlocks` with the row's origins, scopes and name; the fallback only when hints, suggestions and upgrade are all empty. Keep `suggestionOf` and the RS-P5 filter unchanged. Cite Requirements 6.1, 6.2, 6.12, 6.13. Create `tests/ui/view-model/resurrect-upgrade.test.ts`: uuid-like row (hint, upgrade, no fallback), restless row (urgent first, then upgrade), upgrade with a curated entry (both shown, upgrade first), upgrade with a non-command-safe name (title and sentence, no blocks), upgrade with a non-strict version (no section, fallback shown), `har-validator`-like row (no upgrade, hint, no fallback). Update `tests/ui/view-model/resurrect*.test.ts` that deep-equal a model (`upgrade: null`), keeping tags and titles.
    - _Requirements: 6.1, 6.2, 6.11, 6.12, 6.13_
  - [x] 11.8 Write the property test for the section order
    - `tests/ui/view-model/resurrect-upgrade-order.property.test.ts`: slot rows of every plot case, combinations of upgrade (strict, non-strict, absent), zero to three hints and zero or one curated entry, built with the existing arbitraries.
    - **Property 6: Section order is fixed and an upgrade suppresses the fallback (RU-P6)**
    - **Validates: Requirements 6.2, 6.11, 6.12**

- [x] 12. Checkpoint - View-model
  - Run `npx vitest --run tests/ui/view-model tests/core` and ensure all pass. The full `npm run typecheck` is expected to pass only after task 13.1 (the component still reads the old model shape). Ask the user if questions arise.

- [x] 13. Component
  - [x] 13.1 Render the Upgrade_Section
    - In `components/resurrect-slot.tsx` render `model.upgrade` between the urgent sentence and the hints: a `div.gk-resurrect-upgrade` with the label paragraph (`gk-resurrect-label`), the title paragraph, the sentence (`gk-resurrect-text`), and for each block the same markup as an Alternative block (heading, lead, `pre`, note, Copy_Button). Change the copy handler to use `block.copyName` for the Copy_Status text ("Copied the commands for <copyName>"). No new request, no animation, no new color. Update `tests/ui/components/resurrect-slot.test.tsx` and `tests/ui/components/detail-panel.test.tsx` only where they build a `ResurrectModel` or `ResurrectBlock` (`upgrade: null`, `copyName`), and add cases to the slot test: the Upgrade_Section shows the label, the title, the sentence and the command; the Copy_Button has the accessible name "Copy commands to upgrade <name>"; copying writes the lines and sets the status "Copied the commands for <name>"; an Upgrade_Section without blocks shows no Copy_Button; no `fetch` call happens.
    - _Requirements: 6.1, 6.2, 6.14, 6.16_

- [x] 14. Checkpoint - Component
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 14.1 Commit and push the view-model and component groups (orchestrator-only)
    - Stage by name the files of groups 11 and 13 and commit with the subject `resurrect-upgrade: upgrade section, commands, narrowing (groups 11, 13)`. Push. Record the hash.
    - _Requirements: 9.10_

- [x] 15. End-to-end, report spec and traceability
  - [x] 15.1 Update the end-to-end spec
    - In `tests/e2e/resurrect.spec.ts` change the `uuid` case (restless: the urgent sentence first, then the Upgrade_Section with the label "From the registry" and the title "Upgrade to <version>", then the hint from the version document; no fallback paragraph) and add `rimraf` (hint, Upgrade_Section, npm command) and keep `har-validator` (hint, no Upgrade_Section, no fallback conflict); copy test for the upgrade command with `context.grantPermissions(['clipboard-read', 'clipboard-write'])` on the desktop project (clipboard text equals the displayed lines, Copy_Status text appears); axe on each opened panel with `AXE_TAGS`. Read expected versions from the loaded scan body in the test, never hard-code them.
    - _Requirements: 6.14, 9.5_
  - [x] 15.2 Update the report spec
    - In `tests/e2e/resurrect-report.spec.ts` add `rimraf` to the packages whose slot text is written to `test-results/resurrect-slot-text.json`, keep the three screenshots (same file names, same packages, 1440x900) so that the `uuid` screenshot shows the Upgrade_Section in the frame, update the note of the synthetic `request` row, and write the Upgrade_Section text (title and command) per package into the output. Keep the `RS_REPORT=1` and `desktop` gating.
    - _Requirements: 9.6, 9.7_
  - [x] 15.3 Write the traceability test
    - Create `tests/ui/ru-traceability.test.ts` in the pattern of `tests/ui/rs-traceability.test.ts` (tag regex `Feature:\s*resurrect-upgrade,\s*Property\s+RU-P(\d+)`, property count 8, three tests titled `RU-trace ...`): each number 1 to 8 appears in exactly one tag, every tagged file has a `// Validates:` line, every test title of a tagged file starts with its `RU-P` number.
    - _Requirements: 9.4_
  - [x] 15.4 Update the traceability document
    - In `docs/property-traceability.md` add a section `## resurrect-upgrade (RU-P1 to RU-P8)` with one row per property (requirements, test file, test titles, status from a full `npx vitest --run`), update the header sentence (spec list and the test and file counts) and add `### resurrect-upgrade (0 of 8)` to "Properties without a test" with the sentence that all eight properties have a passing test (or list those without one). Add a note that RU-P1 to RU-P6 and RU-P8 run on pure values without a DOM.
    - _Requirements: 9.4_

- [ ] 16. Final checkpoint - All checks and end-to-end
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 16.1 Run the end-to-end suite and the bundle check
    - Run `npm run test:e2e` after the full vitest run is green, and `npm run build` followed by `npm run check:bundle` (the budget script reads the build output; if it needs no build in this repository, run it alone). Fix only failures caused by this spec without any change of art, palette or header layout, and without lowering an assertion or a budget. Record the client JavaScript numbers (bytes against budget) for the report.
    - _Requirements: 6.16, 9.5, 9.9_
  - [~] 16.2 Commit and push the end-to-end group (orchestrator-only)
    - Stage by name the files of group 15 and any fix of task 16.1 and commit with the subject `resurrect-upgrade: end-to-end, report spec, traceability (group 15)`. Push. Record the hash.
    - _Requirements: 9.10_

- [ ] 17. Deep runs, screenshots, deploy, live smoke and report
  - [~] 17.1 Run the deep property tests (orchestrator-only)
    - Run `npm run test:deep -- <file>` for each of the eight property files (`tests/pipeline/mapping/version-doc-plan.property.test.ts`, `hints-combine.property.test.ts`, `upgrade.property.test.ts`, `tests/pipeline/scan/scan-cache-upgrade.property.test.ts`, `tests/ui/view-model/narrow-upgrade.property.test.ts`, `resurrect-upgrade-commands.property.test.ts`, `resurrect-upgrade-order.property.test.ts`, `resurrections-evidence.property.test.ts`). Never set `FC_NUM_RUNS` in the shell. Keep for the report, per property: number, title, file, result and, for a failure, the shrunk counterexample, seed and path (or "no counterexample found"). A failing property is reported, not hidden; fix the cause in a separate commit if it is a code defect and rerun.
    - _Requirements: 9.6_
  - [~] 17.2 Regenerate the three screenshots (orchestrator-only)
    - Run `npm run e2e:fixtures`, then `$env:RS_REPORT = '1'; npx playwright test tests/e2e/resurrect-report.spec.ts --project=desktop`. Check that `docs/screenshots/resurrect/resurrect-buried-har-validator.png`, `resurrect-forgotten-aws-sign2.png` and `resurrect-restless-uuid.png` are rewritten at 1440x900 and show the slot (open the images), and keep `test-results/resurrect-slot-text.json` for task 17.5.
    - _Requirements: 9.7_
  - [~] 17.3 Count the cold-scan requests (orchestrator-only)
    - Run `$env:GRAVEKEEPER_LIVE_TESTS = '1'; $env:GITHUB_TOKEN = (gh auth token); npm run live:report -- --out test-results/resurrect-upgrade-live-report.md request/request` in one command (the token is never printed; the output file is not committed). Take the `npm` rows (`/{package}/latest` and `/{package}/{version}`) and the cold total for `request/request`. Take the "before" numbers from `docs/scan-accuracy-live-report.md` (the `request/request` column, with its date) and note that the "before" report predates this spec.
    - _Requirements: 3.5_
  - [~] 17.4 Deploy and run the live smoke (orchestrator-only)
    - Check that the commits of groups 1 to 15 are pushed to `main`, run `npm run verify:deploy` until it passes (Vercel deploys on push), then run one scan against production without any token header: `Invoke-RestMethod -Method Post -Uri https://gravekeeper-chi.vercel.app/api/scan -ContentType 'application/json' -Body '{"repoUrl":"https://github.com/request/request"}' -TimeoutSec 90`. For the dependencies `uuid` and `rimraf` print `lookupVersion`, `versionBasis`, `hints` and `upgrade` (names and fields only). Repeat once if the first answer is a timeout or a partial source status. Keep the output for task 17.5. If production still answers with the old shape (no `upgrade` anywhere, `hints` of the latest document), wait for the deployment and retry; if it persists, report it.
    - _Requirements: 9.8_
  - [~] 17.5 Write the report (orchestrator-only)
    - Create `docs/resurrect-upgrade-report.md` with the sections `# Resurrect upgrade report`, `## What the slot shows` (for `uuid`, `rimraf`, `har-validator` and a synthetic `request` row, labelled synthetic with its reason, the text from `test-results/resurrect-slot-text.json`: sections, hint text and label, the Upgrade_Section title and command), `## Screenshots` (the three PNGs embedded), `## Properties` (task 17.1), `## Requests` (task 17.3: before and after, the added `{package}/{version}` row), `## Fixture` (the two recorded version documents of task 7.1, the exact repository, the statement that no other set changed, and the list of changed assertions of task 7.2), `## Live smoke` (task 17.4: hints and upgrade of `uuid` and `rimraf` on production), `## Findings` (client JavaScript numbers of task 16.1, which ecosystems showed an upgrade in the data, anything surprising, any limit of the evidence check) and `## Commits and CI` (task 17.6). The report holds no token; grep it for `ghp_`, `gho_` and `github_pat_`.
    - _Requirements: 9.6, 9.7, 9.8_
  - [~] 17.6 Commit the report and append the commits with CI status (orchestrator-only)
    - Stage `docs/resurrect-upgrade-report.md`, `docs/screenshots/resurrect/*.png` and `docs/property-traceability.md` (if the counts changed) by name and commit with the subject `resurrect-upgrade: report and screenshots`. Push. Collect the commits of this spec (the hashes recorded in tasks 2.1, 4.1, 6.1, 8.1, 10.1, 14.1, 16.2 and this one, plus any fix commit) with `git log --oneline`, and the CI status of each with `gh run list --limit 30` (workflow `ci.yml`: status and conclusion per commit, `pending` for an unfinished run). Append the table (hash, subject, CI status) to the section `## Commits and CI` of the report, commit it with the subject `resurrect-upgrade: report commits and CI status` and push; the CI status of this last commit is `pending`.
    - _Requirements: 9.6_

- [~] 18. STOP
  - Stop here. Report to the user: the four slots of `uuid`, `rimraf`, `har-validator` and the synthetic `request` row in short form, the live smoke result for `uuid` and `rimraf` on production, the properties with any counterexample, the cold-scan request counts before and after, the commits with CI status, and the path of `docs/resurrect-upgrade-report.md`. Do not start any other work, spec or refactor.

## Notes

- Every task, including the property-based tests, is required. Nothing is marked optional.
- Tasks 2.1, 4.1, 6.1, 7.1, 8.1, 9.4, 10.1, 14.1, 16.2, 17.1, 17.2, 17.3, 17.4, 17.5 and 17.6 need the network, `git push`, the deployed site or the token; the orchestrator does them. The token is passed only through the process environment of one command and is never printed or written.
- The only fixture re-recording is task 7.1 (`request/request`). It is needed because the recorded set holds only the `/latest` npm documents and a replay of the changed pipeline would end with "replay missed a request"; hand-editing recorded files is not allowed.
- The upgrade is offered only for a deprecated checked version (design D4); packages that are HAUNTED by advisories get no upgrade.
- `.kiro/specs/*` task lists and `tasks.meta.json` files of other specs are not edited.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "3.4", "3.6"] },
    { "id": 4, "tasks": ["3.3", "3.5", "3.7", "3.8"] },
    { "id": 5, "tasks": ["4.1"] },
    { "id": 6, "tasks": ["5.1", "5.3", "5.7"] },
    { "id": 7, "tasks": ["5.2", "5.4"] },
    { "id": 8, "tasks": ["5.5", "5.6"] },
    { "id": 9, "tasks": ["6.1"] },
    { "id": 10, "tasks": ["7.1"] },
    { "id": 11, "tasks": ["7.2"] },
    { "id": 12, "tasks": ["7.3"] },
    { "id": 13, "tasks": ["8.1"] },
    { "id": 14, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 15, "tasks": ["9.4", "9.6"] },
    { "id": 16, "tasks": ["9.5"] },
    { "id": 17, "tasks": ["10.1"] },
    { "id": 18, "tasks": ["11.1"] },
    { "id": 19, "tasks": ["11.2", "11.4", "11.5"] },
    { "id": 20, "tasks": ["11.3", "11.6", "11.7"] },
    { "id": 21, "tasks": ["11.8", "13.1"] },
    { "id": 22, "tasks": ["14.1"] },
    { "id": 23, "tasks": ["15.1", "15.2", "15.3"] },
    { "id": 24, "tasks": ["15.4"] },
    { "id": 25, "tasks": ["16.1"] },
    { "id": 26, "tasks": ["16.2"] },
    { "id": 27, "tasks": ["17.1"] },
    { "id": 28, "tasks": ["17.2"] },
    { "id": 29, "tasks": ["17.3"] },
    { "id": 30, "tasks": ["17.4"] },
    { "id": 31, "tasks": ["17.5"] },
    { "id": 32, "tasks": ["17.6"] }
  ]
}
```
