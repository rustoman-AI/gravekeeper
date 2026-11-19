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
