# Implementation Plan: graveyard-ui
## Overview
This plan implements `requirements.md` and `design.md` of the spec `graveyard-ui` (Requirements 1 to 22, Properties 1 to 34). It has two milestones.
**Milestone 1** (groups 1 to 30) reaches a deployed, working flow as early as possible: housekeeping (its own group, committable alone), the additive pipeline field for advisory exclusion, the view-model foundations, test dependencies and configuration, fonts and theme tokens, the landing page, the scanning state, the results page with the scene (first-pass original SVG art for all six plot kinds), the list view, the detail panel, component tests, Playwright end-to-end tests with axe against mocked `/api/scan` responses, the scene render-time and client JavaScript size checks, a Milestone 1 checkpoint, a deploy task and a Milestone 1 report. **Execution stops after the Milestone 1 report task (group 29, closed by the stop checkpoint 30).**
**Milestone 2** (groups 31 to 47) adds the caretaker's notes, the error screens with the manifest picker, the client failure screens, the Resurrect placeholder, the remaining end-to-end and axe coverage, the remaining screenshots, the Content-Security-Policy, the remaining properties and the traceability update.
Each group ends with a checkpoint that runs `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`. Property-based tests are mandatory and sit directly after the code task they validate. Unit, component and end-to-end tests are mandatory too. Requirement numbers are criterion numbers of `.kiro/specs/graveyard-ui/requirements.md`. Property numbers are from `.kiro/specs/graveyard-ui/design.md` unless a task names another spec.
Implementation language: TypeScript (strict). The project root is the `gravekeeper` folder. Test files follow `<module>.test.ts` and `<module>.property.test.ts` (or `<module>-<topic>.property.test.ts` when one module has several properties, so that no two tasks write the same file) under `/tests`. Every property test uses `cfg()` from `tests/support/fc-config.ts`, carries the tag comments `// Feature: graveyard-ui, Property <n>: <title>` and `// Validates: Requirements <x.y>`, and its title starts with `P<n>`. `AGENTS.md` applies: read the relevant guide in `node_modules/next/dist/docs/` before changing any Next.js code (layout, fonts, `next.config.ts`, routing, `next/dynamic`, `useSearchParams`). Source code cites the requirement number in a comment above each rule. Files use kebab-case, components use PascalCase, one component per file, no default exports except Next.js route files.
**Test environment rules.** Agents must never set `FC_NUM_RUNS` in the shared shell. For a deeper property run use `npm run test:deep` (task 1.3). Component tests use the docblock `// @vitest-environment jsdom` (task 7.3) and accessible queries only.
**Commit order.** Group 1 (housekeeping) is committed alone, before any other change. Group 3 (pipeline field) is the second commit. The user commits unless a task says otherwise (task 28.3 pushes).
**Scope notes.** This spec changes `/pipeline` in exactly one place: the field `excluded` of `AdvisoryEntry` (group 3, Requirement 22). The task lists and `tasks.meta.json` files of the other specs are not edited. Tasks that need network access (task 28.4) never write a token to any file.
## Tasks
- [x] 1. Housekeeping (committable alone)
  - [x] 1.1 Add the missing property tags to two scan-accuracy tests
    - In `tests/pipeline/mapping/range-resolve.property.test.ts` add above the `describe` of Property 3 the lines `// Feature: scan-accuracy, Property 3: The resolved version is listed and satisfies every range` and `// Validates: Requirements 3.2, 3.3, 3.4, 3.13, 3.14`, and above the `describe` of Property 4 the lines `// Feature: scan-accuracy, Property 4: The resolved version is the highest non-prerelease match` and `// Validates: Requirements 3.2, 3.3, 3.4, 3.13, 3.14`. In `tests/pipeline/api/cache-header.property.test.ts` the Feature tag exists: add the line `// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.7, 7.8` directly under it (the file has a plain `// Requirements ...` comment, keep it). Change no test logic and no title.
    - _Requirements: scan-accuracy 10.6, 10.7 (traceability), graveyard-ui 19.1_
  - [x] 1.2 Update the property traceability document
    - In `docs/property-traceability.md` remove the two bullets of "Tag and number mismatches" that say `range-resolve.property.test.ts` has no tag comment and `cache-header.property.test.ts` has no `// Validates:` line (they are fixed by task 1.1), and add one sentence under "Notes" that scan-accuracy P3, P4 and P11 are now tagged. Run `npx vitest --run` once (with `FC_NUM_RUNS` unset) and update the pass counts in the header sentence. Do not change any other row.
    - _Requirements: scan-accuracy 10.6, 10.7_
  - [x] 1.3 Add the `test:deep` script
    - Create `scripts/test-deep.mjs`: a plain Node script (no dependency) that exports `deepEnv(baseEnv)` (returns a copy of `baseEnv` with `FC_NUM_RUNS` set to `'1000'`, never mutating its argument) and `runDeep(argv, spawnImpl, baseEnv)` (spawns `vitest` with `--run` followed by every extra CLI argument, passes the copied environment to the child only, forwards stdio, and returns the exit code), and runs `runDeep(process.argv.slice(2), spawn, process.env)` and exits with that code only when the file is executed directly. Resolve the vitest binary through `process.execPath` and `node_modules/vitest/vitest.mjs` so that it works on Windows and on Linux without a shell. In `package.json` add `"test:deep": "node scripts/test-deep.mjs"` (the only change to `package.json`). Never set the variable in the parent process.
    - _Requirements: 19.1, 19.8_
  - [x] 1.4 Write the test for the `test:deep` script
    - Create `tests/scripts/test-deep.test.ts`: `scripts/test-deep.mjs` exists and `package.json` has the script `test:deep`; `deepEnv` returns `FC_NUM_RUNS` `'1000'`, keeps every other key, and leaves its argument unchanged (including an argument that already has another `FC_NUM_RUNS`); `runDeep` with a fake spawn passes the copied environment to the child, forwards extra arguments (`tests/core`, `--reporter=dot`) after `--run`, never changes `process.env.FC_NUM_RUNS` in the parent, and returns the child exit code.
    - _Requirements: 19.1, 19.8_
  - [x] 1.5 Add the `FC_NUM_RUNS` rule to the tech steering file
    - In `.kiro/steering/tech.md` under "Testing" add two bullets: agents must never set `FC_NUM_RUNS` in the shared shell, and a deeper property run is started with `npm run test:deep` (optionally followed by test paths), which sets `FC_NUM_RUNS=1000` for that one process only.
    - _Requirements: 19.8_
- [x] 2. Checkpoint - Housekeeping
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. This group can be committed alone. Ask the user if questions arise.
- [x] 3. Pipeline: advisory exclusion kind (Requirement 22)
  - [x] 3.1 Add the `excluded` field to the advisory entries
    - In `pipeline/mapping/types.ts` add `readonly excluded: 'withdrawn' | 'informational' | null` to `AdvisoryEntry`. In `pipeline/mapping/advisories.ts` set it in `buildAdvisoryEntries`: `'withdrawn'` when the record has `withdrawn`, else `'informational'` when it has `informational`, else `null`, and `null` for an id without a record (it is counted as an unfetched id). Fix every other construction site that `npm run typecheck` reports. Change no count, note, message, score or entry order. Cite Requirement 22 in a comment above the rule.
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6_
  - [x] 3.2 Update and extend the unit tests
    - Update `tests/pipeline/mapping/advisories.test.ts`, `tests/pipeline/mapping/advisories.property.test.ts` and `tests/support/mapper-registry.ts` where they compare an entry by deep equality (they gain the field). Add cases to `tests/pipeline/mapping/advisories.test.ts`: a withdrawn record gives `'withdrawn'`, an informational record gives `'informational'`, a record that is both gives `'withdrawn'`, an unmaintained informational record gives `'informational'`, a plain record gives `null`, an id without a record gives `null`. Add a case to the assemble tests that the notes and counts equal those of the previous behaviour.
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_
  - [x] 3.3 Write the property test for the exclusion kind
    - `tests/pipeline/mapping/advisory-exclusion.property.test.ts`, generating advisory records (all flag mixes, aliases) and unfetched ids and calling `assembleFacts` or `buildAdvisoryEntries` with `aggregateAdvisories` as the independent reference for the count.
    - **Property 34: Advisory exclusion kind agrees with the counted vulnerabilities (pipeline)**
    - **Validates: Requirements 22.1, 22.2, 22.3, 22.4, 22.5, 22.7**
  - [x] 3.4 Check the field against the recorded fixtures
    - In `tests/pipeline/fixtures-scan.test.ts` (or a new `tests/pipeline/fixtures-advisory-exclusion.test.ts` if the file would grow past one concern) assert for the three recorded fixture replays that every advisory entry has an `excluded` value, that the ids of the entries with `'informational'` equal the ids of the `informational-advisory-excluded` note of the same package (the `ajeetdsouza/zoxide` replay has one), and that the response body of `handleScanRequest` carries the field. No fixture is re-recorded.
    - _Requirements: 22.5, 22.6, 22.7_
- [x] 4. Checkpoint - Pipeline field
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [x] 5. View-model foundations
  - [x] 5.1 Create the constants, types and shared helper
    - Create `view-model/constants.ts` (every constant of the requirements Constants table with Home "view-model", plus `SCENE_PADDING_PX`, `PLOT_BOX_WIDTH_PX`, `PLOT_BOX_HEIGHT_PX`, `REASON_PRIORITY`, `LINK_HOSTS`, `DEFAULT_SEVERITY` use from core, and `CLIENT_JS_BUDGET_BYTES`; import `SCAN_MAX_MANIFESTS` and `SCAN_MAX_DEPENDENCIES` from `pipeline/constants.ts`), `view-model/types.ts` (all types of the design "Types" section including `PlotKind` with six values, `StatusWord` with six words, `ParsedAdvisory`, `AdvisoryExclusion`, `HeadlineModel` with `haunted`, and `DetailModel.advisoryGroups`) and `view-model/internal/compare-code-points.ts`. Create no `index.ts` yet (task 5.40). Read `core/index.ts` and `pipeline/scan/types.ts` for the imported names. Every constant cites its requirement in a comment.
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 8.1, 8.2, 8.3, 15.2, 17.2_
  - [x] 5.2 Write the unit test for the constants
    - Create `tests/ui/view-model/constants.test.ts`: the five consistency rules of the requirements (`SCENE_MAX_PLOTS` equals `SCAN_MAX_DEPENDENCIES`, `CLIENT_FETCH_TIMEOUT_MS` above 26500, `SCAN_STAGE_START_MS` strictly increasing and below `SCAN_SLOW_NOTICE_MS`, `PLOT_JITTER_MAX_PX * 2` below `PLOT_CELL_WIDTH_PX`, `SCENE_MIN_COLUMNS` at most `SCENE_MAX_COLUMNS`), `PLOT_BOX_WIDTH_PX` is 80 and `PLOT_BOX_HEIGHT_PX` is 104, `REASON_PRIORITY` has the ten ids in order, `FEATURED_GRAVEYARDS` has the three URLs in order, `CLIENT_FETCH_TIMEOUT_MS` equals `ROUTE_MAX_DURATION_SECONDS * 1000`.
    - _Requirements: 19.7_
  - [x] 5.3 Extend the architecture check with the UI rules
    - In `scripts/architecture/rules.ts` (read `check.ts`, `globals.ts`, `imports.ts` and `resolve.ts` first) add the rules of the design table: `view-model-import-not-allowed`, `view-model-forbidden-api`, `client-import-not-allowed`, `components-import-pipeline-runtime`, `components-no-core-runtime`, `view-model-uses-core-merge`, extend `no-default-export` and `file-name-style` to `view-model/**`, `client/**` and `components/**` (route files of `app/**` exempt), `no-inner-html`, `no-literal-colour`, `no-fixture-import`. Directories that do not exist yet are skipped without error.
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.8, 15.2, 21.1, 2.5_
  - [x] 5.4 Write the unit tests for the architecture rules
    - Create `tests/architecture/ui-rules.test.ts` with, for each new rule, one inline violating snippet that fails and one clean snippet that passes (for example a `react` import in `view-model/x.ts`, `Date.now()` in the view-model, `dangerouslySetInnerHTML` in a component, a hex colour in a component, a fixture import in `app/`), in the style of `tests/architecture/architecture.test.ts`.
    - _Requirements: 6.1, 6.2, 6.5, 6.8, 15.2, 21.1_
  - [x] 5.5 Create the typed builders and the Scan_Result arbitrary
    - Create `tests/support/ui/scan-result-builder.ts` (typed builders that return a value satisfying `ScanResult` for every state in DG-17: unassessed items of each cause, `capped.skipped`, `partial` and `failed` sources, `no-manifests`, `no-root-manifest`, `range-unresolved`, a HAUNTED package without severity, a restless ghost (HAUNTED with `8.1`, `8.2`), a buried and a forgotten grave, advisories of every `excluded` value and with `excluded` absent, a 300-package and a 301-package result) and `tests/support/ui/scan-result-arbitrary.ts` (the arbitrary of design D10, built through the real core `classify` and `summarize`, with every generator listed in Requirement 19, criterion 2, up to 300 rows and up to 1000 for a `large` flag). Reuse `tests/support/arbitraries/`.
    - _Requirements: 19.2, 19.5_
  - [x] 5.6 Write the unit test for the builders
    - Create `tests/ui/support/scan-result-builder.test.ts`: every builder result passes `parseScanResponse`-independent structural checks (`dependencies.length === assessed.length`, six `sources` keys, `summary.total` equals the unique keys), the arbitrary result has a summary equal to `summarize(result.assessed)`, and the restless, buried and forgotten builders have the intended ruleIds.
    - _Requirements: 19.2, 19.5_
  - [x] 5.7 Implement the response boundary
    - Create `view-model/narrow.ts` (`narrowFacts`, `narrowAdvisories`, `narrowVersionBasis`, total) and `view-model/parse-response.ts` (`parseScanResponse`, `parseRetryAfter`, `parseCacheStatus`, case-insensitive header name, the nine error codes, status and body disagreement gives `malformed-response`). `narrowAdvisories` keeps an entry only under the rules of Requirement 14, criterion 5 and maps `excluded` `null`, `'informational'`, `'withdrawn'` to `counted`, `informational`, `withdrawn` and anything else (including absent) to `unknown`.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.9, 6.6_
  - [x] 5.8 Write the unit tests for the response boundary
    - Create `tests/ui/view-model/parse-response.test.ts`: a valid result, `dependencies.length` unequal to `assessed.length`, a missing `advisories`, five source keys, a 200 with an error body, a 404 with a result body, each of the nine error codes, a tenth code, `Retry-After` values (`'0'`, `'1'`, `'86400'`, `'86401'`, `'1.5'`, `'abc'`, absent), the cache header values (`hit`, `miss`, `HIT`, ` hit`, absent), facts of the wrong type become `null`, an advisory without `id` is dropped, `excluded` of each value and absent.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.9_
  - [x] 5.9 Write the property test for total parsing
    - `tests/ui/view-model/parse-response-total.property.test.ts`, arbitrary JSON (deep, huge strings, wrong types) and arbitrary statuses.
    - **Property 27: Response parsing is total**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.7**
  - [x] 5.10 Write the property test for the boundary round trip
    - `tests/ui/view-model/parse-response-roundtrip.property.test.ts`, with the Scan_Result arbitrary of task 5.5 and `JSON.parse(JSON.stringify(result))`.
    - **Property 28: Valid results round trip through the boundary**
    - **Validates: Requirements 14.5, 14.8**
  - [x] 5.11 Write the property test for the cache status
    - `tests/ui/view-model/parse-response-cache.property.test.ts`, arbitrary header strings (mixed case, whitespace), absent header, statuses 200 and others.
    - **Property 29: Cache status mapping**
    - **Validates: Requirements 14.9, 14.10**
  - [x] 5.12 Implement grave type, plot kind, reasons and glow
    - Create `view-model/grave-type.ts` (`graveTypeOf`, `plotKindOf`, `statusWordOf` as in the design, with the rule that `8.3` alone never makes a restless ghost), `view-model/reasons.ts` (`REASON_PRIORITY` use, `strongestReason`, `shortForm` for each ruleId, `epitaphOf` including the Overgrown_Grave epitaph of Requirement 7.19 and the restless suffixes ", also archived", ", also deprecated", ", also archived and deprecated" of Requirement 7.20) and `view-model/glow.ts` (`glowOf`, `maxSeverityOf`, `GLOW_LEVELS`, `DEFAULT_SEVERITY` fallback). Import `Classification`, `Reason`, `Severity` from `core/index.ts` only.
    - _Requirements: 7.2, 7.4, 7.5, 7.7, 7.15, 7.16, 7.19, 7.20_
  - [x] 5.13 Write the unit tests for the kind, reason and glow tables
    - Create `tests/ui/view-model/grave-type.test.ts` and `tests/ui/view-model/reasons.test.ts`: every short form, the Reason_Priority order, the epitaph of a buried, forgotten (with and without `daysSinceLastRelease`), ghost, restless (`8.1` only, `8.2` only, both, `8.3` only stays a ghost) and lantern package, the six status words, the `unmaintained-advisory` case (`8.2`, buried), and the glow fallback chain (advisory severities, then `facts.maxSeverity`, then MEDIUM).
    - _Requirements: 7.4, 7.5, 7.7, 7.15, 7.16, 7.19, 7.20_
  - [x] 5.14 Write the property test for the grave type and plot kind
    - `tests/ui/view-model/grave-type.property.test.ts`, classifications of every status with every subset and order of ruleIds (including empty) and `null`.
    - **Property 12: Grave type and plot kind are functions of status and rule ids**
    - **Validates: Requirements 7.15, 7.16, 7.17, 7.20**
  - [x] 5.15 Write the property test for the strongest reason
    - `tests/ui/view-model/reasons.property.test.ts`.
    - **Property 9: Strongest reason selection**
    - **Validates: Requirements 7.4, 7.12**
  - [x] 5.16 Write the property test for the glow level
    - `tests/ui/view-model/glow.property.test.ts`.
    - **Property 11: Glow level is monotone in severity**
    - **Validates: Requirements 7.7, 7.14**
  - [x] 5.17 Implement the package rows
    - Create `view-model/package-rows.ts`: `buildPackageRows` exactly as the design "Merged classification and rows" steps 1 to 8 (it imports `uniquePackages` from `core/index.ts`, never `STATUS_RANK` or `classificationTieKey`), the display name of pypi packages (`rawName`, Requirement 7.8), the unassessed causes (DG-10) and labels, the accessible label (Requirement 7.6) and the scene order (Requirement 7.9, ghosts and restless ghosts share the rank), using `compareCodePoints` from task 5.1.
    - _Requirements: 6.8, 7.1, 7.2, 7.3, 7.6, 7.8, 7.9_
  - [x] 5.18 Write the unit tests for the package rows
    - Create `tests/ui/view-model/package-rows.test.ts` with builders: repeated keys across scopes merge to one row, each unassessed cause and label, pypi `rawName`, a buried, forgotten, ghost, restless, lantern row each with the right kind, status word and label, scene order (ghost and restless before dead, score descending, ties by ecosystem and name), and a parity test of `compareCodePoints` with `core/internal/compare`.
    - _Requirements: 7.1, 7.2, 7.3, 7.6, 7.8, 7.9_
  - [x] 5.19 Write the property test for one row per key
    - `tests/ui/view-model/rows-key-set.property.test.ts`.
    - **Property 7: One row per package key**
    - **Validates: Requirements 7.1, 7.10**
  - [x] 5.20 Write the property test for kinds and counts
    - `tests/ui/view-model/rows-kinds.property.test.ts`, comparing every row with `uniquePackages(result.assessed)`.
    - **Property 8: Kinds and counts follow the core merge**
    - **Validates: Requirements 7.2, 7.11**
  - [x] 5.21 Write the property test for the accessible labels
    - `tests/ui/view-model/rows-labels.property.test.ts`.
    - **Property 10: Accessible labels**
    - **Validates: Requirements 7.6, 7.13**
  - [x] 5.22 Write the property test for the grave partition and restless ghosts
    - `tests/ui/view-model/rows-graves.property.test.ts`, with ghosts that carry `8.1`, `8.2`, `8.3` in every combination.
    - **Property 13: Graves partition the dead packages and restless ghosts are haunted**
    - **Validates: Requirements 7.15, 7.16, 7.18, 7.20, 7.21**
  - [x] 5.23 Implement the header model and the headline
    - Create `view-model/header.ts`: `headlineText(n, m, b, f, h)` exactly as the design (parts with count 0 omitted, `": "` only when a part is kept, `", "` separator, final `"."`), `buildHeaderModel` (N, M, B, F, H with H from `summary.counts.HAUNTED`, the "No dependencies could be assessed" sentence and "no grade" when M is 0, the grade line, the scale, the entries sentence, `notDefaultBranch`, Short_SHA, `canonicalUrl`) and `formatAge(asOfIso, nowMs)`. The components never see `Date.now`; the age is computed from a passed-in time.
    - _Requirements: 3.10, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_
  - [x] 5.24 Write the unit tests for the header model
    - Create `tests/ui/view-model/header.test.ts`: the four examples of Requirement 5, criterion 2 as exact strings ("31 of 40 dependencies are in the graveyard: 26 buried, 5 haunted.", "1 of 6 dependencies are in the graveyard: 1 haunted.", "9 of 20 dependencies are in the graveyard: 2 buried, 3 forgotten, 4 haunted.", "0 of 6 dependencies are in the graveyard."), one case per single-part and two-part combination, M equal to 0, a restless ghost counted in H and not in B, the grade line text, the entries sentence, the non-default branch, `formatAge` for seconds, minutes, hours and days.
    - _Requirements: 3.10, 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8_
  - [x] 5.25 Write the property test for the header numbers
    - `tests/ui/view-model/header-summary.property.test.ts`.
    - **Property 4: Header numbers equal the summary numbers**
    - **Validates: Requirements 5.9**
  - [x] 5.26 Write the property test for the headline
    - `tests/ui/view-model/header-headline.property.test.ts`, with an independent oracle written as a table of the eight part combinations and restless ghosts in the generator.
    - **Property 5: Buried plus forgotten plus haunted equals the headline total, and the headline text matches**
    - **Validates: Requirements 5.2, 5.10**
  - [x] 5.27 Implement the scene layout and keyboard navigation
    - Create `view-model/scene.ts` (`columnsFor`, `hashKey`, `sceneHeight`, `buildSceneModel`, plot tooltip lines and labels cut to `EPITAPH_MAX_CHARS`) and `view-model/scene-nav.ts` (`nextFocus`), exactly as the design "Layout algorithm" and "Keyboard navigation".
    - _Requirements: 8.1, 8.2, 8.3, 8.9, 9.6, 9.9_
  - [x] 5.28 Write the unit tests for the scene layout
    - Create `tests/ui/view-model/scene.test.ts`: `columnsFor` at 0, 191, 192, 1920 and 100000 and for `NaN`, fixed `hashKey` vectors, `sceneHeight` for 0, 1 and 301 plots, a 301-row result sets `simplified`, labels longer than `EPITAPH_MAX_CHARS` end with an ellipsis, `nextFocus` for each move at the edges, a single plot and an incomplete last row.
    - _Requirements: 8.1, 8.2, 8.3, 8.9, 9.9_
  - [x] 5.29 Write the property test for plot overlap
    - `tests/ui/view-model/scene-overlap.property.test.ts`, up to 1000 rows and 2 to 20 columns.
    - **Property 14: Plots do not overlap**
    - **Validates: Requirements 8.11**
  - [x] 5.30 Write the property test for plots inside the scene
    - `tests/ui/view-model/scene-bounds.property.test.ts`.
    - **Property 15: Plots lie inside the scene**
    - **Validates: Requirements 8.3, 8.12**
  - [x] 5.31 Write the property test for scene determinism
    - `tests/ui/view-model/scene-determinism.property.test.ts`, with `dependencies` and `assessed` rotated together.
    - **Property 16: Scene is deterministic and independent of input order**
    - **Validates: Requirements 8.2, 8.13**
  - [x] 5.32 Write the property test for plot completeness
    - `tests/ui/view-model/scene-plots.property.test.ts`.
    - **Property 17: Every row appears once with a label**
    - **Validates: Requirements 8.14**
  - [x] 5.33 Write the property test for keyboard navigation
    - `tests/ui/view-model/scene-nav.property.test.ts`.
    - **Property 18: Keyboard navigation stays on the grid**
    - **Validates: Requirements 9.6, 9.9**
  - [x] 5.34 Implement the URL state, the request body and the link builders
    - Create `view-model/urls.ts`: `parseUrlState`, `buildUrl` (`repo`, repeated `manifest`, `view`; `/` when empty), `canonicalRepoUrl` (DG-8), `buildRequestBody` (only `repoUrl` and `manifests`), `encodeManifests`, `decodeManifests`, `registryLink`, `sourceRepoLink`, `advisoryLink` with the patterns of Requirement 21, criterion 3 and `encodeURIComponent` per path segment (npm scoped names keep a literal `@`). Every link function returns `null` for a value that fails its pattern.
    - _Requirements: 3.2, 3.3, 3.4, 3.11, 3.12, 10.10, 18.1, 21.2, 21.3, 21.4_
  - [x] 5.35 Write the unit tests for the URL module
    - Create `tests/ui/view-model/urls.test.ts`: `parseUrlState` for no query, empty `repo`, repeated `manifest`, an unknown `view`, `buildUrl` for each combination, `canonicalRepoUrl` with and without a non-default branch, `buildRequestBody` has exactly the keys `repoUrl` and optionally `manifests`, the three registry links (`@types/node`, `flask-script`, `serde`), a source repo that fails the pattern, an advisory url with `%` sequences, `javascript:` and `data:` inputs give `null`.
    - _Requirements: 3.2, 3.3, 3.4, 10.10, 21.3, 21.4_
  - [x] 5.36 Write the property test for the canonical URL round trip
    - `tests/ui/view-model/urls-canonical.property.test.ts`.
    - **Property 1: Canonical URL round trip**
    - **Validates: Requirements 3.11**
  - [x] 5.37 Write the property test for the manifest query round trip
    - `tests/ui/view-model/urls-manifests.property.test.ts`, strings with `&`, `=`, `%`, `+`, `#`, spaces, empty strings and non-ASCII characters.
    - **Property 2: Manifest query round trip**
    - **Validates: Requirements 3.12**
  - [x] 5.38 Write the property test for the safety of built links
    - `tests/ui/view-model/urls-links.property.test.ts`.
    - **Property 33: Built links are safe**
    - **Validates: Requirements 21.3, 21.4, 21.7**
  - [x] 5.39 Replay the recorded fixtures through the view-model
    - Create `tests/ui/view-model/fixtures-replay.test.ts`: replay `request__request`, `revmic__canopy` and `ajeetdsouza__zoxide` through `runScan` with the wiring of `tests/pipeline/fixtures-scan.test.ts` and `parseScanResponse`, then assert that N, M, B, F and H equal values computed independently from `summary.counts` and from the ruleIds of the DEAD packages of `uniquePackages(result.assessed)`, `B + F === summary.counts.DEAD`, `H === summary.counts.HAUNTED`, and the row counts 40, 6 and 20.
    - _Requirements: 19.6, 5.2, 7.11_
  - [x] 5.40 Create the view-model barrel
    - Create `view-model/index.ts` exporting the public names of every module of this group (constants, types, parse-response, grave-type, reasons, glow, package-rows, header, scene, scene-nav, urls). Components import only through this file. Later groups add their own exports.
    - _Requirements: 6.1, 6.3_
- [x] 6. Checkpoint - View-model foundations
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 7. Test dependencies and configuration
  - [x] 7.1 Install the pinned test dependencies
    - For each of `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `jsdom`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `@playwright/test` and `@axe-core/playwright` run `npm view <package> version` at task time, then `npm install --save-dev --save-exact <package>@<version>` with that version. Check that the installed `axe-core` (dependency of `@axe-core/playwright`) accepts the tag `wcag22aa` (read its `README` or run a one-line `axe.getRules(['wcag22aa'])` check) and, if it does not, pick the newest `@axe-core/playwright` that does and record the reason in the commit message. Check that `package.json` shows no `^` or `~` for the new packages and that `package-lock.json` is updated. Do not run `npm audit fix` and do not update other dependencies. Do not download browsers here (task 23.1).
    - _Requirements: 19.8_
  - [~] 7.2 Update the package pin test
    - Update `tests/packages.test.ts`: the eight new packages are pinned exactly in `devDependencies` (no `^`, `~`, range, tag or `*`), none of them is in `dependencies`, and `core/`, `pipeline/` and `adapters/` import none of them.
    - _Requirements: 19.8_
  - [~] 7.3 Configure Vitest for component tests
    - Read `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`. Update `vitest.config.mts`: `include` `tests/**/*.test.{ts,tsx}`, `exclude` `tests/e2e/**` and `node_modules`, plugins `@vitejs/plugin-react` and `vite-tsconfig-paths`, keep `environment: 'node'`, `testTimeout` and `setupFiles: ['tests/support/offline-fetch.ts']`, and add a second setup file `tests/support/ui/dom-setup.ts` that registers `afterEach(cleanup)` from Testing Library only when `typeof document !== 'undefined'`. Component test files select jsdom with the docblock `// @vitest-environment jsdom` (design RK7). Keep `npx vitest --run` as the single command.
    - _Requirements: 19.3, 19.8_
  - [~] 7.4 Write the DOM smoke test
    - Create `tests/ui/smoke.test.tsx` (jsdom docblock): render a small component with Testing Library, find it with `getByRole`, drive it with `user-event`, and record in a comment whether `HTMLDialogElement.prototype.showModal` exists in the installed jsdom (design RK6).
    - _Requirements: 19.3, 19.4_
  - [~] 7.5 Adjust the TypeScript and ESLint configuration
    - Make `tsconfig.json` include `tests/**/*.tsx` and `playwright.config.ts` without turning off `strict`, and make `eslint.config.mjs` ignore `.next`, `playwright-report`, `test-results` and `tests/e2e/.generated` while linting the new `.tsx` tests. Run `npm run typecheck` and `npm run lint` and fix only configuration, not source rules.
    - _Requirements: 19.8_
- [~] 8. Checkpoint - Test dependencies and configuration
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 9. Fonts and theme tokens
  - [~] 9.1 Record the font licences and align the steering sentence
    - Re-run the two licence checks of design.md "Font licence evidence" (fetch `https://raw.githubusercontent.com/google/fonts/main/ofl/imfellenglishsc/METADATA.pb` and `OFL.txt`, and `https://raw.githubusercontent.com/google/fonts/main/ofl/atkinsonhyperlegible/METADATA.pb`) and confirm `license: "OFL"` for both and the presence of both names in `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`. If either check fails, stop and report instead of continuing. Create `docs/font-licences.md` with both fonts, designers, the licence name and version, the source URLs and the copyright lines, and the full text of the SIL Open Font License 1.1 once. In `.kiro/steering/ui-design.md` change "one gothic display face" to "one period display face" and change nothing else.
    - _Requirements: 15.3_
  - [~] 9.2 Create the site shell components
    - Create `components/site-header.tsx` (`<header>` with the wordmark as a link, not a heading), `components/site-footer.tsx` (`<footer>` with the text "Fonts: SIL Open Font License 1.1, see docs/font-licences.md") and `components/skip-link.tsx` (skip link to `#main`). One component per file, no default exports.
    - _Requirements: 1.9, 15.3, 15.8, 16.4_
  - [~] 9.3 Define the design tokens and base styles
    - Read `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md` and `font.md` first. Replace `app/globals.css` with the Tailwind import, the `@theme` token block of the design (night, night-raised, bone, bone-muted, amber, spectral, stone, moss, focus, moss-deep, and the two font variables), base typography (display font only on headings and the wordmark, weight 400 only, body in the sans font), a visible focus ring from `--color-focus` on every focusable element, and the `@media (prefers-reduced-motion: reduce)` block that sets `animation: none` and `transition: none` on the scene, the fog and the scanning animation classes. No literal colour outside the token block.
    - _Requirements: 15.1, 15.2, 16.2, 16.5, 16.6_
  - [~] 9.4 Replace the root layout and the fonts
    - Rewrite `app/layout.tsx`: `import { IM_Fell_English_SC, Atkinson_Hyperlegible } from 'next/font/google'` with `subsets: ['latin']`, `weight: '400'` for the display font, weights `['400', '700']` for the sans font, `variable` CSS variables and default `adjustFontFallback`; remove the Geist fonts; `export const metadata` with the title "Gravekeeper" and Gravekeeper's own description; `<html lang="en">` with both variable classes; `SkipLink`, `SiteHeader`, `<main id="main">` and `SiteFooter`.
    - _Requirements: 15.3, 15.8, 17.6, 1.9_
  - [~] 9.5 Write the token contrast test
    - Create `tests/ui/tokens.test.ts`: parse `app/globals.css`, read the declared token pairs, compute the WCAG 2.2 contrast ratio and fail below `TEXT_CONTRAST_MIN` for text pairs (bone, bone-muted, amber, spectral, stone, moss on night and on night-raised) and below `NONTEXT_CONTRAST_MIN` for shape and focus pairs; assert that `--color-moss-deep` is declared as decorative only.
    - _Requirements: 15.2, 16.2_
  - [~] 9.6 Write the layout test
    - Create `tests/ui/layout.test.ts`: `app/layout.tsx` imports exactly `IM_Fell_English_SC` and `Atkinson_Hyperlegible` from `next/font/google` and no other font, contains `lang="en"`, exports `metadata` whose title is not the starter text, and has no import of `Geist` or `Pirata_One`; `docs/font-licences.md` names both fonts and the text "SIL Open Font License".
    - _Requirements: 15.3, 15.8_
  - [~] 9.7 Write the component test for the site shell
    - Create `tests/ui/components/site-shell.test.tsx` (jsdom): the header, main-adjacent skip link and footer landmarks render, the wordmark is a link and not a heading, the footer contains the licence text.
    - _Requirements: 1.9, 16.4_
- [~] 10. Checkpoint - Fonts and theme
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 11. Scan client, URL state, first-pass art and landing page
  - [~] 11.1 Implement the Scan_Client
    - Create `client/scan-client.ts` exactly as the design "Scan_Client": `createScanClient({ fetchImpl, setTimer, clearTimer })`, `run(request, signal)` posts `JSON.stringify(request)` with `Content-Type: application/json`, `credentials: 'omit'`, `cache: 'no-store'` to `/api/scan`, one timer of `CLIENT_FETCH_TIMEOUT_MS`, maps a rejected fetch to `network-failure`, the timer to `timeout`, the caller's abort to `aborted`, a non-JSON body to `parseScanResponse(status, headers, undefined)`, and never throws.
    - _Requirements: 3.2, 3.3, 14.1, 21.5_
  - [~] 11.2 Write the unit tests for the Scan_Client
    - Create `tests/ui/client/scan-client.test.ts` with a fake `fetch` and fake timers: the request body, headers and options, a 200 result with `hit`, a 503 with `Retry-After`, a 502 without it, a body that is not JSON, a rejected fetch, no answer within `CLIENT_FETCH_TIMEOUT_MS`, an abort by the caller, an abort after the answer is ignored, the function never throws.
    - _Requirements: 3.2, 3.3, 14.1, 21.5_
  - [~] 11.3 Implement the URL state hook and the scan session hook
    - Read `use-search-params.md`, `use-router.md` and `single-page-applications.md` in `node_modules/next/dist/docs/` first. Create `components/hooks/use-url-state.ts` (reads `useSearchParams`, writes with `router.push`, `router.replace` and `window.history.replaceState` as in design D2) and `components/hooks/use-scan.ts` with the `ScanSession` reducer (`idle`, `scanning`, `result`, `failed`), the `requestKey` and `canonicalKey` of design D3, abort on cleanup, one request per key, and a dependency-injected client so tests need no module mocking.
    - _Requirements: 3.1, 3.2, 3.4, 3.7, 3.8, 3.9_
  - [~] 11.4 Draw the first-pass SVG symbols for all six plot kinds
    - Create `components/scene-sprites.tsx`: one hidden `<svg width="0" height="0" aria-hidden="true">` with an original `<symbol>` for each of `plot-tombstone` (stone-grey), `plot-overgrown` (leaning stone, ivy and moss, no inscription), `plot-ghost` (spectral, glow through a radial gradient scaled by `--glow`, no filter), `plot-restless` (the tombstone shape with the ghost shape over it, built from the two sub-shapes), `plot-lantern` (lit amber) and `plot-unmarked` (bare mound), plus a `-flat` variant of each for the simplified form. Colours come from the tokens (`var(--color-*)`). First-pass art: simple recognisable shapes, no raster image, no third-party artwork. Each symbol has a `viewBox` of 80 by 104.
    - _Requirements: 8.4, 8.5, 15.1, 15.4, 16.3_
  - [~] 11.5 Implement the landing page components
    - Create `components/legend.tsx` (six entries, each with a `<svg><use href="#plot-..."/></svg>` drawing and the visible text of Requirement 1.7), `components/featured-graveyards.tsx` (anchors for `FEATURED_GRAVEYARDS` with `owner/repo` and the ecosystem name), `components/repo-form.tsx` (labelled input, "Dig up" button, empty-input message with `aria-describedby`, polite live region, focus to the input), `components/landing-page.tsx` (one `h1`, one adjacent paragraph, the grade sentence, the form, the featured row, the legend) and `components/gate-fallback.tsx` (static markup with the same `h1` and a reserved block of the form's height). Mount `SceneSprites` once in the landing page.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.1, 2.2, 2.3, 2.4, 2.5_
  - [~] 11.6 Wire the app shell
    - Create `components/graveyard-app.tsx` (`'use client'`; reads the URL state, holds the session, renders `LandingPage` for `idle` and a plain "Scanning" placeholder paragraph for `scanning`, `result` and `failed` until groups 13, 15 and 33 replace them) and rewrite `app/page.tsx` as a synchronous Server Component with `<Suspense fallback={<GateFallback />}><GraveyardApp /></Suspense>` and no `searchParams` prop. Remove the starter page content. Read `page.md` and `use-search-params.md` first.
    - _Requirements: 3.1, 3.2, 3.7, 3.9, 15.8_
  - [~] 11.7 Write the component tests for the landing page
    - Create `tests/ui/components/landing-page.test.tsx` (jsdom): one `h1`, the form label and button, Enter submits, an empty and a whitespace input show "Enter a repository URL" linked by `aria-describedby`, announce it and focus the input and call no submit handler, the submit handler receives the trimmed value as typed, the legend has the six texts of Requirement 1.7, the featured links are anchors with `href` `/?repo=<URL>` in constant order with the ecosystem names, the grade sentence is present, headings are in order.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9, 2.1, 2.2, 2.3, 2.4_
  - [~] 11.8 Write the tests for the scan session hook
    - Create `tests/ui/components/use-scan.test.tsx` (jsdom) with a fake client and fake router: a repo value starts one request, a double activation sends one request, a new key aborts the old request first, a result for an aborted request is ignored, the canonical `repo` replacement does not start a second scan, Back to a different value rescans, no `repo` gives `idle`.
    - _Requirements: 3.2, 3.4, 3.7, 3.8, 3.9_
  - [~] 11.9 Write the app shell tests
    - Create `tests/ui/components/graveyard-app.test.tsx` (jsdom) with the fake client and router injected through props: `/` shows the landing page, `/?repo=...` calls the client with `{ repoUrl }` only, `manifest` values are forwarded, a featured link and "Dig up" push one history entry.
    - _Requirements: 3.1, 3.2, 3.3, 3.7_
  - [~] 11.10 Write the component test for the symbols
    - Create `tests/ui/components/scene-sprites.test.tsx` (jsdom): the six symbol ids and the six `-flat` ids exist, the sheet is `aria-hidden`, no symbol contains a `filter` element, an `image` element or an `href` to an external URL, and no fill is a literal colour.
    - _Requirements: 8.4, 8.5, 15.2, 15.4_
- [~] 12. Checkpoint - Landing page
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 13. Scanning state
  - [~] 13.1 Implement the stage functions
    - Create `view-model/stages.ts` (`SCAN_STAGES` labels, `stageAt(elapsedMs)`, `stageStates(elapsedMs)` with the text states "done", "in progress", "waiting"), export them from `view-model/index.ts`. The functions take the elapsed time as an argument and read no clock.
    - _Requirements: 4.1, 4.2, 4.3, 4.12_
  - [~] 13.2 Write the property test for the stage selection
    - `tests/ui/view-model/stages.property.test.ts`.
    - **Property 3: Stage selection is monotone and follows the start times**
    - **Validates: Requirements 4.13**
  - [~] 13.3 Write the unit tests for the stages
    - Create `tests/ui/view-model/stages.test.ts`: the four labels in order, `stageAt` at 0, 1999, 2000, 5999, 6000, 9999, 10000 and 100000, the state texts for each Stage.
    - _Requirements: 4.1, 4.2, 4.3_
  - [~] 13.4 Implement the scanning screen
    - Create `components/hooks/use-elapsed.ts` (timer, injected clock), `components/hooks/use-reduced-motion.ts` (`matchMedia`), `components/stage-list.tsx` and `components/scanning-screen.tsx`: four Stages with text states, the approximation sentence, no percentage, no numeric progress, no remaining time, the slow notice at `SCAN_SLOW_NOTICE_MS`, one polite live region that announces a Stage change once, "Cancel" as the first focusable element, a static list under Reduced_Motion and a CSS-only fog and lantern animation otherwise. Add the animation classes to `app/globals.css` (compositor properties only).
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.10, 4.11, 17.4_
  - [~] 13.5 Wire the scanning screen into the app
    - In `components/graveyard-app.tsx` render `ScanningScreen` for the `scanning` phase; "Cancel" aborts the request, calls `router.replace('/')` and shows the landing page with the last submitted value in the input and focus on the input.
    - _Requirements: 4.8, 4.9_
  - [~] 13.6 Write the component tests for the scanning screen
    - Create `tests/ui/components/scanning-screen.test.tsx` (jsdom, fake timers): the text states at 0, 2000, 6000 and 10000 ms, one live announcement per Stage change, no `progressbar` role and no percent text, the slow notice at 15000 ms without changing Stage states, "Cancel" is the first focusable element, the reduced-motion variant has no animated element.
    - _Requirements: 4.1, 4.3, 4.4, 4.6, 4.7, 4.8, 4.10_
  - [~] 13.7 Write the app tests for cancel and Back
    - Create `tests/ui/components/graveyard-app-scanning.test.tsx` (jsdom): Cancel aborts the in-flight request, the URL returns to `/`, the input keeps the last value and has focus; Back during a scan aborts it and starts the scan of the earlier URL.
    - _Requirements: 3.8, 4.9_
- [~] 14. Checkpoint - Scanning state
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 15. Results page: header and scene
  - [~] 15.1 Implement the results header components
    - Create `components/results-header.tsx`, `components/grade-line.tsx` (grade letter labelled "worst single risk", explanation, closed `<details>` scale), `components/cache-note.tsx` (age text and "from the caretaker's records" only for `hit`), `components/view-toggle.tsx` (two buttons with `aria-pressed`, query value `view`) and `components/hooks/use-container-width.ts` (`ResizeObserver` in a layout effect). The header renders the `HeaderModel` fields only: the Headline, the counts (buried, forgotten, haunted, alive, unassessed, each with its text label), the entries sentence, `time` with `dateTime`, the Short_SHA with the full SHA as description, and "(not the default branch)".
    - _Requirements: 3.10, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 18.1_
  - [~] 15.2 Implement the scene components
    - Create `components/scene.tsx` (one `role="group"` container sized from the `SceneModel`, one delegated handler for click, hover, focus and keys reading `data-index`, roving tabindex moved by ref, arrow, Home and End through `nextFocus`, `data-simplified` above `SCENE_MAX_PLOTS`), `components/scene-plot.tsx` (`React.memo`, one `<button>` per plot with `aria-label` from the model, `<svg aria-hidden><use href="#plot-<kind>[-flat]"/></svg>` and the label span, custom properties `--x`, `--y`, `--w`, `--h`, `--glow`), `components/scene-tooltip.tsx` (one `role="tooltip"`, stays while the pointer is over it, Escape hides it and keeps focus) and `components/fog-layer.tsx` (two `aria-hidden` layers). Add a `SkipLink` "Skip the graveyard scene" before the scene that moves focus to the view toggle. No `dangerouslySetInnerHTML`.
    - _Requirements: 8.4, 8.5, 8.8, 8.9, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 16.7, 17.5_
  - [~] 15.3 Write the scene styles
    - Add to `app/globals.css` the scene rules: absolute plot placement by custom properties, fog drift, ghost drift and the pulse of ghosts, restless ghosts and lanterns as CSS keyframes on `transform` and `opacity` only with a per-plot delay from `--phase`, the static glow strength from `--glow`, the label style, the visible focus ring on a plot, `[data-simplified="true"]` rules (flat symbols, no animation, no label shadow), and the reduced-motion overrides.
    - _Requirements: 8.6, 8.7, 8.9, 9.7, 16.6, 17.4_
  - [~] 15.4 Implement the results page and wire it into the app
    - Create `components/results-page.tsx` (header, view toggle, `Scene`, memoised `buildPackageRows`, `buildHeaderModel` and `buildSceneModel`, container height from `sceneHeight` reserved before plots render) and update `components/graveyard-app.tsx` to render it for the `result` phase, to replace the `repo` query value with the Canonical_Repo_URL through `history.replaceState` without a new history entry, and to keep `manifest` values unchanged. Opening a plot is wired in task 19.7.
    - _Requirements: 3.4, 3.5, 8.3, 17.3, 17.5, 18.1_
  - [~] 15.5 Write the component tests for the header
    - Create `tests/ui/components/results-header.test.tsx` (jsdom): the headline text for the four examples of Requirement 5, criterion 2, the status counts with text labels and the buried and forgotten split, "No dependencies could be assessed" and "no grade" for M equal to 0, the grade line text, the closed scale disclosure, the entries sentence, `time` with `dateTime`, the "(not the default branch)" text, the cache note only for `hit`, the view toggle `aria-pressed`.
    - _Requirements: 3.10, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 18.1_
  - [~] 15.6 Write the component tests for the scene
    - Create `tests/ui/components/scene.test.tsx` (jsdom, `user-event`): one tab stop, arrow keys, Home and End move focus by row and column, Enter and Space call `onOpen`, click calls `onOpen`, the tooltip shows on hover and on focus with name, ecosystem, status word, score and epitaph, stays while the pointer moves onto it, Escape hides it and keeps focus, every plot has an accessible name, the six kinds render the matching symbol, a restless plot has the status word "haunted, buried" in its name.
    - _Requirements: 7.6, 8.4, 8.8, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8_
  - [~] 15.7 Write the render and memoisation test for the scene
    - Create `tests/ui/components/scene-render.test.tsx` (jsdom): 300 plots render with four nodes per plot, 301 plots set `data-simplified` and still render every plot, re-rendering with the same `SceneModel` object does not re-render any `ScenePlot` (render counter through a test-only wrapper).
    - _Requirements: 8.8, 8.9, 17.5_
  - [~] 15.8 Write the tests for the results flow
    - Create `tests/ui/components/graveyard-app-results.test.tsx` (jsdom, fake client): a result replaces the `repo` value with the canonical URL without a history entry and keeps `manifest`, the view toggle writes `view` without a request, a `hit` shows the caretaker's-records text and `miss` and `unknown` show none.
    - _Requirements: 3.4, 3.10, 18.1_
- [~] 16. Checkpoint - Results page and scene
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 17. List view
  - [~] 17.1 Implement the table model
    - Create `view-model/table.ts` (`buildTableModel(rows, sort)` with the seven columns, `aria-sort` values, sort keys as in the design "Table sort": status key is the status rank then the status word, scores with `null` last in both directions, scene order as the stable tiebreaker, "not assessed" and "unknown" cell texts) and export it from `view-model/index.ts`.
    - _Requirements: 18.3, 18.4, 18.5, 18.7_
  - [~] 17.2 Write the unit tests for the table model
    - Create `tests/ui/view-model/table.test.ts`: the column labels, each sort column ascending and descending, `aria-sort` of the sorted header only, an unmarked grave shows "not assessed" and never 0, an unknown version shows "unknown", ties follow the scene order, a restless row has the status text "haunted, buried".
    - _Requirements: 18.3, 18.4, 18.5, 18.7_
  - [~] 17.3 Write the property test for the sorted table
    - `tests/ui/view-model/table-sort.property.test.ts`.
    - **Property 30: Sorted table is an ordered permutation**
    - **Validates: Requirements 18.4, 18.5, 18.9**
  - [~] 17.4 Write the property test for table and scene agreement
    - `tests/ui/view-model/table-scene.property.test.ts`.
    - **Property 31: Table and scene agree**
    - **Validates: Requirements 18.10**
  - [~] 17.5 Write the property test for sort idempotence
    - `tests/ui/view-model/table-idempotent.property.test.ts`.
    - **Property 32: Sorting is idempotent**
    - **Validates: Requirements 18.11**
  - [~] 17.6 Implement the list view
    - Read `lazy-loading.md` first. Create `components/list-view.tsx` (native `table` with `caption`, `th scope="col"`, a sort button per header with `aria-sort`, one `tr` per row, the package name as a button that opens the detail, all rows without pagination) and load it with `next/dynamic` in `components/results-page.tsx` for `view=list`, with the text fallback "Loading...".
    - _Requirements: 16.7, 17.7, 18.2, 18.4, 18.6, 18.8_
  - [~] 17.7 Write the component tests for the list view
    - Create `tests/ui/components/list-view.test.tsx` (jsdom): caption and column headers, one row per package with the same keys as the scene, sorting by each column, `aria-sort` toggles ascending and descending, "not assessed" and "unknown" cells, activating the name calls `onOpen`, 300 rows render without pagination.
    - _Requirements: 18.2, 18.3, 18.4, 18.6, 18.7, 18.8_
- [~] 18. Checkpoint - List view
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 19. Detail panel
  - [~] 19.1 Implement the fact formatter, the detail model and the advisory groups
    - Create `view-model/format-fact.ts` (`formatFact`), `view-model/advisory-groups.ts` (`buildAdvisoryGroups` as in the design "Advisory groups and the data gap": effective exclusion with the note-id fallback, four groups in order, empty groups omitted except "Counted as open" when `openVulnerabilityCount` is above 0, the group count texts and sentences of Requirement 10, criterion 16 and 19) and `view-model/detail.ts` (`buildDetailModel`: status word and score or unassessed label, every reason verbatim with `isMain`, seven facts in `HealthFacts` order, the version line for the four bases and `versionSpecText`, the plain messages of `pin-not-found`, `conflicting-pins`, `range-unresolved` and `no-default-version`, scopes and manifest paths, `rawName`, per-package notes grouped by Note_Group heading (DG-14), the registry and source repo links, `resurrect` equal to merged status DEAD so it is false for a restless ghost, `advisoryEmptyText`). Export all three from `view-model/index.ts`.
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.13, 10.16, 10.17, 10.18, 10.19_
  - [~] 19.2 Write the unit tests for the detail model and the advisory groups
    - Create `tests/ui/view-model/detail.test.ts` and `tests/ui/view-model/advisory-groups.test.ts` with builders: the four version lines and "not looked up", the `maxSeverity` words of Requirement 10, criterion 5, a restless ghost has `resurrect` false and a forgotten grave has it true, an advisory list with one counted, one informational, one withdrawn entry gives three labelled groups with their texts, an alias example ("2 listed, 1 counted"), a result without `excluded` puts the note-named id under "Informational, not counted" and the rest under "Not classified" with the withdrawn sentence, an empty list with `openVulnerabilityCount` above 0 gives the no-list sentence, hostile ids and urls give `href` `null`.
    - _Requirements: 10.5, 10.6, 10.13, 10.16, 10.17, 10.18, 10.19_
  - [~] 19.3 Write the property test for the fact formatter
    - `tests/ui/view-model/format-fact.property.test.ts`.
    - **Property 19: Fact formatting**
    - **Validates: Requirements 10.4, 10.14**
  - [~] 19.4 Write the property test for the detail contents
    - `tests/ui/view-model/detail.property.test.ts`.
    - **Property 20: Detail contains every reason and fact**
    - **Validates: Requirements 10.3, 10.15**
  - [~] 19.5 Write the property test for the advisory groups
    - `tests/ui/view-model/advisory-groups.property.test.ts`, with every mix of `excluded` values, an absent `excluded`, informational ids named by the note, hostile ids, aliases and urls.
    - **Property 21: Detail lists every advisory once, in its labelled group**
    - **Validates: Requirements 10.16, 10.18, 10.19**
  - [~] 19.6 Implement the detail panel components
    - Create `components/hooks/use-focus-trap.ts` (Tab trap, Escape, focus return to the opener, `inert` on the page behind), `components/external-link.tsx` (`target="_blank"`, `rel="noopener noreferrer"`, host shown as text, plain text when `href` is null), `components/advisory-groups.tsx` (one labelled section per group with its heading, count text and explanation, entries with id link, aliases and severity word) and `components/detail-panel.tsx` (custom modal `role="dialog"` `aria-modal="true"` labelled by the package name, "Close" button, status and score, reasons with the "main reason" mark, seven facts, version line, notes, links, advisory groups; every upstream string as a React text node). Load it with `next/dynamic`. The Resurrect_Slot is added by task 37.1.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.16, 10.17, 16.4, 17.7, 21.1_
  - [~] 19.7 Wire the detail panel into the scene and the list
    - In `components/graveyard-app.tsx` and `components/results-page.tsx` hold the open package key, build the `DetailModel` with `buildDetailModel`, open the panel from the scene (`onOpen`) and from the list, close it with Escape and "Close", and return focus to the opener. Opening or closing must not re-render the scene plots.
    - _Requirements: 9.5, 10.1, 17.5, 18.6_
  - [~] 19.8 Write the component tests for the detail panel
    - Create `tests/ui/components/detail-panel.test.tsx` (jsdom, `user-event`): focus moves into the dialog, Tab stays inside, Escape closes, focus returns to the opener, "unknown" text for each Unknown_Value, the four version lines, every reason message verbatim with one "main reason", all seven fact names, the registry link and the "source repository (unverified)" link with `rel="noopener noreferrer"` and the host text, no link when a value fails its pattern, no Resurrect_Slot content for any package yet.
    - _Requirements: 10.1, 10.3, 10.4, 10.6, 10.10, 10.11, 10.12_
  - [~] 19.9 Write the component tests for the advisory groups
    - Create `tests/ui/components/advisory-groups.test.tsx` (jsdom): three groups with headings and "<k> listed" texts, the counted group shows "<n> counted" and the alias sentence, the informational and withdrawn groups show "not part of the <n> open vulnerabilities", a result without `excluded` shows "Not classified" with the withdrawn sentence, the empty-list sentence, advisory links go to the validated `osv.dev` URL, a hostile url renders as text.
    - _Requirements: 10.16, 10.17, 10.18, 10.19, 21.3_
- [~] 20. Checkpoint - Detail panel
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 21. Component test coverage for Milestone 1
  - [~] 21.1 Write the end-to-end component flow test
    - Create `tests/ui/components/graveyard-flow.test.tsx` (jsdom, fake client): landing, submit, scanning, results for the replayed recorded fixtures (through `parseScanResponse`), switch to the list, open a tombstone, a forgotten grave, a ghost and a restless ghost in the detail panel, close it, and check the headline of each fixture equals the header model text.
    - _Requirements: 3.2, 5.2, 9.5, 10.1, 18.1, 19.3_
  - [~] 21.2 Write the source rule tests
    - Create `tests/ui/source-rules.test.ts`: read the real files under `app/`, `components/`, `client/` and `view-model/` and assert no `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`, no hex, `rgb(` or `hsl(` literal in `components/**` and `app/**/*.tsx`, no import from `tests/` or a path containing `fixtures`, no `Date.now`, `Math.random` or `fetch` in `view-model/`.
    - _Requirements: 2.5, 6.2, 15.2, 21.1_
  - [~] 21.3 Write the reduced-motion style test
    - Create `tests/ui/reduced-motion-css.test.ts`: `app/globals.css` has one `@media (prefers-reduced-motion: reduce)` block that disables animation and transition for the scene, the fog and the scanning classes, and every `@keyframes` rule in the file animates only `transform` and `opacity`.
    - _Requirements: 8.6, 8.7, 16.6, 17.4_
- [~] 22. Checkpoint - Component tests
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 23. Playwright setup, mocked API and Milestone 1 flows with axe
  - [~] 23.1 Configure Playwright
    - Read `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md` first. Run `npx playwright install chromium`. Create `playwright.config.ts` at the repository root: Chromium only, projects `desktop` (1280x800) and `mobile` (390x844), `webServer` running `npm run build && npm run start -- -p 3100` (`reuseExistingServer` false in CI), `testDir` `tests/e2e`, a `baseURL` that the environment variable `E2E_BASE_URL` can override, in which case `webServer` is omitted (used by tasks 28.4 and 29.1). Add `tests/e2e/.generated`, `playwright-report` and `test-results` to `.gitignore` (keep the existing lines, `tests/repo-config.test.ts` stays green) and add the scripts `"e2e:fixtures": "tsx scripts/export-scan-fixtures.ts"` and `"test:e2e": "npm run e2e:fixtures && playwright test"` to `package.json`.
    - _Requirements: 20.1, 20.11_
  - [~] 23.2 Create the fixture exporter
    - Create `scripts/export-scan-fixtures.ts`: replay `tests/fixtures/request__request`, `revmic__canopy` and `ajeetdsouza__zoxide` through `runScan` with the wiring of `tests/pipeline/fixtures-scan.test.ts` and write `tests/e2e/.generated/scan-request.json`, `scan-canopy.json` and `scan-zoxide.json`, and write from the builders of task 5.5 `scan-synthetic-restless.json` (a restless ghost, a ghost, a buried, a forgotten, a lantern and an unmarked grave, with an advisory list of every `excluded` value), `scan-synthetic-300.json`, `scan-synthetic-301.json`. The script makes no network request and imports nothing from `app/`, `components/` or `client/`.
    - _Requirements: 20.1, 19.5_
  - [~] 23.3 Write the test for the exporter
    - Create `tests/ui/export-scan-fixtures.test.ts`: run the exporter's pure function into a temporary directory, parse every written file with `parseScanResponse(200, headers, body)` and assert a result outcome, the three recorded files have 40, 6 and 20 unique packages, the 300 and 301 files have that many.
    - _Requirements: 20.1, 19.6_
  - [~] 23.4 Create the end-to-end helpers
    - Create `tests/e2e/support/mock-scan.ts` (`mockScan(page, handler)` using `page.route('**/api/scan', ...)`, helpers to answer with a generated file, a delay, a status with headers such as `X-Gravekeeper-Cache` and `Retry-After`, an abort), `tests/e2e/support/a11y.ts` (`expectNoA11yViolations(page)` with `AxeBuilder` tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, printing rule id and node target, and recording the per-screen result for task 29) and `tests/e2e/support/fixtures.ts` (loads the generated files). Every test fails on a request to any host other than the test server.
    - _Requirements: 20.1, 20.5, 16.10_
  - [~] 23.5 Write the landing page end-to-end spec
    - Create `tests/e2e/landing.spec.ts`: the landing page, typing a URL and activating "Dig up", each featured link starts a scan of the mocked result, the empty input message, axe on the landing page (Requirement 16, criterion 10).
    - _Requirements: 20.2, 20.5, 1.2, 1.3, 1.5, 2.3_
  - [~] 23.6 Write the scanning end-to-end spec
    - Create `tests/e2e/scanning.spec.ts`: a delayed mock with the Playwright clock shows the stage text changing at 2000, 6000 and 10000 ms, the slow notice at 15000 ms, Cancel returns to the landing page with the input value and focus, axe on the scanning screen.
    - _Requirements: 20.2, 20.5, 4.1, 4.6, 4.9_
  - [~] 23.7 Write the results end-to-end spec
    - Create `tests/e2e/results.spec.ts`: the results of each recorded fixture in Scene and List view show the headline text computed from the generated file, reload of `/?repo=...` gives the same result, Back and Forward between two results, the synthetic 301-package result renders every plot, the restless ghost is drawn and labelled "haunted, buried", axe on the Scene view and on the List view for each recorded fixture.
    - _Requirements: 20.2, 20.5, 3.5, 3.8, 5.2, 8.9, 18.1_
  - [~] 23.8 Write the detail panel end-to-end spec
    - Create `tests/e2e/detail.spec.ts`: open and close the detail panel by mouse and by keyboard (Enter, Escape, focus return) for a tombstone, a forgotten grave, a ghost, a restless ghost and a lantern, the advisory groups show the three labelled groups for the synthetic package, axe with the panel open for each.
    - _Requirements: 20.2, 20.5, 10.1, 10.16, 16.4_
  - [~] 23.9 Write the reduced-motion end-to-end spec
    - Create `tests/e2e/reduced-motion.spec.ts` with `reducedMotion: 'reduce'`: the landing, scanning, results and detail flows run once, the scanning screen has no animated element, and `document.getAnimations()` returns no running CSS animation inside the scene.
    - _Requirements: 20.6, 4.10, 8.7, 16.6_
- [~] 24. Checkpoint - End-to-end tests
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture`, `npx vitest --run` and `npm run test:e2e`, and ensure all pass. Ask the user if questions arise.
- [ ] 25. Scene render time and client JavaScript size
  - [~] 25.1 Add the inert performance hook
    - Create `components/scene-perf.ts` (active only when `window.__GK_PERF__ === true`): `markModelReady()` calls `performance.mark('gk-model-ready')`, `measureSceneCommit()` calls `requestAnimationFrame` and then `performance.measure('gk-scene', 'gk-model-ready')`. Call them from `components/graveyard-app.tsx` when the result arrives and from the scene's layout effect in `components/scene.tsx`. The hook does nothing in normal use and is covered by a unit test in `tests/ui/components/scene-perf.test.tsx` (inactive without the flag, marks and measures with it).
    - _Requirements: 8.10, 17.1_
  - [~] 25.2 Write the render budget spec
    - Create `tests/e2e/scene-perf.spec.ts`: a CDP session sets `Emulation.setCPUThrottlingRate` to `SCENE_PERF_CPU_THROTTLE`, the 300-package synthetic result is loaded `SCENE_PERF_RUNS` times, the median of `gk-scene` is at most `SCENE_RENDER_BUDGET_MS`. WHEN the median is above the budget, apply the contingency of the design "Scene rendering and performance" item 9 in order (row bands with `content-visibility: auto`, then windowed rows), change only `components/scene.tsx` and `app/globals.css`, repeat the measurement, and record before and after in the commit message. The spec also merges the median for the 40-plot `request` result into `test-results/m1-measurements.json` (creating the file when it is missing).
    - _Requirements: 8.10, 17.1, 20.8_
  - [~] 25.3 Implement the client JavaScript budget gate
    - Create `scripts/check-client-js-budget.ts`: a pure function `sumGzipBytes(files)` and a CLI that after `next build` reads `.next/server/app/index.html`, collects every `<script src>` and `<link rel="preload" as="script">` URL, adds the chunk files listed by `.next/server/app/page_client-reference-manifest.js` for the statically imported modules of `graveyard-app.tsx`, de-duplicates by file, sums `zlib.gzipSync(..., { level: 9 })` sizes, imports `CLIENT_JS_BUDGET_BYTES` from `view-model/constants.ts`, exits 1 above the budget and names the constant, the total and the five largest chunks. Add `"check:bundle": "tsx scripts/check-client-js-budget.ts"` to `package.json`. If the measured baseline already exceeds the budget, change the constant in `view-model/constants.ts` with the reason in a comment and in design.md (Open question 13), never skip the check.
    - _Requirements: 17.2_
  - [~] 25.4 Write the unit test for the budget gate
    - Create `tests/ui/check-client-js-budget.test.ts`: `sumGzipBytes` on small in-memory files, the exit decision above and at the budget, de-duplication of a chunk listed twice, the message names `CLIENT_JS_BUDGET_BYTES`.
    - _Requirements: 17.2_
  - [~] 25.5 Write the measured JavaScript budget spec
    - Create `tests/e2e/js-budget.spec.ts`: against `next start`, load `/?repo=<featured url>` with the mocked scan, wait for the results (Scene view, no panel opened), sum the gzip size of every JavaScript response, assert at most `CLIENT_JS_BUDGET_BYTES` with a failure message that names the constant, the total and the largest five chunks, assert that the list, detail and picker chunks are not requested before they are needed, and merge the total into `test-results/m1-measurements.json` without removing other keys.
    - _Requirements: 17.2, 17.7, 20.9_
  - [~] 25.6 Write the layout shift spec
    - Create `tests/e2e/layout-shift.spec.ts`: an init script installs a `PerformanceObserver` for `layout-shift` entries without recent input, and after the results render the sum is at most `RESULTS_CLS_MAX` for each recorded fixture and for the 300-package result.
    - _Requirements: 17.3, 17.6, 20.7_
  - [~] 25.7 Update the CI workflow
    - In `.github/workflows/ci.yml` keep the current steps and add after `npx vitest --run`: `npm run build`, `npm run check:bundle`, `npx playwright install --with-deps chromium`, `npm run e2e:fixtures`, `npx playwright test`, and upload `playwright-report` as an artifact. Update `tests/ci-config.test.ts` so that it asserts the new steps in this order.
    - _Requirements: 17.2, 20.9, 20.1_
- [~] 26. Checkpoint - Performance and bundle
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture`, `npx vitest --run`, `npm run build`, `npm run check:bundle` and `npm run test:e2e`, and ensure all pass. Ask the user if questions arise.
- [~] 27. Checkpoint - Milestone 1
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture`, `npx vitest --run`, `npm run build`, `npm run check:bundle` and `npm run test:e2e`, and ensure all pass. Check that `git status` shows no unrelated change, that the three commits of the commit order (housekeeping, pipeline field, UI) can be made, and ask the user if questions arise.
- [ ] 28. Deploy Milestone 1
  - [~] 28.1 Implement the deployment check
    - Deployment is Vercel's git integration on push to `main` (checked: `origin` is `https://github.com/rustoman-AI/gravekeeper.git`, there is no `.vercel` folder, no Vercel CLI and no deploy step in `.github/workflows/`). The landing page is rendered on the client under `Suspense` (design D1), so the static HTML holds only the shell, and the interactive parts must be checked in a browser. Create `scripts/verify-deployment.ts` with a pure `checkLandingHtml(html)` (the static HTML has `lang="en"`, the title "Gravekeeper", an `h1` with the text "Gravekeeper", the reserved form block of `GateFallback`, and does not contain the starter text "To get started, edit") and a CLI `tsx scripts/verify-deployment.ts <url>` that fetches the URL (up to 30 attempts, 20 s apart, so that a build in progress can finish), prints each failed check and exits 1 on failure. Create `tests/e2e/deployed.spec.ts` (desktop project, no API mock, no `/api/scan` request): the page has the `h1` "Gravekeeper", a labelled URL input, a button "Dig up", the "Featured graveyards" row with three links, and a legend of six entries including "Restless ghost", with axe on the page. Add `"verify:deploy": "tsx scripts/verify-deployment.ts https://gravekeeper-chi.vercel.app"` to `package.json`. Do not create a Vercel project and do not add a deploy step to a workflow.
    - _Requirements: 15.8, 1.1, 1.2, 1.7_
  - [~] 28.2 Write the unit test for the deployment check
    - Create `tests/ui/verify-deployment.test.ts`: `checkLandingHtml` accepts the prerendered shell of the landing page (generate it from the built `.next/server/app/index.html` when it exists, otherwise from a fixed snippet), rejects the starter page, an HTML without the `h1` "Gravekeeper", and an HTML with the wrong title.
    - _Requirements: 15.8, 1.2, 1.7_
  - [~] 28.3 Push to main
    - Confirm with `git status` that the work is committed in the commit order of the Overview (housekeeping alone, then the pipeline field, then the UI), that `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture`, `npx vitest --run`, `npm run build` and `npm run check:bundle` pass, then run `git push origin main`. Ask the orchestrator for the user's approval first if it was not given in the session. Do not force-push and do not change git configuration.
    - _Requirements: 15.8_
  - [~] 28.4 Verify the deployed UI
    - Wait for the CI run and the Vercel deployment of the pushed commit, then run `npm run verify:deploy` (static shell) and run `deployed.spec.ts` against production with the environment variable set for that one command only (PowerShell: `$env:E2E_BASE_URL = "https://gravekeeper-chi.vercel.app"; npx playwright test tests/e2e/deployed.spec.ts --project=desktop; Remove-Item Env:E2E_BASE_URL`) to confirm the new landing page (`h1` "Gravekeeper", "Dig up", "Featured graveyards", six legend entries, zero axe violations). Check that the response header `Cache-Control` of `POST /api/scan` is unchanged by sending one request for `revmic/canopy` and that the result has the field `excluded` on its advisory entries (no token is needed). If the production site still serves the starter page after 10 minutes, report the blocker to the user and do not create a new Vercel project.
    - _Requirements: 15.8, 22.6_
- [ ] 29. Milestone 1 report
  - [~] 29.1 Write the report specification
    - Create `tests/e2e/m1-report.spec.ts` (desktop project only, `reducedMotion: 'reduce'`, `page.clock.install({ time: '2026-11-19T12:00:00Z' })`, mocked `/api/scan`, viewport 1440x900, `document.fonts.ready` awaited, `page.screenshot({ animations: 'disabled' })`) that saves into `docs/screenshots/m1/`: `landing.png`, `scanning.png`, `results-scene-request.png` (the scene for `request/request`), `results-list-request.png`, `detail-uuid.png` (the detail panel for the package `uuid` of `request/request`) and `detail-forgotten.png` (the detail panel of a package with Grave_Type `forgotten`, chosen by the view-model from the recorded replays, or from the synthetic result when no recorded replay has one, and the file `docs/screenshots/m1/README.md` says which). It also runs axe on each of these six screens and merges the per-screen result (violation count and rule ids) into `test-results/m1-measurements.json` without removing the keys that other specs wrote. It reads `E2E_BASE_URL` so that it can also run against the deployed site with the mock in place.
    - _Requirements: 20.10, 20.11, 16.10_
  - [~] 29.2 Implement the report writer
    - Create `scripts/write-m1-report.ts`: reads `test-results/m1-measurements.json` (axe results per screen, scene render median for `request/request` and for the 300-package result with `SCENE_PERF_CPU_THROTTLE`, gzip total of the client JavaScript) and the file list of `docs/screenshots/m1/`, and writes `docs/milestone-1-report.md` with: the six screenshots embedded, the measured scene render time for `request/request` and for 300 plots against `SCENE_RENDER_BUDGET_MS`, the gzipped client JavaScript against `CLIENT_JS_BUDGET_BYTES` (total and margin), the axe result per screen (landing, scanning, results scene, list view, detail panel), the deployed URL check result of task 28.4, and a "Known gaps" section that lists everything not done yet (groups 31 to 47). Add `"report:m1": "tsx scripts/write-m1-report.ts"` to `package.json`.
    - _Requirements: 17.1, 17.2, 20.10, 16.10_
  - [~] 29.3 Write the unit test for the report writer
    - Create `tests/ui/write-m1-report.test.ts`: the pure `renderReport(measurements, files)` function names every screenshot, prints the render time and the byte total next to their constants, marks a budget as exceeded when it is, prints an axe violation list per screen, and never prints an environment variable.
    - _Requirements: 17.1, 17.2, 16.10_
  - [~] 29.4 Capture the screenshots, measure and write the report
    - Run `npm run build`, then `npx playwright test tests/e2e/m1-report.spec.ts tests/e2e/scene-perf.spec.ts tests/e2e/js-budget.spec.ts`, then `npm run report:m1`, and check that `docs/screenshots/m1/` has the six PNG files at 1440x900 and that `docs/milestone-1-report.md` shows the render time for `request/request`, the gzipped client JavaScript against `CLIENT_JS_BUDGET_BYTES`, and the axe result of each of the five screens. Look at each screenshot. If a screen is visibly broken, fix it before the report is accepted. **EXECUTION STOPS AFTER THIS TASK.** Do not start group 31 or any later task. Report the numbers and the screenshot paths to the user and wait for the user's decision.
    - _Requirements: 17.1, 17.2, 20.10, 20.11, 16.10_
- [~] 30. STOP - Milestone 1 ends here
  - Milestone 1 is complete after the report of task 29.4. Do not execute any task numbered 31 or higher until the user has reviewed the Milestone 1 report and approves Milestone 2.
- [ ] 31. Caretaker's notes (Milestone 2)
  - [~] 31.1 Implement the notes model and the picker model
    - Create `view-model/notes.ts` (`buildNotesModel`: the six sources in fixed order with names, status words, distinct symbols and alert lines, `NOTE_SECTIONS` with the four sections and the "Other notes" section for unknown codes, groups by `code` with counts and `previewCount` of at most 5, `capBanner`, `empty`, `manifestWarnings`, the discovery note and the picker for the `no-root-manifest` note) and `view-model/picker.ts` (`buildPickerModel(candidates, selected, repoValue)`: every candidate once in order, at most `SCAN_MAX_MANIFESTS` selectable and the rest disabled with "limit reached", `scanUrl` null while nothing is selected, built with `buildUrl`). Export both from `view-model/index.ts`.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12, 11.13_
  - [~] 31.2 Write the unit tests for the notes and picker models
    - Create `tests/ui/view-model/notes.test.ts` and `tests/ui/view-model/picker.test.ts`: every code of the section table lands in its section, an unknown code lands in "Other notes", 40 notes of one code give count 40 and `previewCount` 5, the three source statuses have three symbols, the alert line text, the cap banner count, the empty state for `no-manifests`, the discovery fallback text "The manifest list may be incomplete", manifest warnings, the picker limit of `SCAN_MAX_MANIFESTS`, an empty candidate list gives no picker.
    - _Requirements: 11.2, 11.3, 11.5, 11.7, 11.8, 11.9, 11.10, 11.12, 13.15, 13.16_
  - [~] 31.3 Write the property test for the note groups
    - `tests/ui/view-model/notes-groups.property.test.ts`, with known and unknown codes.
    - **Property 22: Every note lands in exactly one group**
    - **Validates: Requirements 11.4, 11.7, 11.8, 11.14**
  - [~] 31.4 Write the property test for the source list
    - `tests/ui/view-model/notes-sources.property.test.ts`.
    - **Property 23: Sources are listed once each**
    - **Validates: Requirements 11.2, 11.15**
  - [~] 31.5 Write the property test for the picker
    - `tests/ui/view-model/picker.property.test.ts`, candidate lists with duplicates and hostile characters, selections of at most `SCAN_MAX_MANIFESTS` paths.
    - **Property 26: Picker lists candidates and encodes the selection**
    - **Validates: Requirements 11.11, 13.15, 13.17**
  - [~] 31.6 Implement the notes components and the manifest picker
    - Create `components/caretakers-notes.tsx`, `components/note-group-section.tsx` (themed heading, count, the plain message of the first note always visible, the first 5 and a "Show all <count>" button, every plain message in its own element), `components/source-status-list.tsx` (status word plus symbol, alert lines linked to the matching note), `components/cap-banner.tsx`, `components/empty-graveyard.tsx` and `components/manifest-picker.tsx` (labelled `fieldset` of checkboxes, "limit reached", "Scan selected manifests" disabled while nothing is selected). Load `ManifestPicker` with `next/dynamic`.
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.9, 11.10, 11.11, 11.13, 15.6, 17.7_
  - [~] 31.7 Wire the notes into the results page
    - In `components/results-page.tsx` render the `CaretakersNotes`, the cap banner, the empty graveyard (no scene) and the picker for `no-root-manifest`, and in `components/graveyard-app.tsx` handle "Scan selected manifests" by pushing the URL of the picker model.
    - _Requirements: 11.1, 11.9, 11.10, 11.11_
  - [~] 31.8 Write the component tests for the notes
    - Create `tests/ui/components/caretakers-notes.test.tsx` and `tests/ui/components/manifest-picker.test.tsx` (jsdom): the six sources with status text and symbol, the alert line for `partial` and `failed`, the plain message of the first note of each group without a click, "Show all 40" reveals the rest and the heading keeps the full count, the cap banner, the empty state, the picker limit and the disabled button, the pushed URL.
    - _Requirements: 11.2, 11.3, 11.5, 11.6, 11.9, 11.10, 11.11_
- [~] 32. Checkpoint - Caretaker's notes
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 33. Error screens and the manifest picker
  - [~] 33.1 Implement the error model
    - Create `view-model/errors.ts` (`buildErrorModel` for `kind: 'api'`: the heading and actions table of the design, `plainMessage` equal to `error.message`, the HTTP status, the picker for `too-many-manifests` and `manifest-not-found` with candidates, the root scan URL, the default-branch URL without `/tree/<branch>`, the cooldown from `Retry-After` or `RETRY_FALLBACK_COOLDOWN_SECONDS`, and `retryRemainingMs`). Total for every `ScanErrorBody` shape. Export it from `view-model/index.ts`.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.15, 13.16_
  - [~] 33.2 Write the unit tests for the error model
    - Create `tests/ui/view-model/errors.test.ts`: the nine headings and action lists, the 503 with `Retry-After` 30 gives cooldown 30, the 502 gives `RETRY_FALLBACK_COOLDOWN_SECONDS`, `invalid-url` names each part, `branch-not-found` builds the default-branch URL, the two manifest errors with and without candidates, the plain message is unchanged for a message with markup characters.
    - _Requirements: 13.1, 13.2, 13.3, 13.5, 13.6, 13.15, 13.16_
  - [~] 33.3 Write the property test for the error model
    - `tests/ui/view-model/errors.property.test.ts`.
    - **Property 24: Error model is total and keeps the plain message**
    - **Validates: Requirements 13.1, 13.2, 13.13**
  - [~] 33.4 Write the property test for the retry countdown
    - `tests/ui/view-model/errors-countdown.property.test.ts`.
    - **Property 25: Retry countdown**
    - **Validates: Requirements 13.4, 13.14**
  - [~] 33.5 Implement the error screen components
    - Create `components/hooks/use-countdown.ts` (one timer per second, announces the end once), `components/retry-button.tsx` (disabled until the cooldown ends, "You can try again in <time>" text), `components/back-to-gate.tsx` ("Back to the gate" link to `/`) and `components/error-screen.tsx` (themed heading as the focused `h1`, the plain message in its own element and never truncated, the error code and HTTP status as text, the actions of the model, the `RepoForm` for `invalid-url` with `aria-describedby` on the error text, the `ManifestPicker` for the two manifest errors). No second live region for the heading.
    - _Requirements: 13.1, 13.3, 13.4, 13.5, 13.9, 13.10, 13.11, 13.12, 13.15, 13.16_
  - [~] 33.6 Wire the error screens into the app
    - In `components/graveyard-app.tsx` render `ErrorScreen` for the `failed` phase with `buildErrorModel`, and handle the actions `edit-url`, `retry` (same request, scanning screen), `scan-default-branch`, `scan-root`, `scan-selected` and `back-to-gate` through the router.
    - _Requirements: 13.2, 13.7, 13.11_
  - [~] 33.7 Write the component tests for the error screens
    - Create `tests/ui/components/error-screen.test.tsx` (jsdom, fake timers): one test for each of the nine API error codes (heading, plain message present and unchanged, code and HTTP status text, actions), the 503 countdown disables Retry until it ends and announces the end once, the 502, 504 and 500 enable Retry after `RETRY_FALLBACK_COOLDOWN_SECONDS`, focus is on the heading, "Back to the gate" is present on every error, `invalid-url` leaves the input editable and prefilled.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.9, 13.10, 13.11, 13.12_
- [~] 34. Checkpoint - Error screens
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 35. Client failure screens
  - [~] 35.1 Add the client failures to the error model and the session
    - In `view-model/errors.ts` handle `kind: 'client'` (`network-failure` "The road is washed out", `timeout` "The night ran out", `malformed-response` "The records are garbled", the three fixed plain sentences of Requirement 13.8, cooldown 0, actions `retry` and `back-to-gate`), and in `components/hooks/use-scan.ts` map the Scan_Client outcomes `failure` to the `failed` phase with that model.
    - _Requirements: 13.8, 14.1_
  - [~] 35.2 Write the unit tests for the client failure model
    - Add `tests/ui/view-model/errors-client.test.ts`: the three headings, the three sentences, cooldown 0 and the two actions for each failure.
    - _Requirements: 13.8_
  - [~] 35.3 Write the component tests for the client failures
    - Create `tests/ui/components/client-failure.test.tsx` (jsdom, fake client and fake timers): a rejected fetch, a response that never arrives (the timeout after `CLIENT_FETCH_TIMEOUT_MS`) and a body that is not valid JSON each show their screen with the plain sentence and an enabled Retry, Retry sends the same request again and shows the scanning screen.
    - _Requirements: 13.7, 13.8, 14.1_
- [~] 36. Checkpoint - Client failure screens
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 37. Resurrect placeholder
  - [~] 37.1 Implement the Resurrect_Slot
    - Create `components/resurrect-slot.tsx` (props `{ packageKey: string; displayName: string }` documented, `data-slot="resurrect"`, `data-placeholder="true"`, heading "Resurrect", text "Coming soon: suggest a maintained alternative and a manifest patch", a disabled button "Resurrect" with `aria-disabled="true"` and the accessible description "Not available yet", no request, no alternative package name) and render it in `components/detail-panel.tsx` only when `detail.resurrect` is true.
    - _Requirements: 10.13, 12.1, 12.2, 12.3, 12.4_
  - [~] 37.2 Write the component tests for the Resurrect_Slot
    - Create `tests/ui/components/resurrect-slot.test.tsx` (jsdom): the slot shows for a tombstone and for an overgrown grave, not for a ghost, a restless ghost, a lantern or an unmarked grave, the markup attributes, the disabled button and its description, no `fetch` call on activation, no alternative package name in the text.
    - _Requirements: 10.13, 12.1, 12.2, 12.3_
- [~] 38. Checkpoint - Resurrect placeholder
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 39. Remaining end-to-end and axe coverage
  - [~] 39.1 Write the error screen end-to-end spec
    - Create `tests/e2e/errors.spec.ts`: every API error code with at least one mocked response, `invalid-url` for every `details.part` (url, host, path, owner, repository, branch), `invalid-request` for every `details.reason`, `upstream-unavailable` as 503 with `Retry-After` (countdown tested with the Playwright clock, Retry enabled when it ends) and as 502 without, `too-many-manifests` and `manifest-not-found` with candidates (select paths, rescan with `manifest` values in the URL) and with an empty list, the "Scan the default branch" and "Scan the repository root" actions, and axe on every state.
    - _Requirements: 20.3, 20.5, 16.10, 13.2, 13.4, 13.15, 13.16_
  - [~] 39.2 Write the client failure end-to-end spec
    - Create `tests/e2e/client-failures.spec.ts`: `route.abort('failed')` gives `network-failure`, a never-answered route with the Playwright clock gives `timeout` after 30 s, a non-JSON body and a result with a missing `advisories` give `malformed-response`, Retry works, and axe on each screen.
    - _Requirements: 20.4, 20.5, 13.8, 14.2_
  - [~] 39.3 Write the notes, empty and picker end-to-end spec
    - Create `tests/e2e/notes.spec.ts`: Caretaker's notes for each recorded fixture, the degraded synthetic result (partial and failed sources, cap banner), the empty graveyard (`no-manifests`), the manifest picker of `no-root-manifest` (select and rescan), "Show all", and axe on each state.
    - _Requirements: 20.2, 20.5, 11.1, 11.3, 11.5, 11.9, 11.10, 11.11_
  - [~] 39.4 Write the remaining reduced-motion spec
    - Create `tests/e2e/reduced-motion-errors.spec.ts` with `reducedMotion: 'reduce'`: the error screens, the notes and the picker flows run once and no CSS animation runs on any of them.
    - _Requirements: 20.6, 16.6_
  - [~] 39.5 Write the reflow and keyboard spec
    - Create `tests/e2e/reflow.spec.ts`: at 320 CSS pixels and at 200 percent zoom the landing, results, list, detail and error screens have no two-dimensional scrolling and the scene reduces to `SCENE_MIN_COLUMNS` columns, and a keyboard-only run reaches the landing form, a featured link, the view toggle, one scene plot, a list sort button and the detail panel's "Close" button.
    - _Requirements: 16.4, 16.9, 9.6_
- [~] 40. Checkpoint - Remaining end-to-end tests
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture`, `npx vitest --run` and `npm run test:e2e`, and ensure all pass. Ask the user if questions arise.
- [ ] 41. Remaining screenshots
  - [~] 41.1 Write the screenshot spec
    - Create `tests/e2e/screenshots.spec.ts` for the projects `desktop` (1280x800) and `mobile` (390x844) with `reducedMotion: 'reduce'`, `page.clock.install({ time: '2026-11-19T12:00:00Z' })`, `document.fonts.ready` and `page.screenshot({ animations: 'disabled' })`, saving into `docs/screenshots/` with names `<screen>-<variant>-<viewport>.png` for every screen of the design Screen list S1 to S18: landing (default, empty input), the four scanning stages, results Scene and List for each recorded fixture, the detail panel of a tombstone, an overgrown grave, a ghost, a restless ghost, a lantern and an unmarked grave, Caretaker's notes (recorded and degraded), the empty graveyard, the picker, and every error and client failure screen. An earlier file of the same name is overwritten. The milestone 1 folder `docs/screenshots/m1/` is not touched.
    - _Requirements: 20.10, 20.11_
  - [~] 41.2 Capture and verify the screenshots
    - Run the spec twice on the same build and check that the two runs give identical files (compare SHA-256 per file). If a file differs, remove the source of the difference (clock, font loading, animation) and rerun. Commit the images. List the files in `docs/screenshots/README.md` with the screen name of each.
    - _Requirements: 20.10, 20.11_
- [~] 42. Checkpoint - Screenshots
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [ ] 43. Content-Security-Policy
  - [~] 43.1 Add the security headers
    - Read `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` first. In `next.config.ts` add `headers()` for `/(.*)` with the policy `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`, with `'unsafe-eval'` added to `script-src` in development only. Keep `cacheComponents`, `partialPrefetching` and the Tailwind turbopack rule.
    - _Requirements: 21.6_
  - [~] 43.2 Write the unit test for the policy
    - Create `tests/ui/csp.test.ts`: load `next.config.ts`, call `headers()` and assert the exact directive set and values of Requirement 21, criterion 6, that the source `/(.*)` is covered, that `'unsafe-eval'` is absent in production mode, and that the existing config keys are unchanged.
    - _Requirements: 21.6_
  - [~] 43.3 Write the policy end-to-end spec
    - Create `tests/e2e/csp.spec.ts`: the header is present on the landing page, on the results page and on `/api/scan`, and no console message reports a CSP violation on the landing, scanning, results, list, detail and error screens (fonts load from the same origin).
    - _Requirements: 21.6, 15.3_
- [~] 44. Checkpoint - Content-Security-Policy
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture`, `npx vitest --run`, `npm run build` and `npm run test:e2e`, and ensure all pass. Ask the user if questions arise.
- [ ] 45. Remaining properties and traceability
  - [~] 45.1 Write the property test for JSON-safe models
    - `tests/ui/view-model/json-safe.property.test.ts`, covering `buildSceneModel`, `buildTableModel`, `buildHeaderModel` and `buildNotesModel`.
    - **Property 6: Model values are JSON-safe**
    - **Validates: Requirements 6.7**
  - [~] 45.2 Update the property traceability document
    - In `docs/property-traceability.md` add a `graveyard-ui` section with one row per Property 1 to 34 (requirements, test file, test title, status from a full `npx vitest --run`), update the header counts and the "Properties without a test" list.
    - _Requirements: 19.1_
  - [~] 45.3 Write the traceability test for the graveyard-ui properties
    - Create `tests/ui/traceability.test.ts`: every number from 1 to 34 appears in exactly one `// Feature: graveyard-ui, Property <n>` tag under `tests/`, each tagged file has a `// Validates:` line, and each test title starts with `P<n>`.
    - _Requirements: 19.1_
- [~] 46. Checkpoint - Remaining properties
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
- [~] 47. Final checkpoint - Graveyard UI
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture`, `npx vitest --run`, `npm run build`, `npm run check:bundle` and `npm run test:e2e`, and ensure all pass. Run `npm run test:deep tests/ui tests/pipeline/mapping` once and ensure it passes. Ask the user if questions arise.
## Notes
- Every task, including the property-based tests, is required. Nothing is marked optional.
- Milestone 1 is groups 1 to 30. Execution stops after the Milestone 1 report (task 29.4). Groups 31 to 47 start only after the user approves Milestone 2.
- Each property test carries the tag comments `// Feature: graveyard-ui, Property N: ...` and `// Validates: Requirements X.Y` and uses `cfg()` from `tests/support/fc-config.ts`. Agents never set `FC_NUM_RUNS` in the shared shell; `npm run test:deep` sets it for one process.
- The task lists and `tasks.meta.json` files of `dependency-graveyard-core`, `scan-pipeline`, `scan-accuracy`, `property-traceability` and `session-14-ops` are not edited by any task.
- Group 3 is the only change outside `/view-model`, `/client`, `/components`, `/app`, `/scripts`, `/docs` and `/tests` (Requirement 22).
- Task 7.1 installs packages. Pin them exactly and do not run `npm audit fix` or update other dependencies. Tasks 28.3 and 28.4 need the user's approval to push and network access; no task writes a token to any file.
## Task Dependency Graph
```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.5"] },
    { "id": 1, "tasks": ["1.2", "1.4"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.5", "5.7", "5.12", "5.34"] },
    { "id": 6, "tasks": ["5.4", "5.6", "5.8", "5.9", "5.10", "5.11", "5.13", "5.14", "5.15", "5.16", "5.17", "5.35", "5.36", "5.37", "5.38"] },
    { "id": 7, "tasks": ["5.18", "5.19", "5.20", "5.21", "5.22", "5.23", "5.27"] },
    { "id": 8, "tasks": ["5.24", "5.25", "5.26", "5.28", "5.29", "5.30", "5.31", "5.32", "5.33", "5.39", "5.40"] },
    { "id": 9, "tasks": ["7.1"] },
    { "id": 10, "tasks": ["7.2", "7.3", "7.5"] },
    { "id": 11, "tasks": ["7.4"] },
    { "id": 12, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 13, "tasks": ["9.4", "9.5"] },
    { "id": 14, "tasks": ["9.6", "9.7"] },
    { "id": 15, "tasks": ["11.1", "11.4"] },
    { "id": 16, "tasks": ["11.2", "11.3", "11.5", "11.10"] },
    { "id": 17, "tasks": ["11.6", "11.7", "11.8"] },
    { "id": 18, "tasks": ["11.9"] },
    { "id": 19, "tasks": ["13.1"] },
    { "id": 20, "tasks": ["13.2", "13.3", "13.4"] },
    { "id": 21, "tasks": ["13.5", "13.6"] },
    { "id": 22, "tasks": ["13.7"] },
    { "id": 23, "tasks": ["15.1", "15.2", "15.3"] },
    { "id": 24, "tasks": ["15.4", "15.5", "15.6", "15.7"] },
    { "id": 25, "tasks": ["15.8"] },
    { "id": 26, "tasks": ["17.1"] },
    { "id": 27, "tasks": ["17.2", "17.3", "17.4", "17.5", "17.6"] },
    { "id": 28, "tasks": ["17.7"] },
    { "id": 29, "tasks": ["19.1"] },
    { "id": 30, "tasks": ["19.2", "19.3", "19.4", "19.5", "19.6"] },
    { "id": 31, "tasks": ["19.7", "19.8", "19.9"] },
    { "id": 32, "tasks": ["21.1", "21.2", "21.3"] },
    { "id": 33, "tasks": ["23.1", "23.2"] },
    { "id": 34, "tasks": ["23.3", "23.4"] },
    { "id": 35, "tasks": ["23.5", "23.6", "23.7", "23.8", "23.9"] },
    { "id": 36, "tasks": ["25.1", "25.3", "25.7"] },
    { "id": 37, "tasks": ["25.2", "25.4", "25.6"] },
    { "id": 38, "tasks": ["25.5"] },
    { "id": 39, "tasks": ["28.1"] },
    { "id": 40, "tasks": ["28.2"] },
    { "id": 41, "tasks": ["28.3"] },
    { "id": 42, "tasks": ["28.4"] },
    { "id": 43, "tasks": ["29.1", "29.2"] },
    { "id": 44, "tasks": ["29.3"] },
    { "id": 45, "tasks": ["29.4"] },
    { "id": 46, "tasks": ["31.1"] },
    { "id": 47, "tasks": ["31.2", "31.3", "31.4", "31.5", "31.6"] },
    { "id": 48, "tasks": ["31.7", "31.8"] },
    { "id": 49, "tasks": ["33.1"] },
    { "id": 50, "tasks": ["33.2", "33.3", "33.4", "33.5"] },
    { "id": 51, "tasks": ["33.6", "33.7"] },
    { "id": 52, "tasks": ["35.1"] },
    { "id": 53, "tasks": ["35.2", "35.3"] },
    { "id": 54, "tasks": ["37.1"] },
    { "id": 55, "tasks": ["37.2"] },
    { "id": 56, "tasks": ["39.1", "39.2", "39.3", "39.4", "39.5"] },
    { "id": 57, "tasks": ["41.1"] },
    { "id": 58, "tasks": ["41.2"] },
    { "id": 59, "tasks": ["43.1"] },
    { "id": 60, "tasks": ["43.2", "43.3"] },
    { "id": 61, "tasks": ["45.1"] },
    { "id": 62, "tasks": ["45.2", "45.3"] }
  ]
}
```
