# KIRO_LOG

Raw notes for the write-up. After each session: what I asked, what Kiro did well, where Kiro erred.

## Session 1
- Asked: create steering files (product, tech, structure) with no application code.
- Did well: (fill in after review)
- Erred: (fill in after review)

## Session 2
- Asked: requirements-only spec for dependency-graveyard-core (parsers, classifier, repo summary) with PBT-tagged EARS criteria.
- Did well: (fill in after review)
- Erred: (fill in after review). Note for write-up: automatic requirement detailing added two criteria that contradicted the spec (error on invalid flags, reason without ruleId); I removed them while merging.

## Session 3
- Asked: apply 6 requirement changes (daysSinceLastCommit, combined-score strictness, monotonicity, sourceKind, richer summary/grade, clock rule), commit, then produce design.md only.
- Did well: (fill in after review)
- Erred: (fill in after review). Note: design surfaced real conflicts in the requirements (3.8 vs 4.6 duplicate keys, 10.12 vs unknown severity).

## Session 4
- Asked: resolve design open questions (dedupe by (name, scope), sorted output, known-severity monotonicity, smol-toml pinned), update requirements and design, generate tasks.md, then execute through the parsers group.
- Did well: design review caught real requirement conflicts before any code was written; subagent applied the resolutions consistently across all three docs.
- Erred: (fill in after review). Note: design phase left 4 new minor open items; I took the design's recommended defaults and recorded them in tasks.md.

## Session 5
- Asked: stop rejecting non-normalized Python names (PEP 503 normalize + rawName), add idempotence property, move all design defaults into numbered criteria; update all three docs, no execution.
- Did well: (fill in after review). Design update caught a new round-trip conflict (backslash in git/path specs vs 5.13) before any code existed.
- Erred: (fill in after review). Note: Kiro's earlier D1 rule rejected Django/PyYAML, a real-world miss the user had to catch. Also: task execution could not start in session 4 because task status must be set via the task UI.

## Session 6
- Asked: record open-question resolutions (smol-toml latest pinned, grade thresholds A-F, position-free Cargo first occurrence), then execute tasks 1-6 with commits per group.
- Did well: 402 tests, 38 property tests; all property tests passed at 100 and 1000 runs. Task status now driven through the task tool.
- Erred: (fill in after review). I edited tasks.md text directly once and the task tool refused to save until I reverted it.

### Counterexamples and bugs found
- Property tests: no counterexample against production code in tasks 5.9-5.33 (runs: 100 default, 1000-5000 on request).
- Generator bugs caught by the parser (not production bugs): 5.20 generator emitted duplicate inline-table key `features` and a multi-line array inside an inline table (both invalid TOML; parser warning was correct). 5.15 test appended `__proto__` lines with a different EOL than the generated text, so a trailing `\`+CR joined lines.
- Unit-test bug (5.29): package.json writer emitted `"dependencies"` twice for input [a runtime, b dev, c runtime] (name-sorted walk opened a new section on every scope change). Broke 5.12 section order and produced a duplicate JSON key. Fixed: write sections by SCOPE_ORDER, each once.
- Spec ambiguities found and resolved: criterion 1.9 `a/b#` (empty ref) — core said git, oracle said registry; 1.9 clarified to allow an empty ref (git). Cargo writer table order contradicted SCOPE_ORDER; switched to [dependencies], [dev-dependencies], [build-dependencies].
- Open: `__proto__` cannot be a requirements.txt name (2.8 requires a leading alphanumeric), so Property 8 for that format only checks clean rejection.
- Disclosed narrowing: 5.21 Cargo duplicate generator always tags table entries with a unique version so the kept occurrence is identifiable; version-less tables stay covered by Property 3 tests.

## Notes for the write-up (written by Kiro)
- Parallel execution: Kiro did not run the plan as one long sequential script. It read the task dependency graph, picked every task whose inputs were ready, and handed up to five of them at once to separate sub-agents. Each sub-agent was told which files the others were writing at the same moment, and the reports show it ("another agent is writing finish.ts", "the orchestrator needs to mark it complete"). The orchestrator only updated task status, committed per group and checked results.
- Logic gap found in my own requirement: I asked for a repo grade equal to "the worse of the average-based grade and the worst-package grade" with one set of thresholds. While writing the design, Kiro pointed out that the maximum score is always at least the average, so the worse of the two grades is always just the worst-package grade, and the average-based half of the rule never matters. The rule looked reasonable in prose and would have shipped as dead logic. Because the spec forced every rule into a precise, numbered criterion with a property attached, the redundancy became visible before any code existed. Decision: grade = grade(maxScore); averageScore stays as a plain number.

## Session 7
- Asked: accept checkpoint 6 decisions, simplify the grade rule, fresh-clone check, add CI, then run the classifier and summary groups to the end.
- Fresh clone of 97a825c: npm ci, typecheck, lint, check:core and vitest (20 files, 402 tests) all passed. Nothing missing from package.json (tsx is in devDependencies).
- CI: first run of .github/workflows/ci.yml on push passed (Node 22; typecheck, lint, check:core, vitest).

### Counterexamples and bugs (session 7, tasks 7.1-7.21)
- Property 24 (unknown severity scores like MEDIUM) FAILS, spec conflict, execution stopped at task 7.21. FC_NUM_RUNS=5000, seed 1772739691, path 420:1:3:3:5. Shrunk input: {daysSinceLastRelease:0, daysSinceLastCommit:0, archived:false, deprecated:false, maintainerCount:100, openVulnerabilityCount:0, maxSeverity:null} vs the same with maxSeverity:"MEDIUM". Same status, score, flags. Reasons: unknown -> ["6.3"], known -> ["11.2"]. After removing 6.3 from both, [] != ["11.2"]. Cause: 11.2 ("no risk signals") appears only when no other Reason exists, so a lone 6.3 suppresses it. Awaiting user decision.
- Generator bugs (test code, caught by oracle assertions): arbWrongType can yield valid severity strings like "LOW" (Property 24 "unknown" side was sometimes known); arbBadNumber includes 0.5, a valid day count (Property 28 "unknown commit" route was sometimes known). Both generators were replaced with values that are unknown by construction.
- Test-construction bug (7.18): fast-check probes values given to constantFrom, which tripped a throwing Proxy trap before classify saw it; fixed by generating factories.
- No other property failures in 7.8, 7.9, 7.18-7.20 (default runs and 2000-3000 runs).
- User decision on Property 24: ignore both 6.3 and 11.2 when comparing Reason sequences (criterion 10.24 and Property 24 amended). Classifier behaviour unchanged.
- Group 9 (repo summary, tasks 9.1-9.19, checkpoint 10): no property counterexample against production code (Properties 32-46, up to 5000 runs). Test-code issues only: in 9.16 an import edit did not apply (CRLF file), so the first "counterexamples" were ReferenceErrors, not product failures.
- Final checkpoint: 34 test files, 686 tests, 77 property tests (75 fc.assert), Property IDs 1-46 all covered; passes at 100 and 1000 runs.

## Session 8
- Asked: housekeeping (export Result/SerializeError, fix vuln-cap text, CI actions v5), three hooks (related tests on save, check:core on save, manual Spec sync), then requirements only for a new scan-pipeline spec with every endpoint field checked against real responses.
- Did well: (fill in after review). Endpoint shapes were checked with real HTTP calls; this found that OSV querybatch returns no severity (only ids), severity is a CVSS vector string, RustSec "informational" advisories (e.g. "failure is unmaintained") are not vulnerabilities, PyPI does expose owners via ownership.roles, and GraphQL returns partial data with NOT_FOUND errors per alias.
- Erred: (fill in after review). No fetch MCP server is configured, so verification used PowerShell and gh instead; the table says so. Requirement detailers had no file-write tool; first attempt tried temp files, user asked to write the detailed text straight into requirements.md.

## Session 9
- Asked: confirm spec location, apply scan-pipeline decisions (unmaintained -> deprecated, single 25 s deadline with abort, deps.dev advisory score), ignore tsconfig.tsbuildinfo, analyze requirements, commit, then design.
- Live check: deps.dev GET /v3/advisories/{id} returns a numeric cvss3Score (GHSA-p8p7-x288-28g6 = 6.1) but no withdrawn or informational flag; RUSTSEC-2020-0036 ("failure is unmaintained") scores 9.8 there. So the score is the primary severity source, but the OSV detail request is still needed to exclude informational and withdrawn advisories.
- Analyze Requirements failed twice with an internal service error (-32603), probably the 160 KB document size; a reviewer pass replaced it: 38 findings, 33 fixed in place, 5 new open questions (OQ 29-33).
- Erred: (fill in after review). A sub-agent's regex replace deleted most of the Open questions section and it rebuilt it from memory; numbering 1-28 checked afterwards.

## Session 10
- Asked: close OQ 29-33 (canonical owner/repo/branch from GitHub so a cache hit equals a fresh scan), Vercel Runtime Cache on by default as L2, crates.io owner caching and partial-scan TTL, maxDuration 30, every design constant in the requirements table, fixture sets under 1 MiB; then tasks and execution through the mapping group.
- Measured fixture sizes live: home-assistant/core's tree response alone is 8.9 MB (about 45 MB for the set), so it was replaced by revmic/canopy (Flask-Script==0.6.6 -> source repo resolves to smurfix/flask-script, isArchived true). request/request 0.81 MB, revmic/canopy 0.79 MB, zoxide 0.43 MB (estimates).
- Found: PyPI /pypi/{name}/json is over MAX_RESPONSE_BYTES for popular packages (sqlalchemy 6.06 MB, aiohttp 9.5 MB), so maintainerCount would often be unknown; the per-version endpoint has ownership and is ~60-100 KB. Raised as OQ-D11.
- Decision Kiro made: the Scan_Cache key now includes branch and defaultBranch so "cache hit equals fresh scan" can hold for two branches at the same commit.

### Session 10 execution (scan-pipeline group 1) - stopped on a counterexample
- Property 5 (GitHub configuration, Requirement 2.10) FAILS, spec wording conflict, task 1.28 left in progress. Seed -914370393, path 97:0:0:0:0:0:0:1. Shrunk input: GITHUB_API_URL = "http://a.aa", GITHUB_GRAPHQL_URL = " " (one space). The config is correctly rejected with the fixed message "GITHUB_API_URL is not a supported GitHub API URL.", but the property says the message must not contain either input string, and " " is a substring of every multi-word message (so is "T", "_", "."). Code behaves as designed; the property wording cannot hold for fixed messages and short inputs. Awaiting user decision. Property, generator and code unchanged.
- Architecture check caught a real violation during the group: pipeline/mapping/rate-limit.ts imported a type from pipeline/ports (mappers may import only core, mapping and constants); fixed with a local structural type.
- Spec text drift found: task 1.29 says a date after asOf gives null; requirement 6.4 says 0. Code and tests follow the requirement.

### Session 11 (scan-pipeline group 1, continued) - stopped on a second counterexample
- Decisions applied: Property 5 reworded (message is a member of the fixed set); PyPI maintainers from /pypi/{name}/{version}/json (verified live: keys info, last_serial, ownership, urls, vulnerabilities; sqlalchemy 2.0.36 is 58,684 bytes, was 6.06 MB for the project doc); GraphQL unattributable errors rule R11.15/R11.16 with Property 75.
- Property 19 (deps.dev versionbatch result independent of response order) FAILS. Seeds 838385792 (path 15:2:3:7:9:8:8:8:7:10:10), 1469598630, -1032675152. Shrunk: two responses with the same versionKey (NPM c 1.0.0), one without version, one with relatedProjects SOURCE_REPO github.com/o/r. Criterion 8.9 says "first matching entry in array order wins", so the result depends on order; Property 19 says "any permutation". The two contradict for duplicate keys. Code follows 8.9; test left failing locally and NOT committed. Awaiting user decision.
- Test-side counterexample (fixed in the test, not the code): GraphQL P33 seed -1816785734, input committedDate "2024-02-30T00:00:00Z"; the test used Date.parse (accepts Feb 30) to judge validity, the code correctly rejects it.
- Overwritten test files reviewed: helpers.test.ts covered every task 1.9 bullet (2 tests added); fake-runtime.test.ts covered every task 1.11 bullet. Neither had an earlier committed version.

### Session 12 (scan-pipeline group 1 finished, checkpoint 2)
- Asked: finish scan-pipeline group 1 (1.37, 1.49-1.50, 1.67, 1.69-1.74) and run the checkpoint with my 4 decisions (P19 option A distinct keys, 9.6 unmaintained note wins, missing alias + own NOT_FOUND -> not-found, default_branch length in code points).
- Did well: parallel waves with one owner per file, registry-driven P16/P17 over every endpoint-fact-map path, no property weakened. Checkpoint: typecheck, lint, check:core, check:architecture all exit 0; vitest 72 files, 1357 tests pass (3.64 s); tests/pipeline + tests/architecture at FC_NUM_RUNS=1000: 37 files, 660 tests pass (11.83 s).
- Went wrong: test-side counterexample in P33 (Date.parse accepted "2024-02-30", seed -1816785734), fixed in the test. A sub-agent left FC_NUM_RUNS=3000 set in the shell after a timeout, so "default" runs were really 3000 until noticed. One dispatch failed on a network error and was retried.
## Session 13
- Asked: P<n> title prefixes on tests plus docs/property-traceability.md, then run scan-pipeline groups 2-5 continuously.
- Did well: group 2 ran in parallel waves with a single owner per file, no property was weakened. Checkpoint 4: typecheck, lint, check:core, check:architecture all exit 0; vitest 94 files, 1576 tests pass (4.86 s); tests/adapters + tests/pipeline/scan at FC_NUM_RUNS=1000: 21 files, 212 tests pass (1.50 s).
- Went wrong: two sub-agent dispatches failed on network errors (ENOTFOUND) and were retried; the PyPI port was still on the old whole-project signature and had to be updated; one P46 test-side assertion was over-strict.
### Decisions
- deps-dev untagged permutation test titled P18 (P<n> prefix task).
- retry-policy: `decideAfterAttempt` takes extra inputs `source`, `notFound`, `gateAllows`; exhausted attempts fail with the last attempt's reason; relative `Location` resolved against the current URL (R15.19 reading); a huge `Retry-After` fails as `deadline` because R15.8 checks the deadline first.
- Concurrency limiter takes a third `{clock, timer}` parameter.
- `scrubSecrets`: `Bearer ` prefix matched case-insensitively; longest match first; overlapping distinct secrets may leave a non-secret fragment (R20.8 still holds).
- Body reader decodes UTF-8 non-fatally (U+FFFD); JSON parsing rejects garbage downstream.
- Runtime adapters exported as `systemClock`, `systemTimer`, `systemRandom`, `consoleLogger`; logger writes one JSON line per attempt with the four LogEntry fields.
- `env.ts`: `RuntimeEnv` defined there; `DEFAULT_USER_AGENT='gravekeeper'`; empty `GRAVEKEEPER_USER_AGENT` falls back to the default; only exact `off` disables L2.
- Offline guard registered in `vitest.config.mts` (the repo's config is .mts, not .ts); guard self-test uses a child vitest run on a fixture.
- `GithubBudget.observeGraphql(body)` added; the orchestrator must call it for GraphQL bodies.
- `TextResult = SourceResult<string>`; a JSON scalar body counts as ok.
- GitHub authorizer compares `URL.host` (host + port) case-insensitively.
- deps.dev version and versionbatch 404 -> failed; deps.dev and OSV batches over their size limit return failed `http-error` without sending (OSV changed from silent truncation).
- GitHub manifest 404 -> failed (R3.9); GHES blobs requested with the raw Accept header; GHES without tree-entry SHA -> failed without sending.
- npm scoped names use plain `encodeURIComponent` (`%40scope%2Fname`) per design.md; live contract test to confirm.
- PyPI port updated to `getProject(name, version, ctx)` (per-version endpoint); the adapter does not normalize names (parser already does).
- HTTP client: request headers win over the default User-Agent; body read only for 2xx; caching left to the later CachingHttpClient (`fromCache` false); fetch raced against abort so a hung fetch still settles.
- Open item for group 3: the GitHub adapter encodes the branch once; the orchestrator must pass the decoded branch name, not the percent-encoded canonical form.
- Counterexamples: P46 test-side only (assertion required exactly k+1 waits; scripted last step repeats, so further retries schedule more waits; changed to at least k+1; property unchanged).
- Group 3 checkpoint: typecheck, lint, check:core, check:architecture all exit 0; vitest 112 files, 1852 tests pass (5.30 s); tests/pipeline/scan at FC_NUM_RUNS=1000: 20 files, 294 tests pass (3.41 s).
- User-facing messages: texts supplied by the user, added to requirements.md as the "User-facing messages" table (R20.14-R20.16, P76); invalid-request reason phrases written by Kiro under the style rules; config internal-error messages moved to pipeline/config/config-messages.ts.
- User decisions this session: `branch-not-found` carries `details.branch`; validated Source_Repo owner/repo is an allowed interpolation; invalid `default_branch` is always `upstream-unavailable` (R3.9, option B), `readRepository(body)` lost its `requestedBranch` parameter.
- messages.ts holds its own copy of the invalid-url texts; a test pins them equal to parse-repo-url.ts and to the spec table (parsed at test time).
- `renderErrorMessage` never throws (unknown part -> url row, unknown reason -> invalid-type, missing placeholder -> empty string); builder lists (pins, ids) are sorted and de-duplicated.
- targets.ts leaves git/path deps out of Lookup_Targets; the assembler keeps them unassessed. versionSpecs keep duplicates; pins come from exactPin.
- Source status: OSV truncation passed as `osvTruncated`; duplicate unit keys ignored (first outcome stands).
- run-unit: `unparsable` 2xx body recorded as failed `http-error` (design D5); a throwing/rejecting source call is a `network` failure; runner is a per-scan `createUnitRunner(ledger, signal)`.
- Discovery: repository request always first; budget checked before each request (`budget` unit + upstream-unavailable); unit keys `github:repository|branch|tree`; tree 404 stays upstream-unavailable.
- Registry stage S5 has no PyPI; PyPI per-version request sits in S6 (stage-versions) after the Selected_Version; owners started in `orderCratesLookups` order.
- Version stage: batch failure/unparsable/no `responses` -> single version docs + one `batch-fallback` note; no note when singles start after the deadline; OSV length mismatch -> failed `http-error`; `prerequisite` unit only for a failed/unparsable deps.dev package request.
- Repo-facts stage: `github-token-missing` note whenever no token (R11.8 is unconditional); `github-budget-low` once the gate closes; repos matched case-insensitively.
- Advisory stage: OSV detail failure is not in `unfetchedIds` (assembleFacts treats it as unfetched); deps.dev failure only drops the score.
- Result assembly: notes sorted by code then canonical details JSON (R18.5); `PartialProgress.snapshot` added in assemble-result.ts and filled by runScan; runtime /core imports are relative because vitest has no `@/` alias.
- runScan: selection runs twice (selectManifestStage then runManifestStage), pure; Scan_Cache hook point left for 7.20 after S2.
- Counterexamples (group 3): none in product code; test-side only: P58 harness gitShadow entries (non-registry entries must be null/null; property reading corrected, not weakened) and P57 harness never selected sub/package.json (harness now passes the manifest list; this also made the `sub` extra effective in P39/P55/P56).
- `@vercel/functions` 3.11.3 installed with an exact pin; `getCache` injected into RuntimeCacheStore (the adapter never imports the package); `name: ''` passed on set.
- L2 size limit measured on the serialized value, not the envelope (R19.28); envelope validated generically; per-kind shape checks live in the typed layers (isCachedResponse in CachingHttpClient, isScanResult).
- `CacheEntry.ttlSeconds` added so L2 hits are promoted into L1 with their original storedAtMs and TTL (a partial scan never outlives its L2 entry); entries without ttlSeconds are returned but not promoted.
- RuntimeCacheStore takes an injectable `sha256Hex` (default Web Crypto); tests inject a microtask-only hash. This fixed a flaky test that failed CI once (commit 2e3e411, 13 failures in runtime-cache-store.test.ts; fixed in 859a11e).
- Compact L2 encoders return unparsable text unchanged; OSV keeps id, aliases, withdrawn, database_specific.severity, affected[].database_specific.informational, CVSS_V3 severity entries.
- Scan_Cache: createScanCache relies on TieredCacheStore for the deferred L2 write (no double deferral); a result over L2_MAX_SCAN_BYTES is written with l2Kind null (L1 only); runScan skips storing when the progress handle is closed (margin path).
- CachingHttpClient: GraphQL stored only when errors are absent/null or all NOT_FOUND; store errors swallowed; the store stamps storedAtMs.
- MemoryCacheStore maxEntries is a constructor parameter (default CACHE_MAX_ENTRIES).
- Group 4 checkpoint: typecheck, lint (no warnings), check:core, check:architecture all exit 0; vitest 129 files, 2046 tests pass (6.59 s; second run 7.33 s, same totals); tests/adapters + tests/pipeline/scan at FC_NUM_RUNS=1000: 56 files, 682 tests pass (8.23 s).
- Counterexamples (group 4): none in product code; test-side only: P71 first compared standalone severityOf on id-less OSV bodies (not a fact, since mapOsvAdvisory returns null there); comparison now goes through the record.
- Known coverage gaps: P72 never reaches an L2 `scan` entry (stub sources don't produce an all-ok scan); P70 is at storeDecision level (runScan level covered by run-scan-cache.test.ts).
- Group 5 checkpoint: typecheck, lint, check:core, check:architecture, build all exit 0; vitest 149 files (144 passed, 5 skipped), 2280 tests (2257 passed, 23 skipped) (7.20 s; second run 7.10 s, same totals); tests/pipeline + tests/adapters + tests/architecture at FC_NUM_RUNS=1000: 102 files, 1512 tests pass (18.07 s). Live: tests/live with a token, 7 files, 28 tests pass (30.38 s) including EF-17..19 and the 3 smoke scans.
- `respond(body, asOf)` takes `asOf` so the `Retry-After` header can be computed.
- The request body reader maps an empty or invalid UTF-8 body to `invalid-json` (R21.3c).
- `findBranchConflict` is separate from URL parsing; `handleScanRequest` calls it after parsing the URL.
- `isValidBranchName` is exported from parse-repo-url.ts and used for the body branch (replaced a synthetic-URL check).
- Composition returns port types only (`scanStore`, not the Scan_Cache); the route builds the Scan_Cache with `createScanCache`. This keeps R22.9 without an exemption.
- The route builds its deps per request and falls back to the default GitHub config when the environment is invalid, so `handleScanRequest` reports the config error.
- The live workflow uses `secrets.GITHUB_TOKEN`.
- The recorder has `--only supplementary`; the supplementary set added `ef2-version-document` and `ef18-rate-limit`, and `ef8` gained GHSA-wq4c-wm6x-jw44, to cover EF-2, EF-6 and EF-18.
- The EF-22 matcher moved to the per-version URL.
- Fixtures were recorded with the gh CLI token (user-approved).
- npm scoped names with plain `encodeURIComponent` were confirmed live (HTTP 200).
- Live smoke scan request/request: grade B, 40 dependencies, ALIVE 11 / HAUNTED 0 / DEAD 29, 0 unassessed, all six sources ok, notes source-repo-unverified x40, 4251 ms.
- Live smoke scan revmic/canopy: grade C, 6 dependencies, ALIVE 1 / HAUNTED 3 / DEAD 2, 0 unassessed, all six sources ok, notes source-repo-unverified x3, 3468 ms.
- Live smoke scan ajeetdsouza/zoxide: grade B, 22 dependencies, ALIVE 17 / HAUNTED 0 / DEAD 3, 0 unassessed, all six sources ok, notes informational-advisory-excluded x1, maintainers-lower-bound x7, source-repo-unverified x17, unmaintained-advisory x1, 21494 ms (crates.io owners requests are spaced about 1 s apart).

## Session 14

- Production smoke test, https://gravekeeper-chi.vercel.app, no token on our side. POST /api/scan revmic/canopy: HTTP 200, ok true, grade C, 6 dependencies, ALIVE 1 / HAUNTED 3 / DEAD 2, 0 unassessed, all six sources ok, notes source-repo-unverified x3, no github-token-missing note, Cache-Control no-store. The measured response took 647 ms because an earlier unmeasured request (same body) had already populated the cache, so the cold scan time was not captured.
- Immediate repeat: HTTP 200 in 951 ms with asOf identical to the first response (2026-11-19T03:28:18.506Z), which is the Scan_Cache hit evidence.
- GET /api/scan: 405 with `Allow: POST`, body `invalid-request`, `details.reason` `method-not-allowed`.
- POST https://gitlab.com/a/b: 400, `error.code` `invalid-url`, `details.part` `host`, message "Only repositories on github.com are accepted."
- Env var reaches the function: no `github-token-missing` note in any response.

## Session 15
- scan-accuracy spec executed in four groups: commit threshold and unknown-facts Reason in core, version resolution from declared ranges, advisory entries with the cache header and manifest candidates, then fixtures, traceability and live report.
- Final checkpoint (task 8) is green: typecheck, lint, check:core, check:architecture, vitest and build all exit 0.
- Group checkpoint: typecheck 2.3 s, lint 6.4 s, check:core 0.8 s, check:architecture 1.1 s, build 7.6 s, all exit 0; vitest 168 files (162 passed, 6 skipped), 2475 tests (2449 passed, 26 skipped) in 8.27 s; tests/core + tests/pipeline/mapping + tests/pipeline/scan + tests/pipeline/api at FC_NUM_RUNS=1000: 110 files, 1818 tests pass (21.65 s, 22.9 s wall).

### Decisions
- PEP 440 library: @renovatebot/pep440 5.0.1 (6.0.0 needs Node >=24.10; CI is Node 22); semver 7.8.6; both pinned exactly, fenced to pipeline/mapping/range-semver.ts / range-pep440.ts by architecture rules range-package-not-allowed and range-package-version-exact.
- Cargo mapping: bare = caret, comma = AND, wildcards pass through, `||`, hyphen ranges, v-prefix, x-wildcards rejected.
- range-unresolved note: details {ecosystem, name, ranges}; only {name} rendered; ranges cut to RANGE_MAX_LENGTH (256).
- 8.3 message for unknown commit shortened to "assumed stale" to fit the 200-char cap.
- advisories list every distinct OSV id incl. withdrawn/informational (so length can exceed openVulnerabilityCount); aliases exclude the id and empty strings; url percent-encodes outside A-Za-z0-9._:-.
- X-Gravekeeper-Cache only on 200; margin path is miss; body identical between hit and fresh (P68).
- candidates in discovery order capped at DISCOVERY_MAX_MANIFESTS; [] for an empty tree.
- uniquePackages/mergeClassifications/compareClassifications exported from core.
- CACHE_KEY_VERSION 1 -> 2; fixtures re-recorded once after version resolution (task 7.1 run early because version requests changed).
- advisoryUrl/buildAdvisoryEntries registered as helpers (not body mappers) in the mapper registry.
- Process: CI failed once on 1c0da21 (spec-only commit: the messages completeness test parses the spec table, which gained a row before messages.ts did); fixed by 42d7c85. A checkpoint sub-agent timed out (1 h) because FC_NUM_RUNS=1000 was left set in the shared shell; cleared and re-run.
- Live: psf/requests has no root requirements.txt (no-root-manifest note; pyproject.toml is not a supported format), so it reports 0 dependencies.
## Session 16
- Asked: execute graveyard-ui to Milestone 1 (landing, scanning, results scene with first-pass art for six plot kinds, list view, detail panel), deploy to https://gravekeeper-chi.vercel.app, and report with 1440x900 screenshots, scene render time, gzipped JS against the budget, axe per screen and the design changes. Rules: commit and push per green sub-group, never weaken a property, one owner per file, FC_NUM_RUNS never set in the shared shell (use test:deep), never print the token.
- Went well: every group was committed green with CI green (commits 2cd7e4d to 815f3b1). 34 graveyard-ui properties are planned; P1-P5, P7-P21 and P27-P34 are tested at 1000 runs. Tests caught real bugs before production. axe reports 0 violations on 17 screens x 2 projects and on production. CLS 0. Client JS 156,222 B gzip of 256,000. Scene render request 38.7 ms; synthetic-300 63.9 ms at 4x throttle (budget 100).
- Report: docs/milestone-1-report.md; screenshots in docs/screenshots/m1; PBT results in docs/property-traceability.md (no tool updates PBT status in tasks.md, so the table holds them; user-approved).
### Counterexamples and fixes
- P16 (scene determinism) at 1000 runs, seed 1457184590, columns=4, offset=10: rows with the same ecosystem and name but different sourceKind kept input order. Fix: final sourceKind tiebreak in the scene sort.
- App shell test (11.9): a featured-link click pushed `/` instead of `/?repo=...` because the callback treated a repo URL as an href. Fix: push `{ repo, manifests: [], view }`.
- Scene CSS unit mismatch (caught in review): the component set `--x` as px lengths and the CSS multiplied by 1px. Fix: CSS uses the values directly.
- axe `link-in-text-block` in the detail panel (links told apart by colour alone). Fix: `.gk-link` is underlined.
- Layout-shift spec: the footer shifted at scanning to results (CLS 0.03-0.12 against 0.01). Fix: `<main>` has `min-h-dvh`.
- Scene render: synthetic-300 median 344 ms, then 171.6 ms (row bands, content-visibility), then 85.1 ms (windowed rows); design contingency item 9.
- Perf spec was flaky under parallel workers (one 505 ms median). Fix: its own Playwright project after desktop and mobile.
- js-budget lazy-chunk step was flaky (it checked before the request started). Fix: wait for the response.
- Screenshot review: overlapping plot labels, a focus box on the programmatically focused h1, an empty Advisories heading. Fixes: label clamp to plot width, no outline on tabindex=-1 headings, section hidden when empty.
### What went wrong
- One 28.4 run read the client-rendered Suspense shell as a stale deployment and sent a mangled API request (PowerShell quoting). I re-checked and production was fine.
- Parallel agents briefly saw each other's transient typecheck errors.
- tasks.md once reverted a completed task's marker (5.38); it was re-marked.
### Design changes (docs/m1-design-changes.md, 16 items)
- Property 9 relies on core's status precedence (design note added).
- Scene order has a final sourceKind tiebreak.
- Table status sort key is status rank, then status word.
- Scene render contingency applied: row bands, then windowed rows; later bands mount after a timer.
- Perf spec runs in its own Playwright project.
- `<main>` has `min-h-dvh`.
- `.gk-link` is underlined.
- Detail panel fact labels use field names (Requirement 10.4).
- Per-package note headings use a local table in `view-model/detail.ts` until the group 31 notes model exists.
- Featured-graveyard ecosystem names are a small map in the component.
- Contrast, perf and CLS constants live in the tests.
- The results page moves focus to the results `h1`.
- `test:deep` is `scripts/test-deep.ts`.
- Scene labels are plot-wide, wrap anywhere and clamp at two lines.
- Programmatic-focus targets show no focus outline.
- The Advisories section renders only when it has content.
- Next (user approved after Milestone 1, in progress): human fact labels, scene row spacing for two-line labels, a live production scan spec.
- Credits: Kiro credit usage can't be seen from inside the session, so none is recorded here.
## graveyard-art (backfilled from reports and git history)
- Source: docs/milestone-3-report.md, .kiro/specs/graveyard-art, git history 41660dc (2026-11-20 07:29 -0500) to 3bd0e3d (2026-11-20 21:42 -0500). No chat record exists in this log for this session, so nothing here comes from memory.
- Built: the art and voice pass (19 requirements, 28 task groups). Two housekeeping items first: the deployed Playwright project runs with one worker, and Vite's native `resolve.tsconfigPaths` replaced `vite-tsconfig-paths` (package removed). Then a night-landscape scene backdrop with two fog layers and per-row depth; four tombstone silhouettes, ivy levels, tilts, wispy ghosts, a restless ghost rising from its own stone, lanterns and unmarked mounds; a large-headline results header with a stone grade plaque and status chips; humanised durations, plain reason lines and an engraved epitaph with "Show the rule"; a full-bleed landing hero with a cemetery gate, "How the caretaker decides" and headstone-shaped featured cards; a caretaker scanning scene; one-sentence empty states; art-style, reduced-motion, e2e, axe, perf and size gates; a traceability test and the Milestone 3 report with screenshots. Post-Milestone-3 fixes were added to the spec as R20 (singular and plural count sentences) and R21 (font-aware layout-shift measurement).
- Key commits: 41660dc (spec and housekeeping), 2c2378c (backdrop, fog, depth, tokens), 301208b (sprites), 15858f4 (header), 88fa53d (epitaphs and reasons), edb1954 (landing), 395fa54 (caretaker scene), 4568d5d (empty states), 48d0e48 (art style, e2e, axe, perf gates), a59259b (traceability), dfe07eb (compact results header), 7db5b4d and 54151d0 (spec change and regenerated screenshots), de8976c (Milestone 3 report), 3bd0e3d (post-M3 fixes). 0fe0984 is the scene-perf fix described below.
- Properties added: GA-P1 to GA-P14 (variant choice, tilt, depth, depth geometry, duration total and monotone, plain reasons, epitaph name and facts, symbol ids, caretaker scene, header and empty states, notes shown once, reasons verbatim). docs/property-traceability.md records all 14 as passing in the normal and the deep runs.
- Bugs found by property tests: GA-P5 found that the duration regex in design.md excluded 10 to 24 months (counterexample 300 days, written "10 months"). The regex in the design was fixed (commit 88fa53d). The reports name no other property counterexample for this spec. Separately, CI measured 115.6 ms for 300 plots at 4x throttle after the art, over the 100 ms budget. That came from the perf spec, not a property test. Fixes in 0fe0984: sprite sheet mounted once, backdrop memoised, only the measured column rendered on the first pass, heading focus and caretaker's notes deferred one frame. The report says lowering the budget, the run count or the throttle was rejected. CI medians afterwards: 40 ms (300 plots) and 25 ms (request).
- Decisions the user made (as written in the spec): the seven parts and their order are "the order of the user's priority" (scene, sprites, header, epitaphs, landing, scanning screen, empty states); the two housekeeping items come first; the work ends at Milestone 3 and then stops. The reports record no other user decision for this spec.
- Milestone 3 numbers from the report: client JS 168,734 B gzip of 256,000; render medians 17.1 ms (request) and 23.3 ms (synthetic 300) against 100 ms; axe 0 violations on all 7 screens; live scan 2422 ms. Known gaps listed there: screenshots use reduced motion, render time is from a local build, and on a 390x844 phone the header still fills most of the first screen. Credits are not reported (not visible from the session).
## pyproject (backfilled from reports and git history)
- Source: docs/pyproject-report.md, .kiro/specs/pyproject, git history 6da90db (2026-11-20 22:03 -0500) to afd5d54 (2026-11-20 23:02 -0500).
- Built: `pyproject.toml` as a fourth manifest format. Parsing of PEP 621 `[project]` dependencies and optional dependencies, PEP 735 `[dependency-groups]` and Poetry tables (including translation of Poetry constraints to PEP 440 ranges). Discovery, root selection and fetching of `pyproject.toml`, cache key version 2 to 3, a PyPI `*` rule so unconstrained entries resolve instead of getting `range-unresolved`, PEP 440 zero-padding, the `no-manifests` message and other format lists updated, a psf/requests fixture set, an e2e test, the traceability document and a live report.
- Key commits: 6da90db (spec), 61981af (core parser, Poetry translator, properties), 7115d2f (discovery, cache key 3, pypi `*` rule, prefix padding), 7b1f424 (psf/requests fixture, e2e, traceability), 7def432 (final checkpoint), b7ebbaf (zero-pad every clause), 61e5310 (live report), afd5d54 (report commits and CI), 7976fc1 (task status).
- Properties added: PY-P1 to PY-P10 (never throws, writer round trip, Poetry constraint equivalence, determinism, PEP 503 names, scope mapping, include-group, PEP 508 grammar, discovery, range resolution). All ten passed 1000 runs after fix 4.12.
- Bugs found by property tests: PY-P10 found two PEP 440 zero-padding defects in `pepSatisfies`. First `1.0.*` against `["1"]` (seed -444692813; the deep run also found `5.0.*,>=0` with `["5"]`, seed -710714697), fixed in 7115d2f (task 4.11, criterion 10.9). Then `~=2.0.0.0` against `["2.0"]` (seed 1855169442), fixed in b7ebbaf (task 4.12, criterion 10.10). Two test-side issues: PY-P2 first failed on the empty list (seed -792885459) because the test was too strict, and PY-P8 now filters blank and comment-only lines.
- Result: the live scan of psf/requests gives grade B, 16 alive, 0 haunted, 1 dead (pysocks), 17 unique packages, 0 unassessed. psf/requests is not a convincing graveyard (1 dead or haunted against revmic/canopy's 5, and a better grade), so revmic/canopy stays featured. The report could not confirm that the deployed build was 7def432 itself (no Vercel status was attached when it checked).
- Decisions the user made (as written in the spec): the decisions of the requirements are "final (user brief of the session that created this spec)". Out of scope by that brief: a production serializer, include-group resolution, uv/pdm/hatch/flit tables, lockfiles, and any art, palette or header change ("The user sends art changes separately"). The live report used the user-approved `GITHUB_TOKEN`, passed only through the environment.
## resurrect (backfilled from reports and git history)
- Source: docs/resurrect-report.md, .kiro/specs/resurrect, git history d49bad1 (2026-11-21 12:29 -0500) to 3104985 (2026-11-21 13:37 -0500).
- Built: the Resurrect slot of the detail panel, for every DEAD package and every restless ghost. Upstream hints (npm `deprecated` string and the RustSec unmaintained text, cache key version 3 to 4, compact OSV entries keep summary and details), pyproject tool detection (Poetry or PEP 621) so commands match, a curated list `data/resurrections.json` (37 entries kept of 42 candidates: npm 13, pypi 10, cargo 14, 5 dropped) with a live contract test (92 cases, 55 targets, 0 removed), the slot model, copyable commands, an urgent line for restless ghosts, a fallback paragraph, e2e and axe checks, and a report with three screenshots. Nothing is invented and no language model is used.
- Key commits: d49bad1 (spec), 87dd26b (hints, cache key 4), 5694815 (tool detection), 8aa8773 (curated list, loader, live contract test), d18b79f (slot model, commands, component), 7363311 (fixtures, e2e, report spec), 817c1bd (traceability), 12b0e06 (report and screenshots, CI failure), 7d07ef5 (RS-P3 fix), 3104985 (report commits and CI), 18bad18 (task status).
- Properties added: RS-P1 to RS-P12 (determinism, slot visibility, validated names, commands, never its own replacement, hint text, links, hint extraction, client narrowing, curated lookup, section order, stored results with hints). All passed 1000 runs in the final report.
- Bugs found by property tests: RS-P3 found a product defect: names from an injected curated list were not re-validated in `suggestionOf`. Counterexamples: npm `request` with `to: [""]` (seed -726162033), with `to: ["a b"]` (deep seed -1346668248), and a cargo row with `["@scope/pkg","got"]`. Fixed in d18b79f. Scan-pipeline Property 71 (compact L2 OSV entry equals full text) caught that the compact entry dropped `summary` and `details` once this spec started reading them (counterexample `{"summary":"","id":"a"}`, seed 433693239), fixed in 87dd26b. Test bugs: an RS-P3 counterexample with a manifest path as a code segment (seed -1445781093) and a U+FEFF trim check in RS-P6 (seed -1597909426). CI failure on 12b0e06: RS-P3's generator produced `--save-dev`, which is also a fixed flag the builder adds (seed 1515876375); 7d07ef5 narrowed the check to name positions.
- Decisions the user made (as written in the spec): the decisions of the requirements are "final (user brief of the session that created this spec)". By that brief the slot appears for DEAD packages and restless ghosts only, no language model or scan-time web search, no PyPI hints, the slot sends no request, no change to art or header, and the per-version npm document is not read (Decision D3; the resurrect-upgrade spec later fetches it for deprecated checked versions). The curated list was to hold about 30 entries, each with a source page that states the recommendation. Entries whose page did not say so were dropped and listed in the report.
- Numbers: client JS 173,948 B gzip (+5,119 B); render medians 31.6 ms (300 plots) and 17.0 ms (request); axe 0 violations on five panels. `verify:deploy` passed on 7d07ef5.
## resurrect-upgrade (backfilled from reports and git history)
- Source: docs/resurrect-upgrade-report.md, .kiro/specs/resurrect-upgrade, git history 8b80843 (2026-11-21 14:07 -0500) to fa61069 (2026-11-21 15:36 -0500).
- Built: version-specific npm notices (one extra request when the checked version is deprecated and differs from `/latest`, cache key version 4 to 5), an "Upgrade to <version>" section labelled "From the registry" with the ecosystem command, ahead of the hints and curated suggestions, and a split of the curated entries into a human `source` page and a machine-checked `evidence` URL. The `request/request` fixture set was re-recorded. Example: uuid@3.4.0 now shows "Upgrade to 14.0.3" with `npm install uuid@14.0.3`; rimraf shows 6.1.4 with `--save-dev`. Cold scan of request/request went from 103 to 105 requests (2 version documents: uuid@3.4.0 and rimraf@2.7.1).
- Key commits: 8b80843 (spec), db4fd27 (strict version, cache key 5, npm getVersion), c033595 (version-document plan, hint combiner, upgrade chooser), 62446e8 (stage S6, upgrade in the scan result), 2e850ed (re-recorded fixture), 4e6e94e (e2e fix), 3ea7ceb (curated source and evidence), a61603b (upgrade section, commands, narrowing), 891ed4a (e2e, report spec, traceability), c4eb43b (report and screenshots), fa61069 (report commits and CI), ae77e99 (task status).
- Properties added: RU-P1 to RU-P8 (version document requested only for a deprecated, differing, strict npm version; hint combination; upgrade only to a healthy higher default; strict versions and command grammar; client narrowing; section order and fallback suppression; JSON round trip; curated loader schema). All passed 1000 runs.
- Bugs found by property tests: none. The report says no RU property found a code defect. Two CI failures came from e2e assertions this spec changed: 2e850ed (re-recorded uuid now has a hint, fixed in 4e6e94e) and a61603b (the upgrade section became the first text block, fixed in 891ed4a, task 15.1).
- Decisions the user made (as written in the spec): the decisions table is "final (user brief of the session that created this spec)". The upgrade is offered only when the checked version is deprecated (known from deps.dev `isDeprecated`), not for HAUNTED packages, because OSV is queried only for the checked version. The version notice replaces the `/latest` hint. The fallback paragraph is suppressed when an upgrade exists. PEP 621 upgrades use `<name>>=<version>`. `evidence` is required for every curated entry. Only `request/request` is re-recorded.
- Caveat in the report: uuid 14.0.3 is the deps.dev default, but the uuid notice itself suggests uuid@11 for CommonJS codebases, so the slot shows both. Client JS 174,557 B gzip (+609 B).
## art-polish (backfilled from reports and git history)
- Source: docs/art-polish-report.md, .kiro/specs/art-polish, git history bdefcf4 (2026-11-21 18:28 -0500) to 5117bb5 (2026-11-21 20:41 -0500).
- Built: a visual polish pass on graveyard-art. The first row stands on the ground in front of the fence (backdrop at `z-index: -1`, stage lead 104 px desktop and 14 px mobile), with a ground gradient and grass tiles; fog without hard edges, alternating band positions per row; a two-line headline at 1280 px and wider (28 to 40 px) and a compact mobile header; the `slab` stone redrawn as a flat ledger stone with an engraved cross; a larger restless ghost rising above its stone; six iron silhouettes and a lit path in the landing hero; regenerated screenshots (50 changed PNGs plus 4 new, commit f281606), a deterministic picker screenshot, and the report.
- Key commits: bdefcf4 (spec), d2c2a31 (constants, ground tokens, contrast property), 5fd2339 (graves on the ground), ee239bf (feathered fog), bc1f5e0 (headline and mobile header), c279691 (ledger stone, restless ghost), 4846ffc (hero), 3306ddf (AP traceability), b033298 (deterministic picker screenshot), f281606 (screenshots), 4f2776c (report), 5117bb5 (report commits and CI).
- Properties added: AP-P1 ledger variant set, AP-P2 fog row offsets, AP-P3 restless art, AP-P4 ground contrast. All passed at 1000 runs, no counterexample (4 files, 6 tests).
- Bugs found by property tests: none. Problems found by other checks: the design's ground tokens failed `bone-muted` contrast over fog (4.09 and 3.61 against 4.5) and were darkened (tightest margin now 4.52:1); the 200 %-wide fog layer in the design showed hard-edged rectangles and was replaced by a layer exactly the box width; on mobile the first-row labels ended at 755.25 px against a limit of 700, and the header ladder (plaque beside the `h1`) brought it to 696.6; the picker screenshot differed by 6 pixels between runs, fixed in the screenshot spec (b033298, stable in 14 of 14 runs). The report also lists one unit test that failed once in a full run at checkpoint 14, did not reproduce in two reruns, and whose name was not captured. Its cause is unknown.
- Decisions the user made (as written in the spec and report): the brief named six changes and the three viewports 1440x760, 1280x720 and 390x700. The spec treats `slab` as the variant the brief calls "the coffin". The art may move only through CSS on decorative layers or the stage offset, and the plot layout boxes stay unchanged. The report records no coffin finding for task 9.1 and no other user decision. The design says the task asks the user before changing the headline bounds if the headline takes three lines.
- Numbers: above the fold at 1440x760 the first-row label bottom is 587 and the second row's art starts at 602.5; at 390x700 the label bottom is 696.6. Render medians 29 to 30.5 ms (300 plots) and 17 to 18 ms (request). Client JS 175,010 B gzip. axe 0 violations on four screens. Checkpoint 14: vitest 4031 passed, 119 skipped; e2e 310 passed, 108 skipped.
## Session 17
- polish-leftovers spec (spec commit 49710e9), 2026-11-22: restless ghost variant, grave label wrapping, spec number and BOM fixes, a flaky-test investigation, then CI, deploy and this log. Scope change: the user dropped the landing-wordmark item. The header wordmark stays visible on every page, because hiding it would flash on direct /?repo= visits, which is the URL judges open.
### Items
- Restless ghost (547151f, CI success): a restless ghost (DEAD with open advisories) now rises from its own variant stone drawn at full size. Ghost scale is 0.595 (70% of 0.85) and its centre is at x 62, so it sits upper right with the stone's central column clear; overlap with the stone box is at most 25%. New token --color-wraith #d27ab5 with contrast 6.48 against night, 6.12 ground, 6.10 grass, 4.94 sky-low; hue 319.8 degrees against 186.9 for spectral; luminance gap 0.338. It has its own fainter gradient and no cyan glow. AP-P3 was rewritten. New tests: wraith token checks, and restless and haunted markup differ. Axe: 0 violations.
- Grave labels (43b4fa6, CI success): labels never use an ellipsis. They are display block in a 28 px box, 12/14 px, text-overflow clip, overflow-wrap anywhere. The browser breaks after hyphens (browserify-istanbul shows "browserify-" / "istanbul"); a third line is clipped (karma-phantomjs-launcher shows "karma-" / "phantomjs-"). view-model/label-fit.ts estimates lines at 7.2 px per character and adds an SVG <title> with the full name to the plot svg when a label may be cut. The aria-label still starts with the full name. Limit: the plot svg is aria-hidden with pointer-events none, so the title gives no hover tooltip; the full name reaches assistive tech through the aria-label. Above-fold is unchanged: at 1440x760 the label bottom is 587 and row 2 top is 602.5; at 390x700 the first row is in view.
- Spec and test leftovers (1502cee, CI success): art-polish design.md slab numbers 62/80 became 70/84 with a superseded note (the outline path on line 173 is still stale and left as is). The graveyard-ui design.md example headline is now "31 of 40 dependencies are in the graveyard: 6 buried, 20 forgotten, 5 haunted." The BOM was removed from tests/e2e/above-fold.spec.ts, and tests/ui/repo-hygiene.test.ts now guards tests/e2e/*.ts. Other BOMs remain in .kiro markdown (art-polish design and tasks, steering product, structure and tech).
### Flaky tests
- Root cause: timeouts under CPU starvation in a full parallel run, not logic bugs. 0 failures in 10 normal and 10 shuffled full runs; 2 failures in 10 full runs with 16 busy-loop spinners. Run in isolation, each file failed 0 of 20.
- (a) tests/ui/components/graveyard-flow.test.tsx, "opens and closes a tombstone, a forgotten grave and a ghost from the scene (9.5, 10.1)": findByRole("dialog") hit the default 1000 ms asyncUtilTimeout.
- (b) tests/pipeline/resurrect-fixtures.test.ts, "two replays of every set are equal": 36,975 ms against the 30 s testTimeout (normally 49 to 76 ms).
- Fix: asyncUtilTimeout 5000 (file-local, restored afterwards) and a 60 s per-test timeout in (a); (b) reuses the cached replay for one side and has a 120 s timeout. Acceptance: 20 of 20 passes quiet and 20 of 20 under load per file; the full suite passed quiet and under load. Which of the two was the original art-polish failure cannot be determined.
- ae2551f (CI success): the final full `npm run test:deep` failed once on tests/ui/view-model/detail-reasons.property.test.ts (31.2 s against 30 s; 19 s alone), same cause. It and six other property tests that took over 20 s in the contended deep run (scene-overlap, scene-nav, detail, epitaph-name, table-scene, rows-labels) got explicit 120 s timeouts; numRuns is unchanged. The full deep run then passed twice (4086 passed, 119 skipped).
### Checkpoint, CI and deploy
- Final checkpoint: typecheck, lint, core purity and architecture OK. vitest 4086 passed, 119 skipped (4205). e2e 316 passed, 108 skipped. check:bundle 175,274 B gzip of 256,000. scene-perf medians: synthetic-300 32.8 ms (limit 100 ms), request 21.6 ms (limit 80.4 ms).
- CI: 5117bb5 success (run 44972669820); 49710e9, 547151f, 43b4fa6, 1502cee and ae2551f all success.
- Deploy: the Vercel git integration deployed ae2551f (status success 2026-11-22T07:55:15Z). `npm run verify:deploy` passed on attempt 1 against https://gravekeeper-chi.vercel.app. Production check: --color-wraith #d27ab5 is served, the restless gradient is present, 0 ellipsis labels, svg titles on karma-phantomjs-launcher and json-stringify-safe, wordmark visible.
- Credits: Kiro credit usage can't be seen from inside the session, so none is recorded here.
### Screenshots
- docs/screenshots/polish/leftovers-uuid-grave-1440x760.png (230x199 clip): uuid's full-size cross with the small faint red-violet restless ghost at its upper right, beside the cyan haunted karma ghost. Both labels are visible.
- docs/screenshots/polish/leftovers-landing-hero-1440x760.png: landing hero with headstones, obelisk and tall cross behind the fence, the faint path through the gate, and the header wordmark kept.
- Generated by tests/e2e/polish-leftovers-report.spec.ts (gated by POLISH_LEFTOVERS_REPORT=1, desktop project). Two consecutive runs gave identical files (SHA-256 prefixes 5F0D9DB9501A landing, EF5BA6D16397 uuid). Each shot is also taken twice in-test and must be byte-equal.
- Session log commit 0824a3f.

## Session 18
- Asked: submission prep under a code freeze (no app, component, view-model, core or pipeline changes unless a check fails), commit after each item: repo checklist, README for judges, docs/KIRO_USAGE.md, and a small real MCP use.
### Repo checklist
- Public: `gh repo view` reports rustoman-AI/gravekeeper PUBLIC.
- License: LICENSE at the root, GitHub detects MIT (`gh api repos/rustoman-AI/gravekeeper/license`).
- .kiro: `git check-ignore -v .kiro .kiro/specs .kiro/steering .kiro/hooks` printed nothing (exit 1); `git ls-files .kiro` lists 60 spec files, 4 steering files and 4 hooks.
- Secret scan over `git log -p --all` (169 commits, 185,483 lines; values never printed): one full-length `ghp_` match, in commit 6db4686, `tests/adapters/composition.test.ts` line 19, still in HEAD. It was a fake fixture (40 characters after the prefix where real tokens have 36, contains a word like "fake", only passed to `vi.stubEnv`). The user chose to continue and to rebuild the fixture at runtime so future scans stay clean (commit f11eddf). No 40-hex value after "token" was found. Prefix-only hits are pattern strings in code and docs.
- CI: bc828f8 and every Session 17 commit (49710e9 to dd29fcf) are success.
- art-polish design.md: the Ledger_Stone section now matches LEDGER_OUTLINE in code (68 x 24 box, aspect about 2.83; obelisk aspect corrected from 0.42 to 0.58 including its plinth), and "top of the chamfer" became "far edge of the top face" (commit f11eddf).
### README and KIRO_USAGE
- README.md replaced (commit f6a86f2, 654 words). The three example links were opened on production first: request/request 40 plots, grade D; psf/requests 17 plots, grade B; ajeetdsouza/zoxide 20 plots, grade B. Thresholds come from core/model/constants.ts (730 days, grade bands 19/39/59/79).
- docs/KIRO_USAGE.md draft (commit 198749c): 12 specs, 151 requirements, 851 tasks, 222 properties; six product defects found by property tests, each with its fix commit. Gaps left as TODO.
### MCP
- Added `.kiro/settings/mcp.json` with the official Playwright MCP server, pinned: `npx -y @playwright/mcp@0.0.86 --headless --isolated --browser chromium --viewport-size 1440,900 --output-dir test-results/mcp`.
- The server's tools did not appear in this Kiro session after the config was added, also after one retry 45 s later (the session's tool catalogue is fixed when the session starts). The server itself started, so I drove it over stdio with the MCP TypeScript SDK client (@modelcontextprotocol/sdk 1.32.2, installed in %TEMP%, not in the repo), using the exact command and arguments from mcp.json.
- First run: `browser_click` failed because I passed `ref`; the 0.0.86 schema calls the argument `target`. Two of my checks also read the wrong output. Fixed the client and ran again.
- Tool calls of the passing run: listTools (25 tools); browser_navigate https://gravekeeper-chi.vercel.app/; browser_snapshot; browser_navigate /?repo=https://github.com/request/request; browser_wait_for 5 s; browser_snapshot; browser_click target f1e118 (the uuid plot); browser_snapshot; browser_press_key Escape; browser_snapshot; browser_close.
- Results: landing has heading "Gravekeeper" and the "GitHub repository URL" textbox. The grade card (figure "worst single risk") shows D and "Graded on the riskiest package, uuid (score 60), not on the average (22)". The uuid plot is the button "uuid, npm, haunted, buried, 1 open vulnerability (HIGH)", which is the restless kind. Clicking it opened dialog "uuid" with heading "uuid"; Escape closed it and focus returned to the uuid button.
- Credits: Kiro credit usage can't be seen from inside the session, so none is recorded here.
## Session 20
- Asked: render the demo video under the code freeze. Commit only the recording script and this log entry; the MP4 goes to test-results/demo (git-ignored). Target: 1920x1080 MP4, 2:40 to 2:50, silent, English captions burned in, production site.
- Script: `scripts/demo/record-demo.ts` (one function per shot). It warms the three scan URLs, records with Playwright `recordVideo` at 1920x1080 (deviceScaleFactor 1, page content only, so nothing else on the machine can appear), then re-encodes with ffmpeg to H.264 CRF 18 preset veryfast, silent (`-an`), captions burned in. ffmpeg 9.0.2 was already installed (Gyan build under WinGet packages); nothing was installed.
- Tooling note on the brief's first option: a headed Chromium `--app` window plus ffmpeg `gdigrab` was tried first. A gdigrab probe captured the real desktop (other windows, the taskbar), so a window-only crop was not reliable here. I used the second option instead (Playwright `recordVideo` re-encoded with ffmpeg), which records only the page and keeps the machine out of frame. The mouse is not drawn by `recordVideo`, so an SVG cursor overlay is injected into every page and follows the real `page.mouse` moves (slow, eased, many steps; a click ring on `mousedown`).
- Captions: `test-results/demo/captions.srt` is written from the actual shot start times. libass sizes are in a 288-line space, so `FontSize=11` gives about 41 px at 1080p; white, thin dark outline, bottom center, `MarginV=14`. Each cue wraps to at most 2 lines of 42 characters and lasts at least 1.5 s (checked: 23 cues, 0 bad). The sixth-source sentence (82 characters) is split into two consecutive cues with the words unchanged, because it does not fit two 42-column lines.
- Numbers checked against docs/KIRO_USAGE.md on this date: 12 specs, 151 requirements, 222 correctness properties (matches the totals row). The request/request numbers in the captions match the live scan (31 of 40, grade D from uuid). All caption numbers were kept as written.
- MCP caption: Session 19 did not run the MCP smoke check itself (the Playwright MCP tools were not in that session's tool catalogue), so the caption stays "A Playwright MCP server runs the production smoke check." (not the "Kiro runs ..." wording).
- Timing changes from the brief: the production scans returned from cache in well under a second, so the type-and-scan shot holds the `/api/scan` response about 4.5 s to show the scanning screen. The 1:40-1:52 block was split into three shots (List, psf/requests, zoxide) with their own holds. The `.kiro/specs` and design.md shots were split so each is its own shot. Shots run on an elastic schedule: when a page ran long (the List toggle slipped about 1.4 s), the later shots shifted by the same amount instead of the holds shrinking. Final slip 1.5 s. Captions are tied to actual shot starts, so they stayed aligned.
- Output: `test-results/demo/gravekeeper-demo.mp4`, 166.5 s (2:46.5), 1920x1080, H.264 30 fps, no audio stream, 27,508,278 bytes (26.2 MiB). `timeline.json` and `captions.srt` sit next to it; `frames/` holds one PNG per shot (16).
- Frames checked (one per shot, from the final MP4): 01-landing, 02-type, 03-results, 04-scroll, 05-uuid, 06-upgrade, 07-list, 08-psf, 09-zoxide, 10-kiro-specs, 11-kiro-design, 12-kiro-usage, 13-kiro-steering, 14-kiro-hooks, 15-kiro-mcp, 16-closing. No browser chrome on the app shots (the GitHub shots show github.com's own header, which is part of the page, not browser UI), no Windows taskbar or notifications, no personal data, no loading spinner where results were expected. Captions sit inside the frame and do not cover the D grade card or the dialog's Copy/Close buttons.
- First render used `FontSize=38` and drew captions about 140 px tall over three lines, covering the scene; fixed to `FontSize=11`. Re-rendered after that and after the List-shot split. Two script bugs were fixed before the good run: a double `route.continue` on the delayed scan, and a strict-mode locator for "registry page" (narrowed with `exact: true`).
- Secret search of the committed files (`ghp_`, `gho_`, `github_pat_`): 0 matches.
- Credits: Kiro credit usage can't be seen from inside the session, so none is recorded here.
## Session 21
- P0: an outside tester ran 9 uncached scans of request/request on production in a row; all 9 hit the 30 s function timeout (504), and only after the cache warmed did one return, in 16 s. The design returns partial results at SCAN_DEADLINE_MS=25000 before maxDuration=30, so a 504 should never reach the user. Code freeze lifted for this bug only.
### Reproduction (step 1)
- Scripts (kept, under scripts/demo): `repro-timeout.mts` (sequential, records ms, HTTP status, X-Gravekeeper-Cache, grade/counts, scan-deadline-reached note, non-ok sources) and `repro-concurrent.mts` (N concurrent).
- On warm instances every scan returned 200 well under the deadline (0.5 to 3.3 s), including 9 concurrent uncached scans of a large npm repo. I did not reproduce a 504 on a warm instance. Cold/contended instances are the trigger (see root cause).
- Limitation: I could not pull the Vercel function logs. There is no Vercel CLI or VERCEL_TOKEN here and the project is not linked locally (`.vercel/` absent). The logs for the 9 requests should be read from the Vercel dashboard (Functions, /api/scan) to confirm cold-start timing. Not done this session.
### Root cause (step 2, written before the fix: docs/session-21-timeout-rca.md)
- The scan deadline and the response margin were measured from `deps.clock()` read **inside** the handler (`handle-scan-request.ts`), and the margin timer was scheduled even later. Vercel's 30 s maxDuration is measured from function invocation. The gap (cold-start module init, `buildDeps()`, the body read) was not counted against the 26 500 ms budget (25000 + 1500). Headroom under maxDuration was only 3 500 ms, so a cold or contended invocation, plus the final assemble/serialize, ran past 30 s -> 504. Warm instances skip the cold start, which is why they never timed out.
- Why the existing properties missed it: P48 and P49 (`deadline.property.test.ts`) measure from `startedAtMs` on the injected clock, the same in-handler reading, so they cannot see the pre-handler time. Both were green while production timed out.
- Ruled out with evidence: crates.io spacing sleeps abort with the signal; the HTTP client aborts fetch/body on the deadline (P48 passes even when fetch ignores the signal); L2 writes are bounded to 300 ms, never throw, and are deferred via `after()`; the margin is a real setTimeout and P49 answers a never-settling scan at exactly deadline+margin.
### Fix (step 3)
- New constant `SCAN_WALL_BUDGET_MS = 24000`: the wall-clock budget from function invocation within which the handler must respond. Added to the scan-pipeline requirements constants table with consistency rules (1500 < 24000 <= 26500, and 24000 + 3000 <= 30000 so at least 3 s is left for cold start and serialize).
- The route (`app/api/scan/route.ts`) captures `receivedAtMs = Date.now()` at the top, before `buildDeps` and the body read, and passes it in `ApiDeps.receivedAtMs`. The handler derives the scan deadline and the margin from `SCAN_WALL_BUDGET_MS` minus the time already spent since `receivedAtMs`, with a 2 000 ms floor. Default `receivedAtMs = startedAtMs` keeps old callers and fixture recordings unchanged (`deps.deadlineMs` still wins when set). Cache writes stay deferred.
- Net effect: the handler answers by `receivedAtMs + 24 s` (or the floor when the budget is spent), leaving >= 6 s under maxDuration for cold start and serialize. Target met: every scan responds within 27 s wall time with whatever is done; unfinished packages are already marked unassessed with the `scan-deadline-reached` note by the existing margin path.
- Tests: new `tests/pipeline/api/wall-budget.property.test.ts` (fake clock, never-settling sources, arbitrary time already spent since invocation; asserts the response is produced by `receivedAtMs + SCAN_WALL_BUDGET_MS` or the floor, and under the budget whenever budget remains); `tests/pipeline/constants.test.ts` gains the new constant and three invariants; `tests/pipeline/api/handle-scan-request.test.ts` updated from the old 25 000 bound to the wall budget; new `tests/e2e/deadline-live.spec.ts` (deployed project, E2E_BASE_URL) scans a pool until it finds an uncached (cache miss) scan and asserts it responds under 28 s and is never 502/504.
- Full unit suite green: 4092 passed, 119 skipped. check:core, check:architecture, lint, typecheck all pass.
- Commit 218a35e. Secret scan (ghp_, gho_, github_pat_) of the staged diff: 0 matches. CI run on 218a35e: success. Vercel deploy status for 218a35e: success. verify:deploy against production: pass.
### Re-run after deploy (step 4)
- Live e2e against https://gravekeeper-chi.vercel.app: PASS. It scanned request/request (cache hit, 613 ms) then npm/node-semver (**cache miss, 1659 ms**), under the 28 s limit, not a 504.
- 5 fresh uncached (cache miss) scans, mixed ecosystems, all 200, no deadline note, no 504: motdotla/dotenv 2158 ms (grade B), lodash/lodash 3254 ms (C), pallets/jinja 2394 ms (B), requests/requests-oauthlib 1550 ms (C), python-poetry/poetry 1689 ms (A). Earlier uncached misses the same run: winstonjs/winston 5019 ms (B), jestjs/jest 6586 ms (B, 8 unassessed). request/request now returns cached in ~0.5 s. No scan approached the deadline; all well under 27 s.
- Caveat: because the Scan_Cache TTL is 6 h, repeated runs warm these repos, so a later run of the live test may find them all cached; the test then skips with a message rather than failing, and the cold path stays covered by the fake-clock property test.
- Credits: Kiro credit usage can't be seen from inside the session, so none is recorded here.