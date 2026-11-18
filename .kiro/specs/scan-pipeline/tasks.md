# Implementation Plan: scan-pipeline

## Overview

This plan builds the scan pipeline in five groups: (1) ports, constants, the architecture check and all pure mapping functions, (2) the HTTP client and the six source adapters, (3) the orchestrator and the deadline model, (4) caching, (5) the route handler, fixtures and live contract tests. Each group ends with a checkpoint that runs `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`. Property-based tests are mandatory and sit directly after the code task they validate. Unit tests are mandatory too. Requirement numbers are criterion numbers from `requirements.md`; Property numbers are from `design.md`.

Implementation language: TypeScript (strict). The project root is the `gravekeeper` folder. `/core` is not changed. Test files follow `<module>.test.ts` and `<module>.property.test.ts` under `/tests` as laid out in the Testing Strategy of `design.md`. Every property test uses `cfg()` from `tests/support/fc-config.ts`, carries the tag comment `// Feature: scan-pipeline, Property <n>: <title>`, and its title starts with `P<n>`. `AGENTS.md` applies: read the relevant guide in `node_modules/next/dist/docs/` before writing any Next.js code.

## Tasks

- [x] 1. Ports, constants, architecture check and pure mapping
  - [x] 1.1 Define the runtime, HTTP and cache port types
    - Create `pipeline/ports/runtime.ts` (`Clock`, `RandomSource`, `TimerHandle`, `Timer`, `LogEntry`, `Logger`, `ConcurrencyLimiter`, `Deferrer`), `pipeline/ports/http.ts` (`SourceName`, `ReasonCategory`, `AdapterReason`, `SourceHeaders`, `AttemptGate`, `L2Kind`, `CachePolicy`, `HttpRequest`, `RequestContext`, `WorkUnitOutcome`, `HttpClient`, and the `GithubConfig` type `{ apiUrl, graphqlUrl, webHost }` so adapters can receive validated configuration without importing `/pipeline/config`) and `pipeline/ports/cache.ts` (`JsonValue`, `CacheEntry`, `L2EntryKind`, `CacheStore`).
    - Ports import only `/core`, other ports files and `pipeline/constants.ts`.
    - _Requirements: 15.3, 15.10, 15.15, 17.9, 19.1, 19.9, 19.10, 19.20, 20.6, 22.11_

  - [x] 1.2 Define the six Source_Port interfaces
    - Create `pipeline/ports/github-source.ts`, `depsdev-source.ts`, `osv-source.ts`, `npm-source.ts`, `cratesio-source.ts`, `pypi-source.ts` (interfaces `GithubSource`, `DepsDevSource`, `OsvSource`, `NpmSource`, `CratesIoSource`, `PypiSource`, plus `SourceResult`, `RepoCoordinates`, `VersionRequest`, `OsvQuery`) and `pipeline/ports/index.ts` re-exporting every port type.
    - _Requirements: 22.1, 22.11, 2.6, 14.11, 12.13_

  - [x] 1.3 Write unit tests for the port types
    - `tests/pipeline/ports.test.ts`: `expectTypeOf` checks for `WorkUnitOutcome`, `SourceResult`, `HttpRequest`, `CacheStore` and the six interface names; a runtime check that every file in `pipeline/ports` imports only allowed modules.
    - _Requirements: 22.1, 22.11_

  - [x] 1.4 Implement `canonicalJson` and `requestKey`
    - Create `pipeline/ports/request-key.ts`: `canonicalJson(value)` (object keys in ascending code point order, array order kept) and `requestKey(request)` returning `canonicalJson(["req", source, method, url, body])`. Pure, no token or header in any key.
    - _Requirements: 19.2, 19.3, 19.4, 23.3_

  - [x] 1.5 Write unit tests for `canonicalJson` and `requestKey`
    - `tests/pipeline/request-key.test.ts`: key order independence, array order kept, injectivity examples, two requests that differ only in headers share a key, `__proto__` keys.
    - _Requirements: 19.3, 19.4, 23.3_

  - [x] 1.6 Implement `pipeline/constants.ts`
    - Export every constant of the Constants table in `requirements.md` (for example `SCAN_DEADLINE_MS`, `SCAN_RESPONSE_MARGIN_MS`, `ROUTE_MAX_DURATION_SECONDS`, `REQUEST_TIMEOUT_MS`, `REQUEST_TOTAL_TIMEOUT_MS`, `MAX_RESPONSE_BYTES`, `RETRY_MAX_ATTEMPTS`, `REDIRECT_MAX_HOPS`, `CONCURRENCY_*`, `CRATESIO_MIN_INTERVAL_MS`, `DEPSDEV_BATCH_SIZE`, `OSV_BATCH_SIZE`, `GRAPHQL_BATCH_SIZE`, `OSV_MAX_ADVISORY_DETAILS`, `SCAN_MAX_DEPENDENCIES`, `SCAN_MAX_MANIFESTS`, `DISCOVERY_*`, the cache TTLs, `CACHE_MAX_ENTRIES`, `CACHE_KEY_VERSION`, `L2_*`, `FIXTURE_SET_MAX_BYTES`, `TOKEN_TEST_MIN_LENGTH`, `GITHUB_DEFAULT_*`, `GHES_API_PATH_SUFFIX`, `GITHUB_RAW_HOST`, `GITHUB_BUDGET_THRESHOLD`, `URL_IGNORED_QUERY_PARAMS`, `CVSS_RANGES`). Use the values of the table. Do not define any other `UPPER_SNAKE` constant.
    - _Requirements: 23.11, 16.13, 21.16_

  - [x] 1.7 Write unit tests for the constants
    - `tests/pipeline/constants.test.ts`: each consistency rule of the Constants section as its own test case (every bullet, and each inequality of a bullet that names several), the batch-size and maximum rule over every exported name that ends with `_BATCH_SIZE`, contains `_MAX_` or begins with `MAX_`, failure when a constant named in a rule is not exported, `SCAN_MAX_MANIFESTS` at least the number of names in `DISCOVERY_MANIFEST_NAMES`, `ROUTE_MAX_DURATION_SECONDS * 1000 > SCAN_DEADLINE_MS + SCAN_RESPONSE_MARGIN_MS`, and a check that the file defines no `UPPER_SNAKE` constant outside the requirements table.
    - _Requirements: 23.11, 21.16, 5.6_

  - [x] 1.8 Implement the pipeline helpers
    - Create `pipeline/mapping/result.ts` (`Result`, `ok`, `err`; mappers cannot import `pipeline/internal`), `pipeline/mapping/compare-code-points.ts` (`compareCodePoints` with a `codePointAt` loop), `pipeline/mapping/read-own.ts` (`readOwn(value, key)`: try/catch, `Object.hasOwn`, returns `undefined` for anything unreadable), `pipeline/internal/result.ts` (re-export of `Result`, `ok`, `err`) and `pipeline/internal/safe.ts` (`guard`).
    - _Requirements: 13.1, 13.2, 13.10, 5.1, 16.2, 18.4, 18.5_

  - [x] 1.9 Write unit tests for the helpers
    - `tests/pipeline/helpers.test.ts`: parity with `core/internal/compare` and `core/internal/safe` on shared examples (astral against high BMP, `"10"` before `"2"`); `readOwn` on throwing getters, proxies, `__proto__`, arrays and primitives; `guard` returns the fallback for a thrown `Error`, string and `undefined`.
    - _Requirements: 13.2, 13.10, 16.2_

  - [x] 1.10 Build the fake runtime
    - Create `tests/support/fake-runtime.ts`: `createFakeRuntime(startMs)` returning `{ clock, timer, random, advanceToNextTimer, flush, pendingTimers }` (timers ordered by due time then creation order, `sleep` honors the abort signal) and `runUntilSettled(promise, runtime)` that fails with `stuck` when no timer is pending.
    - _Requirements: 15.10, 19.10, 23.1_

  - [x] 1.11 Write unit tests for the fake runtime
    - `tests/support/fake-runtime.test.ts`: timer ordering, `clearTimeout`, `sleep` returns `'aborted'` at once on an aborted signal, `runUntilSettled` drives a three-timer chain, `stuck` failure.
    - _Requirements: 15.10, 23.1_

  - [x] 1.12 Build the JSON and mutation arbitraries
    - Create `tests/support/arbitraries/json.ts` (`arbJson` combining `fc.jsonValue()`, `fc.anything()`, `__proto__`, `constructor` and `prototype` keys, deep nesting, huge numbers, `-0`, numeric strings, arrays where objects are expected, throwing getters) and `tests/support/arbitraries/mutate.ts` (delete the field, set `null`, wrong type, duplicate or shuffle array entries, add unknown keys, invalid timestamp, applied at one path).
    - _Requirements: 13.10, 13.15_

  - [x] 1.13 Encode the Endpoint_Fact_Map as test data
    - Create `tests/support/endpoint-fact-map.ts` with rows `{ id, source, verified, requiresToken, requestMatcher, paths[] }` for EF-1 to EF-25 as in the Endpoint_Fact_Map section of `requirements.md` (a path such as `data.rN.defaultBranchRef.target.committedDate` matches any alias `rN`).
    - _Requirements: 23.13_

  - [x] 1.14 Implement import extraction and specifier resolution
    - Create `scripts/architecture/imports.ts` (`extractImports(filePath, text): ImportRef[]` with kinds `import`, `import-type`, `export-from`, `import-equals-require`, `import-type-expression`, `dynamic-import`, `require-call`; `specifier` is `null` for a non-literal argument; built on `ts.createSourceFile`, never executes code) and `scripts/architecture/resolve.ts` (`resolveSpecifier(fromFile, specifier)` for relative and `@/` specifiers, project-root-relative POSIX paths, whole-segment directory comparison).
    - _Requirements: 22.13, 22.14_

  - [x] 1.15 Implement the forbidden API finder
    - Create `scripts/architecture/globals.ts`: `findForbiddenApi(text, names)` walks the AST for identifier references, `Date.now`, `Date["now"]`, `Math.random`, `performance.now`, `process.env`, zero-argument `new Date()` and `Date()` calls, and ignores property names.
    - _Requirements: 22.6, 22.12, 13.2_

  - [x] 1.16 Implement the rule table and `checkArchitecture`
    - Create `scripts/architecture/rules.ts` (the `LayerRule` table of the design: `mapping-import-not-allowed`, `mapping-forbidden-api`, `core-imports-upper-layer`, `adapters-import-not-allowed`, `layer-imports-adapters`, `ports-missing-interface`, `ports-import-not-allowed`, `pipeline-forbidden-api`, `file-name-style`, `no-default-export`, `token-reference-count`, `token-client-reachability`, `token-next-public`, `adapters-forbidden-time-api`) and `scripts/architecture/check.ts` (`checkArchitecture(files): Violation[]`, pure; `buildImportGraph` for the transitive `'use client'` check; non-literal specifiers reported as `non-literal-specifier`).
    - _Requirements: 22.2, 22.4, 22.6, 22.7, 22.8, 22.9, 22.10, 22.11, 22.12, 22.14, 22.17, 20.1, 20.10, 15.10_

  - [x] 1.17 Add the architecture CLI and wire it into scripts and CI
    - Create `scripts/check-architecture.ts` (walks `core`, `pipeline`, `adapters`, `app`, `components` for `.ts` and `.tsx`, prints `file:line rule message`, exits 1 on any violation). In `package.json` add `"check:architecture": "tsx scripts/check-architecture.ts"`, `"check": "npm run check:core && npm run check:architecture"` and set `"prebuild": "npm run check"`. In `.github/workflows/ci.yml` add `- run: npm run check:architecture` after `npm run check:core` and before `npx vitest --run`.
    - _Requirements: 22.16_

  - [x] 1.18 Add the save hooks for the architecture check
    - Create `scripts/hooks/check-architecture-on-save.mjs` modelled on `check-core-on-save.mjs`, `.kiro/hooks/architecture-on-save.json` (`PostFileSave` on `(pipeline|adapters|app|core)/**/*.ts(x)`), and extend the matcher of `run-related-tests-on-save.json` to `tests/pipeline`, `tests/adapters`, `tests/app`, `tests/architecture`.
    - _Requirements: 22.16_

  - [x] 1.19 Write unit tests for the architecture checker
    - `tests/architecture/architecture.test.ts`: the real tree reports zero violations; one inline snippet per rule asserting the exact rule id and line; every `ImportKind` of 22.13; non-literal specifier; whole-segment comparison (`pipeline/mapping-extra`); token rules (two files with `process.env.GITHUB_TOKEN`, `NEXT_PUBLIC_`, a `'use client'` file that reaches the token file); a CLI test on a temporary directory (exit 1 with `file:line`, exit 0 when clean).
    - _Requirements: 22.2, 22.4, 22.6, 22.7, 22.8, 22.9, 22.10, 22.11, 22.12, 22.13, 22.14, 22.16, 22.17_

  - [x] 1.20 Write the property test for the architecture checker
    - `tests/architecture/architecture.property.test.ts`: generated layer paths, specifier forms and `../` depths.
    - **Property 66: The architecture checker finds every forbidden import**
    - **Validates: Requirements 22.15**

  - [x] 1.21 Define the mapping types
    - Create `pipeline/mapping/types.ts` with every supporting type of the Mappers section (`IsoInstant`, `SourceRepo`, `Fetched`, `VersionBasis`, `VersionSelection`, `BatchEntry`, `OsvQueryResult`, `OsvBatchMapping`, `AdvisoryRecord`, `VulnerabilityFacts`, `GraphqlAlias`, `GraphqlBatch`, `GraphqlRepoResult`, `RawTargetInputs`, `AssembledFacts`, `TargetNote`, `ManifestCandidate`, `DiscoveryResult`, `DiscoveryLimits`, `SelectionLimits`, `SelectionResult`, `SelectionError`).
    - _Requirements: 13.1, 13.4, 13.14_

  - [x] 1.22 Implement the URL parser and formatter
    - Create `pipeline/url/parse-repo-url.ts` (`parseRepoUrl(input, webHost)` returning a `Repo_Ref` or `invalid-url` with `details.part` and fixed-template messages; error precedence 7, 5, 6, 8, 9, 10; `.git.git` rejected) and `pipeline/url/format-repo-url.ts` (`formatRepoUrl`, Canonical_Repo_URL with percent-encoded branch). Total, never throws, no use of the input in messages.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.16, 2.5_

  - [x] 1.23 Write unit tests for the URL parser
    - `tests/pipeline/url/parse-repo-url.test.ts`: one example per criterion 1.1 to 1.11 (case rules, ignored query parameters, `www.`, branch with `/` and `%XX`, `+` not decoded, each rejection with its `details.part`), precedence 7, 5, 6, 8, 9, 10 (1.16), GHES Web_Host rejecting `github.com` (2.5).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.16, 2.5_

  - [x] 1.24 Write property tests for URL round trip and normalization
    - Create `tests/pipeline/url/parse-repo-url.property.test.ts` and `tests/support/arbitraries/urls.ts` (valid parts, spelling variants, branches with percent-encoding and `/`, mutations).
    - **Property 1: Repository reference round trip**
    - **Property 2: URL normalization is idempotent and variant-invariant**
    - **Validates: Requirements 1.12, 1.13, 1.15**

  - [x] 1.25 Write property tests for URL totality and mutation rejection
    - Append to `tests/pipeline/url/parse-repo-url.property.test.ts`.
    - **Property 3: URL parsing is total**
    - **Property 4: One mutation of an accepted URL is rejected**
    - **Validates: Requirements 1.14, 1.17**

  - [x] 1.26 Implement the GitHub configuration derivation
    - Create `pipeline/config/github-config.ts`: `readGithubConfig(env)` returning `GithubConfig` or `internal-error` with a fixed message that names the variable and never its value; check order 2.4, 2.9, then Requirement 20 criterion 11 (token placement check as defined there).
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.9, 2.11, 20.11_

  - [x] 1.27 Write unit tests for the GitHub configuration
    - `tests/pipeline/config/github-config.test.ts`: defaults when unset or empty, default API URL with a trailing `/`, GHES URL with `GHES_API_PATH_SUFFIX` giving a lowercase Web_Host, rejection of port, query, fragment, user information, `http`, wrong path, unparsable value, a non-`https` GraphQL URL, error order of 2.11, message never contains the input.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.9, 2.11_

  - [x] 1.28 Write the property test for the configuration
    - `tests/pipeline/config/github-config.property.test.ts` with generated string pairs (empty, unparsable, non-`https`).
    - **Property 5: GitHub configuration derivation is total and does not echo input**
    - **Validates: Requirements 2.10**

  - [x] 1.29 Implement `parseIsoInstant` and `dayCount`
    - Create `pipeline/mapping/day-count.ts`. `dayCount(date, asOf)` is `floor((asOfMs - dateMs) / DAY_MS)`, null for an invalid `asOf`, an invalid date or a date after `asOf`, never throws, never reads the clock.
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.8_

  - [x] 1.30 Write unit tests for `dayCount`
    - `tests/pipeline/mapping/day-count.test.ts`: exact boundaries (`DAY_MS - 1`, `DAY_MS`), leap days, `.fff` fractions, invalid ISO forms, future dates, non-string dates.
    - _Requirements: 6.3, 6.4, 6.5, 6.8_

  - [x] 1.31 Write property tests for `dayCount`
    - `tests/pipeline/mapping/day-count.property.test.ts`.
    - **Property 11: Day_Count is total, non-negative and deterministic**
    - **Property 12: Day_Count is monotonic**
    - **Property 13: Day_Count is the exact floor**
    - **Validates: Requirements 6.6, 6.7, 6.9, 6.10**

  - [x] 1.32 Implement version selection
    - Create `pipeline/mapping/version-select.ts`: `exactPin(versionSpec, ecosystem)`, `selectVersion(pins, versions, defaultVersion)` returning `VersionSelection` with notes (`pin-not-found`, `no-default-version`, `conflicting-pins`), `readDepsDevVersions(body)`. Result independent of spec order.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.10, 7.11, 7.12, 7.13_

  - [x] 1.33 Write unit tests for version selection
    - `tests/pipeline/mapping/version-select.test.ts`: pins per ecosystem (`==`, `===`, `=`, exact npm and Cargo forms), ranges and wildcards rejected, conflicting pins, pin missing from the version list, no default version, empty lists.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.11, 7.12_

  - [x] 1.34 Write property tests for version selection
    - `tests/pipeline/mapping/version-select.property.test.ts`.
    - **Property 14: Version_Selector accepts only exact pins**
    - **Property 15: Version selection does not depend on spec order**
    - **Validates: Requirements 7.10, 7.13**

  - [x] 1.35 Implement the deps.dev mappers
    - Create `pipeline/mapping/deps-dev.ts`: `mapDepsDevPackage` (release age as the minimum Day_Count over valid timestamps, `deprecated` of the Selected_Version), `mapDepsDevVersion` (Source_Repo from `relatedProjects`, host compared with Web_Host), `mapDepsDevVersionBatch` (entries matched by `versionKey`, never by position).
    - _Requirements: 8.2, 8.3, 8.4, 8.7, 8.8, 8.9, 8.16, 2.8_

  - [x] 1.36 Write unit tests for the deps.dev mappers
    - `tests/pipeline/mapping/deps-dev.test.ts` and `tests/support/arbitraries/shapes/ef-1.ts`, `ef-2.ts`, `ef-3.ts` (valid bodies in the shapes verified on 2026-11-17): field cases per Endpoint_Fact_Map row, host other than Web_Host is absent, batch response with a missing, extra or reordered entry, uppercase `system`.
    - _Requirements: 8.2, 8.3, 8.4, 8.7, 8.8, 8.9, 8.16, 2.8_

  - [x] 1.37 Write property tests for the deps.dev mappers
    - `tests/pipeline/mapping/deps-dev.property.test.ts`.
    - **Property 18: Release age is the minimum Day_Count over valid timestamps**
    - **Property 19: Batch responses are matched by key, not by position**
    - **Validates: Requirements 8.13, 8.16**

  - [x] 1.38 Implement the CVSS v3 calculator
    - Create `pipeline/mapping/cvss.ts`: `cvssV3BaseScore(vector)` (3.0 and 3.1 formulas with each version's round-up function, validation of R10.1: exact prefix, eight distinct base metrics, closed value sets, no whitespace), `cvssSeverity(vector)`, `severityFromScore(score)` using `CVSS_RANGES` (0.0 gives null).
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.14_

  - [x] 1.39 Write unit tests for the CVSS calculator
    - `tests/pipeline/mapping/cvss.test.ts`: the published scores listed in R10.11 for 3.0 and 3.1, each invalid vector form, boundary scores 0.0, 3.9, 4.0, 6.9, 7.0, 8.9, 9.0, scope changed, round-up differences between 3.0 and 3.1.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.11_

  - [x] 1.40 Write property tests for the CVSS calculator
    - `tests/pipeline/mapping/cvss.property.test.ts` and `tests/support/arbitraries/cvss.ts` (vectors from the eight metrics with all values, permutations of segments).
    - **Property 27: CVSS score range and severity mapping**
    - **Property 28: CVSS severity is monotonic in impact**
    - **Property 29: CVSS result does not depend on metric order**
    - **Validates: Requirements 10.9, 10.10, 10.12**

  - [x] 1.41 Implement severity selection and the deps.dev advisory mapper
    - Create `pipeline/mapping/severity.ts`: `severityOf(advisoryScore, osvBody)` (order of R10.5: valid Advisory_Score, then `database_specific.severity` exact and case-sensitive with `MODERATE` to `MEDIUM`, then the highest CVSS entry, then null) and `mapDepsDevAdvisory(body)` (finite number in `[0, 10]` only).
    - _Requirements: 10.5, 10.6, 10.7, 10.14, 9.21_

  - [x] 1.42 Write unit tests for severity selection
    - `tests/pipeline/mapping/severity.test.ts`: score 0.0 ends with null, label forms (`moderate`, `Moderate`, `LOW`), label wins over `severity[]`, invalid label falls through, `CVSS_V4` entries ignored, `NaN`, `Infinity`, `10.1` and strings rejected as score.
    - _Requirements: 10.5, 10.6, 10.7, 10.14, 9.21_

  - [x] 1.43 Write property tests for severity selection
    - `tests/pipeline/mapping/severity.property.test.ts`.
    - **Property 23: OSV-only severity rule**
    - **Property 30: Severity does not depend on severity entry order**
    - **Property 31: A valid Advisory_Score decides the severity**
    - **Validates: Requirements 9.15, 10.16, 10.13, 10.15**

  - [x] 1.44 Implement the OSV batch mappers
    - Create `pipeline/mapping/osv-batch.ts`: `mapOsvQueryBatch(body, queryCount)` (length mismatch, `next_page_token` marks `truncated`), `planAdvisoryRequests(ids, cap)` (distinct, ordered by code point, at most `OSV_MAX_ADVISORY_DETAILS`, rest `unfetched`).
    - _Requirements: 9.2, 9.3, 9.4, 9.11, 9.17, 9.19, 9.20_

  - [x] 1.45 Write unit tests for the OSV batch mappers
    - `tests/pipeline/mapping/osv.test.ts` and `tests/support/arbitraries/shapes/ef-5.ts`: length mismatch, empty results, duplicate ids across queries, truncation flag, cap boundary (`cap`, `cap + 1`), invalid entries.
    - _Requirements: 9.2, 9.3, 9.4, 9.11, 9.17, 9.19, 9.20_

  - [x] 1.46 Write the property test for advisory request planning
    - Create `tests/pipeline/mapping/osv.property.test.ts` and `tests/support/arbitraries/advisories.ts` (OSV advisory bodies with aliases, `withdrawn`, informational values, severity forms).
    - **Property 24: Advisory request sets are capped and distinct**
    - **Validates: Requirements 9.18, 9.23**

  - [x] 1.47 Implement the OSV advisory mapper and aggregation
    - Create `pipeline/mapping/osv-advisory.ts`: `mapOsvAdvisory(body, advisoryScore)` returning `AdvisoryRecord` (`withdrawn`, `informational`, `unmaintained`, `severity` through `severityOf`), `aggregateAdvisories(records, unfetchedIds)` (Alias_Groups of Counted_Advisories plus unfetched ids, `maxSeverity`, `informationalIds` and `unmaintainedIds` of non-withdrawn advisories in ascending order).
    - _Requirements: 9.5, 9.6, 9.7, 9.8, 9.9, 9.12, 9.13, 9.14, 10.17_

  - [x] 1.48 Write unit tests for the OSV advisory mapper
    - Append to `tests/pipeline/mapping/osv.test.ts` with `tests/support/arbitraries/shapes/ef-6.ts`: withdrawn excluded, informational excluded, alias merge (including transitive and one-sided links), unfetched ids counted, `maxSeverity` from fetched advisories only, a withdrawn informational advisory gets no id in `informationalIds`.
    - _Requirements: 9.5, 9.6, 9.7, 9.8, 9.9, 9.12, 9.14_

  - [x] 1.49 Write property tests for vulnerability counts
    - Append to `tests/pipeline/mapping/osv.property.test.ts`.
    - **Property 20: Vulnerability count bounds**
    - **Property 21: Vulnerability facts do not depend on advisory order**
    - **Property 22: One alias link merges two vulnerabilities**
    - **Property 25: Unfetched advisory ids are counted**
    - **Validates: Requirements 9.12, 9.13, 9.14, 9.18**

  - [x] 1.50 Write the property test for maximum severity
    - Append to `tests/pipeline/mapping/severity.property.test.ts`.
    - **Property 32: Maximum severity over advisories**
    - **Validates: Requirements 10.17**

  - [x] 1.51 Implement the GraphQL repository mappers
    - Create `pipeline/mapping/github-repos.ts`: `buildRepositoriesQuery(batch)` (aliases `r0`, `r1`, values passed as variables), `planGraphqlBatches(repos, batchSize)` (distinct case-insensitive, deterministic order), `mapGraphqlRepos(body, batch, asOf)` (`ok`, `not-found` for `NOT_FOUND` on the alias path, `failed` for foreign error types; `archived` and `daysSinceLastCommit` independent).
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.9, 11.12, 11.14_

  - [x] 1.52 Write unit tests for the GraphQL mappers
    - `tests/pipeline/mapping/github-repos.test.ts` with `tests/support/arbitraries/shapes/ef-17.ts` and `ef-19.ts`: query text and variables for one and `GRAPHQL_BATCH_SIZE` aliases, a `NOT_FOUND` alias with HTTP 200, a foreign error type, missing `defaultBranchRef`, invalid `committedDate`, batch boundary.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.9, 11.12, 11.14_

  - [x] 1.53 Write property tests for the GraphQL mappers
    - `tests/pipeline/mapping/github.property.test.ts`.
    - **Property 33: archived and daysSinceLastCommit are independent**
    - **Property 34: GraphQL batching covers each source repository once**
    - **Validates: Requirements 11.11, 11.14**

  - [x] 1.54 Implement the rate limit readers
    - Create `pipeline/mapping/rate-limit.ts`: `readGraphqlRateLimit(body)` and `readRestRateLimit(headers)`; `remaining` set only from an integer, `resetAt` as an ISO instant from an integer epoch.
    - _Requirements: 14.2, 14.4, 3.7_

  - [x] 1.55 Write unit tests for the rate limit readers
    - `tests/pipeline/mapping/rate-limit.test.ts`: integer, empty, non-integer, negative and missing values for headers and for `data.rateLimit`, `resetAt` conversion.
    - _Requirements: 14.2, 14.4, 3.7_

  - [x] 1.56 Implement the repository and branch readers
    - Create `pipeline/mapping/github-resolve.ts`: `readRepository(body, requestedBranch)` (`full_name` split at its one `/` in GitHub's spelling, `private` true is `repo-not-found`, default branch rules) and `readCommitSha(body)` (exactly 40 hexadecimal characters).
    - _Requirements: 3.2, 3.3, 3.6, 3.9, 3.10, 3.12_

  - [x] 1.57 Write unit tests for the repository and branch readers
    - `tests/pipeline/mapping/github-resolve.test.ts` with `tests/support/arbitraries/shapes/ef-12.ts` and `ef-13.ts`: private repository, missing or empty `default_branch`, `default_branch` of `BRANCH_MAX_LENGTH` and `BRANCH_MAX_LENGTH + 1`, `full_name` without `/`, with two `/`, empty parts, mixed case kept, SHA of 39, 40 and 41 characters, non-hex characters, non-object bodies.
    - _Requirements: 3.2, 3.3, 3.6, 3.9, 3.10, 3.12_

  - [x] 1.58 Write the property test for repository and branch responses
    - `tests/pipeline/mapping/github-resolve.property.test.ts` over `arbJson` for both responses.
    - **Property 6: Repository and branch responses give a commit or a typed error**
    - **Validates: Requirements 3.11**

  - [x] 1.59 Implement the maintainer mappers
    - Create `pipeline/mapping/maintainers.ts`: `mapNpmLatest` (maintainer count and `deprecated`), `mapCratesOwners` (distinct valid `user` logins plus `team` entries, `lowerBound` for mixed lists, `null` for a non-empty list with no valid entry), `mapPypiOwnership`, `orderCratesLookups(targets)` (first scope in the order `runtime`, `build`, `dev`, `optional`, `peer`, then name by code point).
    - _Requirements: 12.1, 12.3, 12.4, 12.5, 12.14, 12.15, 8.6_

  - [x] 1.60 Write unit tests for the maintainer mappers
    - `tests/pipeline/mapping/maintainers.test.ts` with `tests/support/arbitraries/shapes/ef-20.ts`, `ef-21.ts`, `ef-22.ts`: duplicate names, empty list is 0, invalid-only list is null, mixed users and teams set the lower bound, scope order examples for crates.
    - _Requirements: 12.1, 12.3, 12.4, 12.5, 12.14, 12.15_

  - [x] 1.61 Write property tests for the maintainer mappers
    - `tests/pipeline/mapping/maintainers.property.test.ts`.
    - **Property 35: Maintainer count is the number of distinct valid entries**
    - **Property 36: Lower-bound note appears exactly for mixed owner lists**
    - **Property 74: Crates owners are looked up in scope order and cached owners send no request** (mapper level: `orderCratesLookups` over generated scopes and permutations; the cache half is covered in task 7.24)
    - **Validates: Requirements 12.11, 12.12, 12.15**

  - [x] 1.62 Implement manifest discovery
    - Create `pipeline/mapping/discovery.ts`: `discoverManifests(treeBody, limits)` returning `Discovery_Result` (filters, `depthLimited`, `countLimited`, `truncatedTree`, sort by depth then path) or `invalid-tree`.
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.11_

  - [x] 1.63 Write unit tests for manifest discovery
    - `tests/pipeline/mapping/discovery.test.ts` with `tests/support/arbitraries/shapes/ef-14.ts`: skip directories are not counted as limited, depth `DISCOVERY_MAX_DEPTH` and `+ 1`, count `DISCOVERY_MAX_MANIFESTS` and `+ 1`, `truncated` true, non-string `path` or `type` ignored, size `null` for a non-integer, `invalid-tree` forms.
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.11, 4.12_

  - [x] 1.64 Write property tests for manifest discovery
    - `tests/pipeline/mapping/discovery.property.test.ts` and `tests/support/arbitraries/trees.ts` (skip directories, deep paths, duplicates, hostile entries).
    - **Property 7: Discovery_Result invariants**
    - **Property 8: Discovery does not depend on tree entry order**
    - **Property 9: Tree responses are handled totally**
    - **Validates: Requirements 4.9, 4.13, 4.10, 4.12**

  - [x] 1.65 Implement manifest selection
    - Create `pipeline/mapping/selection.ts`: `selectManifests(candidates, requested, treePaths, limits)` (Root_Manifests by default with no cap, duplicates removed on exact strings, `too-many-manifests` before `manifest-not-found`, listed paths inside skipped directories accepted).
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.13_

  - [x] 1.66 Write unit tests for manifest selection
    - `tests/pipeline/mapping/selection.test.ts`: default root selection order, `no-root-manifest` case, duplicates, `SCAN_MAX_MANIFESTS` and `+ 1`, check order 5.4 before 5.5, wrong case and wrong last segment, path inside `node_modules` accepted.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 1.67 Write the property test for manifest selection
    - `tests/pipeline/mapping/selection.property.test.ts`.
    - **Property 10: Manifest selection invariants**
    - **Validates: Requirements 5.13**

  - [x] 1.68 Implement `assembleFacts`
    - Create `pipeline/mapping/assemble.ts`: `assembleFacts(raw, asOf)` returning exactly the seven fact keys and the target notes. `deprecated` from deps.dev for the Selected_Version, filled from `mapNpmLatest` for npm with basis `default`, set `true` by `unmaintainedIds` for `cargo`; `maintainerCount` only from the maintainer mapper of the ecosystem; notes for `package-not-found`, `informational-advisory-excluded`, `unmaintained-advisory`, `advisory-details-incomplete`, `osv-pagination-ignored`, `maintainers-lower-bound` and selection notes.
    - _Requirements: 13.4, 13.11, 13.12, 13.13, 13.14, 8.4, 8.5, 8.6, 9.6, 9.9, 9.11, 9.22, 12.4_

  - [x] 1.69 Write unit tests for `assembleFacts`
    - `tests/pipeline/mapping/assemble.test.ts`: all sources ok, each source unavailable gives only its facts null, the `deprecated` composition rules, `unmaintained` for crates sets `deprecated` and adds the note, `unsound` and `notice` do not, truncated OSV result, `no-source-repo`.
    - _Requirements: 13.4, 13.11, 13.14, 8.4, 8.6, 9.6, 9.22_

  - [x] 1.70 Write property tests for `assembleFacts`
    - `tests/pipeline/mapping/assemble.property.test.ts`.
    - **Property 37: Assembled facts have the declared types**
    - **Property 38: Assembly is deterministic**
    - **Property 26: Unmaintained advisories set deprecated for crates**
    - **Validates: Requirements 13.11, 13.13, 9.22**

  - [x] 1.71 Export all Mappers from `pipeline/mapping/index.ts`
    - Re-export every Mapper and every type of `pipeline/mapping`. No other module in the group edits this file.
    - _Requirements: 13.1, 22.2_

  - [x] 1.72 Build the Mapper registry for property tests
    - Create `tests/support/mapper-registry.ts` listing every export of `pipeline/mapping/index.ts` with a validator of its declared output type and a way to call it with a generated JSON value and a generated `asOf`.
    - _Requirements: 13.10, 13.15_

  - [x] 1.73 Write the registry completeness test
    - `tests/pipeline/mapping/mapper-registry.test.ts`: fails when an exported Mapper is missing from the registry.
    - _Requirements: 13.10, 13.15_

  - [x] 1.74 Write property tests over the Mapper registry
    - `tests/pipeline/mapping/mappers.property.test.ts` (registry driven, `arbJson`, shapes of `tests/support/arbitraries/shapes/*`, delete-only mutations at every path of `endpoint-fact-map.ts` for P17).
    - **Property 16: Every Mapper is total, typed and non-mutating**
    - **Property 17: A missing field maps to unknown**
    - **Validates: Requirements 8.11, 9.16, 9.19, 10.8, 11.10, 12.8, 13.10, 13.15, 8.12, 12.9, 13.12**

- [x] 2. Checkpoint - Ports, constants, architecture check and mapping
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [ ] 3. HTTP client and source adapters
  - [~] 3.1 Implement the retry policy
    - Create `adapters/http/retry-policy.ts`: `backoffDelayMs(attemptsMade, r)`, `parseRetryAfter(value)` (non-negative integer seconds only), `decideAfterAttempt(...)` (the decision table of the design, wait checks in the order deadline, `RETRY_AFTER_MAX_MS`, total timeout, gate) and `resolveRedirect(firstUrl, currentUrl, location, hops, method)` returning `follow` or `refuse`. Pure, no clock or random access.
    - _Requirements: 15.4, 15.5, 15.6, 15.7, 15.8, 15.13, 15.17, 15.19, 15.20, 15.21_

  - [~] 3.2 Write unit tests for the retry policy
    - `tests/adapters/retry-policy.test.ts`: every row of the decision table, `Retry-After` of `0`, an integer at `RETRY_AFTER_MAX_MS` and above, a date-form value ignored, GitHub 403 with and without `Retry-After`, wait crossing the deadline and the total timeout, redirect `follow` and each `refuse` case.
    - _Requirements: 15.4, 15.5, 15.6, 15.7, 15.8, 15.17, 15.19, 15.20_

  - [~] 3.3 Write the property test for backoff
    - `tests/adapters/retry-policy.property.test.ts`.
    - **Property 44: Backoff delay is within bounds**
    - **Validates: Requirements 15.13**

  - [~] 3.4 Implement the concurrency limiter
    - Create `adapters/http/concurrency-limiter.ts`: `createConcurrencyLimiter(limit, minIntervalMs)` returning `ConcurrencyLimiter`; slot waits abortable (`{ acquired: false }`), spacing between starts through the injected `Timer` and `Clock`.
    - _Requirements: 15.3, 15.14, 15.16_

  - [~] 3.5 Write unit tests for the limiter
    - `tests/adapters/concurrency-limiter.test.ts`: limit 1 and 4, FIFO start order, abort while waiting, a failing task releases its slot, `minIntervalMs` spacing on the fake runtime.
    - _Requirements: 15.3, 15.14, 15.16_

  - [~] 3.6 Write the property test for the limiter
    - `tests/adapters/concurrency-limiter.property.test.ts`.
    - **Property 45: The concurrency limiter respects its limit**
    - **Validates: Requirements 15.14**

  - [~] 3.7 Implement secret scrubbing
    - Create `adapters/http/redact.ts`: `scrubSecrets(text, secrets)` replaces every occurrence of a secret and of `Bearer ` plus a secret with `[redacted]`; empty secrets are ignored.
    - _Requirements: 20.4, 20.8, 20.9_

  - [~] 3.8 Write unit tests for scrubbing
    - `tests/adapters/redact.test.ts`: several occurrences, overlapping secrets, case of `Bearer`, regular-expression metacharacters in the secret, no secret set.
    - _Requirements: 20.4, 20.8, 20.9_

  - [~] 3.9 Implement the limited body reader
    - Create `adapters/http/body-reader.ts`: `readBodyLimited(response, maxBytes, signal)` streams chunks, counts bytes, cancels the reader and discards everything at the first byte over the limit; a body of exactly the limit is accepted; abort stops the read.
    - _Requirements: 15.2_

  - [~] 3.10 Write unit tests for the body reader
    - `tests/adapters/body-reader.test.ts`: body of `MAX_RESPONSE_BYTES` accepted, `+ 1` rejected with the reader cancelled, multi-chunk bodies, abort during the read, invalid UTF-8.
    - _Requirements: 15.2_

  - [~] 3.11 Implement the system runtime adapters
    - Create `adapters/runtime/system-clock.ts`, `system-timer.ts` (`setTimeout`, `clearTimeout`, abortable `sleep`), `system-random.ts` and `console-logger.ts` (writes only the four `LogEntry` fields). These are the only adapter files allowed to call `Date.now`, `setTimeout` or `Math.random`.
    - _Requirements: 15.10, 20.6_

  - [~] 3.12 Write unit tests for the system runtime adapters
    - `tests/adapters/system-runtime.test.ts` (with Vitest fake timers): `sleep` resolves `'elapsed'` or `'aborted'`, `clearTimeout` cancels, the logger output has exactly the keys `source`, `status`, `durationMs`, `code`.
    - _Requirements: 15.10, 20.6_

  - [~] 3.13 Implement the token reader and environment reader
    - Create `adapters/runtime/token-reader.ts` (the only file in the repository that contains `process.env.GITHUB_TOKEN`; empty string counts as unset) and `adapters/runtime/env.ts` (`GITHUB_API_URL`, `GITHUB_GRAPHQL_URL`, `GRAVEKEEPER_RUNTIME_CACHE`, `GRAVEKEEPER_USER_AGENT`; `off` is the only value that disables L2).
    - _Requirements: 2.7, 20.1, 20.10, 19.19, 22.17_

  - [~] 3.14 Write unit tests for the token reader and environment reader
    - `tests/adapters/env.test.ts`: unset and empty token, `GRAVEKEEPER_RUNTIME_CACHE` of `off`, `on`, empty, unset and an arbitrary value, the token never appears in the object returned by `env.ts`, the real tree has exactly one file with `process.env.GITHUB_TOKEN`.
    - _Requirements: 2.7, 20.1, 20.10, 19.19, 22.17_

  - [~] 3.15 Build the scripted fetch and the script arbitraries
    - Create `tests/support/scripted-fetch.ts` (`(url, attemptIndex) => Step`, sleeps on the fake timer, honors `init.signal` with an `AbortError`, records `sentAtMs`, `abortedAtMs`, request headers and `redirect` mode), `tests/support/arbitraries/scripts.ts` (per-source steps with failure probability, latencies around `REQUEST_TIMEOUT_MS`, `REQUEST_TOTAL_TIMEOUT_MS` and `SCAN_DEADLINE_MS`, `Retry-After` values, oversize bodies, budget header sequences) and `tests/support/arbitraries/redirects.ts` (chains of 301, 302, 303, 307, 308 with same-origin and cross-origin, relative and absolute and missing `Location`, lengths 0 to `REDIRECT_MAX_HOPS + 2`, header sets that include `Authorization`).
    - _Requirements: 15.9, 15.19, 15.21, 16.13, 23.1_

  - [~] 3.16 Install the offline fetch guard
    - Create `tests/support/offline-fetch.ts` replacing `globalThis.fetch` with a function that records the call and throws `OfflineFetchError`, plus an `afterEach` that fails the test when a call was recorded; inactive for files under `tests/live` when `GRAVEKEEPER_LIVE_TESTS` is `1`. Add `setupFiles: ['tests/support/offline-fetch.ts']` to `vitest.config.ts`.
    - _Requirements: 23.1_

  - [~] 3.17 Write unit tests for the test support
    - `tests/support/support.test.ts`: the offline stub throws and the guard fails a test that swallowed the throw (checked through a helper run), `scripted-fetch` records abort instants and honors latency `'never'`, redirect arbitrary produces chains of the stated lengths.
    - _Requirements: 23.1_

  - [~] 3.18 Implement the GitHub authorizer
    - Create `adapters/http/github-authorizer.ts`: `createGithubAuthorizer(readToken, config)` returns `(url: URL) => string | null`, giving `"Bearer " + token` only for scheme `https`, a host (case-insensitive) equal to the host of the API URL or the GraphQL URL, and a set token.
    - _Requirements: 20.2, 20.3, 20.7_

  - [~] 3.19 Write unit tests for the authorizer
    - `tests/adapters/github-authorizer.test.ts`: API and GraphQL host get the header, `raw.githubusercontent.com`, other registries and look-alike hosts (`api.github.com.evil.test`, `API.GITHUB.COM` with a port) do not, `http` does not, unset token gives `null`.
    - _Requirements: 20.2, 20.3, 20.7_

  - [~] 3.20 Implement the HTTP client
    - Create `adapters/http/http-client.ts`: `createHttpClient(options)` with the Work_Unit loop and the attempt of the design (per-attempt timeout on the injected timer, `AbortSignal.any`, `redirect: 'manual'` with same-origin redirects followed for GET up to `REDIRECT_MAX_HOPS`, `Authorization` recomputed per hop by the authorizer, header allow-list `content-type`, `retry-after`, `x-ratelimit-*`, body size cap, scrubbing before the body is returned, gate `allow` and `observe`, `failed` outcomes carry no body, Retry-After and backoff handling through `retry-policy.ts`). Never throws and never rejects.
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.15, 15.16, 15.17, 15.19, 15.20, 15.21, 16.5, 16.8, 16.9, 20.2, 20.3, 20.4_

  - [~] 3.21 Write unit tests for the HTTP client attempts
    - `tests/adapters/http-client.test.ts` (scripted fetch, fake runtime): status table (2xx, 404 absent and failed, 429, 5xx, other 4xx), attempt count and backoff times, `Retry-After` honoured and capped, per-attempt and total timeouts, abort at the scan deadline (`deadline`), wait crossing the deadline, slot wait aborted, `fromCache` false, the returned `attempts`.
    - _Requirements: 15.1, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.16, 16.5, 16.8, 16.9_

  - [~] 3.22 Write unit tests for redirects, authorization and scrubbing
    - `tests/adapters/http-client-redirect-auth.test.ts`: same-origin redirect followed with the header recomputed, cross-origin redirect refused with no request sent and no header forwarded, missing `Location`, `REDIRECT_MAX_HOPS` hops followed and `+ 1` refused, POST redirect refused, token sent only to the GitHub API and GraphQL hosts, never to registries or the raw host, response bodies and headers that echo the token are scrubbed, oversize body gives `http-error`, header allow-list, gate blocks the next attempt with `budget`.
    - _Requirements: 15.2, 15.17, 15.19, 15.20, 15.21, 20.2, 20.3, 20.4_

  - [~] 3.23 Write property tests for attempt counts
    - `tests/adapters/http-client.property.test.ts` over generated attempt sequences.
    - **Property 42: Attempts per Work_Unit are bounded**
    - **Property 43: Non-retriable first outcomes get exactly one attempt**
    - **Validates: Requirements 15.11, 15.12**

  - [~] 3.24 Write the property test for waits that cross the deadline
    - Append to `tests/adapters/http-client.property.test.ts`.
    - **Property 46: A wait that would cross the deadline ends the unit**
    - **Validates: Requirements 15.18**

  - [~] 3.25 Write the property test for redirect chains
    - Append to `tests/adapters/http-client.property.test.ts` using `tests/support/arbitraries/redirects.ts`.
    - **Property 73: Redirect chains never leave the origin or exceed the hop limit**
    - **Validates: Requirements 15.21**

  - [~] 3.26 Implement GitHub budget tracking
    - Create `pipeline/scan/github-budget.ts`: `GithubBudget` implements `AttemptGate`; starts unknown for every scan, `remaining` set only from an integer read through `readRestRateLimit` or `readGraphqlRateLimit`, `allow()` false when `remaining !== null && remaining < GITHUB_BUDGET_THRESHOLD`, keeps the last `resetAt`.
    - _Requirements: 14.2, 14.3, 14.4, 14.6, 14.8, 14.9_

  - [~] 3.27 Write unit tests for GitHub budget tracking
    - `tests/pipeline/scan/github-budget.test.ts`: unknown at start, integer below, at and above the threshold, non-integer and empty values ignored, a later higher value reopens the gate, `resetAt` kept.
    - _Requirements: 14.2, 14.3, 14.4, 14.6, 14.9_

  - [~] 3.28 Implement the SourceResult conversion
    - Create `adapters/http/source-result.ts`: `toSourceResult(outcome)` and `toTextResult(outcome)` mapping `ok`, `absent`, `failed` outcomes; a 2xx body that is not JSON gives `unparsable`; headers kept as the allow-list.
    - _Requirements: 15.15, 17.6, 4.11, 3.10_

  - [~] 3.29 Write unit tests for the SourceResult conversion
    - `tests/adapters/source-result.test.ts`: valid JSON, empty body, truncated JSON, a JSON scalar, `absent`, `failed` with each `AdapterReason`.
    - _Requirements: 15.15, 3.10_

  - [~] 3.30 Implement the GitHub source adapter
    - Create `adapters/github/github-source.ts`: `createGithubSource(client, config, tokenPresent)`; repository and branch requests with `cache: null`, tree request cached with the Commit_SHA in the URL, manifest text from `GITHUB_RAW_HOST` for the default Web_Host (no gate) and from the blobs endpoint with the gate for GHES, GraphQL `POST` with `auth: 'github'` and `storeWhen: 'graphql-no-foreign-errors'`; path segments with `encodeURIComponent`.
    - _Requirements: 2.6, 3.1, 3.4, 3.8, 11.1, 14.3, 14.11, 19.2, 19.4_

  - [~] 3.31 Write unit tests for the GitHub source adapter
    - `tests/adapters/sources/github-source.test.ts` (scripted `HttpClient`): exact URL, method, headers and body of every method, `cache` policies, raw host versus blobs endpoint, `hasToken`, branch with `/` and `%` requested unchanged.
    - _Requirements: 2.6, 3.1, 3.4, 3.8, 14.11, 19.4_

  - [~] 3.32 Write the property test for the GitHub budget threshold
    - `tests/pipeline/scan/github-budget.property.test.ts` with the real HTTP client, the GitHub adapter and generated header and `rateLimit.remaining` sequences (missing, empty, non-integer, negative, 0) on the fake runtime.
    - **Property 40: GitHub budget threshold is never crossed**
    - **Validates: Requirements 14.9**

  - [~] 3.33 Implement the deps.dev source adapter
    - Create `adapters/depsdev/depsdev-source.ts`: package, version, `versionbatch` (system in uppercase, at most `DEPSDEV_BATCH_SIZE` requests) and advisory requests; 404 is `absent` for package and advisory; advisory policy `ADVISORY_CACHE_TTL_SECONDS` with `l2Kind: 'depsdev-advisory'`; other bodies `l2Kind: null` with `UPSTREAM_CACHE_TTL_SECONDS`.
    - _Requirements: 8.1, 8.8, 9.20, 9.21, 9.23, 19.17, 19.18, 19.20_

  - [~] 3.34 Write unit tests for the deps.dev source adapter
    - `tests/adapters/sources/depsdev-source.test.ts`: URL, method and body per method, uppercase `system`, encoded package names, cache policies and `l2Kind`, batch size guard.
    - _Requirements: 8.8, 9.20, 9.21, 19.17, 19.18, 19.20_

  - [~] 3.35 Implement the OSV source adapter
    - Create `adapters/osv/osv-source.ts`: `queryBatch` (at most `OSV_BATCH_SIZE` queries, keys in a fixed order) and `getVulnerability` (`notFound: 'failed'`, `ADVISORY_CACHE_TTL_SECONDS`, `l2Kind: 'osv-advisory'`).
    - _Requirements: 9.1, 9.4, 9.9, 17.6, 19.17, 19.18, 19.20_

  - [~] 3.36 Write unit tests for the OSV source adapter
    - `tests/adapters/sources/osv-source.test.ts`: request body key order, ecosystem names, a 404 on the detail request is `failed`, cache policies.
    - _Requirements: 9.1, 9.4, 9.9, 17.6, 19.17, 19.20_

  - [~] 3.37 Implement the npm source adapter
    - Create `adapters/npm/npm-source.ts`: `getLatest(name)` to `https://registry.npmjs.org/{name}/latest`, 404 is `absent`, scoped names encoded.
    - _Requirements: 12.1, 8.6, 12.7_

  - [~] 3.38 Write unit tests for the npm source adapter
    - `tests/adapters/sources/npm-source.test.ts`: URL for plain and scoped names, 404 `absent`, cache policy.
    - _Requirements: 12.1, 8.6, 12.7_

  - [~] 3.39 Implement the crates.io source adapter
    - Create `adapters/cratesio/cratesio-source.ts`: `getOwners(name)` with `User-Agent` from `GRAVEKEEPER_USER_AGENT`, `CRATES_OWNERS_TTL_SECONDS` with `l2Kind: 'crates-owners'`, 404 `absent`; the shared limiter policy `CONCURRENCY_CRATESIO` with `CRATESIO_MIN_INTERVAL_MS` is applied by the HTTP client.
    - _Requirements: 12.2, 12.7, 12.13, 15.16, 19.20_

  - [~] 3.40 Write unit tests for the crates.io source adapter
    - `tests/adapters/sources/cratesio-source.test.ts`: URL, `User-Agent` header, cache policy and `l2Kind`, 404 `absent`.
    - _Requirements: 12.2, 12.7, 12.13, 19.20_

  - [~] 3.41 Implement the PyPI source adapter
    - Create `adapters/pypi/pypi-source.ts`: `getProject(name)` to `https://pypi.org/pypi/{name}/json`, 404 is `absent`.
    - _Requirements: 12.5, 12.7_

  - [~] 3.42 Write unit tests for the PyPI source adapter
    - `tests/adapters/sources/pypi-source.test.ts`: URL with a normalized name, 404 `absent`, a body over `MAX_RESPONSE_BYTES` surfaces as `failed` `http-error` through the client.
    - _Requirements: 12.5, 12.7, 15.2_

- [~] 4. Checkpoint - HTTP client and adapters
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [ ] 5. Orchestrator and deadline model
  - [~] 5.1 Define the scan types
    - Create `pipeline/scan/types.ts`: `ScanResult`, `ScanNote` and `NoteCode` (no `manifest-selection-capped`), `ScanInput`, `ScanDeps`, `ScanLimits`, `TypedCache`, `ScanProgress`, `LookupTarget`, `Scan_Error` types as in the Data Models section of the design.
    - _Requirements: 18.1, 17.9, 21.5, 21.6_

  - [~] 5.2 Implement the note templates and note builders
    - Create `pipeline/scan/messages.ts` (fixed templates for every note and error message, no raw upstream text) and `pipeline/scan/notes.ts` (builders per `NoteCode`, `source-failed` and `source-partial` with `reasons` unique and in code point order).
    - _Requirements: 17.9, 17.15, 20.5, 21.5_

  - [~] 5.3 Write unit tests for notes
    - `tests/pipeline/scan/notes.test.ts`: every code has a fixed message, no template contains `${`, the Web_Host in `invalid-url` comes from configuration, `reasons` ordering and uniqueness.
    - _Requirements: 17.9, 17.15, 20.5, 21.5_

  - [~] 5.4 Implement the work ledger and source statuses
    - Create `pipeline/scan/ledger.ts` (`WorkLedger.record`, append-only) and `pipeline/scan/source-status.ts` (`computeSourceStatuses`, `buildSourceNotes`; `partial` for any deadline unit or a truncated OSV result, `failed` only when every Applicable_Unit failed for a reason other than `deadline`).
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.8, 17.9, 17.13, 17.14, 17.15, 17.16_

  - [~] 5.5 Write unit tests for the ledger and statuses
    - `tests/pipeline/scan/ledger.test.ts`: each row of R17.2 to R17.5, a source with no Applicable_Unit, deadline units, `prerequisite`, `budget`, `token-missing`, `truncated` units, nine reason categories.
    - _Requirements: 17.2, 17.3, 17.4, 17.5, 17.8, 17.13, 17.14_

  - [~] 5.6 Write property tests for source statuses
    - `tests/pipeline/scan/source-status.property.test.ts`.
    - **Property 52: Source status and source notes follow the unit outcomes**
    - **Property 53: OSV truncation makes the source partial**
    - **Property 54: Reason categories are valid and distinct**
    - **Validates: Requirements 17.12, 17.16, 17.14, 17.15**

  - [~] 5.7 Implement Lookup_Target planning and the dependency cap
    - Create `pipeline/scan/targets.ts`: dedupe registry dependencies into Lookup_Targets by `(ecosystem, name)`, order by `compareCodePoints`, cap at `SCAN_MAX_DEPENDENCIES` with `capped.total` and `capped.skipped`, mark `git` and `path` dependencies as unassessed.
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.6, 16.7, 16.10, 13.16_

  - [~] 5.8 Write unit tests for target planning
    - `tests/pipeline/scan/targets.test.ts`: shared target across scopes and manifests, cap at `SCAN_MAX_DEPENDENCIES` and `+ 1`, skipped targets sort after looked-up ones, `git` and `path` never looked up.
    - _Requirements: 16.3, 16.6, 16.7, 16.10, 13.16_

  - [~] 5.9 Write the property test for the dependency cap
    - `tests/pipeline/scan/targets.property.test.ts`.
    - **Property 47: The dependency cap partitions the Lookup_Targets**
    - **Validates: Requirements 16.6, 16.7, 16.10**

  - [~] 5.10 Implement unit execution helpers
    - Create `pipeline/scan/run-unit.ts`: `runUnit(source, unitKey, call)` (records `deadline` without calling when the signal is aborted, otherwise `raceAbort(call(), signal)`), `skipUnit(source, unitKey, reason)`, `raceAbort`, `safeLog`. A source that ignores the abort signal cannot hold the scan past the deadline.
    - _Requirements: 16.5, 16.8, 16.12, 17.5, 17.8_

  - [~] 5.11 Write unit tests for unit execution helpers
    - `tests/pipeline/scan/run-unit.test.ts`: aborted signal records `deadline` and never calls, `raceAbort` resolves at the abort for a source that never settles, a throwing Logger is ignored.
    - _Requirements: 16.5, 16.8, 16.12_

  - [~] 5.12 Implement the discovery stage
    - Create `pipeline/scan/stage-discovery.ts`: repository, branch and tree requests in order with the shared `GithubBudget`; canonical owner, repo and branch; errors `repo-not-found`, `branch-not-found`, `upstream-unavailable` (with `resetAt` only when it is an integer instant), `deadline-exceeded`; always sends the repository and branch requests.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.12, 3.13, 4.1, 4.11, 16.11, 18.1_

  - [~] 5.13 Write unit tests for the discovery stage
    - `tests/pipeline/scan/stage-discovery.test.ts` (scripted `Source_Ports`): each error with its `details`, 404 of the tree request is `upstream-unavailable`, budget below threshold stops discovery, deadline during discovery gives `deadline-exceeded`, mixed-case `full_name`.
    - _Requirements: 3.2, 3.5, 3.6, 3.7, 3.9, 3.10, 3.12, 3.13, 4.11, 16.11_

  - [~] 5.14 Implement manifest selection, fetch and parse stage
    - Create `pipeline/scan/stage-manifests.ts`: discovery result, `selectManifests`, skip by `size` over `MAX_MANIFEST_LENGTH` (`manifest-too-large`), one fetch at a time in ascending path order, `parseManifest` of `/core`, `manifest-fetch-failed` notes, `no-manifests`, `no-root-manifest`, `tree-truncated`; remaining manifests fail with reason `deadline` after the deadline.
    - _Requirements: 4.6, 4.8, 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12_

  - [~] 5.15 Write unit tests for the manifest stage
    - `tests/pipeline/scan/stage-manifests.test.ts`: default root selection, explicit list, `too-many-manifests`, `manifest-not-found`, oversize skip with no Work_Unit, a failed fetch continues, all failed gives an empty result with notes, warnings kept in order, ecosystem only from the ParseResult.
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.8, 5.9, 5.10, 5.11, 5.12_

  - [~] 5.16 Implement the package and registry stage
    - Create `pipeline/scan/stage-registries.ts`: deps.dev package documents, npm latest, PyPI json and crates.io owners started together under the source limits; owners requested in the order of `orderCratesLookups`; an unexpired owners entry is answered without a request.
    - _Requirements: 8.1, 12.1, 12.2, 12.5, 12.10, 12.13, 12.14, 16.1_

  - [~] 5.17 Write unit tests for the registry stage
    - `tests/pipeline/scan/stage-registries.test.ts`: request counts per ecosystem, crates order for mixed scopes, a 404 is `absent` and `ok`, an unparsable body is a failed unit, deadline cut of owners lookups.
    - _Requirements: 8.1, 12.1, 12.2, 12.5, 12.7, 12.14, 16.1_

  - [~] 5.18 Implement the version, source repo and vulnerability id stage
    - Create `pipeline/scan/stage-versions.ts`: `selectVersion` per target, deps.dev `versionbatch` with fallback to single version documents and one `batch-fallback` note, OSV `querybatch` in chunks of `OSV_BATCH_SIZE`, targets without a Selected_Version recorded with reason `prerequisite`.
    - _Requirements: 7.4, 7.5, 7.6, 7.11, 8.7, 8.8, 8.9, 9.1, 9.2, 9.3, 17.8_

  - [~] 5.19 Write unit tests for the version stage
    - `tests/pipeline/scan/stage-versions.test.ts`: pinned and default basis, batch success, batch failure with fallback and the note, a target with a missing package document, OSV chunking at `OSV_BATCH_SIZE` and `+ 1`, length mismatch.
    - _Requirements: 7.4, 7.5, 8.8, 9.1, 9.2, 9.3, 17.8_

  - [~] 5.20 Implement the advisory stage
    - Create `pipeline/scan/stage-advisories.ts`: one plan for the union of ids (`planAdvisoryRequests`), OSV detail and deps.dev advisory requests for the same id set, unfetched ids recorded with reason `truncated`, `advisory-details-incomplete` input for `assembleFacts`.
    - _Requirements: 9.4, 9.9, 9.18, 9.20, 9.23, 17.14_

  - [~] 5.21 Write unit tests for the advisory stage
    - `tests/pipeline/scan/stage-advisories.test.ts`: both request sets equal and ordered, cap at `OSV_MAX_ADVISORY_DETAILS`, a deps.dev 404 is `ok`, an OSV 404 is a failed unit, shared ids across targets requested once.
    - _Requirements: 9.4, 9.9, 9.18, 9.20, 9.23, 17.6_

  - [~] 5.22 Implement the repository facts stage
    - Create `pipeline/scan/stage-repo-facts.ts`: `planGraphqlBatches`, `buildRepositoriesQuery`, one GraphQL request per batch under the `github` limiter with the budget gate; without a token every unit is `token-missing` and one `github-token-missing` note is added; units after a closed gate are `budget`.
    - _Requirements: 11.1, 11.2, 11.7, 11.8, 11.13, 14.3, 14.4, 17.5_

  - [~] 5.23 Write unit tests for the repository facts stage
    - `tests/pipeline/scan/stage-repo-facts.test.ts`: no token, no Source_Repo, batch boundary, a `NOT_FOUND` alias is `ok` with null facts, a foreign error type fails the unit, budget stop.
    - _Requirements: 11.1, 11.2, 11.5, 11.7, 11.8, 11.9, 11.13, 14.3, 17.5_

  - [~] 5.24 Implement result assembly and partial assembly
    - Create `pipeline/scan/assemble-result.ts`: per target `guard` around `assembleFacts`, `classify` once per target, `summarize` of `/core`, Source_Statuses, notes (exactly one `scan-deadline-reached` when the deadline was reached), the fields of R18.1 with canonical `repo`; and `assemblePartial(progress, input)` that feeds the same code path from a `ScanProgress`, returning `deadline-exceeded` when discovery is incomplete.
    - _Requirements: 13.5, 13.9, 13.14, 13.16, 16.5, 16.12, 17.7, 18.1, 18.2, 18.8, 18.9, 18.12_

  - [~] 5.25 Write unit tests for result assembly
    - `tests/pipeline/scan/assemble-result.test.ts`: lists have matching lengths, shared targets give equal facts and classifications, unassessed dependencies, the throwing-Mapper guard turns facts all-null, `assemblePartial` with discovery complete and incomplete, `summary` equals `summarize(assessed)`.
    - _Requirements: 13.16, 16.12, 17.7, 18.1, 18.8, 18.9, 18.12_

  - [~] 5.26 Implement `runScan`
    - Create `pipeline/scan/run-scan.ts`: the scan controller and the deadline timer on the injected `Timer` (`SCAN_DEADLINE_MS` after Scan_Start, cleared when the scan settles), stages S1 to S9 in the order of the stage table (S7 and S8 concurrent), `guard` converting a thrown exception into `internal-error`, a `ScanProgress` handle fed as stages finish. Scan_Cache lookup and store are wired in task 7.20.
    - _Requirements: 16.1, 16.3, 16.4, 16.5, 16.9, 16.11, 16.12, 18.7, 21.8_

  - [~] 5.27 Write the unit tests for the stubbed scan cases, part 1
    - `tests/pipeline/scan/run-scan.test.ts`: the cases of R23.12 numbered 1 to 6, each named after the requirement it checks.
    - _Requirements: 23.12_

  - [~] 5.28 Write the unit tests for the stubbed scan cases, part 2
    - `tests/pipeline/scan/run-scan-cases.test.ts`: the cases of R23.12 numbered 7 to 10 and 12. Case 11 (the route with a never-responding upstream) is written in task 9.8.
    - _Requirements: 23.12_

  - [~] 5.29 Write property tests for scan resilience
    - `tests/pipeline/scan/run-scan.property.test.ts` using scripted sources and `tests/support/arbitraries/scripts.ts`.
    - **Property 6: Repository and branch responses give a commit or a typed error** (orchestrator level)
    - **Property 50: One failing source never fails the scan**
    - **Property 51: Facts of failing sources are null**
    - **Validates: Requirements 3.11, 17.10, 17.11**

  - [~] 5.30 Write property tests for scan output
    - Append to `tests/pipeline/scan/run-scan.property.test.ts`.
    - **Property 39: Unassessed dependencies and shared targets**
    - **Property 55: Scan results are deterministic**
    - **Property 56: The summary is the core summary**
    - **Validates: Requirements 13.16, 18.7, 18.8**

  - [~] 5.31 Write property tests for result shape
    - Append to `tests/pipeline/scan/run-scan.property.test.ts`.
    - **Property 57: Result lists have matching lengths**
    - **Property 58: Version fields are consistent**
    - **Validates: Requirements 18.9, 18.12**

  - [~] 5.32 Write the property test for budget sequences
    - Append to `tests/pipeline/scan/github-budget.property.test.ts`.
    - **Property 41: Budget sequences give a result or a typed error**
    - **Validates: Requirements 14.10**

  - [~] 5.33 Write the property test for the deadline
    - Create `tests/pipeline/scan/deadline.property.test.ts` with scripted `fetch` steps on the fake runtime (variants: honors the signal, ignores the signal, a never-settling scan is covered in task 9.11).
    - **Property 48: No attempt is sent at or after the deadline**
    - **Validates: Requirements 16.9**

- [~] 6. Checkpoint - Orchestrator and deadline model
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [ ] 7. Caching
  - [~] 7.1 Implement the in-memory LRU store
    - Create `adapters/cache/memory-cache-store.ts`: `MemoryCacheStore` implements `CacheStore` over an insertion-ordered `Map`, injected `Clock`, expiry when `now < storedAtMs` or `now - storedAtMs >= ttl * 1000`, a hit or `set` makes the key most recent, `set` of a new key at `CACHE_MAX_ENTRIES` evicts the first key, `set` of an existing key evicts nothing, `size()`.
    - _Requirements: 19.1, 19.9, 19.10, 19.11, 19.12_

  - [~] 7.2 Write unit tests for the in-memory store
    - `tests/adapters/memory-cache-store.test.ts`: age `ttl * 1000 - 1` live and `ttl * 1000` expired, clock moving backwards, LRU order, replacing a key restarts the lifetime, `storedAtMs` kept when passed, the Upstream_Cache and Scan_Cache are separate instances.
    - _Requirements: 19.9, 19.10, 19.11, 19.12_

  - [~] 7.3 Write property tests for the in-memory store
    - `tests/adapters/memory-cache-store.property.test.ts`.
    - **Property 59: Cache entries live exactly for their TTL**
    - **Property 60: Caches never exceed their size limit**
    - **Validates: Requirements 19.11, 19.18, 19.12**

  - [~] 7.4 Install `@vercel/functions` and implement the L2 adapter
    - Run `npm install @vercel/functions --save-exact` (a plain `<major>.<minor>.<patch>` string in `dependencies`, no `^` or `~`). Create `adapters/cache/runtime-cache-store.ts`: `RuntimeCacheStore` implements `CacheStore` over `getCache()`; keys `gravekeeper:v<CACHE_KEY_VERSION>:<l2Kind>:<sha256 hex of the L1 key>`; value envelope `{ v: 1, storedAtMs, ttlSeconds, value }` with `ttl` and tag `gravekeeper-v1`; envelope validated on read; every `get` and `set` bounded by `L2_OPERATION_TIMEOUT_MS` on the injected timer; a `scan` value over `L2_MAX_SCAN_BYTES` or an advisory or owners value over `L2_MAX_BODY_BYTES` is not written; every failure is a miss or a skipped write with one Logger line `{ source: 'cache', status: null, durationMs, code: 'l2-cache-error' }`.
    - _Requirements: 19.19, 19.20, 19.23, 19.24, 19.25, 19.26, 19.28_

  - [~] 7.5 Write unit tests for the L2 adapter
    - `tests/adapters/runtime-cache-store.test.ts` and `tests/support/arbitraries/l2.ts` (a fake `getCache` whose `get` and `set` throw, never settle, answer late, return invalid envelopes or answer normally): key format and prefix, envelope validation, `now < storedAtMs` is a miss, timeout at `L2_OPERATION_TIMEOUT_MS`, paused cache, size limits, one log line per failed operation, `getCache` never called when L2 is off.
    - _Requirements: 19.19, 19.23, 19.24, 19.25, 19.26, 19.28_

  - [~] 7.6 Implement the compact L2 encoders
    - Create `pipeline/ports/l2-entries.ts` (pure, imports nothing but `constants.ts`): `compactOsvAdvisory`, `compactDepsDevAdvisory`, `compactCratesOwners`, each taking a body text and returning compact JSON text of the same shape, preserving the edge cases of the "Compact entries" table (non-object or id-less OSV body becomes `{}`, out-of-range score dropped, owner list with no valid entry keeps one `{ kind: 'other' }`, empty list stays empty).
    - _Requirements: 19.27, 19.31_

  - [~] 7.7 Write unit tests for the compact encoders
    - `tests/adapters/l2-entries.test.ts`: fixed bodies per kind, the compact text is smaller, Mapper output on compact and full text is equal for each edge case of the table, a Scan_Result has exactly the top-level keys of R18.1.
    - _Requirements: 19.27, 19.31_

  - [~] 7.8 Write the property test for compact entries
    - `tests/adapters/l2-entries.property.test.ts` over generated OSV, deps.dev and crates.io bodies, including wrong types and invalid owner lists.
    - **Property 71: A compact L2 entry gives the same facts as the full body**
    - **Validates: Requirements 19.31**

  - [~] 7.9 Implement the tiered store
    - Create `adapters/cache/tiered-cache-store.ts`: L1 in front of L2; L2 read and written only when the call carries an `l2Kind` and L2 is enabled; an L2 hit is promoted into L1 with its original `storedAtMs`; the L2 write goes to the `Deferrer`; never throws.
    - _Requirements: 19.11, 19.20, 19.23, 19.24, 19.25_

  - [~] 7.10 Write unit tests for the tiered store
    - `tests/adapters/tiered-cache-store.test.ts`: L1 hit does not touch L2, L2 hit promoted with the original lifetime, kinds outside the three are never read or written in L2, the write is deferred and not awaited, L2 off.
    - _Requirements: 19.20, 19.23, 19.24, 19.25_

  - [~] 7.11 Write the property test for the tiered store
    - `tests/adapters/tiered-cache-store.property.test.ts` with the fake L2 of `tests/support/arbitraries/l2.ts`, generated puts, gets, clock values, L1 resets and L2 failures.
    - **Property 67: Tiered cache behaves like one cache that survives instance loss**
    - **Validates: Requirements 19.11**

  - [~] 7.12 Implement the caching HTTP client
    - Create `adapters/http/caching-http-client.ts`: `CachingHttpClient` decorates an `HttpClient`; a hit returns `ok` or `absent` with `fromCache: true` and `attempts: 0` without a limiter slot, gate call or budget change; a miss stores `{ status, bodyText }` only for `ok` or `absent`, honoring `storeWhen`, compacting for `l2Kind` policies, never storing failures, oversize bodies, 429, GraphQL with a foreign error type, an OSV detail 404 or headers; stored values validated on read.
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.14, 19.17, 19.18, 19.24, 19.27, 15.2_

  - [~] 7.13 Write unit tests for the caching HTTP client
    - `tests/adapters/caching-http-client.test.ts`: a hit sends no request and leaves the budget unchanged, each never-stored case, the deps.dev 404 marker `{ status: 404, bodyText: "" }` is stored and read as `absent`, an OSV detail 404 is not stored, keys do not change with the token, the compact text is what later reads return, an invalid stored value is a miss.
    - _Requirements: 19.2, 19.3, 19.14, 19.17, 19.27_

  - [~] 7.14 Implement Scan_Cache keys
    - Create `pipeline/scan/cache-keys.ts`: `scanCacheKey(parts)` returning `canonicalJson(["scan", CACHE_KEY_VERSION, webHost, owner, repo, branch, defaultBranch, commitSha, sortedManifestPaths])` with canonical (GitHub) spelling never lowercased and paths sorted by code point.
    - _Requirements: 19.5, 19.8, 19.13, 19.15_

  - [~] 7.15 Write unit tests for Scan_Cache keys
    - `tests/pipeline/scan/cache-keys.test.ts`: each field changes the key, owner or repo that differ only in letter case give different keys, path order does not change the key, the token cannot be an input.
    - _Requirements: 19.5, 19.13_

  - [~] 7.16 Write the property test for Scan_Cache keys
    - `tests/pipeline/scan/cache-keys.property.test.ts`.
    - **Property 61: Scan_Cache key identity**
    - **Validates: Requirements 19.13**

  - [~] 7.17 Implement the Scan_Cache store rule and typed cache
    - Create `pipeline/scan/scan-cache.ts`: `storeDecision(statuses, notes, cratesioUnits)` (full TTL when all six statuses are `ok` and no `github-token-missing` note; `PARTIAL_SCAN_TTL_SECONDS` when the only non-`ok` source is `cratesio` with status `partial` and every non-`ok` cratesio unit is a deadline-cancelled or deadline-unstarted owners lookup; otherwise no store), `TypedCache<ScanResult>` with validation on read (`isScanResult`), writes to L1 at once and to L2 through the `Deferrer` only when the serialized result is within `L2_MAX_SCAN_BYTES`.
    - _Requirements: 19.5, 19.6, 19.7, 19.22, 19.28, 19.30_

  - [~] 7.18 Write unit tests for the store rule
    - `tests/pipeline/scan/scan-cache.test.ts`: every row of the rule, a result with `capped.skipped` is stored, a margin-path result is never stored, the partial TTL, an invalid cached value is a miss, a result over `L2_MAX_SCAN_BYTES` stays in L1.
    - _Requirements: 19.5, 19.7, 19.22, 19.30_

  - [~] 7.19 Write the property test for the store rule
    - `tests/pipeline/scan/scan-cache-store-rule.property.test.ts`.
    - **Property 70: A Scan_Result is stored if and only if the store rule holds**
    - **Validates: Requirements 19.30**

  - [~] 7.20 Wire the Scan_Cache into `runScan`
    - Edit `pipeline/scan/run-scan.ts`: after manifest selection build the key from canonical values, return a live entry unchanged (original `asOf`, `sources`, `notes`, expiry untouched) after the three S1 requests only, and apply `storeDecision` after assembly; a result assembled by the margin path is never stored.
    - _Requirements: 19.5, 19.6, 19.7, 19.21, 19.22, 3.13_

  - [~] 7.21 Write unit tests for the cache wiring
    - `tests/pipeline/scan/run-scan-cache.test.ts`: a hit sends only the repository, branch and tree requests, a hit equals the first result, a result with `github-token-missing` is not stored, expiry after `SCAN_CACHE_TTL_SECONDS`, a changed Commit_SHA misses, the partial result of a deadline-cut crates.io lookup is stored for `PARTIAL_SCAN_TTL_SECONDS`.
    - _Requirements: 19.5, 19.6, 19.7, 19.22, 3.13_

  - [~] 7.22 Write property tests for cache hits
    - `tests/pipeline/scan/cache-replay.property.test.ts` with generated spelling variants of one repository resolving to the same canonical repository.
    - **Property 62: A cached scan repeats the result without upstream traffic**
    - **Property 68: A cache hit equals a fresh scan, for every request spelling**
    - **Validates: Requirements 19.16, 19.21**

  - [~] 7.23 Write unit tests for crates.io owner caching
    - `tests/pipeline/scan/crates-order.test.ts`: owners requested in scope order with the caching client in place, an unexpired owners entry in L1 and in L2 sends no request, a 404 marker is read as `absent`, the owners entry outlives the partial Scan_Result (`CRATES_OWNERS_TTL_SECONDS`).
    - _Requirements: 12.13, 12.14, 19.22_

  - [~] 7.24 Write the property test for crates.io lookups
    - Create `tests/pipeline/scan/crates-order.property.test.ts` using the caching client over the scripted source.
    - **Property 74: Crates owners are looked up in scope order and cached owners send no request** (scan level)
    - **Validates: Requirements 12.15**

  - [~] 7.25 Write the property test for L2 failures
    - Append to `tests/adapters/tiered-cache-store.property.test.ts` with full scans over generated L2 failures (throw, timeout, unavailable, paused, invalid envelope), compared with the same scan with `GRAVEKEEPER_RUNTIME_CACHE` equal to `off`.
    - **Property 69: L2 failures never change a result**
    - **Validates: Requirements 19.29**

  - [~] 7.26 Write the property test for tokens in L2
    - Create `tests/adapters/token-leak.property.test.ts` with capturing L1 and L2 stores and upstream stubs that echo the token.
    - **Property 72: The token never reaches an L2 key or value**
    - **Validates: Requirements 19.32**

- [~] 8. Checkpoint - Caching
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [ ] 9. Route handler, fixtures, live tests and CI
  - [~] 9.1 Implement the error union and response builder
    - Create `pipeline/api/scan-error.ts`: `ScanErrorBody`, `ScanResponseBody`, the code to status mapping (400, 404, 405, 413, 415, 500, 502, 503, 504), `details` omitted when a code defines none, and `respond()` that always sets `Content-Type: application/json` and `Cache-Control: no-store`, adds `Allow: POST` for 405 and `Retry-After: ceil((resetAt - asOf) / 1000)` (at least 1) for 503.
    - _Requirements: 21.5, 21.6, 21.7, 21.9, 21.13, 3.7, 14.5_

  - [~] 9.2 Write unit tests for the error mapping
    - `tests/pipeline/api/scan-error.test.ts`: each row of the status table, `Retry-After` rounding and minimum, no `Retry-After` when `resetAt` is not later than `asOf`, `details` omitted not null, headers on every response.
    - _Requirements: 21.5, 21.6, 21.7, 21.9, 21.13_

  - [~] 9.3 Implement the bounded body reader
    - Create `pipeline/api/read-body.ts`: reads the request stream up to `REQUEST_BODY_MAX_BYTES`, checks the declared `content-length` first, strict UTF-8 decoding.
    - _Requirements: 21.3_

  - [~] 9.4 Write unit tests for the body reader
    - `tests/pipeline/api/read-body.test.ts`: body of `REQUEST_BODY_MAX_BYTES` accepted, `+ 1` gives `body-too-large`, declared length over the limit with a short body, invalid UTF-8, empty body, null stream.
    - _Requirements: 21.3_

  - [~] 9.5 Implement request validation
    - Create `pipeline/api/validate-request.ts`: media type check, JSON parse, the field checks of R21.2 in the order of R21.3 (d) to (h) (`repoUrl` string, `branch` string or absent, `manifests` an array of strings of at most the allowed count, unknown fields), branch conflict.
    - _Requirements: 21.2, 21.3, 21.4, 21.15_

  - [~] 9.6 Write unit tests for request validation
    - `tests/pipeline/api/validate-request.test.ts`: each failing field with its `details.reason` and `field`, check order, `application/json; charset=utf-8` accepted, other media types give 415, unknown field, `manifests` over the limit.
    - _Requirements: 21.2, 21.3, 21.4_

  - [~] 9.7 Implement `handleScanRequest`
    - Create `pipeline/api/handle-scan-request.ts`: order method (405, body untouched), media type (415), body read (413), JSON (400), fields, configuration (`readGithubConfig`), URL (`parseRepoUrl`), branch, branch conflict, then one `clock()` reading for `startedAtMs` and `asOf`, then `runScan` raced against the margin timer (`SCAN_DEADLINE_MS + SCAN_RESPONSE_MARGIN_MS` after Scan_Start); on the margin the progress is closed, a late scan result is discarded and never cached, and `assemblePartial` answers. The route-level `guard` converts exceptions into `internal-error`.
    - _Requirements: 21.1, 21.3, 21.8, 21.10, 21.13, 21.14, 21.15, 6.1, 16.12, 16.13, 2.11_

  - [~] 9.8 Write unit tests for `handleScanRequest`
    - `tests/pipeline/api/handle-scan-request.test.ts`: validation order, 405 before the body is read, configuration error before `invalid-url`, branch from URL and body, the margin path with a never-settling `runScan` (answers a partial result or `deadline-exceeded` no later than 26.5 s on the fake clock), and case 11 of R23.12 (never-responding upstream through the real HTTP client).
    - _Requirements: 21.3, 21.13, 21.14, 21.15, 16.12, 16.13, 23.12_

  - [~] 9.9 Write the property test for the route union
    - `tests/pipeline/api/handle-scan-request.property.test.ts` over any method, `Content-Type`, body bytes (including bodies around `REQUEST_BODY_MAX_BYTES`).
    - **Property 64: The route always answers with the declared union**
    - **Validates: Requirements 21.12**

  - [~] 9.10 Write the property test for branch resolution
    - Append to `tests/pipeline/api/handle-scan-request.property.test.ts`.
    - **Property 65: Branch from the body and the URL**
    - **Validates: Requirements 21.15**

  - [~] 9.11 Write the property test for the response deadline
    - Append to `tests/pipeline/scan/deadline.property.test.ts` (three variants: sources that honor the signal, sources that ignore it, and a never-settling `runScan` for the margin path).
    - **Property 49: A response arrives within the deadline plus margin**
    - **Validates: Requirements 16.13**

  - [~] 9.12 Create the public entry point of the pipeline
    - Create `pipeline/index.ts` exporting `runScan`, `handleScanRequest`, `RawScanRequest`, `ApiResponse` and the public types. No default export.
    - _Requirements: 21.10, 22.8_

  - [~] 9.13 Implement the production composition
    - Create `adapters/composition.ts`: `createProductionDeps(env, deferrer, config)` builds the system clock, timer, random and logger, the shared `HttpClient` (limiters from `CONCURRENCY_*` and `CRATESIO_MIN_INTERVAL_MS`, authorizer, secrets), the six sources, the caching client, and the two stores (module-scope `globalThis` singletons for L1; `TieredCacheStore` with `RuntimeCacheStore` unless `GRAVEKEEPER_RUNTIME_CACHE` is `off`). It is the only module that reads `process.env`, through `adapters/runtime/env.ts` and `token-reader.ts`.
    - _Requirements: 19.19, 20.1, 22.5, 22.9, 22.17_

  - [~] 9.14 Write unit tests for the composition
    - `tests/adapters/composition.test.ts`: `off` builds no `RuntimeCacheStore` and never calls `getCache`, unset, empty and any other value enable L2, singletons survive two calls, the token reaches only the authorizer.
    - _Requirements: 19.19, 20.1_

  - [~] 9.15 Implement the route handler
    - Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `03-api-reference/03-file-conventions/route.md`, `.../02-route-segment-config/maxDuration.md`, `.../runtime.md` and `04-functions/after.md` first (AGENTS.md). Create `app/api/scan/route.ts`: `export const maxDuration = 30;` as a number literal, named exports `POST`, `GET`, `HEAD`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` that call one `handle` function, a `Deferrer` backed by `after`, `Response.json(body, { status, headers })` (empty body for `HEAD`). No `runtime`, `dynamic`, `revalidate` or `fetchCache` export. It is the only file outside `/adapters` that imports `adapters`.
    - _Requirements: 21.1, 21.9, 21.10, 21.11, 21.13, 21.16, 22.10_

  - [~] 9.16 Write unit tests for the route
    - `tests/app/scan-route.test.ts`: `route.ts` text checks (`maxDuration` is a number literal equal to `ROUTE_MAX_DURATION_SECONDS`, no `runtime`, `dynamic`, `revalidate`, `fetchCache` exports, seven method exports, no scan logic), each non-POST method answers the JSON 405 with `Allow: POST`, `HEAD` has an empty body with the same status and headers.
    - _Requirements: 21.9, 21.10, 21.11, 21.13, 21.16_

  - [~] 9.17 Write the property test for the token in every sink
    - Append to `tests/adapters/token-leak.property.test.ts`: sinks are every Logger line, every returned or thrown error message, the serialized Scan_Result and Scan_Error, the route response headers and body, and every key and value of the Upstream_Cache, the Scan_Cache and the L2 store; upstream stubs echo request headers in bodies and in GraphQL `errors[].message`, with 4xx, 5xx, timeout, redirect and unparsable answers.
    - **Property 63: The token never reaches a sink**
    - **Validates: Requirements 20.8, 20.9, 20.12**

  - [~] 9.18 Implement the fixture recorder
    - Create `scripts/record-fixtures.ts` and `scripts/fixtures/` helpers (`allowHeaders`, `assertNoSecrets`, staging in `tests/fixtures/.recording-<name>/`, size check against `FIXTURE_SET_MAX_BYTES` over every file of the set, replay check of R23.4 before replacing `tests/fixtures/<name>/`), a `RecordingHttpClient` around the production client with empty caches and no L2, the layout of the design (`metadata.json`, `index.json`, `responses/<source>/<hash16>.json`, byte-exact `bodyText`), refusal when `GRAVEKEEPER_LIVE_TESTS` is not `1` or `GITHUB_TOKEN` is unset, and the three supplementary recordings. Add `"fixtures:record": "tsx scripts/record-fixtures.ts"` to `package.json`.
    - _Requirements: 23.2, 23.3, 23.4, 23.6, 23.7, 23.10, 23.16, 20.13_

  - [~] 9.19 Write unit tests for the recorder
    - `tests/pipeline/record-fixtures.test.ts`: only allow-listed headers written (a response with `Authorization`, `set-cookie`, `x-request-id` writes none), `assertNoSecrets` rejects the token, `Bearer `, `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_` and an `Authorization` header, refusal without the flag or token, an oversized set is refused with the five largest files named and nothing written, previous fixtures unchanged after a rejection.
    - _Requirements: 23.6, 23.7, 23.10, 23.16, 20.13_

  - [~] 9.20 Implement fixture replay
    - Create `tests/support/fixture-http-client.ts` (`FixtureHttpClient` implements `HttpClient`, key from `requestKey`, `misses`, `assertNoMisses()` failing with `fixture missing for source <name>: <METHOD> <path>` with no query string and no header) and `tests/support/fixture-fetch.ts` (a `fetch` implementation answering from the fixture index).
    - _Requirements: 23.1, 23.3_

  - [~] 9.21 Write unit tests for fixture replay
    - `tests/support/fixture-http-client.test.ts`: a recorded request is answered with `ok` or `absent`, an unknown request is a `failed` `http-error` and is reported by `assertNoMisses()` without a query string, `fixture-fetch` answers a recorded URL.
    - _Requirements: 23.1, 23.3_

  - [~] 9.22 Write the fixture hygiene and size tests
    - `tests/fixtures/fixtures-hygiene.test.ts` (every file under `tests/fixtures` scanned recursively for the token when set, `Bearer `, token prefixes and `Authorization`) and `tests/fixtures/fixtures-size.test.ts` (every Fixture_Set at most `FIXTURE_SET_MAX_BYTES`, summing all files). Both run in every test run.
    - _Requirements: 23.6, 23.16_

  - [~] 9.23 Record the fixture sets
    - With `GRAVEKEEPER_LIVE_TESTS=1` and the user's `GITHUB_TOKEN` set (ask the user to provide it if it is unset, and do not print or store it), run `npm run fixtures:record` for `request/request` (npm), `revmic/canopy` (Python) and `ajeetdsouza/zoxide` (Rust) and for the supplementary sets `ef8-withdrawn`, `ef10-informational` and `ef19-not-found-alias`. Confirm that each recorded set passes the hygiene and size tests.
    - _Requirements: 23.2, 23.3, 23.4, 23.16_

  - [~] 9.24 Write the fixture coverage test
    - `tests/pipeline/fixtures-coverage.test.ts`: for every verified row of `endpoint-fact-map.ts` except EF-4 (and except EF-11, EF-23, EF-24 and the Not verified paths of R23.13), at least one recorded response contains every path; a failure reads `EF-<n> <source> missing path <path>`.
    - _Requirements: 23.13_

  - [~] 9.25 Write the fixture scan test
    - `tests/pipeline/fixtures-scan.test.ts`: for each recorded repository run `runScan` twice with empty caches over `CachingHttpClient(FixtureHttpClient)`, real sources and a fake runtime whose clock is `Date.parse(metadata.asOf)`; assert equal results, `ok` true, and at least one dependency with `archived` or `deprecated` true; `assertNoMisses()` in `afterEach`.
    - _Requirements: 23.2, 23.3, 23.4, 23.5_

  - [~] 9.26 Add the route smoke scan
    - Append to `tests/app/scan-route.test.ts`: install `fixture-fetch.ts` and run one scan of a recorded repository through the exported `POST` handler, asserting status 200, `ok: true` and `Cache-Control: no-store`.
    - _Requirements: 21.1, 21.7, 21.9, 23.2_

  - [~] 9.27 Implement the live test support
    - Create `tests/live/live-support.ts`: `LIVE` flag helper (`GRAVEKEEPER_LIVE_TESTS === '1'`), `it.skipIf` wrapper, the token skip with the reason `GITHUB_TOKEN not set` for EF-17, EF-18 and EF-19, a failure formatter that names only row id, source and path, and a path checker that reuses `endpoint-fact-map.ts`.
    - _Requirements: 23.8, 23.9, 23.14, 23.15_

  - [~] 9.28 Write the GitHub live contract tests
    - `tests/live/github.live.test.ts`: one test per verified GitHub row (EF-12 to EF-19) against the real API; EF-17, EF-18 and EF-19 skipped without a token.
    - _Requirements: 23.8, 23.9, 23.14, 23.15_

  - [~] 9.29 Write the deps.dev live contract tests
    - `tests/live/depsdev.live.test.ts`: EF-1, EF-2 and EF-25 (including the 404 of the withdrawn advisory id).
    - _Requirements: 23.8, 23.9, 23.15_

  - [~] 9.30 Write the OSV live contract tests
    - `tests/live/osv.live.test.ts`: EF-5 to EF-10.
    - _Requirements: 23.8, 23.9, 23.15_

  - [~] 9.31 Write the registry live contract tests
    - `tests/live/registries.live.test.ts`: EF-20 (npm), EF-21 (crates.io, with `User-Agent`), EF-22 (PyPI).
    - _Requirements: 23.8, 23.9, 23.15_

  - [~] 9.32 Write the versionbatch live contract test
    - `tests/live/deps-dev-versionbatch.live.test.ts`: one `POST https://api.deps.dev/v3alpha/versionbatch` with an `NPM`, a `PYPI` and a `CARGO` `versionKey` taken from the fixture repositories; check `responses[].request.versionKey.system`, `.name`, `.version` and `responses[].version`; every `responses[]` entry matches a request by `request.versionKey` and every request has a matching entry; a failure is reported under R23.15.
    - _Requirements: 23.17, 8.8, 8.9, 23.15_

  - [~] 9.33 Write the live gating test
    - `tests/live/live-gating.test.ts`: with the flag unset every live test reports as skipped (not passed) and the offline `fetch` stub records no call; with a token unset the three GraphQL rows are skipped with the stated reason.
    - _Requirements: 23.9, 23.14_

  - [~] 9.34 Wire CI and the manual live workflow
    - Verify `.github/workflows/ci.yml` runs, in order, `npm ci`, `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture`, `npx vitest --run`, with no live flag and no token. Add `.github/workflows/live.yml` (`workflow_dispatch` only) that sets `GRAVEKEEPER_LIVE_TESTS=1`, passes `GITHUB_TOKEN` from repository secrets and runs the live tests. Add `tests/ci-config.test.ts` asserting the order of the CI steps and that `ci.yml` never sets `GRAVEKEEPER_LIVE_TESTS`.
    - _Requirements: 22.16, 23.1, 23.8, 23.9_

- [~] 10. Final checkpoint - Route handler, fixtures, live tests and CI
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

## Notes

- Every task, including the property-based tests, is required. Nothing is marked optional.
- Each property test carries the tag comments from `design.md` (`// Feature: scan-pipeline, Property N: ...` and `// Validates: Requirements X.Y`) and uses `cfg()` from `tests/support/fc-config.ts`.
- `/core` is not edited. `@vercel/functions` is installed in task 7.4 only, with an exact pin.
- Handoff: the groups after checkpoint 1 (task 2) are executed in later sessions. Work through the tasks up to and including checkpoint 1 first, in this order: group 1, then groups 2 (tasks 3 and 4), 3 (tasks 5 and 6), 4 (tasks 7 and 8) and 5 (tasks 9 and 10) in separate sessions.
- Task 9.23 needs the user's `GITHUB_TOKEN` and network access. Ask the user before running it.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.6", "1.8", "1.12", "1.13", "1.14", "1.15"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.7", "1.9", "1.10", "1.16", "1.21", "1.22", "1.26"] },
    { "id": 2, "tasks": ["1.3", "1.5", "1.11", "1.17", "1.23", "1.27", "1.29", "1.32", "1.38", "1.44", "1.54", "1.56", "1.59", "1.62"] },
    { "id": 3, "tasks": ["1.18", "1.19", "1.24", "1.28", "1.30", "1.33", "1.35", "1.39", "1.41", "1.45", "1.51", "1.55", "1.57", "1.60", "1.63", "1.65"] },
    { "id": 4, "tasks": ["1.20", "1.25", "1.31", "1.34", "1.36", "1.40", "1.42", "1.46", "1.47", "1.52", "1.58", "1.61", "1.64", "1.66"] },
    { "id": 5, "tasks": ["1.37", "1.43", "1.48", "1.53", "1.67", "1.68"] },
    { "id": 6, "tasks": ["1.49", "1.69", "1.71"] },
    { "id": 7, "tasks": ["1.50", "1.70", "1.72"] },
    { "id": 8, "tasks": ["1.73"] },
    { "id": 9, "tasks": ["1.74"] },
    { "id": 10, "tasks": ["3.1", "3.4", "3.7", "3.9", "3.11", "3.13", "3.15", "3.16", "3.26", "3.28"] },
    { "id": 11, "tasks": ["3.2", "3.5", "3.8", "3.10", "3.12", "3.14", "3.17", "3.18", "3.27", "3.29", "3.30", "3.33", "3.35", "3.37", "3.39", "3.41"] },
    { "id": 12, "tasks": ["3.3", "3.6", "3.19", "3.20", "3.31", "3.34", "3.36", "3.38", "3.40", "3.42"] },
    { "id": 13, "tasks": ["3.21", "3.22", "3.32"] },
    { "id": 14, "tasks": ["3.23"] },
    { "id": 15, "tasks": ["3.24"] },
    { "id": 16, "tasks": ["3.25"] },
    { "id": 17, "tasks": ["5.1"] },
    { "id": 18, "tasks": ["5.2", "5.4", "5.7"] },
    { "id": 19, "tasks": ["5.3", "5.5", "5.8", "5.10", "5.24"] },
    { "id": 20, "tasks": ["5.6", "5.9", "5.11", "5.12", "5.16", "5.25"] },
    { "id": 21, "tasks": ["5.13", "5.14", "5.17", "5.18"] },
    { "id": 22, "tasks": ["5.15", "5.19", "5.20", "5.22"] },
    { "id": 23, "tasks": ["5.21", "5.23", "5.26"] },
    { "id": 24, "tasks": ["5.27", "5.28", "5.29", "5.32", "5.33"] },
    { "id": 25, "tasks": ["5.30"] },
    { "id": 26, "tasks": ["5.31"] },
    { "id": 27, "tasks": ["7.1", "7.4", "7.6", "7.14"] },
    { "id": 28, "tasks": ["7.2", "7.5", "7.7", "7.9", "7.15"] },
    { "id": 29, "tasks": ["7.3", "7.8", "7.10", "7.12", "7.16", "7.17"] },
    { "id": 30, "tasks": ["7.11", "7.13", "7.18", "7.20"] },
    { "id": 31, "tasks": ["7.19", "7.21", "7.25", "7.26"] },
    { "id": 32, "tasks": ["7.22", "7.23"] },
    { "id": 33, "tasks": ["7.24"] },
    { "id": 34, "tasks": ["9.1", "9.3", "9.20", "9.22", "9.27", "9.34"] },
    { "id": 35, "tasks": ["9.2", "9.4", "9.5", "9.21", "9.28", "9.29", "9.30", "9.31", "9.32"] },
    { "id": 36, "tasks": ["9.6", "9.7", "9.33"] },
    { "id": 37, "tasks": ["9.8", "9.11", "9.12"] },
    { "id": 38, "tasks": ["9.9", "9.13"] },
    { "id": 39, "tasks": ["9.10", "9.14", "9.15", "9.18"] },
    { "id": 40, "tasks": ["9.16", "9.17", "9.19"] },
    { "id": 41, "tasks": ["9.23"] },
    { "id": 42, "tasks": ["9.24", "9.25", "9.26"] }
  ]
}
```
