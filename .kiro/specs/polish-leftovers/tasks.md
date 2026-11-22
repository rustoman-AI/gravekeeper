# Implementation Plan: polish-leftovers

## Overview

Implementation language: TypeScript (Next.js, React, vitest, fast-check, Playwright), as detected in the Clarify phase. Items are done in the order: restless ghost, labels, leftovers, CI/deploy/log, screenshots, final report. Each item group ends with an orchestrator-only "Commit and push" task that runs only the tests related to that item, then commits, pushes and records the hash and CI status.

Rules for every task:
- Each file has one owner per task. Implementation sub-agents must not commit or push. Only the orchestrator-only tasks run `git commit` and `git push`.
- Run only the tests related to the item. Run the full `npm run test:deep` (never setting `FC_NUM_RUNS` in the shell), the full vitest suite, full e2e, `check:bundle` and scene-perf only in task 5.1.
- Never print or commit tokens. Do not run `gh auth token`.
- Visual tasks take screenshots at 1440x760 and at 390x700 into `test-results/polish-visual/` (not committed), open them with the image reader and look at them. Record what was seen.
- Do not change the Above_Fold_Budget values or the tests that check them.
- Do not touch `docs/screenshots/m1`, `m2`, `m3`.
- Do not change the header wordmark: it stays visible on every page, including the landing page.
- Fix CI failures with a new commit, never an amend.

## Tasks

- [x] 1. Baseline
  - [x] 1.1 Confirm CI is green on 5117bb5 (orchestrator-only)
    - Run `gh run list --commit 5117bb5 --json name,status,conclusion,headSha` and record each workflow conclusion
    - If a run is not `success`, stop and report to the user before starting item 2
    - _Requirements: 4.1_

- [x] 2. Item 1: Distinct restless ghost
  - [x] 2.1 Rework restless geometry in `view-model/restless-art.ts`
    - Remove `RESTLESS_STONE_SCALE`, `RESTLESS_STONE_FOOT`, `restlessStoneTransform`
    - Add `RESTLESS_GHOST_SCALE` (0.595), `RESTLESS_GHOST_REFERENCE_SCALE` (0.85), `RESTLESS_GHOST_CENTRE_X` (62), `RESTLESS_RISE_OVERLAP`, `RESTLESS_MAX_OVERFLOW_PX`, `RESTLESS_MAX_OVERLAP`, `STONE_TOPS`, `Box`, `STONE_BOXES`
    - Add per-variant `restlessGhostTransform(variant)` and `restlessGeometry(variant)` as in the design
    - Owner: `view-model/restless-art.ts` only
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 2.2 Add the `--color-wraith` token in `app/globals.css`
    - Add `--color-wraith: #d27ab5` with the explanatory comment next to the other colour tokens
    - Owner: `app/globals.css` only
    - _Requirements: 1.6_

  - [x] 2.3 Draw the restless sprite in `components/scene-sprite-ghosts.tsx`
    - Add `ghost-body-gradient-restless`, `shape-ghost-wisp-restless` and `shape-ghost-wisp-restless-flat` to `GhostDefs`
    - Restless symbols: stone group with no transform and `<use href="#shape-stone-<v>"/>`, then wisp group with `restlessGhostTransform(v)`, no glow `<use>`
    - Leave the haunted symbols unchanged
    - Owner: `components/scene-sprite-ghosts.tsx` only
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.10_

  - [x] 2.4 Rewrite `tests/ui/view-model/restless-art.property.test.ts` (keeps id AP-P3)
    - **Property 1: Restless arrangement**
    - Header text: "The restless ghost rises beside a full-size stone"
    - Recompute stone top and x extent from rendered paths, ghost scale and box from the rendered `transform`; cover all four variants, full and flat symbols; use `cfg()` from `tests/support/fc-config`; tag `Feature: polish-leftovers, Property 1`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 5.4**

  - [x] 2.5 Extend `tests/ui/tokens.test.ts` for the wraith token
    - **Property 2: Restless tint is distinct and visible**
    - Contrast at least 3 against `night`, `night-raised`, `ground`, `ground-moss`, `grass`, `sky-low`; hue difference to `spectral` at least 90 degrees; relative luminance difference at least 0.1
    - **Validates: Requirements 1.6, 1.8**

  - [x] 2.6 Update `tests/ui/sprites-ghosts.test.tsx` with restless example tests
    - Stone group has no `transform`, wisp has the helper transform, no glow `<use>`
    - Restless markup contains `--color-wraith` and not `--color-spectral`; haunted markup is the reverse
    - Reduced motion: the restless plot's art has `animation-name: none` under `prefers-reduced-motion` (use the CSS text or the existing reduced-motion test pattern in this file)
    - Confirm `tests/ui/sprites-greyscale.test.tsx` still passes unchanged
    - Owner: `tests/ui/sprites-ghosts.test.tsx` only
    - _Requirements: 1.7, 1.8, 5.9_

  - [x] 2.7 Run related e2e and visually check the restless ghost
    - Run restless-related unit tests, the axe e2e specs and `scene-perf` (perf project with `--no-deps`) against 100 ms / 80.4 ms
    - Capture the Reference_Scan result view with restless graves at 1440x760 and 390x700 into `test-results/polish-visual/restless-*.png`, open each image and confirm: stone full size, ghost smaller and to the upper right, red-violet tint clearly different from the cyan haunted ghost
    - Owner: no source files (temporary screenshots only); report any defect to the orchestrator instead of editing
    - _Requirements: 1.6, 1.7, 1.9, 1.10_

  - [x] 2.8 Commit and push item 1 (orchestrator-only)
    - Run `npx vitest --run` on the restless-art, tokens, sprites-ghosts, sprites-greyscale tests, the relevant e2e specs including axe, and scene-perf
    - On green: `git add` the item's files by name, commit "Distinct restless ghost", `git push`
    - Record the commit hash and CI status (`gh run list --branch <branch> --limit 5`) for the final report
    - _Requirements: 5.1, 4.2_

- [x] 3. Item 2: Non-truncating grave labels
  - [x] 3.1 Create `view-model/label-fit.ts`
    - Export `LABEL_CHAR_WIDTH_PX` (7.2), `labelSegments`, `wrapLabel`, `mayTruncateLabel` as specified in the design (clamp capacity to at least 1, empty name returns `[]`)
    - Owner: `view-model/label-fit.ts` only
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 3.2 Replace the `.gk-plot-label` rule in `app/globals.css`
    - Remove `-webkit-line-clamp` and `display: -webkit-box`; add `display: block`, `height: var(--label-band-h, 28px)`, `overflow: hidden`, `text-overflow: clip`, `overflow-wrap: anywhere`, `white-space: normal`
    - Keep 12 px font, 14 px line height, colour, width and position unchanged
    - Owner: `app/globals.css` only
    - _Requirements: 2.1, 2.2, 2.8, 2.9, 2.10, 2.11_

  - [x] 3.3 Render the full-name `<title>` in `components/scene-plot.tsx`
    - Render `<title>{plot.label}</title>` as first child of the plot `<svg>` when `mayTruncateLabel(plot.label, plot.width)` is true
    - Keep the SVG `aria-hidden` and the button `aria-label={plot.accessibleLabel}` unchanged
    - Owner: `components/scene-plot.tsx` only
    - _Requirements: 2.5, 2.6, 2.7_

  - [x] 3.4 Write `tests/ui/view-model/label-fit.property.test.ts`
    - **Property 3: Label wrapping preserves the name and breaks only at hyphens**
    - **Property 5: Labels that fit the model are never clipped**
    - Add example tests: `browserify-istanbul` at 80 px gives `["browserify-", "istanbul"]`; `karma-phantomjs-launcher` gives 3 lines and `mayTruncateLabel` true; empty name; width below one character
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [x] 3.5 Write `tests/ui/scene-plot-title.property.test.tsx`
    - **Property 4: The full name is in the graphic's title exactly when the label may be cut**
    - Example: `karma-phantomjs-launcher` renders `svg > title` with the full name and an `aria-label` starting with it
    - **Validates: Requirements 2.5, 2.6, 2.7**

  - [x] 3.6 Update the element-count assertions in `tests/ui/scene-stage.test.tsx` and `tests/ui/scene-render.test.tsx`
    - Count plot elements excluding an optional `svg > title` so the existing `1 + plot.querySelectorAll("*").length === 4` checks stay valid
    - Owner: those two test files only
    - _Requirements: 2.6_

  - [x] 3.7 Write `tests/ui/label-css.test.ts`
    - Read `app/globals.css`: `.gk-plot-label` has no `line-clamp`, no `-webkit-box`, has `text-overflow: clip`, font size at least 11 px
    - _Requirements: 2.1, 2.10_

  - [x] 3.8 Write `tests/e2e/labels-polish.spec.ts`
    - `browserify-istanbul` shows two line rectangles broken after the hyphen (`Range.getClientRects`)
    - Computed `text-overflow` is `clip`, computed font size at least 11 px
    - For every plot where `label.scrollHeight > label.clientHeight`, the plot SVG has a `<title>` equal to the full name (checks `LABEL_CHAR_WIDTH_PX`; raise the constant in `view-model/label-fit.ts` if this fails, reported to the orchestrator)
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 2.10_

  - [x] 3.9 Run label e2e checks and visually check labels
    - Run `above-fold.spec.ts` (budget unchanged), the CLS and 320 px reflow specs, the axe specs and the new labels spec
    - Capture the Reference_Scan result at 1440x760 and 390x700 into `test-results/polish-visual/labels-*.png`, open each image and confirm: no ellipsis, hyphen wrapping, second line clipped cleanly, text readable
    - Owner: no source files; report defects to the orchestrator
    - _Requirements: 2.1, 2.8, 2.9, 2.11_

  - [x] 3.10 Commit and push item 2 (orchestrator-only)
    - Run unit tests for label-fit, scene-plot-title, label-css, scene-stage, scene-render and the e2e specs from 3.9 (above-fold, CLS, reflow, axe, labels-polish)
    - On green: `git add` by name, commit "Non-truncating grave labels", `git push`
    - Record the hash and CI status
    - _Requirements: 5.1, 4.2_

- [x] 4. Item 3: Leftovers (design.md numbers, BOM, flake)
  - [x] 4.1 Fix the ledger numbers in `.kiro/specs/art-polish/design.md`
    - Line 153: slab 80 / top 62 becomes slab 84 / top 70; line 179: `STONE_TOPS.slab` 62 becomes 70 and `98 - (98 - 70) * 0.5 = 84`
    - Add the sentence "Superseded by `.kiro/specs/polish-leftovers/design.md` (full-size stone, smaller ghost)" under the restless section
    - Leave lines 21 and 173 alone; list line 173 as a known stale item in the report
    - Owner: that file only
    - _Requirements: 3.1, 3.2_

  - [x] 4.2 Fix the Reference_Scan counts in `.kiro/specs/graveyard-ui/design.md`
    - Read `headlineText` in `view-model` and its test, then rewrite the example headline near line 638 to match its exact output for 6 buried, 20 forgotten, 5 haunted
    - Run `Select-String -Path .kiro/specs/*/design.md -Pattern 'request/request|\d+ (buried|forgotten|haunted|alive)|grade [A-F]\b|score 60'` and confirm no remaining hit conflicts with 6 buried, 20 forgotten, 5 haunted, 9 alive, grade D, uuid score 60; fix any other conflicting file one owner at a time and list it
    - Owner: `graveyard-ui/design.md` (plus any other conflicting design.md found, reported)
    - _Requirements: 3.3_

  - [x] 4.3 Remove the BOM and add the hygiene test
    - Strip bytes EF BB BF from `tests/e2e/above-fold.spec.ts` without changing anything else
    - Create `tests/ui/repo-hygiene.test.ts` asserting no file in `tests/e2e/*.ts` starts with EF BB BF
    - Owner: those two files only
    - _Requirements: 3.4_

  - [x] 4.4 Investigate the flaky test
    - Run the full vitest suite 10 times with `--reporter=json --outputFile=test-results/flake/full-<n>.json` as a background process, then read results; if no failure, run 10 more with `--sequence.shuffle`
    - Group failures by file and test name; run the most frequent failing file 20 times in isolation; if it never fails alone, repeat with `--no-file-parallelism` and `--sequence.shuffle`
    - Report: failing file, failing test name, root cause (with fast-check seed if applicable) and failure rate. If it never reproduces, report the evidence and seeds
    - Owner: `test-results/flake/` output only; no source edits
    - _Requirements: 3.5, 3.6_

  - [x] 4.5 Fix or quarantine the flaky test
    - Fix the root cause in the failing test file (or the code under test if the cause is there) and run the file 20 consecutive times with all passing, then the full suite once
    - If a fix is not possible, change `it(` to `it.skip(` with a comment directly above: `// QUARANTINE (polish-leftovers): <root cause>. Failure rate <x>/<n>. Owner and follow-up: <text>.`
    - Report the test name, root cause and whether it was fixed or quarantined
    - Owner: the failing test file only (identified in 4.4)
    - _Requirements: 3.7, 3.8_

  - [x] 4.6 Commit and push item 3 (orchestrator-only)
    - Run the repo-hygiene test, the flaky file 20 times, and `above-fold.spec.ts`
    - Make separate commits for: design.md fixes, BOM removal, flake fix or quarantine; `git push`
    - Record the hashes and CI status
    - _Requirements: 5.1, 4.2_

- [x] 5. Item 4: Final verification, CI, redeploy, verify:deploy, KIRO_LOG.md
  - [x] 5.1 Final checkpoint before deploy (orchestrator-only)
    - Run `npm run test:deep` in full, without setting `FC_NUM_RUNS` in the shell
    - Run the full vitest suite, full e2e, `npm run check:bundle` (at most 256,000 bytes gzip), and scene-perf (perf project with `--no-deps`) against 100 ms / 80.4 ms
    - Ensure all tests pass, ask the user if questions arise
    - _Requirements: 5.2, 5.3, 5.5, 1.10_

  - [x] 5.2 Confirm CI is green on every new commit (orchestrator-only)
    - Run `gh run list --branch <branch> --limit 10 --json name,status,conclusion,headSha` until each new commit is `completed` with `success`
    - _Requirements: 4.2_

  - [x] 5.3 Redeploy to https://gravekeeper-chi.vercel.app (orchestrator-only)
    - Check `.vercel/`, `vercel.json` and `.github/workflows/*.yml`: if a workflow or Git integration deploys on push, wait for that deployment; otherwise use the already configured Vercel CLI
    - Do not add a new deployment path and do not print tokens
    - _Requirements: 4.3, 5.7_

  - [x] 5.4 Run the Deploy_Verifier (orchestrator-only)
    - Run `npm run verify:deploy` and keep the result lines
    - _Requirements: 4.4_

  - [x] 5.5 Append the session entry to `KIRO_LOG.md`
    - Append a "polish-leftovers" section (file exists): the session items, commit hashes, flake test name and root cause, CI status, verify:deploy result
    - Search the file for `ghp_`, `github_pat_` and `Bearer ` and confirm no match
    - Owner: `KIRO_LOG.md` only
    - _Requirements: 4.5, 4.6, 5.7_

  - [x] 5.6 Commit and push the log (orchestrator-only)
    - Commit "Log polish-leftovers session", `git push`, record the hash and CI status
    - _Requirements: 5.1, 4.2_

- [x] 6. Screenshots of the uuid grave and the landing hero
  - [x] 6.1 Create `tests/e2e/polish-leftovers-report.spec.ts`
    - Gate on `POLISH_LEFTOVERS_REPORT=1` and the `desktop` project; otherwise write nothing
    - Fixed 1440x760, `deviceScaleFactor: 1`, `reducedMotion: "reduce"`, `/api/scan` mocked with the `request` fixture, `document.fonts.ready` awaited, mouse at (0, 0), `animations: "disabled"`, `caret: "hide"`
    - Output `docs/screenshots/polish/leftovers-landing-hero-1440x760.png` and `docs/screenshots/polish/leftovers-uuid-grave-1440x760.png`; uuid grave found with `button.gk-plot[aria-label^="uuid,"]`, centred, clip grown by 32 px
    - Take each screenshot twice and require byte-equal buffers before writing
    - Owner: that spec file only
    - _Requirements: 4.7, 5.8_

  - [x] 6.2 Generate and visually check the screenshots
    - Run the spec with `POLISH_LEFTOVERS_REPORT=1` twice and confirm the PNGs are byte-identical across runs
    - Open both PNGs and confirm content; also capture the same two views at 390x700 into `test-results/polish-visual/` and look at them
    - Confirm `git diff --stat -- docs/screenshots` shows no change under `m1`, `m2`, `m3` or the existing polish PNGs
    - Owner: `docs/screenshots/polish/` new files only
    - _Requirements: 4.7, 4.8, 5.8_

  - [x] 6.3 Append screenshot paths to `KIRO_LOG.md`
    - Add the two image paths and the report spec name to the "polish-leftovers" section
    - Owner: `KIRO_LOG.md` only
    - _Requirements: 4.6, 4.7_

  - [x] 6.4 Commit and push screenshots (orchestrator-only)
    - Run `tests/ui/repo-hygiene.test.ts` and confirm the spec does not write without the env flag (a normal `playwright test --list` run is enough)
    - Commit "Polish screenshots and log", `git push`, record the hash, and confirm CI is green with `gh run list`
    - _Requirements: 5.1, 4.2, 4.8_

- [x] 7. Final report and STOP
  - [x] 7.1 Report and STOP (orchestrator-only)
    - Report to the user: all commit hashes, the flake test name and root cause (fixed or quarantined with the Quarantine_Note), CI status for each commit, the verify:deploy result, and the screenshot paths (`docs/screenshots/polish/leftovers-landing-hero-1440x760.png`, `docs/screenshots/polish/leftovers-uuid-grave-1440x760.png`)
    - Mention the known stale line 173 in art-polish design.md
    - STOP. Do not start further work
    - _Requirements: 4.6, 4.7, 5.1_

## Notes

- All tasks are required; none are optional.
- Orchestrator-only tasks are the only ones that commit, push, deploy or call `gh`.
- Each commit task runs only the tests related to its item. The full deep suite runs once, in 5.1.
- Property tests use `cfg()` from `tests/support/fc-config` and the tag format `Feature: polish-leftovers, Property N: ...`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2"] },
    { "id": 1, "tasks": ["2.3"] },
    { "id": 2, "tasks": ["2.4", "2.5", "2.6"] },
    { "id": 3, "tasks": ["2.7"] },
    { "id": 4, "tasks": ["2.8"] },
    { "id": 5, "tasks": ["3.1", "3.2"] },
    { "id": 6, "tasks": ["3.3"] },
    { "id": 7, "tasks": ["3.4", "3.5", "3.6", "3.7", "3.8"] },
    { "id": 8, "tasks": ["3.9"] },
    { "id": 9, "tasks": ["3.10"] },
    { "id": 10, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 11, "tasks": ["4.5"] },
    { "id": 12, "tasks": ["4.6"] },
    { "id": 13, "tasks": ["5.1"] },
    { "id": 14, "tasks": ["5.2"] },
    { "id": 15, "tasks": ["5.3"] },
    { "id": 16, "tasks": ["5.4"] },
    { "id": 17, "tasks": ["5.5"] },
    { "id": 18, "tasks": ["5.6"] },
    { "id": 19, "tasks": ["6.1"] },
    { "id": 20, "tasks": ["6.2"] },
    { "id": 21, "tasks": ["6.3"] },
    { "id": 22, "tasks": ["6.4"] },
    { "id": 23, "tasks": ["7.1"] }
  ]
}
```
