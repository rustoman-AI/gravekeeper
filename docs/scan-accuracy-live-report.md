# Scan accuracy live report

Generated 2026-11-19T11:50:13.052Z with the production stack, the L2 cache off and empty L1 caches before each cold scan. Request counts are taken at `fetch` (method, host and path pattern only).

Pipeline limits: at most 10 manifests and 300 dependencies per scan.

## Requests per source and endpoint (cold scans)

| source | endpoint pattern | request/request | expressjs/express | psf/requests | BurntSushi/ripgrep |
| --- | --- | --- | --- | --- | --- |
| cratesio | GET crates.io/api/v1/crates/{crate}/owners | 0 | 0 | 0 | 11 |
| depsdev | GET api.deps.dev/v3/advisories/{id} | 8 | 1 | 0 | 0 |
| depsdev | GET api.deps.dev/v3/systems/{system}/packages/{name} | 40 | 44 | 0 | 11 |
| depsdev | POST api.deps.dev/v3alpha/versionbatch | 1 | 1 | 0 | 1 |
| github | GET api.github.com/repos/{owner}/{repo} | 1 | 1 | 1 | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/branches/{ref} | 1 | 1 | 1 | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/git/trees/{ref} | 1 | 1 | 1 | 1 |
| github | GET raw.githubusercontent.com/{owner}/{repo}/{ref}/{path} | 1 | 1 | 0 | 1 |
| github | POST api.github.com/graphql | 1 | 1 | 0 | 1 |
| npm | GET registry.npmjs.org/{package}/{version} | 40 | 44 | 0 | 0 |
| osv | GET api.osv.dev/v1/vulns/{id} | 8 | 1 | 0 | 0 |
| osv | POST api.osv.dev/v1/querybatch | 1 | 1 | 0 | 1 |

## request/request

| field | value |
| --- | --- |
| HTTP status | 200 |
| X-Gravekeeper-Cache (cold) | miss |
| X-Gravekeeper-Cache (immediate repeat) | hit (HTTP 200) |
| cold duration ms | 5027 |

| field | value |
| --- | --- |
| grade | D |
| counts (ALIVE / HAUNTED / DEAD) | 9 / 5 / 26 |
| unassessed (dependency entries with no classification) | 0 |
| unique packages / assessed / unassessed (summary) | 40 / 40 / 0 |
| dependencies | 40 |
| dependencies by versionBasis | pinned: 0, resolved: 40, default: 0, null: 0 |
| `range-unresolved` notes | 0 |
| total advisories | 8 |
| `capped.skipped` non-empty | no |
| any source partial or failed | no |

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
| source-repo-unverified | 40 |

### HAUNTED packages

| package | score | advisories (severity) |
| --- | --- | --- |
| form-data | 37 | GHSA-fjxv-7rqg-78g4 (severity unknown), GHSA-hmw2-7cc7-3qxx (HIGH) |
| karma | 42 | GHSA-7x7c-qm48-pq9c (MEDIUM), GHSA-rc3x-jf5g-xvc5 (MEDIUM) |
| qs | 22 | GHSA-4mjr-xmp4-gh2g (MEDIUM), GHSA-6rw7-vpxm-498p (LOW) |
| tough-cookie | 20 | GHSA-72xf-g2v4-qvf3 (MEDIUM) |
| uuid | 60 | GHSA-w5hq-g745-h8pq (HIGH) |

### Per-package results

| name | status | score | ruleIds | checked version | versionBasis |
| --- | --- | --- | --- | --- | --- |
| aws-sign2 | DEAD | 25 | 8.3, 10.8 | 0.7.0 | resolved |
| aws4 | DEAD | 25 | 8.3, 10.8 | 1.13.2 | resolved |
| bluebird | DEAD | 25 | 8.3, 10.8 | 3.7.2 | resolved |
| browserify | ALIVE | 10 | 8.4 | 13.3.0 | resolved |
| browserify-istanbul | DEAD | 20 | 8.3 | 2.0.0 | resolved |
| buffer-equal | ALIVE | 10 | 8.4 | 1.0.1 | resolved |
| caseless | DEAD | 20 | 8.3 | 0.12.0 | resolved |
| codecov | DEAD | 30 | 8.1, 8.2, 8.3 | 3.8.3 | resolved |
| combined-stream | DEAD | 20 | 8.3 | 1.0.8 | resolved |
| coveralls | ALIVE | 10 | 8.4 | 3.1.1 | resolved |
| extend | ALIVE | 10 | 8.4 | 3.0.2 | resolved |
| forever-agent | DEAD | 20 | 8.3 | 0.6.1 | resolved |
| form-data | HAUNTED | 37 | 7.2 | 2.3.3 | resolved |
| function-bind | DEAD | 20 | 8.3 | 1.1.2 | resolved |
| har-validator | DEAD | 35 | 8.2, 8.4, 10.8 | 5.1.5 | resolved |
| http-signature | DEAD | 20 | 8.3 | 1.2.0 | resolved |
| is-typedarray | DEAD | 25 | 8.3, 10.8 | 1.0.0 | resolved |
| isstream | DEAD | 25 | 8.3, 10.8 | 0.1.2 | resolved |
| json-stringify-safe | DEAD | 20 | 8.3 | 5.0.1 | resolved |
| karma | HAUNTED | 42 | 7.2, 8.3 | 3.1.4 | resolved |
| karma-browserify | ALIVE | 10 | 8.4 | 5.3.0 | resolved |
| karma-cli | DEAD | 30 | 8.1, 8.3 | 1.0.1 | resolved |
| karma-coverage | DEAD | 20 | 8.3 | 1.1.2 | resolved |
| karma-phantomjs-launcher | DEAD | 30 | 8.1, 8.2, 8.3 | 1.0.4 | resolved |
| karma-tap | DEAD | 20 | 8.3 | 3.2.1 | resolved |
| mime-types | ALIVE | 0 | 11.2 | 2.1.35 | resolved |
| nyc | ALIVE | 0 | 11.2 | 14.1.1 | resolved |
| oauth-sign | DEAD | 20 | 8.3 | 0.9.0 | resolved |
| performance-now | DEAD | 25 | 8.3, 10.8 | 2.1.0 | resolved |
| phantomjs-prebuilt | DEAD | 35 | 8.1, 8.2, 8.3, 10.8 | 2.1.16 | resolved |
| qs | HAUNTED | 22 | 7.2 | 6.5.5 | resolved |
| rimraf | DEAD | 30 | 8.2, 10.8 | 2.7.1 | resolved |
| safe-buffer | DEAD | 20 | 8.3 | 5.2.1 | resolved |
| server-destroy | DEAD | 25 | 8.3, 10.8 | 1.0.1 | resolved |
| standard | ALIVE | 10 | 8.4 | 9.0.2 | resolved |
| tape | ALIVE | 0 | 11.2 | 4.17.0 | resolved |
| taper | DEAD | 25 | 8.3, 10.8 | 0.5.0 | resolved |
| tough-cookie | HAUNTED | 20 | 7.2 | 2.5.0 | resolved |
| tunnel-agent | DEAD | 20 | 8.3 | 0.6.0 | resolved |
| uuid | HAUNTED | 60 | 7.2, 8.2 | 3.4.0 | resolved |

### Requests (cold scan, counted at fetch)

| source | endpoint pattern | requests |
| --- | --- | --- |
| depsdev | GET api.deps.dev/v3/advisories/{id} | 8 |
| depsdev | GET api.deps.dev/v3/systems/{system}/packages/{name} | 40 |
| depsdev | POST api.deps.dev/v3alpha/versionbatch | 1 |
| github | GET api.github.com/repos/{owner}/{repo} | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/branches/{ref} | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/git/trees/{ref} | 1 |
| github | GET raw.githubusercontent.com/{owner}/{repo}/{ref}/{path} | 1 |
| github | POST api.github.com/graphql | 1 |
| npm | GET registry.npmjs.org/{package}/{version} | 40 |
| osv | GET api.osv.dev/v1/vulns/{id} | 8 |
| osv | POST api.osv.dev/v1/querybatch | 1 |

| source | cold requests |
| --- | --- |
| github | 5 |
| depsdev | 49 |
| osv | 9 |
| npm | 40 |
| cratesio | 0 |
| pypi | 0 |
| total | 103 |

Requests during the immediate repeat: 2.

## expressjs/express

| field | value |
| --- | --- |
| HTTP status | 200 |
| X-Gravekeeper-Cache (cold) | miss |
| X-Gravekeeper-Cache (immediate repeat) | hit (HTTP 200) |
| cold duration ms | 4135 |

| field | value |
| --- | --- |
| grade | B |
| counts (ALIVE / HAUNTED / DEAD) | 36 / 1 / 7 |
| unassessed (dependency entries with no classification) | 0 |
| unique packages / assessed / unassessed (summary) | 44 / 44 / 0 |
| dependencies | 44 |
| dependencies by versionBasis | pinned: 8, resolved: 36, default: 0, null: 0 |
| `range-unresolved` notes | 0 |
| total advisories | 1 |
| `capped.skipped` non-empty | no |
| any source partial or failed | no |

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
| source-repo-unverified | 44 |

### HAUNTED packages

| package | score | advisories (severity) |
| --- | --- | --- |
| hbs | 20 | GHSA-7f5c-rpf4-86p8 (MEDIUM) |

### Requests (cold scan, counted at fetch)

| source | endpoint pattern | requests |
| --- | --- | --- |
| depsdev | GET api.deps.dev/v3/advisories/{id} | 1 |
| depsdev | GET api.deps.dev/v3/systems/{system}/packages/{name} | 44 |
| depsdev | POST api.deps.dev/v3alpha/versionbatch | 1 |
| github | GET api.github.com/repos/{owner}/{repo} | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/branches/{ref} | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/git/trees/{ref} | 1 |
| github | GET raw.githubusercontent.com/{owner}/{repo}/{ref}/{path} | 1 |
| github | POST api.github.com/graphql | 1 |
| npm | GET registry.npmjs.org/{package}/{version} | 44 |
| osv | GET api.osv.dev/v1/vulns/{id} | 1 |
| osv | POST api.osv.dev/v1/querybatch | 1 |

| source | cold requests |
| --- | --- |
| github | 5 |
| depsdev | 46 |
| osv | 2 |
| npm | 44 |
| cratesio | 0 |
| pypi | 0 |
| total | 97 |

Requests during the immediate repeat: 2.

## psf/requests

| field | value |
| --- | --- |
| HTTP status | 200 |
| X-Gravekeeper-Cache (cold) | miss |
| X-Gravekeeper-Cache (immediate repeat) | hit (HTTP 200) |
| cold duration ms | 895 |

| field | value |
| --- | --- |
| grade | null |
| counts (ALIVE / HAUNTED / DEAD) | 0 / 0 / 0 |
| unassessed (dependency entries with no classification) | 0 |
| unique packages / assessed / unassessed (summary) | 0 / 0 / 0 |
| dependencies | 0 |
| dependencies by versionBasis | pinned: 0, resolved: 0, default: 0, null: 0 |
| `range-unresolved` notes | 0 |
| total advisories | 0 |
| `capped.skipped` non-empty | no |
| any source partial or failed | no |

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
| no-root-manifest | 1 |

### HAUNTED packages

_none_

### Requests (cold scan, counted at fetch)

| source | endpoint pattern | requests |
| --- | --- | --- |
| github | GET api.github.com/repos/{owner}/{repo} | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/branches/{ref} | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/git/trees/{ref} | 1 |

| source | cold requests |
| --- | --- |
| github | 3 |
| depsdev | 0 |
| osv | 0 |
| npm | 0 |
| cratesio | 0 |
| pypi | 0 |
| total | 3 |

Requests during the immediate repeat: 2.

## BurntSushi/ripgrep

| field | value |
| --- | --- |
| HTTP status | 200 |
| X-Gravekeeper-Cache (cold) | miss |
| X-Gravekeeper-Cache (immediate repeat) | hit (HTTP 200) |
| cold duration ms | 11923 |

| field | value |
| --- | --- |
| grade | A |
| counts (ALIVE / HAUNTED / DEAD) | 11 / 0 / 0 |
| unassessed (dependency entries with no classification) | 2 |
| unique packages / assessed / unassessed (summary) | 13 / 11 / 2 |
| dependencies | 13 |
| dependencies by versionBasis | pinned: 0, resolved: 11, default: 0, null: 2 |
| `range-unresolved` notes | 0 |
| total advisories | 0 |
| `capped.skipped` non-empty | no |
| any source partial or failed | no |

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
| maintainers-lower-bound | 3 |
| source-repo-unverified | 11 |

### HAUNTED packages

_none_

### Requests (cold scan, counted at fetch)

| source | endpoint pattern | requests |
| --- | --- | --- |
| cratesio | GET crates.io/api/v1/crates/{crate}/owners | 11 |
| depsdev | GET api.deps.dev/v3/systems/{system}/packages/{name} | 11 |
| depsdev | POST api.deps.dev/v3alpha/versionbatch | 1 |
| github | GET api.github.com/repos/{owner}/{repo} | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/branches/{ref} | 1 |
| github | GET api.github.com/repos/{owner}/{repo}/git/trees/{ref} | 1 |
| github | GET raw.githubusercontent.com/{owner}/{repo}/{ref}/{path} | 1 |
| github | POST api.github.com/graphql | 1 |
| osv | POST api.osv.dev/v1/querybatch | 1 |

| source | cold requests |
| --- | --- |
| github | 5 |
| depsdev | 12 |
| osv | 1 |
| npm | 0 |
| cratesio | 11 |
| pypi | 0 |
| total | 29 |

Requests during the immediate repeat: 2.

## Limits and secrets

No request count exceeds the pipeline limits: the largest cold scan resolved 44 dependencies and 1 manifest (limits 300 and 10), used 1 deps.dev version batch (batch size 100), 1 OSV querybatch (batch size 500), at most 8 advisory detail requests per source (limit 500) and 1 GraphQL batch (batch size 50). No token appears in this file (a search for ghp_, gho_, github_pat_ and Bearer found no match).
