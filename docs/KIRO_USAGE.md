# How Gravekeeper was built with Kiro

Demo video (2:25): https://youtu.be/AdOa_fjXAq4

A factual draft built from `KIRO_LOG.md`, the specs in `.kiro/specs` and the git history. Gaps are marked TODO.

## Spec-driven development

Every product feature was built from a spec in [.kiro/specs](../.kiro/specs). Counts below were taken from the files on 2026-11-22: requirements are `### Requirement N` headings in `requirements.md`, tasks are sub-tasks in `tasks.md` (top-level tasks where a spec has no sub-tasks), and properties are `### Property N` headings in `design.md`.

| Spec | Workflow | Requirements | Tasks | Properties |
| --- | --- | --- | --- | --- |
| dependency-graveyard-core | requirements first | 13 | 90 | 47 |
| scan-pipeline | requirements first | 23 | 209 | 76 |
| scan-accuracy | requirements first | 11 | 53 | 12 |
| graveyard-ui | requirements first | 22 | 174 | 34 |
| graveyard-art | requirements first | 21 | 83 | 14 |
| pyproject | requirements first | 15 | 53 | 10 |
| resurrect | requirements first | 16 | 55 | 12 |
| resurrect-upgrade | requirements first | 9 | 54 | 8 |
| art-polish | requirements first | 11 | 39 | 4 |
| polish-leftovers | quick spec | 5 | 36 | 5 |
| property-traceability | quick spec | 2 | 2 | 0 |
| session-14-ops | quick spec | 3 | 3 | 0 |
| **Total** | | **151** | **851** | **222** |

Two cases where writing the spec changed the implementation:

- **The repository grade.** The first requirement asked for the worse of an average-based grade and a worst-package grade. While writing the design, Kiro pointed out that the maximum score is always at least the average, so the worse of the two grades is always the worst-package grade (KIRO_LOG.md, "Notes for the write-up"). The rule was simplified in Session 7, and `repoGrade` in `core/summarizer/grade.ts` grades the maximum score only.
- **Python package names.** An early rule (D1) rejected names that were not already normalized, which would have rejected real packages such as Django and PyYAML. Session 5 replaced it with PEP 503 normalization that keeps the original spelling as `rawName`, added an idempotence property, and the design update found a round-trip conflict (backslashes in git and path specs against criterion 5.13) before any code existed.

## Property-based testing

The design documents define 222 correctness properties, and [docs/property-traceability.md](property-traceability.md) maps each property of the nine specs before polish-leftovers (217) to its test; it lists 0 properties without a test. The repository has 137 `*.property.test.*` files using fast-check. `npm run test:deep` runs them with 1000 runs each.

Defects in product code found by property tests:

| Property | What it found | Fix |
| --- | --- | --- |
| graveyard-ui P16 (scene determinism) | Rows with the same ecosystem and name but a different `sourceKind` kept input order (seed 1457184590). | Final `sourceKind` tiebreak in the scene sort, commit 5f1b8e5 |
| graveyard-ui P33 | At 1000 runs, a repo host `a.xn--` built the invalid URL `https://a.xn--///tree/`. | The response boundary rejects repos the pipeline cannot produce, commit 38ed2eb |
| pyproject PY-P10 | PEP 440 zero padding was missing in prefix clauses: `1.0.*` did not match `["1"]` (seed -444692813). | `pepSatisfies`, commit 7115d2f |
| pyproject PY-P10 | Zero padding was also missing in the `~=` path: `~=2.0.0.0` against `["2.0"]` returned unresolved (seed 1855169442). | `pepSatisfies` pads every clause, commit b7ebbaf |
| resurrect RS-P3 | Names from an injected curated list were not re-validated in `suggestionOf`, for example `to: [""]` (seed -726162033). | `view-model/resurrect.ts`, commit d18b79f |
| scan-pipeline Property 71 | The compact cache entry for OSV dropped `summary` and `details` once the resurrect spec started reading them (seed 433693239). | Compact encoder keeps both fields, commit 87dd26b |

Property tests also stopped execution three times on contradictions in the spec itself, and the user decided each one: Property 24 against Reasons 6.3 and 11.2 (Session 7), Property 5 against fixed error messages (Session 10), and Property 19 against criterion 8.9 for duplicate deps.dev keys (Session 11). Property GA-P5 found that the design's duration regex excluded 10 to 24 months; the design was corrected (docs/m3-design-changes.md). Test-side counterexamples, where the test was wrong and the code was right, are listed in KIRO_LOG.md (for example P33 using `Date.parse`, which accepts February 30).

## Steering

The four files in [.kiro/steering](../.kiro/steering) are always included.

| File | Rules it holds |
| --- | --- |
| `product.md` | What the app does, the supported manifests, public data sources only, no login, no paid APIs, no LLM calls at runtime, explainable results, partial results over an error page. |
| `structure.md` | Folder layout, file and symbol naming, `/core` may not import adapters, app or components or call fetch, fs or Date.now, requirement numbers cited above each rule, accessibility basics. |
| `tech.md` | Stack (Next.js, TypeScript strict, Tailwind, Vitest, fast-check, Vercel), `/core` may depend only on smol-toml pinned exactly, recorded fixtures instead of live network in tests, caching and rate-limit behaviour, the `FC_NUM_RUNS` rule, token handling. |
| `ui-design.md` | Art direction and palette, original SVG and CSS art only, OFL fonts through next/font, themed copy that never replaces the plain message, accessibility rules (no status by colour or shape alone, reduced motion, a real table for screen readers). |

Cases where a steering rule changed what Kiro did:

- **`FC_NUM_RUNS`.** In Session 11 a sub-agent left `FC_NUM_RUNS=3000` set in the shared shell after a timeout, so later "default" runs were really 3000 runs. In Session 15 a checkpoint sub-agent timed out after one hour for the same reason. Commit 2a8f347 added `npm run test:deep` (it sets `FC_NUM_RUNS=1000` for its own child process) and the steering rule "Agents must never set `FC_NUM_RUNS` in the shared shell." After that, deep runs went through `npm run test:deep`, and Session 17 task reports state that the variable was never set.
- **Exact pin for core dependencies.** The rule added in commit 1f8bb7d (only smol-toml, pinned exactly) is enforced by `npm run check:core`. In Session 15 the PEP 440 and semver libraries were placed in `pipeline/mapping` behind architecture rules (`range-package-not-allowed`, `range-package-version-exact`), not in `/core`.
- **Colour is never the only signal.** Following `ui-design.md`, every plot has a status word ("haunted, buried", "dead, forgotten", ...) in its accessible name, and the polish-leftovers restless ghost got a distinct shape arrangement as well as a distinct tint, checked by a greyscale distinctness test.
- TODO: "read before write" and "commit after green" are not steering rules in this repo. Read-before-write comes from `AGENTS.md` (read the bundled Next.js docs before writing code), and commit-after-green was a per-session instruction in the prompts. No logged case shows either one changing Kiro's behaviour.

## Agent hooks

The four hooks in [.kiro/hooks](../.kiro/hooks) were added in commits 247205e and 11ac026.

| Hook | Trigger | What it runs |
| --- | --- | --- |
| `core-purity-on-save.json` | PostFileSave on `core/**/*.ts` (not tests) | `node scripts/hooks/check-core-on-save.mjs`, which runs the core purity check (import allow-list, no fetch, fs, Date.now or Math.random, exact smol-toml pin) |
| `architecture-on-save.json` | PostFileSave on `.ts` and `.tsx` under `pipeline`, `adapters`, `app` or `core` (not tests) | `node scripts/hooks/check-architecture-on-save.mjs`, which runs `npm run check:architecture` |
| `run-related-tests-on-save.json` | PostFileSave on `.ts` under `core`, `pipeline` and the matching `tests/` folders | `node scripts/hooks/vitest-related.mjs`, which runs the Vitest files related to the saved file |
| `spec-sync.json` | Manual | An agent prompt that compares the active spec's requirements and design with the code and lists rules found in only one of them, plus mismatches. It reports only and changes nothing. |

The Session 10 log records one real violation caught by the architecture check during a group: `pipeline/mapping/rate-limit.ts` imported a type from `pipeline/ports`.

## Vibe coding vs spec

Plain chat sessions, without a spec, were used for setup and operations work where there was no product behaviour to specify:

- Session 1: steering files and `KIRO_LOG.md` (commit 931290d).
- Adding the agent hooks (commit 247205e).
- Housekeeping: property tags, `npm run test:deep` and the `FC_NUM_RUNS` steering rule (commit 2a8f347).
- Post-Milestone-3 fixes were added to the graveyard-art spec as new requirements (R20, R21) rather than done in chat (commit 3bd0e3d).
- Session 18: submission prep (this document, the README, the repo checklist, the MCP smoke check).

Operations work that needed a checklist was still run as a quick spec: `property-traceability` and `session-14-ops` (live audit, UI steering file, production smoke test).


## MCP

Before Session 18 no MCP server was used. The Session 8 log notes that no fetch MCP server was configured, so verification used PowerShell and the `gh` CLI instead. Production checks before Session 18 used Playwright through Node scripts and `curl`, not MCP.

In Session 18 a workspace config was added at [.kiro/settings/mcp.json](../.kiro/settings/mcp.json) for the official Playwright MCP server, pinned to `@playwright/mcp@0.0.86` (headless, isolated profile, Chromium, 1440x900).

What happened:

- The server's tools did not show up in the running Kiro session after the config was added, and still did not after one retry. Kiro reads the MCP tool list when a session starts, so a new server is only available in a later session.
- The server itself started. It was driven over stdio with the MCP TypeScript SDK client (`@modelcontextprotocol/sdk` 1.32.2, installed outside the repo), using the exact command and arguments from `mcp.json`.
- The first run failed on `browser_click` because the client passed `ref`; in version 0.0.86 the argument is `target`. The second run passed.
- Calls in the passing run: `browser_navigate` to the landing page, `browser_snapshot`, `browser_navigate` to the request/request scan, `browser_wait_for` (5 s), `browser_snapshot`, `browser_click` on the uuid plot, `browser_snapshot`, `browser_press_key` Escape, `browser_snapshot`, `browser_close`.
- Results on production: the landing page has the "Gravekeeper" heading and the repository URL field. The grade card shows D, graded on uuid (score 60). The uuid plot's accessible name is "uuid, npm, haunted, buried, 1 open vulnerability (HIGH)", the restless kind. Clicking it opened the "uuid" dialog, and Escape closed it with focus back on the plot.

Not used: no MCP server took part in writing code, specs or tests. All earlier verification used Node scripts, `curl` and the `gh` CLI.

## Operations

- **Keep-warm (Session 22).** [`.github/workflows/keep-warm.yml`](../.github/workflows/keep-warm.yml) runs every four hours (cron `17 */4 * * *`) and on manual dispatch. It POSTs the app's request body, `{"repoUrl": ...}`, to `https://gravekeeper-chi.vercel.app/api/scan` for each repository in the README "Try it" table, each featured graveyard on the landing page and `request/request` (four distinct repos), one at a time with a 5 s pause. The Scan_Cache TTL is six hours, so a four-hour schedule keeps the entries live. The job logs only the repo, HTTP status, milliseconds and the `X-Gravekeeper-Cache` header, never the response body, needs no secrets (the API is public), and fails only when every repo returns a network error; a slow or partial scan (any HTTP status) does not fail it. It warms the cache so the public example links answer in well under a second, instead of the several seconds a cold heavy scan can take (Session 22 measured up to ~11 s for a 96-runtime-dependency project; the Session 21 wall-budget fix keeps every scan under the function limit regardless).

## Numbers

| Measure | Value | Source |
| --- | --- | --- |
| Logged sessions | 17 before this one, plus Session 18 | KIRO_LOG.md |
| Commits on `main` | 171 at commit f6a86f2 (first commit 2026-11-16) | `git rev-list --count HEAD` |
| Specs | 12 | `.kiro/specs` |
| Correctness properties | 222 | design.md files |
| Unit and property tests | 4086 passed, 119 skipped (4205), in 375 test files | `npx vitest --run`, Session 17 final checkpoint |
| End-to-end tests | 316 passed, 108 skipped, from 29 Playwright spec files | `npm run test:e2e`, Session 17 |
| Client JavaScript | 175,274 B gzip, budget 256,000 B | `npm run check:bundle`, Session 17 |
| Scene render medians | synthetic 300 plots at 4x CPU throttle 32.8 ms, request/request 21.6 ms (limits 100 ms and 80.4 ms) | `tests/e2e/scene-perf.spec.ts`, Session 17 |
| Kiro credits used | not visible from inside a session | none |