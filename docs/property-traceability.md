# Property traceability

Maps every design property of the `scan-pipeline` and `dependency-graveyard-core` specs to its test. Rows were checked against the `// Feature: <spec>, Property <n>` tag comments, the `// Validates:` lines and the test titles in `tests/`. Status comes from a full `npx vitest --run` (FC_NUM_RUNS unset): 1357 tests, all passed.

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
| P39 | 13.16 | | | not yet implemented |
| P40 | 14.9 | | | not yet implemented |
| P41 | 14.10 | | | not yet implemented |
| P42 | 15.11 | | | not yet implemented |
| P43 | 15.12 | | | not yet implemented |
| P44 | 15.13 | | | not yet implemented |
| P45 | 15.14 | | | not yet implemented |
| P46 | 15.18 | | | not yet implemented |
| P47 | 16.6, 16.7, 16.10 | | | not yet implemented |
| P48 | 16.9 | | | not yet implemented |
| P49 | 16.13 | | | not yet implemented |
| P50 | 17.10 | | | not yet implemented |
| P51 | 17.11 | | | not yet implemented |
| P52 | 17.12, 17.16 | | | not yet implemented |
| P53 | 17.14 | | | not yet implemented |
| P54 | 17.15 | | | not yet implemented |
| P55 | 18.7 | | | not yet implemented |
| P56 | 18.8 | | | not yet implemented |
| P57 | 18.9 | | | not yet implemented |
| P58 | 18.12 | | | not yet implemented |
| P59 | 19.11, 19.18 | | | not yet implemented |
| P60 | 19.12 | | | not yet implemented |
| P61 | 19.13 | | | not yet implemented |
| P62 | 19.16 | | | not yet implemented |
| P63 | 20.8, 20.9 | | | not yet implemented |
| P64 | 21.12 | | | not yet implemented |
| P65 | 21.15 | | | not yet implemented |
| P66 | 22.15 | `tests/architecture/architecture.property.test.ts` | P66 reports a violation on the import line when the target is forbidden<br>P66 reports no import violation when the target is allowed | passing |
| P67 | 19.11 | | | not yet implemented |
| P68 | 19.21 | | | not yet implemented |
| P69 | 19.29 | | | not yet implemented |
| P70 | 19.30 | | | not yet implemented |
| P71 | 19.31 | | | not yet implemented |
| P72 | 19.32 | | | not yet implemented |
| P73 | 15.21 | | | not yet implemented |
| P74 | 12.15 | `tests/pipeline/mapping/maintainers.property.test.ts` | P74 orderCratesLookups orders by first scope then code point name, independent of input order | passing |
| P75 | 11.16 | `tests/pipeline/mapping/github.property.test.ts` | P75 unattributable errors leave every alias outcome unchanged | passing |

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
| P14 | 6.3, 6.5, 6.6 | `tests/core/classifier/classify.property.test.ts` | Property 14: 6.3 Reason is present iff unknown fields exist and lists each exactly once | passing |
| P15 | 8.10 | `tests/core/classifier/classify.property.test.ts` | Property 15: abandoned equals archived, deprecated or the 8.3 release condition | passing |
| P16 | 8.11 | `tests/core/classifier/classify.property.test.ts` | Property 16: dormant equals the 8.4 definition | passing |
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

## Properties without a test

### scan-pipeline (34 of 75)

P39 to P65 and P67 to P73 have no test yet (not yet implemented):

P39, P40, P41, P42, P43, P44, P45, P46, P47, P48, P49, P50, P51, P52, P53, P54, P55, P56, P57, P58, P59, P60, P61, P62, P63, P64, P65, P67, P68, P69, P70, P71, P72, P73.

### dependency-graveyard-core

None. All 46 properties have at least one passing test.

## Tag and number mismatches

- No test is tagged with a property number that is missing from the matching design.md.
- No `P<n>` or `Property <n>` title disagrees with its tag comment, and every tagged file belongs to the spec named in its tag.
- Tag wording differs from the design heading (number is right):
  - scan-pipeline P5: tag says "does not echo input", design says "uses fixed error messages" (`tests/pipeline/config/github-config.property.test.ts:31`).
  - dependency-graveyard-core P21: tag says "Score is the sum of its components (classify level)", design says "Score equals the sum of the components, clamp is a no-op" (`tests/core/classifier/classify.property.test.ts:191`).
  - dependency-graveyard-core P7, P8, P12, P14, P42: the design heading ends in "(extra)", or the tag adds "(parser side)" or "(serializer side)". Wording only.
- Tests matched by tag comment only, because the title has no `P<n>` prefix: scan-pipeline P5, P14, P15, and the dependency-graveyard-core serialize-manifest tests.

## Notes

- `dependency-graveyard-core/design.md` has 46 properties, not 39. The table has one row per property.
- P16 and P17 are registry-driven: one test per mapper or per removed field in `mappers.property.test.ts`, so the title cell gives a count.
