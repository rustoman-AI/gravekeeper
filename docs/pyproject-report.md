# pyproject live report

Generated 2026-11-21T03:41:25.613Z with the production stack, the L2 cache off and empty L1 caches before each cold scan. Request counts are taken at `fetch` (method, host and path pattern only).

Pipeline limits: at most 10 manifests and 300 dependencies per scan.

## Requests per source and endpoint (cold scans)

| source | endpoint pattern | psf/requests |
| --- | --- | --- |
| depsdev | GET api.deps.dev/v3/systems/{system}/packages/{name} | 17 |
| depsdev | POST api.deps.dev/v3alpha/versionbatch | 1 |
| github | GET api.github.com/repos/{owner}/{repo} | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/branches/{ref} | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/git/trees/{ref} | 1 |
| github | GET raw.githubusercontent.com/{owner}/{repo}/{ref}/{path} | 1 |
| github | POST api.github.com/graphql | 1 |
| osv | POST api.osv.dev/v1/querybatch | 1 |
| pypi | GET pypi.org/pypi/{name}/{version}/json | 17 |

## psf/requests

| field | value |
| --- | --- |
| HTTP status | 200 |
| X-Gravekeeper-Cache (cold) | miss |
| X-Gravekeeper-Cache (immediate repeat) | hit (HTTP 200) |
| cold duration ms | 2567 |

| field | value |
| --- | --- |
| grade | B |
| counts (ALIVE / HAUNTED / DEAD) | 16 / 0 / 1 |
| unassessed (dependency entries with no classification) | 0 |
| unique packages / assessed / unassessed (summary) | 17 / 17 / 0 |
| dependencies | 18 |
| dependencies by versionBasis | pinned: 1, resolved: 9, default: 8, null: 0 |
| `range-unresolved` notes | 0 |
| total advisories | 0 |
| `capped.skipped` non-empty | no |
| any source partial or failed | no |

### Manifests read

| path | format | dependencies |
| --- | --- | --- |
| pyproject.toml | pyproject.toml | 18 |

### Source statuses

| source | status |
| --- | --- |
| github | ok |
| depsdev | ok |
| osv | ok |
| npm | ok |
| cratesio | ok |
| pypi | ok |

### Notes by code

| code | count |
| --- | --- |
| source-repo-unverified | 17 |

### HAUNTED packages

_none_

### Per-package results

| name | status | score | ruleIds | checked version | versionBasis |
| --- | --- | --- | --- | --- | --- |
| certifi | ALIVE | 5 | 10.8 | 2026.11.20 | resolved |
| chardet | ALIVE | 0 | 11.2 | 7.7.0 | resolved |
| charset-normalizer | ALIVE | 5 | 10.8 | 3.5.2 | resolved |
| cryptography | ALIVE | 5 | 10.8 | 50.0.2 | default |
| httpbin | ALIVE | 0 | 11.2 | 0.10.4 | resolved |
| idna | ALIVE | 5 | 10.8 | 3.20.0 | resolved |
| pyopenssl | ALIVE | 0 | 11.2 | 26.4.0 | default |
| pyright | ALIVE | 5 | 10.8 | 1.1.414 | default |
| pysocks | DEAD | 25 | 8.3, 10.8 | 1.7.1 | resolved |
| pytest | ALIVE | 0 | 11.2 | 9.2.0 | resolved |
| pytest-cov | ALIVE | 5 | 10.8 | 7.1.0 | default |
| pytest-httpbin | ALIVE | 10 | 8.4 | 2.1.0 | pinned |
| pytest-mock | ALIVE | 0 | 11.2 | 3.17.0 | default |
| pytest-xdist | ALIVE | 10 | 10.6 | 3.8.0 | default |
| trustme | ALIVE | 10 | 6.3, 10.6 | 1.2.1 | default |
| typing-extensions | ALIVE | 0 | 11.2 | 4.16.0 | default |
| urllib3 | ALIVE | 0 | 11.2 | 2.8.0 | resolved |

### Requests (cold scan, counted at fetch)

| source | endpoint pattern | requests |
| --- | --- | --- |
| depsdev | GET api.deps.dev/v3/systems/{system}/packages/{name} | 17 |
| depsdev | POST api.deps.dev/v3alpha/versionbatch | 1 |
| github | GET api.github.com/repos/{owner}/{repo} | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/branches/{ref} | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/git/trees/{ref} | 1 |
| github | GET raw.githubusercontent.com/{owner}/{repo}/{ref}/{path} | 1 |
| github | POST api.github.com/graphql | 1 |
| osv | POST api.osv.dev/v1/querybatch | 1 |
| pypi | GET pypi.org/pypi/{name}/{version}/json | 17 |

| source | cold requests |
| --- | --- |
| github | 5 |
| depsdev | 18 |
| osv | 1 |
| npm | 0 |
| cratesio | 0 |
| pypi | 17 |
| total | 41 |

Requests during the immediate repeat: 2.

## Featured comparison

| repository | ALIVE | HAUNTED | DEAD | unassessed | DEAD plus HAUNTED | grade |
| --- | --- | --- | --- | --- | --- | --- |
| psf/requests | 16 | 0 | 1 | 0 | 1 | B |
| revmic/canopy | 1 | 3 | 2 | 0 | 5 | C |

revmic/canopy stays featured: psf/requests has DEAD plus HAUNTED of 1 against canopy's 5, which is not strictly larger, and it is not equal with a worse grade (B is better than C), so psf/requests is not a Convincing_Graveyard.

## Findings

- `range-unresolved` notes: 0. The pypi `*` rule resolves unconstrained entries (for example `chardet` in the dev scope). Before this spec, unconstrained pypi entries got `range-unresolved`.
- Parser warnings: one, `pyproject.toml table [dependency-groups.test]: "requests" refers to this project itself and was skipped.` This is the self-reference `requests[socks]`. The scan and the e2e fixture (`tests/e2e/.generated/scan-psf-requests.json`) show it under the manifest's `warnings`, not under notes.
- Unassessed dependencies: none (0 entries with no classification; 17 unique packages, 17 assessed).
- versionBasis split over 18 dependency entries: pinned 1, resolved 9, default 8, null 0.
- DEAD package: `pysocks` (score 25, rules 8.3 and 10.8): 2619 days since the last release and the last commit, which is past `ABANDONMENT_DAYS` (730), and a single maintainer. It is the only DEAD package, so the grade is B.
- `chardet` appears in two scopes (dev with `*`, optional with `>=3.0.2,<8`). The 18 entries collapse to 17 unique packages.
- Two PEP 440 zero-padding defects were found by property PY-P10 and fixed in `pepSatisfies`: the prefix (`.*`) clauses (commit 7115d2f, task 4.11, criterion 10.9) and the other clauses such as `~=` (commit b7ebbaf, task 4.12, criterion 10.10). The library does not treat `2.0` as `2.0.0.0` without padding.


## Production scan

POST `https://gravekeeper-chi.vercel.app/api/scan` with `{"repoUrl":"https://github.com/psf/requests"}`.

Deploy check: `gh api repos/rustoman-AI/gravekeeper/commits/7def432/status` returned `pending` (no Vercel status was attached; the only check run, `check`, was `in_progress`). I did not wait. The response itself shows production already includes this spec: it lists `pyproject.toml` (format `pyproject.toml`) as a manifest and the pypi `*` rule is active (no `range-unresolved` notes). I could not confirm that the deployed build is commit 7def432 itself.

| field | value |
| --- | --- |
| HTTP status | 200 |
| X-Gravekeeper-Cache | miss |
| duration ms (client-measured) | 3123 |
| grade | B |
| counts (ALIVE / HAUNTED / DEAD) | 16 / 0 / 1 |
| unique packages / assessed / unassessed | 17 / 17 / 0 |
| dependencies by versionBasis | pinned: 1, resolved: 9, default: 8 |
| notes | source-repo-unverified: 17 |
| DEAD | pysocks (8.3, 10.8) |

Manifests read: `pyproject.toml` (pyproject.toml), with the self-reference warning for `[dependency-groups.test]`. Discovery also listed the candidate `docs/requirements.txt`, which was not read. The result matches the local live scan.

## Properties
Each file was run with `npm run test:deep -- <file>`. `scripts/test-deep.ts` sets `FC_NUM_RUNS=1000` in the child environment only, and `tests/support/fc-config.ts` reads it as `numRuns` (default 100). Every property therefore ran 1000 times, except where a failure stopped the run early.

| # | Title | Test file | Runs | Result |
| --- | --- | --- | --- | --- |
| PY-P1 | Parsing never throws | `tests/core/parsers/pyproject-never-throws.property.test.ts` | 1000 | pass, no counterexample found |
| PY-P2 | The normalized set round-trips through a pyproject writer | `tests/core/parsers/pyproject-roundtrip.property.test.ts` | 1000 | pass, no counterexample found |
| PY-P3 | Poetry translation accepts exactly the versions Poetry accepts | `tests/core/formats/poetry-constraint.property.test.ts` | 1000 | pass, no counterexample found |
| PY-P4 | Output is deterministic, sorted and free of repeated keys | `tests/core/parsers/pyproject-determinism.property.test.ts` | 1000 | pass, no counterexample found |
| PY-P5 | Names are PEP 503 normalized and rawName is kept | `tests/core/parsers/pyproject-names.property.test.ts` | 1000 | pass, no counterexample found |
| PY-P6 | Scope mapping is total | `tests/core/parsers/pyproject-scopes.property.test.ts` | 1000 | pass, no counterexample found |
| PY-P7 | include-group entries are skipped with one warning and never resolved | `tests/core/parsers/pyproject-include-group.property.test.ts` | 1000 | pass, no counterexample found |
| PY-P8 | PEP 508 entries agree with the requirements.txt grammar | `tests/core/parsers/pep508.property.test.ts` | 1000 | pass, no counterexample found |
| PY-P9 | Discovery and root selection treat pyproject.toml like every manifest | `tests/pipeline/mapping/pyproject-discovery.property.test.ts` | 1000 | pass, no counterexample found |
| PY-P10 | Translated ranges resolve to the highest accepted version | `tests/pipeline/mapping/poetry-resolve.property.test.ts` | 1000 | pass, no counterexample found |

Files with several tests (P1 has 3, P2 has 2, P4 has 5, P5 has 2, P6 has 3, P7 has 4, P8 has 2, P9 has 2, P10 has 2) passed all their tests. All ten properties passed 1000 runs after fix 4.12 (re-run of task 12.2).

### Counterexamples found during development
- **PY-P10** found the PEP 440 zero-padding defect. The shrunk case is `1.0.*` with versions `["1"]`, seed -444692813, path `17:0:2:3:2:2:4`. The deep run found `5.0.*,>=0` with `["5"]`, seed -710714697. It was fixed in `pepSatisfies` (task 4.11, criterion 10.9, commit 7115d2f).
- **PY-P10** found a second zero-padding defect, in the `~=` path: `~=2.0.0.0` vs `["2.0"]`, seed 1855169442, path `263:6:9`. `resolveRange` returned `unresolved` where the Poetry_Reference expects `2.0`. It was fixed in task 4.12 (criterion 10.10) in a separate commit, b7ebbaf: `pepSatisfies` now zero-pads the candidate for every PEP 440 clause.
- **PY-P2** first failed on the empty list (`[[]]`, seed -792885459) because the test was too strict. The parser correctly warns when there are no tables. The test was corrected.
- **PY-P8** filters out blank and comment-only lines, which the requirements.txt grammar ignores.

## Commits and CI

The post-Milestone 3 fixes commit 3bd0e3d preceded this spec, and its CI passed.

| hash | subject | CI |
| --- | --- | --- |
| 6da90db | spec: pyproject (requirements, design, tasks) | success |
| 61981af | pyproject: core parser, Poetry translator and properties (groups 1-2) | no own run (pushed with 7115d2f, which passed) |
| 7115d2f | pyproject: discovery, cache key 3, pypi * rule, PEP 440 prefix padding, scan test (groups 4-5, 7.1-7.2, 10.1) | success |
| 7b1f424 | pyproject: psf/requests fixture set, export, e2e test, traceability doc; canopy stays featured (groups 7, 9, 10.2) | success |
| 7def432 | pyproject: final checkpoint green (task 11) | success |
| b7ebbaf | fix(pep440): zero-pad candidates for every clause (PY-P10 counterexample ~=2.0.0.0 vs 2.0; task 4.12, R10.10) | success |
| 61e5310 | pyproject: live report | success |
| (this commit) | pyproject: report commits and CI status | pending |
