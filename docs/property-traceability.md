# Property traceability

Maps every design property of the `scan-pipeline`, `dependency-graveyard-core`, `scan-accuracy`, `graveyard-ui`, `graveyard-art`, `pyproject` and `resurrect` specs to its test. Rows were checked against the `// Feature: <spec>, Property <n>` tag comments, the `// Validates:` lines and the test titles in `tests/`. Status comes from a full `npx vitest --run` (FC_NUM_RUNS unset): 3807 passed and 82 skipped, 332 test files passed and 7 skipped (339 files, 3889 tests), with no failure. `npx vitest --run tests/pipeline tests/adapters tests/architecture` with `FC_NUM_RUNS=1000` also passed (1512 tests) before the scan-accuracy spec and was not rerun for this update.

## scan-pipeline

| Property | Requirement(s) | Test file | Test title | Status |
| --- | --- | --- | --- | --- |
| P1 | 1.12 | `tests/pipeline/url/parse-repo-url.property.test.ts` | P1 parse(format(ref)) equals ref for every valid Repo_Ref | passing |
| P2 | 1.13, 1.15 | `tests/pipeline/url/parse-repo-url.property.test.ts` | P2 every spelling variant of an accepted input parses to equal Repo_Refs<br>P2 normalization is idempotent for every accepted input | passing |
| P3 | 1.14 | `tests/pipeline/url/parse-repo-url.property.test.ts` | P3 returns a Repo_Ref or invalid-url for any string and never throws | passing |
| P4 | 1.17 | `tests/pipeline/url/parse-repo-url.property.test.ts` | P4 rejects an accepted URL after exactly one mutation | passing |
| P5 | 2.10 | `tests/pipeline/config/github-config.property.test.ts` | returns a bare lowercase Web_Host or an error with a fixed message independent of the input, and never throws | passing |
| P6 | 3.11 | `tests/pipeline/mapping/github-resolve.property.test.ts` | P6 readCommitSha accepts exactly 40 hexadecimal characters under commit.sha<br>P6 readCommitSha never throws and gives 40 hexadecimal characters or null<br>P6 readRepository never throws and gives a well-formed repository or invalid | passing |
| P7 | 4.9, 4.13 | `tests/pipeline/mapping/discovery.property.test.ts` | Property 7: invariants and the first DISCOVERY_MAX_MANIFESTS in depth then path order | passing |
| P8 | 4.10 | `tests/pipeline/mapping/discovery.property.test.ts` | Property 8: any permutation of the entries gives an equal result | passing |
| P9 | 4.12 | `tests/pipeline/mapping/discovery.property.test.ts` | Property 9: a tree field that is not an array gives invalid-tree<br>Property 9: any JSON value gives a result or invalid-tree and never throws<br>Property 9: entries with a non-string path or type are ignored | passing |
| P10 | 5.13 | `tests/pipeline/mapping/selection.property.test.ts` | P10 default selection is exactly the Root_Manifests in ascending order, uncapped, permutation-invariant<br>P10 explicit selection is distinct, capped, first-occurrence ordered and permutation-invariant<br>P10 never throws for any request list, and checks too-many before not-found | passing |
| P11 | 6.6, 6.10 | `tests/pipeline/mapping/day-count.property.test.ts` | P11 gives 0 for a date after asOf<br>P11 is null or an integer at least 0, null for an invalid asOf, deterministic, and never throws | passing |
| P12 | 6.7 | `tests/pipeline/mapping/day-count.property.test.ts` | P12 gives the earlier date a Day_Count at least as large as the later date | passing |
| P13 | 6.9 | `tests/pipeline/mapping/day-count.property.test.ts` | P13 returns k for a date k * DAY_MS + r milliseconds before asOf | passing |
| P14 | 7.10 | `tests/pipeline/mapping/version-select.property.test.ts` | returns null or the pin of R7.1 and R7.2 without its operator, and never throws | passing |
| P15 | 7.13 | `tests/pipeline/mapping/version-select.property.test.ts` | returns the same Selected_Version, Version_Basis and notes for every permutation of the specs | passing |
| P16 | 8.11, 9.16, 9.19, 10.8, 11.10, 12.8, 13.10, 13.15 | `tests/pipeline/mapping/mappers.property.test.ts` | 26 tests, all titled `P16 <mapper> ...` | passing |
| P17 | 8.12, 12.9, 13.12 | `tests/pipeline/mapping/mappers.property.test.ts` | 87 tests, all titled `P17 <mapper> ...` | passing |
| P18 | 8.13 | `tests/pipeline/mapping/deps-dev.property.test.ts` | P18 daysSinceLastRelease is permutation invariant for any shuffle<br>P18 daysSinceLastRelease is the minimum Day_Count and is permutation invariant | passing |
| P19 | 8.16 | `tests/pipeline/mapping/deps-dev.property.test.ts` | P19 batch results do not depend on the order of responses | passing |
| P20 | 9.12 | `tests/pipeline/mapping/osv.property.test.ts` | P20 the count is between 0 and the number of advisories, and 0 when none is counted | passing |
| P21 | 9.13 | `tests/pipeline/mapping/osv.property.test.ts` | P21 count and maxSeverity are equal for any permutation of advisories and aliases | passing |
| P22 | 9.14 | `tests/pipeline/mapping/osv.property.test.ts` | P22 one mutual alias link lowers the count by exactly one | passing |
| P23 | 9.15, 10.16 | `tests/pipeline/mapping/severity.property.test.ts` | P23 an accepted label decides without reading severity[]<br>P23 any other label falls through to the severity[] rule | passing |
| P24 | 9.18, 9.23 | `tests/pipeline/mapping/osv.property.test.ts` | P24 id sets larger than OSV_MAX_ADVISORY_DETAILS leave the rest unfetched<br>P24 sets planned from generated querybatch results are capped, distinct and ordered | passing |
| P25 | 9.18 | `tests/pipeline/mapping/osv.property.test.ts` | P25 the count covers every unfetched id and maxSeverity uses fetched counted advisories only | passing |
| P26 | 9.22 | `tests/pipeline/mapping/assemble.property.test.ts` | P26: Unmaintained advisories set deprecated for crates | passing |
| P27 | 10.9 | `tests/pipeline/mapping/cvss.property.test.ts` | P27 score is in range with one decimal and severity follows CVSS_RANGES | passing |
| P28 | 10.10 | `tests/pipeline/mapping/cvss.property.test.ts` | P28 raising C, I or A never lowers the severity | passing |
| P29 | 10.12 | `tests/pipeline/mapping/cvss.property.test.ts` | P29 permuting metric segments keeps score and severity | passing |
| P30 | 10.13 | `tests/pipeline/mapping/severity.property.test.ts` | P30 permuting severity entries does not change the severity | passing |
| P31 | 10.15 | `tests/pipeline/mapping/severity.property.test.ts` | P31 a valid Advisory_Score decides regardless of OSV fields | passing |
| P32 | 10.17 | `tests/pipeline/mapping/severity.property.test.ts` | P32 maxSeverity is the highest per-advisory severity and ignores order | passing |
| P33 | 11.11 | `tests/pipeline/mapping/github.property.test.ts` | P33 archived and daysSinceLastCommit are null independently of each other | passing |
| P34 | 11.14 | `tests/pipeline/mapping/github.property.test.ts` | P34 batches cover each distinct repository once, in bounded batches with r0.. aliases | passing |
| P35 | 12.11 | `tests/pipeline/mapping/maintainers.property.test.ts` | P35 crates: count is permutation-invariant and equals the distinct valid logins<br>P35 missing field gives null for every ecosystem<br>P35 npm: count is permutation-invariant and equals the distinct valid names<br>P35 pypi: count is permutation-invariant and equals the distinct string users | passing |
| P36 | 12.12 | `tests/pipeline/mapping/maintainers.property.test.ts` | P36 lowerBound is true iff a valid user and a team are both present | passing |
| P37 | 13.11 | `tests/pipeline/mapping/assemble.property.test.ts` | P37: Assembled facts have the declared types | passing |
| P38 | 13.13 | `tests/pipeline/mapping/assemble.property.test.ts` | P38: Assembly is deterministic | passing |
| P39 | 13.16 | `tests/pipeline/scan/run-scan.property.test.ts` | P39: unassessed dependencies and shared targets | passing |
| P40 | 14.9 | `tests/pipeline/scan/github-budget.property.test.ts` | P40: no GitHub request is sent after the first response whose integer budget is below the threshold | passing |
| P41 | 14.10 | `tests/pipeline/scan/github-budget.property.test.ts` | P41: any budget header sequence gives a Scan_Result or upstream-unavailable for github, and a Scan_Result when no value is below the threshold | passing |
| P42 | 15.11 | `tests/adapters/http-client.property.test.ts` | P42 attempts per Work_Unit are bounded | passing |
| P43 | 15.12 | `tests/adapters/http-client.property.test.ts` | P43 non-retriable first outcomes get exactly one attempt | passing |
| P44 | 15.13 | `tests/adapters/retry-policy.property.test.ts` | P44 backoff delay is within bounds | passing |
| P45 | 15.14 | `tests/adapters/concurrency-limiter.property.test.ts` | P45: The concurrency limiter respects its limit | passing |
| P46 | 15.18 | `tests/adapters/http-client.property.test.ts` | P46 a wait that would cross the deadline ends the unit | passing |
| P47 | 16.6, 16.7, 16.10 | `tests/pipeline/scan/targets.property.test.ts` | P47 the dependency cap partitions the Lookup_Targets (SCAN_MAX_DEPENDENCIES)<br>P47 the dependency cap partitions the Lookup_Targets (small limits) | passing |
| P48 | 16.9 | `tests/pipeline/scan/deadline.property.test.ts` | P48: every attempt (first or retry) is sent before Scan_Start + SCAN_DEADLINE_MS, whether fetch honors or ignores the signal, and runScan does not throw<br>P48: the scan is exercised past the first stage in at least one generated slow scenario | passing |
| P49 | 16.13 | `tests/pipeline/scan/deadline.property.test.ts` | P49: with a never-settling scan that ignores the signal, only the margin timer answers, at exactly deadline plus margin<br>P49: with sources that honor or ignore the signal, the response is produced by Scan_Start + SCAN_DEADLINE_MS + SCAN_RESPONSE_MARGIN_MS | passing |
| P50 | 17.10 | `tests/pipeline/scan/run-scan.property.test.ts` | P50: one failing source never fails the scan | passing |
| P51 | 17.11 | `tests/pipeline/scan/run-scan.property.test.ts` | P51: facts of failing sources are null | passing |
| P52 | 17.12, 17.16 | `tests/pipeline/scan/source-status.property.test.ts` | P52: source status and source notes follow the unit outcomes | passing |
| P53 | 17.14 | `tests/pipeline/scan/source-status.property.test.ts` | P53: OSV truncation makes the source partial | passing |
| P54 | 17.15 | `tests/pipeline/scan/source-status.property.test.ts` | P54: reason categories are valid and distinct | passing |
| P55 | 18.7 | `tests/pipeline/scan/run-scan.property.test.ts` | P55: scan results are deterministic | passing |
| P56 | 18.8 | `tests/pipeline/scan/run-scan.property.test.ts` | P56: the summary is the core summary | passing |
| P57 | 18.9 | `tests/pipeline/scan/run-scan.property.test.ts` | P57: result lists have matching lengths | passing |
| P58 | 18.12 | `tests/pipeline/scan/run-scan.property.test.ts` | P58: version fields are consistent | passing |
| P59 | 19.11, 19.18 | `tests/adapters/memory-cache-store.property.test.ts` | P59 cache entries live exactly for their TTL | passing |
| P60 | 19.12 | `tests/adapters/memory-cache-store.property.test.ts` | P60 caches never exceed their size limit and evict least recently used first | passing |
| P61 | 19.13 | `tests/pipeline/scan/cache-keys.property.test.ts` | Property 61: keys differ when any scalar field differs<br>Property 61: keys differ when the path set differs<br>Property 61: keys ignore a token and path order<br>Property 61: owner and repo differing only in letter case give different keys | passing |
| P62 | 19.16 | `tests/pipeline/scan/cache-replay.property.test.ts` | Property 62: A cached scan repeats the result without upstream traffic | passing |
| P63 | 20.8, 20.9 | `tests/adapters/token-leak.property.test.ts` | P63: an all-ok scan stores a Scan_Result in L1 and L2, and the stored entry is token-free (not vacuous)<br>P63: neither the token nor "Bearer " + token reaches any Logger line, error message, Scan_Result, Scan_Error, route response or cache key or value | passing |
| P64 | 21.12 | `tests/pipeline/api/handle-scan-request.property.test.ts` | P64: answers every request with the declared union, status table and headers, and never throws | passing |
| P65 | 21.15 | `tests/pipeline/api/handle-scan-request.property.test.ts` | P65: uses the body branch, else the URL branch, and rejects unequal pairs without an upstream request | passing |
| P66 | 22.15 | `tests/architecture/architecture.property.test.ts` | P66 reports a violation on the import line when the target is forbidden<br>P66 reports no import violation when the target is allowed | passing |
| P67 | 19.11 | `tests/adapters/tiered-cache-store.property.test.ts` | P67 unit: a live value written to L2 is returned after an L1 reset | passing |
| P68 | 19.21 | `tests/pipeline/scan/cache-replay.property.test.ts` | Property 68: A cache hit equals a fresh scan, for every request spelling | passing |
| P69 | 19.29 | `tests/adapters/tiered-cache-store.property.test.ts` | P69 unit: an all-200 scan reaches L2 (scan cache and HTTP cache) and equals the off result | passing |
| P70 | 19.30 | `tests/pipeline/scan/scan-cache-store-rule.property.test.ts` | Property 70: A Scan_Result is stored if and only if the store rule holds | passing |
| P71 | 19.31 | `tests/adapters/l2-entries.property.test.ts` | P71 crates.io owners: Mapper output is equal on compact and full text<br>P71 deps.dev advisory: Mapper output is equal on compact and full text<br>P71 OSV advisory: Mapper output is equal on compact and full text | passing |
| P72 | 19.32 | `tests/adapters/token-leak.property.test.ts` | P72: no L1 or L2 key or value contains the token or "Bearer " + token, for any token, status, and redirect<br>P72: the stack caches and writes L2 entries while upstream echoes the token (not vacuous) | passing |
| P73 | 15.21 | `tests/adapters/http-client.property.test.ts` | P73 redirect chains never leave the origin or exceed the hop limit | passing |
| P74 | 12.15 | `tests/pipeline/mapping/maintainers.property.test.ts`<br>`tests/pipeline/scan/crates-order.property.test.ts` | P74 orderCratesLookups orders by first scope then code point name, independent of input order<br>Property 74: Crates owners are looked up in scope order and cached owners send no request | passing |
| P75 | 11.16 | `tests/pipeline/mapping/github.property.test.ts` | P75 unattributable errors leave every alias outcome unchanged | passing |
| P76 | 20.16 | `tests/pipeline/scan/messages.property.test.ts` | P76 Rendered messages are safe | passing |

## dependency-graveyard-core

| Property | Requirement(s) | Test file | Test title | Status |
| --- | --- | --- | --- | --- |
| P1 | 4.2 | `tests/core/parsers/parse-manifest.property.test.ts` | Property 1: never throws on any string for any format and no warning starts with the internal-error prefix | passing |
| P2 | 4.3 | `tests/core/parsers/parse-manifest.property.test.ts` | Property 2: non-string input gives no dependencies and exactly one warning saying the input must be a string | passing |
| P3 | 4.5, 1.12, 3.17 | `tests/core/parsers/cargo-toml.property.test.ts`<br>`tests/core/parsers/package-json.property.test.ts`<br>`tests/core/parsers/requirements-txt.property.test.ts` | Property 3: every parsed dependency is well formed and rawName equals name (valid, mutated, trap and noise text)<br>Property 3: valid text gives exactly the modelled dependencies, rawName equal to the package or key as written, no warnings<br>Property 3: every parsed dependency is well formed and rawName equals name<br>Property 3: every parsed dependency is well formed for valid, mutated and noisy text | passing |
| P4 | 4.6, 1.11, 3.8, 3.18, 3.19 | `tests/core/parsers/cargo-toml.property.test.ts`<br>`tests/core/parsers/package-json.property.test.ts`<br>`tests/core/parsers/requirements-txt.property.test.ts` | Property 4: one table pair `[dependencies]` against `[target.<cfg>.dependencies]` keeps the top-level entry whatever the header order<br>Property 4: the kept dependency per key is the position-free First_Occurrence and each discard has one warning naming package and table<br>Property 4: a key repeated inside one section keeps the last value and adds no warning<br>Property 4: no two dependencies share (name, scope) for any text<br>Property 4: first line wins with its rawName, and each discard gets one warning naming package and scope<br>Property 4: Foo_Bar, foo-bar, FOO.BAR and foo__bar collapse to the first spelling in the text | passing |
| P5 | 4.7 | `tests/core/parsers/parse-manifest.property.test.ts` | Property 5: repeated calls on the same non-string value return deeply equal results<br>Property 5: repeated calls on the same string and format return deeply equal results | passing |
| P6 | 4.8 | `tests/core/parsers/cargo-toml.property.test.ts`<br>`tests/core/parsers/package-json.property.test.ts`<br>`tests/core/parsers/requirements-txt.property.test.ts` | Property 6: output is sorted by code point name then scope for valid, mutated, trap and noise text<br>Property 6: permuting entries, tables, headers, line endings and BOM gives the same dependencies in the same order<br>Property 6: output is sorted by code point name then scope for valid, mutated and noisy text<br>Property 6: permuting sections and keys of a manifest gives the same dependencies in the same order<br>Property 6: output is sorted by code point name then scope for valid, mutated and noisy text<br>Property 6: permuting the lines of a manifest without duplicate keys gives the same dependencies | passing |
| P7 | 1.8, 3.8, 3.18, 5.2, 4.6 | `tests/core/parsers/cargo-toml.property.test.ts`<br>`tests/core/parsers/package-json.property.test.ts`<br>`tests/core/parsers/requirements-txt.property.test.ts`<br>`tests/core/serializers/serialize-manifest.property.test.ts` | Property 7: one name declared once in each scope of a non-empty set gives one dependency per scope and no warning<br>Property 7: a name declared once in each scope of a non-empty set gives one dependency per scope, no warning<br>Property 7: a name declared once yields exactly one runtime Dependency with the declared fields and no warning<br>Property 7: distinct names stay distinct entries and requirements.txt only has the runtime scope<br>Property 7: one entry per (name, scope), the first after filter and sort is kept, scopes stay separate | passing |
| P8 | 4.9, 4.11 | `tests/core/parsers/cargo-toml.property.test.ts`<br>`tests/core/parsers/package-json.property.test.ts`<br>`tests/core/parsers/requirements-txt.property.test.ts` | Property 8: prototype-like names are ordinary dependencies and no prototype changes<br>Property 8: prototype names are ordinary dependencies and Object.prototype is untouched<br>Property 8: names that collide with Object.prototype members are ordinary Dependencies and nothing is polluted | passing |
| P9 | 5.8, 5.3 | `tests/core/serializers/serialize-manifest.property.test.ts` | Property 9: parse(serialize(list, format)) equals restrict(list, format) without warnings | passing |
| P10 | 5.9 | `tests/core/serializers/serialize-manifest.property.test.ts` | Property 10: parse(serialize(parse(x).dependencies)) has the same projection as parse(x) | passing |
| P11 | 5.10 | `tests/core/serializers/serialize-manifest.property.test.ts` | Property 11: serialize(parse(serialize(list)).dependencies) is byte-identical to serialize(list) | passing |
| P12 | 5.12, 5.6, 5.4, 5.5 | `tests/core/serializers/serialize-manifest.property.test.ts` | Property 12: permutations give byte-identical text, restricted and deduplicated in Dependency_Order | passing |
| P13 | 6.4 | `tests/core/classifier/classify.property.test.ts` | Property 13: never throws and always returns a Classification<br>Property 13: never throws for Proxies with throwing traps and exotic values | passing |
| P14 | 6.3, 6.5, 6.6 | `tests/core/classifier/classify.property.test.ts` | Property 14: 6.3 Reason is present iff reportable unknown fields exist and lists each exactly once | passing |
| P15 | 8.10 | `tests/core/classifier/classify.property.test.ts` | Property 15: abandoned equals archived, deprecated or the 8.3 release condition with the commit threshold | passing |
| P16 | 8.11 | `tests/core/classifier/classify.property.test.ts` | Property 16: dormant equals the 8.4 definition and never co-occurs with an 8.3 Reason | passing |
| P17 | 8.12 | `tests/core/classifier/classify.property.test.ts` | Property 17: changing maintainerCount leaves abandoned and status unchanged | passing |
| P18 | 9.5 | `tests/core/classifier/classify.property.test.ts` | Property 18: status is HAUNTED iff vulnerable, DEAD iff not vulnerable and abandoned, else ALIVE | passing |
| P19 | 9.6 | `tests/core/classifier/classify.property.test.ts` | Property 19: repeated calls return deeply equal results, including Reasons order | passing |
| P20 | 10.10 | `tests/core/classifier/classify.property.test.ts` | Property 20: score is an integer in [0, 100] | passing |
| P21 | 10.22, 10.1, 10.17 | `tests/core/classifier/classify.property.test.ts`<br>`tests/core/scoring/scoring.property.test.ts` | Property 21: classify score equals the sum of the score components<br>Property 21: score is the component sum, components within caps, 0 <= sum <= 100 | passing |
| P22 | 10.11 | `tests/core/scoring/scoring.property.test.ts` | Property 22: increasing a valid openVulnerabilityCount by 1 never lowers the score | passing |
| P23 | 10.12 | `tests/core/scoring/scoring.property.test.ts` | Property 23: raising a known severity never lowers the score | passing |
| P24 | 10.24, 7.3 | `tests/core/classifier/classify.property.test.ts` | Property 24: shrunk counterexample with no vulnerabilities<br>Property 24: unknown maxSeverity classifies like MEDIUM apart from the 6.3 and 11.2 Reasons | passing |
| P25 | 10.13, 10.20 | `tests/core/scoring/scoring.property.test.ts` | Property 25: a larger daysSinceLastRelease never lowers the score | passing |
| P26 | 10.14 | `tests/core/scoring/scoring.property.test.ts` | Property 26: setting archived or deprecated to true never lowers the score | passing |
| P27 | 10.19 | `tests/core/scoring/scoring.property.test.ts` | Property 27: becoming abandoned never lowers the score | passing |
| P28 | 10.18 | `tests/core/classifier/classify.property.test.ts` | Property 28: haunted and abandoned scores strictly above either alone | passing |
| P29 | 10.15 | `tests/core/classifier/classify.property.test.ts` | Property 29: no vulnerability and no 8.1 to 8.3 criterion gives ALIVE | passing |
| P30 | 11.6, 11.1, 11.3, 11.4, 11.5, 11.2 | `tests/core/classifier/classify.property.test.ts` | Property 30: Reasons are well formed and ordered | passing |
| P31 | 11.7 | `tests/core/classifier/classify.property.test.ts` | Property 31: status is explained by Reasons | passing |
| P32 | 12.8, 12.1, 12.2, 12.3 | `tests/core/summarizer/summarize.property.test.ts` | Property 32: counts and unassessed partition the unique packages | passing |
| P33 | 12.9, 12.4 | `tests/core/summarizer/summarize.property.test.ts` | Property 33: average and maximum are bounded by the merged scores | passing |
| P34 | 12.10, 12.17 | `tests/core/summarizer/summarize.property.test.ts` | Property 34: summarize is invariant under input permutation | passing |
| P35 | 12.11, 12.17 | `tests/core/summarizer/summarize.property.test.ts` | Property 35: summarize is deterministic and equals the oracle | passing |
| P36 | 12.12, 12.6, 12.7 | `tests/core/summarizer/summarize.property.test.ts` | Property 36: worst list is bounded, ordered and equals the oracle prefix | passing |
| P37 | 12.17, 12.5 | `tests/core/summarizer/summarize.property.test.ts` | Property 37: grade is in A-F when assessed > 0 and null otherwise | passing |
| P38 | 12.18, 12.15, 12.16 | `tests/core/summarizer/summarize.property.test.ts` | Property 38: grade equals grade(maxScore), independent of averageScore, with monotonic thresholds | passing |
| P39 | 12.19, 12.13 | `tests/core/summarizer/summarize.property.test.ts` | Property 39: maxScore equals the maximum merged score and the score of maxScorePackage | passing |
| P40 | 12.20, 12.14 | `tests/core/summarizer/summarize.property.test.ts` | Property 40: unassessed items match unassessed packages | passing |
| P41 | 12.21, 12.1 | `tests/core/summarizer/summarize.property.test.ts` | Property 41: repeating an entry in another scope only adds a scope | passing |
| P42 | 12.1, 12.2, 12.22 | `tests/core/summarizer/summarize.property.test.ts` | Property 42: merged classification equals the oracle choice, independent of order and null entries | passing |
| P43 | 13.7, 13.3 | `tests/core/no-mutation.property.test.ts` | Property 43: classify does not mutate its input<br>Property 43: parseManifest does not mutate its inputs<br>Property 43: serializeManifest does not mutate its inputs<br>Property 43: summarize does not mutate its input | passing |
| P44 | 2.14, 2.2 | `tests/core/parsers/requirements-txt.property.test.ts` | Property 44: every parsed pypi Dependency has normalize(rawName) === name<br>Property 44: normalize is idempotent and equals the independent oracle<br>Property 44: parsed pypi Dependencies from arbitrary text satisfy normalize(rawName) === name | passing |
| P45 | 12.23, 12.15 | `tests/core/summarizer/summarize.property.test.ts` | Property 45: grade is not better than grade(score) of any assessed package | passing |
| P46 | 12.24, 12.15 | `tests/core/summarizer/summarize.property.test.ts` | Property 46: appending an entry never improves the grade | passing |
| P47 | 9.2, 9.5, 9.6 | `tests/core/summarizer/unique-packages.property.test.ts` | Property 12: uniquePackages length equals summarize total and merged classifications match<br>Property 12: mergeClassifications returns a member that no other member beats | passing |

## scan-accuracy

| Property | Requirement(s) | Test file | Test title | Status |
| --- | --- | --- | --- | --- |
| P1 | 1.2, 1.3, 1.5, 1.8 | `tests/core/classifier/commit-threshold.property.test.ts` | P1: abandoned and dormant follow the commit threshold for raw facts<br>P1: abandoned and dormant follow the commit threshold at the boundary day counts | passing |
| P2 | 2.1, 2.2, 2.3, 2.4, 2.5, 2.8, 2.9 | `tests/core/classifier/unknown-facts.property.test.ts` | Property 2: the 6.3 Reason has the exact text for the reportable unknown fields<br>Property 2: an unknown severity is not reported when the open count is a Valid_Fact 0 | passing |
| P3 | 3.2, 3.3, 3.4, 3.13, 3.14 | `tests/pipeline/mapping/range-resolve.property.test.ts` | Property 3: The resolved version is listed and satisfies every range > a resolved version is an element of the list and satisfies each range under the library<br>Property 3 > a satisfiable range set over a list containing a stable match always resolves | passing |
| P4 | 3.2, 3.3, 3.4, 3.13, 3.14 | `tests/pipeline/mapping/range-resolve.property.test.ts` | Property 4: The resolved version is the highest non-prerelease match > equals the independent integer maximum of the listed stable versions (or unresolved when none match)<br>Property 4 > never returns a prerelease even when it is the highest match<br>Property 4 > cargo bare and caret requirements pick the integer maximum below the caret bound | passing |
| P5 | 3.8, 3.9, 3.15 | `tests/pipeline/mapping/version-choose.property.test.ts` | returns the same selection, basis and notes for any permutation of the specs<br>never resolves a range when at least one Exact_Pin is present | passing |
| P6 | 4.9, 4.10 | `tests/pipeline/mapping/range-cargo.property.test.ts` | a bare version resolves like the same version with a caret<br>a comma requirement satisfies each comparator alone, is the highest such version, and ignores order | passing |
| P7 | 3.6, 3.7, 3.16, 4.11 | `tests/pipeline/mapping/version-choose.property.test.ts` | cargoToSemverRange and chooseVersion do not throw for any string<br>an unresolved outcome falls back to the default with exactly one range-unresolved note and sorted, cut ranges | passing |
| P8 | 11.3, 11.5 | `tests/pipeline/scan/messages.property.test.ts` | P8 The unresolved-range message contains no range text | passing |
| P9 | 8.1, 8.2, 8.3, 8.6 | `tests/pipeline/scan/candidates.property.test.ts` | P9 too-many-manifests carries exactly the discovered paths, capped, with only limit and candidates<br>P9 manifest-not-found carries exactly the discovered paths, capped, with only path and candidates | passing |
| P10 | 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.13, 6.14, 6.15 | `tests/pipeline/mapping/advisories.property.test.ts`<br>`tests/pipeline/mapping/assemble.property.test.ts`<br>`tests/pipeline/scan/advisories.property.test.ts` | P10: Advisory entries mirror the OSV ids<br>P10: no ids gives an empty list<br>assemble tagged test at line 279 (advisories in the assembled output)<br>P10: Advisory entries mirror the OSV ids (scan level) | passing |
| P11 | 7.1, 7.2, 7.3, 7.4, 7.7, 7.8 | `tests/pipeline/api/cache-header.property.test.ts` | Property 11: The cache header is present on 200 only and never changes the body | passing |
| P12 | 9.2, 9.5, 9.6 | `tests/core/summarizer/unique-packages.property.test.ts` | Property 12: uniquePackages length equals summarize total and merged classifications match<br>Property 12: mergeClassifications returns a member that no other member beats | passing |

## graveyard-ui

| Property | Requirement(s) | Test file | Test title | Status | 1000 runs | Date | Counterexample and fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | 3.11 | `tests/ui/view-model/urls-canonical.property.test.ts` | P1 repoUrl of the request body equals the Canonical_Repo_URL after writing it as the repo query value<br>P1 round-trips a plain example | passing | passed | 2026-11-19 | none |
| P2 | 3.12 | `tests/ui/view-model/urls-manifests.property.test.ts` | P2 also holds with a leading "?" and through buildUrl and parseUrlState<br>P2 decodeManifests(encodeManifests(list)) equals list in the same order | passing | passed | 2026-11-19 | none |
| P3 | 4.13 | `tests/ui/view-model/stages.property.test.ts` | P3 is an integer in 0..3 equal to the index of the last start time at most t<br>P3 never decreases as the elapsed time grows | passing | passed | 2026-11-19 | none |
| P4 | 5.9 | `tests/ui/view-model/header-summary.property.test.ts` | P4 N, M and the status counts come from the summary | passing | passed | 2026-11-19 | none |
| P5 | 5.2, 5.10 | `tests/ui/view-model/header-headline.property.test.ts` | P5 B + F = DEAD, H = HAUNTED, N = B + F + H, and the text equals the oracle | passing | passed | 2026-11-19 | none |
| P6 | 6.7 | `tests/ui/view-model/json-safe.property.test.ts` | P6 scene, table, header and notes models are plain JSON values that round-trip unchanged | passing | passed | 2026-11-20 | none |
| P7 | 7.1, 7.10 | `tests/ui/view-model/rows-key-set.property.test.ts` | P7 has exactly one row per distinct dependency key, and as many rows as summary.total | passing | passed | 2026-11-19 | none |
| P8 | 7.2, 7.11 | `tests/ui/view-model/rows-kinds.property.test.ts` | P8 rows carry the core classification and kind, and kind counts equal the summary | passing | passed | 2026-11-19 | none |
| P9 | 7.4, 7.12 | `tests/ui/view-model/reasons.property.test.ts` | P9 is an element of reasons, avoids 6.3/11.2 when another exists, and is 8.1-8.3 for DEAD<br>P9 returns null for a null classification | passing | passed | 2026-11-19 | none. The generator excludes DEAD together with 7.2, following the core status precedence (see the design note). |
| P10 | 7.6, 7.13 | `tests/ui/view-model/rows-labels.property.test.ts` | P10 every label is non-empty, names the package and status word, and is unique | passing | passed | 2026-11-19 | none |
| P11 | 7.7, 7.14 | `tests/ui/view-model/glow.property.test.ts` | P11 defaults to MEDIUM<br>P11 equals the level of the highest advisory severity, then fact severity, then MEDIUM<br>P11 GLOW_LEVELS[a] <= GLOW_LEVELS[b] whenever a is not higher than b | passing | passed | 2026-11-19 | none |
| P12 | 7.15, 7.16, 7.17, 7.20 | `tests/ui/view-model/grave-type.property.test.ts` | P12 derives grave type and plot kind exactly as specified<br>P12 equals for equal status and equal rule id set, whatever the order and duplicates<br>P12 maps the six kinds to six distinct words | passing | passed | 2026-11-19 | none |
| P13 | 7.15, 7.16, 7.18, 7.20, 7.21 | `tests/ui/view-model/rows-graves.property.test.ts` | P13 buried plus forgotten equal DEAD, only dead plots have a grave, and restless ghosts are exactly the haunted with 8.1 or 8.2 | passing | passed | 2026-11-19 | none |
| P14 | 8.11, 8.15 | `tests/ui/view-model/scene-overlap.property.test.ts` | P14 no two distinct plot rectangles intersect for 2 to 20 columns | passing | passed | 2026-11-19 | none. Rectangles are half-open, so plots with touching edges do not overlap. Now includes label rectangles (30.4, passed at 1000 runs on 2026-11-19). |
| P15 | 8.3, 8.12, 8.15 | `tests/ui/view-model/scene-bounds.property.test.ts` | P15 every plot rectangle is inside [0, width] x [0, height] and height follows the formula | passing | passed | 2026-11-19 | none. Now includes label rectangles (30.4, passed at 1000 runs on 2026-11-19). |
| P16 | 8.2, 8.13 | `tests/ui/view-model/scene-determinism.property.test.ts` | P16 builds equal scenes twice and after rotating dependencies and assessed together | passing | passed after fix | 2026-11-19 | Failed at 1000 runs with seed 1457184590 (columns=4, offset=10). Two rows with the same ecosystem and name but a different sourceKind kept input order. Fixed with a sourceKind tiebreak in the scene sort of `view-model/package-rows.ts` (design step 8 updated). |
| P17 | 8.14 | `tests/ui/view-model/scene-plots.property.test.ts` | P17 each row has exactly one plot with a non-empty label containing its name or its cut form | passing | passed | 2026-11-19 | none |
| P18 | 9.6, 9.9 | `tests/ui/view-model/scene-nav.property.test.ts` | P18 every move lands on an existing plot, edges keep the index, right then left returns | passing | passed | 2026-11-19 | none |
| P19 | 10.4, 10.14 | `tests/ui/view-model/format-fact.property.test.ts` | P19 formats booleans as "yes" and "no", and false as "no"<br>P19 formats non-negative integer counts as their decimal text and rejects non-integers<br>P19 formats non-negative whole numbers of day fields as "<n> days", and 0 as "0 days"<br>P19 formats severity words as themselves and every other string as unknown<br>P19 lists the seven fact fields<br>P19 never formats an unknown value as 0, "no" or empty<br>P19 returns "unknown" for any value that is not valid for any field | passing | passed | 2026-11-19 | none |
| P20 | 10.4, 10.15 | `tests/ui/view-model/detail.property.test.ts` | P20 the detail lists every reason verbatim in order, marks one as main, and names each fact once | passing | passed | 2026-11-19 | none. The 1000-run pass used `--testTimeout=600000` on the command line. The file sets no per-test timeout. Now includes labels (30.2, passed at 1000 runs on 2026-11-19). |
| P21 | 10.16, 10.18, 10.19 | `tests/ui/view-model/advisory-groups.property.test.ts` | P21 a withdrawn entry stays withdrawn even when a note names its id<br>P21 puts every entry in exactly one group, in API order, with unchanged id and checked href<br>P21 with an absent exclusion, note-named ids are informational and the rest are not classified<br>P21 with every exclusion known, each entry is in the group its value names and nothing is unclassified | passing | passed | 2026-11-19 | none |
| P22 | 11.4, 11.7, 11.8, 11.14 | `tests/ui/view-model/notes-groups.property.test.ts` | P22 agrees with the exported section table<br>P22 puts every note in exactly one group, with counts summing to notes.length and messages verbatim | passing | passed | 2026-11-19 | none |
| P23 | 11.2, 11.15 | `tests/ui/view-model/notes-sources.property.test.ts` | P23 lists the six sources once each in the fixed order, with the status taken from sources | passing | passed | 2026-11-19 | none |
| P24 | 13.1, 13.2, 13.13 | `tests/ui/view-model/errors.property.test.ts` | P24 keeps the API message exactly<br>P24 never throws, and always has a heading, a way out and unique actions | passing | passed | 2026-11-19 | none |
| P25 | 13.4, 13.14 | `tests/ui/view-model/errors-countdown.property.test.ts` | P25 enables Retry exactly when the remaining time is 0<br>P25 is non-increasing in elapsed time and never negative<br>P25 is s * 1000 - t before the cooldown ends and 0 from s * 1000 on<br>P25 starts at the full cooldown at elapsed 0 | passing | passed | 2026-11-19 | none |
| P26 | 11.11, 13.15, 13.17 | `tests/ui/view-model/picker.property.test.ts` | P26 builds a URL that decodes to the selected paths in candidate order and the repo value<br>P26 lists every candidate once in order and disables unchecked boxes at the limit | passing | passed | 2026-11-19 | none |
| P27 | 14.1, 14.2, 14.3, 14.4, 14.7 | `tests/ui/view-model/parse-response-total.property.test.ts` | P27: returns exactly one of result, error or failure and never throws | passing | passed | 2026-11-19 | none |
| P28 | 14.5, 14.8 | `tests/ui/view-model/parse-response-roundtrip.property.test.ts` | P28 returns the input unchanged apart from narrowing, keeping valid facts, advisories and bases | passing | passed | 2026-11-19 | none |
| P29 | 14.9, 14.10 | `tests/ui/view-model/parse-response-cache.property.test.ts` | P29 maps hit and miss exactly, anything else to unknown, and never changes the result<br>P29 reads no cache status from a non-200 status | passing | passed | 2026-11-19 | none |
| P30 | 18.4, 18.5, 18.9 | `tests/ui/view-model/table-sort.property.test.ts` | P30 sorted rows permute the scene rows and are ordered by the column key, null keys last | passing | passed | 2026-11-19 | none |
| P31 | 18.10 | `tests/ui/view-model/table-scene.property.test.ts` | P31 table and scene hold the same keys, and each table row matches its plot row | passing | passed | 2026-11-19 | none |
| P32 | 18.11 | `tests/ui/view-model/table-idempotent.property.test.ts` | P32 building the table from the rows of a table built with the same sort keeps the row order | passing | passed | 2026-11-19 | none |
| P33 | 21.3, 21.4, 21.7 | `tests/ui/view-model/urls-links.property.test.ts` | P33 advisoryLink is null or an https link to a LINK_HOSTS host<br>P33 canonicalRepoUrl stays on https and the Scan_Result repo host, whatever the owner, repo and branch<br>P33 javascript: and data: inputs never produce a link<br>P33 non-string sourceRepo and advisory url give null<br>P33 registryLink gives null for non-string names<br>P33 registryLink is null or an https link to a registry host<br>P33 sourceRepoLink is null or an https link to a LINK_HOSTS host | passing | passed | 2026-11-19 | none |
| P34 | 22.1, 22.2, 22.3, 22.4, 22.5, 22.7 | `tests/pipeline/mapping/advisory-exclusion.property.test.ts` | P34: Advisory exclusion kind agrees with the counted vulnerabilities (pipeline) | passing | passed | 2026-11-19 | none. This is the pipeline advisory-exclusion test. |

Status is from a full `npx vitest --run` with FC_NUM_RUNS unset on 2026-11-20. "1000 runs" is `npm run test:deep` on the file. Each tag was checked against the property number, and `tests/ui/traceability.test.ts` enforces it for P1 to P34. P34 is the pipeline advisory-exclusion test, outside `tests/ui`.

## graveyard-art (GA-P1 to GA-P14)

Tags read `// Feature: graveyard-art, Property GA-P<n>`. Test titles start with `GA-P<n>`. Titles below are the design property titles. All 14 properties passed in the normal and the deep (`npm run test:deep`) runs.

| Property | Requirement(s) | Test file | Test title | Status |
| --- | --- | --- | --- | --- |
| GA-P1 | 3.2, 3.3, 3.4 | `tests/ui/view-model/variant-choice.property.test.ts` | Variant choice is a deterministic function of kind and key | passing |
| GA-P2 | 3.6, 3.8 | `tests/ui/view-model/tilt.property.test.ts` | Tilt stays within the range and only stones lean | passing |
| GA-P3 | 2.6, 2.7 | `tests/ui/view-model/depth.property.test.ts` | Depth is monotone by row and stays in range | passing |
| GA-P4 | 2.8, 17.1 | `tests/ui/view-model/depth-geometry.property.test.ts` | Depth does not change any layout box | passing |
| GA-P5 | 6.1, 6.2, 6.6 | `tests/ui/view-model/duration-total.property.test.ts` | Duration formatting is total | passing |
| GA-P6 | 6.3, 6.4 | `tests/ui/view-model/duration-monotone.property.test.ts` | Duration formatting is monotone with exact unit boundaries | passing |
| GA-P7 | 8.1, 8.2, 8.3, 8.4 | `tests/ui/view-model/plain-reasons.property.test.ts` | Plain reason lines are total and take numbers only from the facts | passing |
| GA-P8 | 7.2, 7.7 | `tests/ui/view-model/epitaph-name.property.test.ts` | The epitaph contains the name and is made of sentences | passing |
| GA-P9 | 7.3, 7.4, 7.5, 7.6, 7.8 | `tests/ui/view-model/epitaph-facts.property.test.ts` | The epitaph invents no fact | passing |
| GA-P10 | 4.7, 4.8 | `tests/ui/view-model/symbol-ids.property.test.ts` | Every plot resolves to one existing, kind-unique symbol | passing |
| GA-P11 | 10.2, 10.3, 10.5 | `tests/ui/view-model/caretaker-scene.property.test.ts` | Lit stones grow as a prefix and the lantern follows the last lit stone | passing |
| GA-P12 | 5.4, 5.9, 11.1, 11.2, 11.3, 11.4, 11.5 | `tests/ui/view-model/header-empty.property.test.ts` | The header shows either a verdict or one empty sentence | passing |
| GA-P13 | 11.6, 11.8 | `tests/ui/view-model/notes-once.property.test.ts` | The empty-graveyard message appears once | passing |
| GA-P14 | 8.1, 8.6, 8.8 | `tests/ui/view-model/detail-reasons.property.test.ts` | Reasons keep the core message and rule id verbatim | passing |

## pyproject (PY-P1 to PY-P10)

Tags read `// Feature: pyproject, Property PY-P<n>`. Test titles start with `PY-P<n>`. Status is from the full `npx vitest --run` above; every file listed passed.

| Property | Requirement(s) | Test file | Test title | Status |
| --- | --- | --- | --- | --- |
| PY-P1 | 2.1, 2.2, 2.4, 2.6, 2.7 | `tests/core/parsers/pyproject-never-throws.property.test.ts` | PY-P1: arbitrary strings with full unicode never throw and give a well formed result<br>PY-P1: hostile TOML-shaped texts never throw and give a well formed result<br>PY-P1: single table fragments, fixed and generated, never throw and give a well formed result | passing |
| PY-P2 | 8.9, 5.5, 5.7, 3.1, 3.2, 4.1 | `tests/core/parsers/pyproject-roundtrip.property.test.ts` | PY-P2 PEP 621 style: write then parse returns the sorted input with no warnings<br>PY-P2 Poetry style: write then parse returns the sorted input with no warnings | passing |
| PY-P3 | 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.10 | `tests/core/formats/poetry-constraint.property.test.ts` | PY-P3 the translated PEP 440 text accepts exactly what the Poetry reference accepts | passing |
| PY-P4 | 8.2, 8.3, 8.5, 8.6, 8.7 | `tests/core/parsers/pyproject-determinism.property.test.ts` | PY-P4: hostile and TOML-shaped text parses to equal results twice, sorted, without repeated keys<br>PY-P4: written dependency lists (both styles) parse deterministically, sorted, without repeated keys, no warnings<br>PY-P4: permuting the entries of a written list gives the same dependency list and warnings<br>PY-P4: scope models of every table kind are sorted and unique, and entry and table order do not change the result<br>PY-P4: the same package in a PEP 621 and a Poetry table keeps the PEP 621 entry whatever the text order, with one warning | passing |
| PY-P5 | 7.1, 7.2, 7.3, 7.4 | `tests/core/parsers/pyproject-names.property.test.ts` | PY-P5: the oracle collapses separator runs and lowercases (self check)<br>PY-P5: in every table kind, name is the PEP 503 form, rawName is as written, and it matches requirements.txt | passing |
| PY-P6 | 8.1, 8.8, 3.1, 3.2, 4.1, 5.1, 5.2, 5.3 | `tests/core/parsers/pyproject-scopes.property.test.ts` | PY-P6: the local scope table agrees with expectedScope for every kind and optional flag<br>PY-P6: every dependency of every table kind has exactly its table scope, within supportedScopes<br>PY-P6: Poetry entries map by table and optional flag, within supportedScopes | passing |
| PY-P7 | 4.2, 4.4, 4.5 | `tests/core/parsers/pyproject-include-group.property.test.ts` | PY-P7: dependencies equal those of the input without Include_Entries<br>PY-P7: exactly one Requirement 4.2 warning is added per Include_Entry, with the verbatim text<br>PY-P7: no dependency has an included group as its only source<br>PY-P7: self cycles and missing targets neither throw nor produce an error warning | passing |
| PY-P8 | 3.4, 3.5, 3.9 | `tests/core/parsers/pep508.property.test.ts` | PY-P8: a PEP 621 entry and a requirements.txt line give the same name, rawName, versionSpec and sourceKind, or both are skipped<br>PY-P8: generated valid lines are read, not vacuously skipped by both | passing |
| PY-P9 | 9.1, 9.2, 9.3, 9.8 | `tests/pipeline/mapping/pyproject-discovery.property.test.ts` | PY-P9 discovery lists exactly the manifest-named blobs outside skip dirs within the depth limit, format equals file name<br>PY-P9 default selection is exactly the root manifests in ascending code point order, pyproject.toml and requirements.txt together | passing |
| PY-P10 | 6.11, 10.4 | `tests/pipeline/mapping/poetry-resolve.property.test.ts` | PY-P10 resolveRange on the translation equals the Poetry_Reference highest stable version<br>PY-P10 every non-* translation is accepted by pepRange | passing |
## resurrect (RS-P1 to RS-P12)

Tags read `// Feature: resurrect, Property RS-P<n>`. Test titles start with `RS-P<n>`. Status is from the full `npx vitest --run` above; every file listed passed.

| Property | Requirement(s) | Test file | Test title | Status |
| --- | --- | --- | --- | --- |
| RS-P1 | 10.11 | `tests/ui/view-model/resurrect-determinism.property.test.ts` | RS-P1 building the model twice gives deeply equal values<br>RS-P1 the model does not depend on object identity or key order of the inputs<br>RS-P1 permuting the notes of the scan does not change the model of a row<br>RS-P1 the model survives a JSON round trip unchanged | passing |
| RS-P2 | 9.1, 9.2 | `tests/ui/view-model/resurrect-visibility.property.test.ts` | RS-P2: for every plot case the model is non-null iff status is DEAD or kind is restless<br>RS-P2: the rule holds for every combination of classification and plot kind<br>RS-P2: every plot case and plot kind is exercised, with and without a slot | passing |
| RS-P3 | 7.2, 7.6, 10.1, 10.10 | `tests/ui/view-model/resurrect-names.property.test.ts` | RS-P3: every alternative and code name is valid; names that fail never appear | passing |
| RS-P4 | 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.9, 10.10, 11.7 | `tests/ui/view-model/resurrect-commands.property.test.ts` | RS-P4: every token is a Fixed_Word or a validated name, copyText equals the lines, hostile names give no block<br>RS-P4: a name that is not command-safe for any origin ecosystem yields no block | passing |
| RS-P5 | 7.7 | `tests/ui/view-model/resurrect-self.property.test.ts` | RS-P5 no alternative normalises to the name of the row<br>RS-P5 when every alternative is a self-reference the suggestion is absent and the fallback shows<br>RS-P5 an alternative that is not a self-reference is kept | passing |
| RS-P6 | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6 | `tests/pipeline/mapping/hint-text.property.test.ts` | RS-P6 constant matches the bound used by the oracle<br>RS-P6 non-string values give null<br>RS-P6 strings match the independent oracle<br>RS-P6 result is trimmed, bounded, plain and single-spaced<br>RS-P6 normalizing twice equals normalizing once<br>RS-P6 Markdown, HTML and URL characters stay literal | passing |
| RS-P7 | 12.2, 4.9, 4.10 | `tests/ui/view-model/resurrect-links.property.test.ts` | RS-P7: every href comes from a validated builder or a validated curated source, is https, and is not taken from hint text<br>RS-P7: a URL present only in hint text never appears as an href | passing |
| RS-P8 | 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.7 | `tests/pipeline/mapping/hints.property.test.ts` | RS-P8 npm extractor never throws and yields at most one well-shaped hint<br>RS-P8 npm extractor returns one hint exactly when deprecated is a string non-empty after normalization<br>RS-P8 advisory extractor never throws and keeps kind, source URL and the cap<br>RS-P8 advisory extractor matches the independent selection oracle, ids ascending and unique<br>RS-P8 withdrawn or not-unmaintained records never produce a hint<br>RS-P8 advisory extractor is total for a hostile list | passing |
| RS-P9 | 4.7, 4.8 | `tests/ui/view-model/narrow-hints.property.test.ts` | RS-P9 is total and gives [] for any non-array<br>RS-P9 returns only valid hints, at most the cap, in the order of the valid inputs<br>RS-P9 is idempotent on its own output | passing |
| RS-P10 | 7.4, 7.5 | `tests/ui/view-model/resurrections.property.test.ts` | RS-P10 loaded lists hold one entry per normalized from, and every equivalent spelling resolves to it<br>RS-P10 a name whose normalized form is not a from gives null in a loaded list<br>RS-P10 lookupCurated returns the same entry for every equivalent spelling of a shipped from<br>RS-P10 lookupCurated agrees with the oracle on arbitrary names, null when the normalized form is not a from<br>RS-P10 an npm name is looked up exactly, so a different case is not an equivalent spelling | passing |
| RS-P11 | 9.3, 9.4, 9.6, 9.7, 9.11 | `tests/ui/view-model/resurrect-order.property.test.ts` | RS-P11 urgent exists iff the row is restless, and sections follow urgent, hints, suggestions, fallback<br>RS-P11 the fallback is present iff there are no hints and no suggestions<br>RS-P11 the fallback is forgotten-type for forgotten rows and buried-type otherwise<br>RS-P11 the fallback names no package: no code segments, no alternatives, no curated name<br>RS-P11 every combination of hint count and curated kind occurs for each slot case | passing |
| RS-P12 | 4.5, 4.6, 5.5 | `tests/pipeline/scan/scan-cache-hints.property.test.ts` | RS-P12 accepts a generated result, before and after a JSON round trip<br>RS-P12 rejects a result with one hint replaced by a malformed one<br>RS-P12 rejects a result with one pyprojectTool replaced by an unknown value | passing |

RS-P4 and RS-P7 run on view-model values without a DOM.

RS-P3 found a defect during development: curated names injected into the model were not re-validated in `suggestionOf`. Counterexamples: `to: [""]` (seed -726162033) and `to: ["a b"]` (seed -1346668248). The fix is in `view-model/resurrect.ts`.

## Properties without a test

### scan-pipeline (0 of 76)

None. All 76 properties (P1 to P76) have at least one passing test.

### dependency-graveyard-core (0 of 47)

None. All 47 properties (P1 to P47) have at least one passing test.

### scan-accuracy (0 of 12)

None. All 12 properties (P1 to P12) have at least one passing test.

### graveyard-ui (0 of 34)

None. All 34 properties (P1 to P34) have at least one passing test.

### pyproject (0 of 10)

None. All 10 properties (PY-P1 to PY-P10) have at least one passing test.

### resurrect (0 of 12)

None. All 12 properties (RS-P1 to RS-P12) have at least one passing test.

## Tag and number mismatches

- No test is tagged with a property number that is missing from the matching design.md.
- No `P<n>` or `Property <n>` title disagrees with its tag comment, and every tagged file belongs to the spec named in its tag.
- Tag wording differs from the design heading (number is right):
  - scan-pipeline P5: tag says "does not echo input", design says "uses fixed error messages" (`tests/pipeline/config/github-config.property.test.ts:31`).
  - dependency-graveyard-core P21: tag says "Score is the sum of its components (classify level)", design says "Score equals the sum of the components, clamp is a no-op" (`tests/core/classifier/classify.property.test.ts:191`).
  - dependency-graveyard-core P7, P8, P12, P14, P42: the design heading ends in "(extra)", or the tag adds "(parser side)" or "(serializer side)". Wording only.
- dependency-graveyard-core P47 shares its test with scan-accuracy P12 (one file carries both tags, the titles say "Property 12").
- Rows changed by scan-accuracy: core P14, P15, P16 (titles updated), P24 (tag updated, titles unchanged) and the new core P47. Pipeline P14, P15, P57, P58, P64 and P68 keep their tests and titles and still pass.
- Tests matched by tag comment only, because the title has no `P<n>` prefix: scan-pipeline P5, P14, P15, and the dependency-graveyard-core serialize-manifest tests.

## Notes

- `dependency-graveyard-core/design.md` has 47 properties, not 39. The table has one row per property.
- P16 and P17 are registry-driven: one test per mapper or per removed field in `mappers.property.test.ts`, so the title cell gives a count.
- scan-accuracy P3, P4 and P11 are now tagged with `// Feature: scan-accuracy` and `// Validates:` lines.
- pyproject PY-P8 compares the PEP 621 entry parser with the requirements.txt parser. The Pyproject_Writer used by PY-P2 and PY-P4 is test-only and not part of the product code.
- pyproject PY-P10 found a PEP 440 zero-padding defect in prefix matches (counterexample `1.0.*` against `["1"]`, seed -444692813). The fix is in task 4.11 and criterion 10.9.
