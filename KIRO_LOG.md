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
