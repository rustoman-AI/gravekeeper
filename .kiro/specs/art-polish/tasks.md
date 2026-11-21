# Implementation Plan: art-polish

## Overview

This plan implements `requirements.md` and `design.md` of the spec `art-polish`, a visual polish pass on `graveyard-art`. It has eight working groups and eight checkpoints, then a delivery group and a STOP task: (1) foundations (constants, tokens, contrast helper, report spec), (3) stage and ground, (5) fog, (7) headline and header, (9) sprites, (11) hero, (13) traceability, (15) delivery (regenerated screenshots, report screenshots, budgets, deploy, report). Checkpoints 2, 4, 6, 8, 10, 12 and 14 follow the groups. Each runs `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`; checkpoint 14 also runs the end-to-end suite and the bundle check. Property-based tests are mandatory sub-tasks next to the code they validate. Requirement numbers are criterion numbers of `.kiro/specs/art-polish/requirements.md`; property numbers `AP-P1` to `AP-P4` are those of `.kiro/specs/art-polish/design.md`.

Implementation language: TypeScript (strict), CSS and SVG. The project root is the `gravekeeper` folder. The spec phase wrote no code; the tasks below do.

Rules for every task:

- One owner per file per task: a file named in a task is edited by that task only, and tasks that name the same file are in different waves of the dependency graph. `app/globals.css` is edited by tasks 1.3, 3.1, 5.1, 7.1, 7.4 and 7.5 (one wave each). `tests/ui/art-css.test.ts` is edited by tasks 3.2, 5.2 and 7.2 (one wave each).
- Property tests use `cfg()` from `tests/support/fc-config.ts`, carry the tag comment `// Feature: art-polish, Property AP-P<n>: <title>` and a `// Validates: Requirements <list>` line, hold one property per file, and have titles that start with `AP-P<n>`. Never set `FC_NUM_RUNS` in the shell. Deep runs use `npm run test:deep -- <files>`.
- Tasks marked **orchestrator-only** are done by the orchestrator (they run `git commit` and `git push` or use the network). A coding sub-agent does not start them.
- **Visual tasks** (marked "Visual") require the sub-agent to take screenshots, open the images, and report in its result what it sees, in plain words: what stands in front of what, whether any fog edge or stripe is visible, whether the first row stands on the ground, whether labels are readable, whether the ghost is above its stone. Preview screenshots are taken with `$env:POLISH_REPORT = '1'; $env:POLISH_OUT_DIR = 'test-results/polish-preview'; npx playwright test tests/e2e/polish-report.spec.ts --project=desktop` (task 1.5) and are not committed. A visual task that cannot open the images reports that and stops.
- Every existing test and the properties of the other specs stay green. A test changes only where this spec legitimately changes a behavior. `tests/ui/art-css.test.ts` keeps its horizon test (240 px and 150 px); any other value change in that file is written into the task result as "old value, new value, reason" for the report.
- Plot layout boxes do not change: no edit to `view-model/scene.ts`, `view-model/depth.ts`, `components/scene-plot.tsx` or `components/scene.tsx`. The art moves only through the Stage offset and decorative layers.
- No new animation. No `filter`, `mask` or `backdrop-filter`. Colours only as tokens in the `@theme` block. WCAG AA contrast, CLS at most 0.01, reflow at 320 px, reduced motion static, the 100 ms scene render budget with the 80.4 ms regression limit, and the 256,000 byte JavaScript budget stay.
- `AGENTS.md` applies. This plan uses no new Next.js API and edits no route, metadata or config file; if a task finds that it must, it reads the relevant guide in `node_modules/next/dist/docs/` first.
- Source code cites the requirement number in a comment above each rule (steering rule).
- Commit and push after each green group: the orchestrator stages the files of that group by name (no `git add -A`).

## Tasks

- [x] 1. Foundations: constants, tokens, contrast helper, report spec
  - [x] 1.1 Create the fog and restless-art modules
    - Create `view-model/fog.ts` with `FOG_BAND_CENTER_X_PCT` (40, 60), `FOG_BAND_CENTER_Y_PCT` (34, 84), `FOG_BAND_RX_PCT` 28, `FOG_BAND_RY_PCT` 14, `FOG_HIGH_RX_PCT` 24 and `fogRowOffsetPct(row)` (index `row % 2`, total over non-negative integers) as in the design. Create `view-model/restless-art.ts` with the constants, `STONE_TOPS` (rounded 19, cross 24, obelisk 6, slab 62), `restlessStoneTransform`, `restlessGhostTransform` and `restlessGeometry` as in the design (ghost transform maps `centreX` 43 to x 40 and the wisp top to `RESTLESS_GHOST_TOP`). Both modules are pure (no JSX, no browser API). Export them from `view-model/index.ts` (this task is the only owner of that file in this plan). Each constant carries a comment citing its requirement.
    - Create `tests/ui/view-model/art-polish-constants.test.ts`: the constant values, `fogRowOffsetPct(0) = 40` and `(1) = 60`, and for each restless variant the numbers of the design (ghost box -10 to 70, eyes bottom 11.25, stone tops 58.5, 61, 52 and 80, overlap ratios at most 0.4).
    - _Requirements: 4.4, 4.9, 7.1, 7.3_
  - [x] 1.2 Write the property test for fog row offsets
    - `tests/ui/fog-offsets.property.test.ts`: `fc.nat({ max: 100000 })` for the row; same value on repeated calls, difference from row `r + 1` at least 15, equal to row `r + 2`.
    - **Property 2: AP-P2 Fog row offsets alternate deterministically**
    - **Validates: Requirements 4.4, 4.9**
  - [x] 1.3 Add the ground tokens
    - In the `@theme` block of `app/globals.css` add `--color-ground-moss: #16241d;` and `--color-grass: #1e3326;` with comments ("ground below the fence (label text sits on it)", "grass strips at the row base (label text sits on it)"), and extend the header comment list of tokens. Edit nothing else in the file.
    - In `tests/ui/tokens.test.ts` add both tokens to the existing "graveyard-art landscape tokens" checks as text-bearing tokens: they exist with a 6-digit hex value, they are not marked DECORATIVE ONLY, bone has at least 4.5 on each of `ground`, `ground-moss`, `grass` and `night`, and bone has at least 4.5 on the composite of `mist` at `FOG_OPACITY_HIGH` over the darkest and over the lightest of those four backgrounds. If a ratio is below 4.5, darken the token (only these two hex values may change) and write the final values into the result.
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  - [x] 1.4 Write the property test for ground contrast
    - Create `tests/support/contrast.ts` (relative luminance, contrast ratio, hex parse, sRGB composite and interpolation; same formula as `tests/ui/tokens.test.ts`, which stays unchanged). Create `tests/ui/ground-contrast.property.test.ts`: build the ground gradient from the four stops `ground`, `ground-moss`, the 55 % mix of moss and night, and `night` (the stops of the design's `.gk-stage::before` rule), reading the hex values from the `@theme` block of `app/globals.css`; task 3.2 asserts that the rule uses exactly those stops. Generate `t` in [0, 1] and fog opacity `a` in [0, `FOG_OPACITY_HIGH`]; assert contrast of bone on the composite at least 4.5, and the same at the grass colour.
    - **Property 4: AP-P4 Plot labels stay readable on the whole ground**
    - **Validates: Requirements 3.2, 3.3, 3.4**
  - [x] 1.5 Create the polish report spec
    - Create `tests/e2e/polish-report.spec.ts`, modelled on `tests/e2e/m3-report.spec.ts`: skipped unless `POLISH_REPORT=1` and project `desktop`; mocked `/api/scan` (`mockScan`, `respondWithFixture("request")`), `emulateMedia({ reducedMotion: "reduce" })`, `document.fonts.ready` awaited before each shot. For each of landing and request/request results it opens a new context at 1440x760 and one at 390x700 (mobile: `isMobile` and `hasTouch` true, device scale factor 1), takes a viewport screenshot (animations disabled, caret hidden) to `docs/screenshots/polish/<name>-<size>.png`, with the file names `landing-1440x760.png`, `landing-390x700.png`, `results-request-1440x760.png`, `results-request-390x700.png`, and runs axe (`@axe-core/playwright`, as in the other specs) and fails on any violation. `POLISH_OUT_DIR` (a path relative to the project root) overrides the output directory for preview runs. It also writes `test-results/polish-measurements.json`: for each screen the viewport, the axe violation count, and for the results screens the bottom of the lowest first-row label, the top of the first second-row art box, the Headline line count and the Headline font size. Nothing is written when the gate is not set.
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 2. Checkpoint - Foundations
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 2.1 Commit and push the foundations group (orchestrator-only)
    - Stage by name the files of group 1 and commit with the subject `art-polish: constants, ground tokens, contrast helper, report spec (group 1)`. Push. Record the hash for the report.
    - _Requirements: 10.6_

- [x] 3. Stage and ground
  - [x] 3.1 Remove the empty band and draw the ground (Visual)
    - In `app/globals.css` change `.gk-stage` to the design: `--stage-lead: calc(var(--horizon-h) - 136px)`, `padding-top: var(--stage-lead)`, `isolation: isolate`, remove its `background`; the Backdrop rule gets `z-index: -1`; add `.gk-stage::before` (ground gradient from `--color-ground` through `--color-ground-moss` to `--color-night`) and `.gk-stage::after` (grass strips: radial-gradient blades with px radii in tiles `Wpx x var(--cell-h, 156px)` plus a `repeating-linear-gradient` base bar, strip height at most 14 px, colour `--color-grass` only), both full-bleed from `top: calc(var(--horizon-h) - 14px)` to the bottom, `z-index: 0`, `pointer-events: none`; add `.gk-stage-inner { z-index: 1 }`. Keep `--horizon-h` 240 px and 150 px. No `url()`, `mask` or `filter`. Keep the header comment of the block and cite Requirements 1.1 to 1.9.
    - Take a preview screenshot (see the rules) of the results scene at 1440x760 and 390x700, open both images and report: whether the first row stands on the ground in front of the fence, whether any empty band is left between the fence and the first row, whether the grass strip is visible at each row base and looks like grass, whether the labels are readable, and whether the moon and the trees are still visible. Adjust only the grass radii, the gradient stops and the 14 px lip until the images look right, and keep the constraints.
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_
  - [x] 3.2 Update the art style test for the stage and the ground
    - In `tests/ui/art-css.test.ts` keep the horizon test unchanged and add: `.gk-stage` declares `--stage-lead` equal to `calc(var(--horizon-h) - 136px)` and `padding-top: var(--stage-lead)`; the Backdrop rule has `z-index: -1`; `.gk-stage::before` and `.gk-stage::after` exist, are `pointer-events: none`, have `top: calc(var(--horizon-h) - 14px)`, contain no `url(` and no `mask`; the `::before` gradient mentions `--color-ground`, `--color-ground-moss` and `--color-night`; the `::after` tiles use `var(--cell-h, 156px)`; no rule other than the `@theme` block declares a colour literal for these layers. List any other changed assertion with old and new values in the task result.
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 1.7, 9.7, 9.8_
  - [x] 3.3 Assert the overlap in the art end-to-end spec
    - In `tests/e2e/art.spec.ts` add one test: on the request fixture the top of the first plot's art box is above the bottom of the Backdrop box (`.gk-backdrop` bounding box), the Backdrop box is behind the plot (computed `z-index` of the Backdrop is `-1`), and the `.gk-stage` `padding-top` equals 104 px at 1440 px width and 14 px at 390 px width. Edit nothing else in the file.
    - _Requirements: 1.1, 1.2_
  - [x] 3.4 Update the above-the-fold spec to the new viewports
    - In `tests/e2e/above-fold.spec.ts` replace the sizes 1440x900, 1280x800 and 390x844 with 1440x760, 1280x720 (desktop project) and 390x700 (mobile project, set through `test.use({ viewport })`). Desktop test: the bottom of the lowest label of the first row (the plots whose top is within one cell height, 156 px, of the first plot's top) is at most the viewport height, and the first plot of the second row has at least 40 px of its art box inside the viewport. Mobile test: the bottom of the lowest label of the first row is at most the viewport height. Keep the "plaque sits in the same row as the headline" test for both desktop sizes, the reduced-motion emulation, the font wait and the "not scrolled" check. Update the file comment to cite Requirements 2.1 to 2.5. This test is expected to fail until task 7.4; note that in the result.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 4. Checkpoint - Stage and ground
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 4.1 Commit and push the stage group (orchestrator-only)
    - Stage by name the files of group 3 and commit with the subject `art-polish: graves stand in the landscape, ground and grass (group 3)`. Push. Record the hash.
    - _Requirements: 10.6_

- [x] 5. Fog without hard edges
  - [x] 5.1 Feather the fog (Visual)
    - In `app/globals.css` replace the `.gk-fog` background by the design's two radial-gradient bands (`ellipse 28% 14% at 40% 34%` and `at 60% 84%`, colour stops `var(--color-mist) 0%`, a `color-mix` 45 % stop at 55 %, `transparent 100%`), `background-size: 100% calc(var(--cell-h, 156px) * 2)`, `background-repeat: repeat-y`, `background-position: 0 16px`; make `.gk-fog-high` and `.gk-fog-b` use the swapped centres (60 % and 40 %) and `ellipse 24% 14%`, and remove their old `background-position` and `background-size`. Keep opacity 0.25 and 0.35, `top/right/bottom/left`, `animation` (transform only), the simplified-mode and the reduced-motion rules. Constants must equal those of `view-model/fog.ts`. No `mask`, no `filter`, no `url()`. The Hero uses the same classes.
    - Visual: take preview screenshots of the results scene at 1440x760 and of the landing at 1440x760 (reduced motion, so the fog is static), open the images and report: whether any fog band shows a hard edge on any side, whether rows 1 and 2 show bands at different horizontal positions, whether any stripe or tile seam is visible, whether labels under fog are still readable. Tune only the colour stop positions inside the constraints; a change of the numbers in `view-model/fog.ts` is allowed only together with the CSS in this task and with the constants test updated (report it).
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
  - [x] 5.2 Add the fog CSS test
    - In `tests/ui/art-css.test.ts` add the fog test of the design ("Fog CSS test (R4.10)"): for every rule whose selector contains `.gk-fog` and that has `background-image`, split on top-level commas, require only `radial-gradient(` parts, no `url(`, each ending in `transparent 100%`; parse `ellipse A% B% at C% D%`, check the band is inside the layer horizontally and strictly inside one half of the tile vertically (at least 2 points from each border); require `background-repeat: repeat-y`, `background-size` starting with `100%` and containing `calc(var(--cell-h, 156px) * 2)`; per layer, two bands whose `C` differ by at least 15 and whose `D` lie in different halves; compare with the constants of `@/view-model`. Keep the existing fog opacity, keyframe and reduced-motion tests green. Add a negative self-check: a helper applied to a hard-edged sample string (an `url()` image, a gradient ending in a colour, a band touching the tile border) reports a failure for each.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.10, 9.5, 9.7_

- [x] 6. Checkpoint - Fog
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 6.1 Commit and push the fog group (orchestrator-only)
    - Stage by name the files of group 5 and commit with the subject `art-polish: feathered fog with alternating row offsets (group 5)`. Push. Record the hash.
    - _Requirements: 10.6_

- [x] 7. Headline and header
  - [x] 7.1 Set the headline clamp at 1280 px and wider
    - In `app/globals.css` add `@media (min-width: 1280px) { .gk-headline { font-size: clamp(1.75rem, 2.2vw + 0.5rem, 2.5rem); } }` after the existing headline rules, with a comment citing Requirement 5.1 and the unchanged bounds below 1280 px. Leave the 26 px to 56 px and 32 px to 56 px rules as they are. `.gk-headline-empty` is unchanged.
    - _Requirements: 5.1, 5.2_
  - [x] 7.2 Test the headline clamps
    - In `tests/ui/art-css.test.ts` keep the two existing headline tests and add: a rule in a `(min-width: 1280px)` media block sets `.gk-headline` `font-size` to a `clamp` whose lower bound is 28 px (1.75 rem) and upper bound 40 px (2.5 rem); the preferred value is `2.2vw + 0.5rem`.
    - _Requirements: 5.1, 5.2, 5.5_
  - [x] 7.3 Add the headline line-count end-to-end spec
    - Create `tests/e2e/headline-lines.spec.ts` (desktop project; request fixture mocked; reduced motion; fonts ready): at 1280x720 and 1440x760 the number of distinct `top` values (rounded) of `Range.getClientRects()` over the `.gk-headline` text is at most 2, the Plaque shares a grid row with the Headline, and the computed font size is between 28 and 40 px; at 1920x1080 the font size is 40 px and the line count is at most 2. Also assert the headline text equals the header model sentence ("31 of 40 dependencies are in the graveyard: 6 buried, 20 forgotten, 5 haunted.").
    - _Requirements: 5.3, 5.4_
  - [x] 7.4 Measure the targets and compact the header only if needed (Visual)
    - Run `npx playwright test tests/e2e/above-fold.spec.ts tests/e2e/headline-lines.spec.ts --project=desktop --project=mobile` and record the measured numbers (bottom of the lowest first-row label, top of the second-row art, header height, headline lines) for 1440x760, 1280x720 and 390x700. Open preview screenshots of the three sizes and report what is visible without scrolling. If every test passes, change nothing. If a target is missed, apply the ladder of the design's Header section one step at a time in `app/globals.css` (step 1: `.gk-results-header` `row-gap` to 0; step 2: only if a class for the results page container already exists, reduce its top padding; step 3: `.gk-plaque-letter` to 3 rem from 1024 px), rerunning and recording before and after for each step. The Plaque stays beside the Headline; DOM order, text and accessible names do not change. If the ladder is exhausted, stop and report the numbers instead of changing the art.
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7_
  - [x] 7.5 Mobile header steps (Visual)
    - Context: task 7.4 measured the desktop sizes as met (1440x760 and 1280x720: first-row label bottom 587, second-row art top 602.5, headline 2 lines) and 390x700 as missed after step 1 (`row-gap: 0`): first-row label bottom 755.25 against at most 700 (55 px short). The Plaque beside the headline squeezes it to 6 lines at 27.5 px, and there are three rows of status chips. Apply the design's mobile steps in `app/globals.css`, inside the `max-width: 639px` media block only, one at a time, measuring before and after each: step 4 places the Plaque in the first grid row beside the repository name (`h1`) with a compact letter of about 2 rem, so the headline spans the full width (CSS grid placement only; DOM order, text, heading levels and accessible names unchanged; from 640 px the Plaque stays beside the headline); step 5 tightens the status chips (smaller vertical padding and gap) while each chip keeps a touch target of at least 24x24 CSS px and the text size stays unchanged. Cite Requirement 2.6 in a comment above each rule. No rule outside the media block changes.
    - If the first-row label bottom at 390x700 is still above 700 after step 5, stop and report the numbers; do not change the art or the DOM.
    - Visual: take preview screenshots at 390x700 and 320x700 (reflow), open the images and report: the Plaque position, the number of headline lines, the chips (readable, not overlapping, touch targets measured), whether any horizontal scrolling appears at 320 px, and whether the first row is fully visible at 390x700. Run `above-fold`, `reflow`, `layout-shift`, `results`, `art` and the axe-bearing specs (`polish-report.spec.ts` preview, the accessibility specs) and record the measured numbers for each step.
    - _Requirements: 2.3, 2.6, 2.7, 9.6_

- [x] 8. Checkpoint - Headline and header
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [x] 8.1 Commit and push the headline group (orchestrator-only)
    - Stage by name the files of group 7 and commit with the subject `art-polish: two-line headline at 1280 px and wider (group 7)`. Push. Record the hash and the measured numbers of task 7.4.
    - _Requirements: 10.6, 10.7_

- [ ] 9. Sprites
  - [~] 9.1 Redraw the slab as a ledger stone (Visual)
    - In `components/scene-sprite-stones.tsx` redraw `#shape-stone-slab` as the design's Ledger_Stone (flat chamfered top, stepped base, engraved cross in `--color-night`, tokens only, no filter, mask or text) and update the flat twin `plot-tombstone-slab-flat` to the outline. Keep every symbol id and the root `<g>` with `--depth-bright`. Update the file header comment (the `slab` description). In `tests/ui/components/sprites-stones.test.tsx` update the assertions that depended on the old slab markup and add: the slab shape contains a `--color-night` stroked path forming a cross (one vertical and one horizontal segment), all ids still exist, and all symbols still differ in markup.
    - Visual: render the sprite sheet entries of the four tombstone variants at 80x104 (a temporary Playwright page evaluation that screenshots the `<symbol>`s through a `<use>`, nothing committed), open the image, and report: whether any variant still looks like a coffin, whether the ledger stone reads as a flat grave marker with a cross, and whether the four outlines are distinguishable in greyscale.
    - _Requirements: 6.1, 6.2, 6.3, 6.6_
  - [~] 9.2 Rearrange the restless plot (Visual)
    - In `components/scene-sprite-ghosts.tsx` build the restless symbols from `restlessStoneTransform()` and `restlessGhostTransform()` (full and flat twins), draw the stone first and the wisp after it, and set `overflow="visible"` on the restless `<symbol>` elements; remove `RESTLESS_PLACEMENT`. If the final slab top differs from 62, update `STONE_TOPS` in `view-model/restless-art.ts` (this task is the only owner of that file after task 1.1) and the expected numbers in `tests/ui/view-model/art-polish-constants.test.ts` (this task is the only owner of that file after task 1.1), and report the new values. Update `tests/ui/components/sprites-ghosts.test.tsx`: the restless symbols reference the stone of their variant, the wisp group follows the stone, the transforms equal the helpers' output, and the flat twins use the same placement.
    - Visual: render the four restless variants and one plain ghost side by side at plot size, and in the request scene at 1440x760; open the images and report: whether the ghost is about the size of the plain ghost, whether it clearly rises above its stone, whether any part is hidden behind the stone, whether it is clipped at the top of the symbol (risk R-1: if clipped, apply the fallback of the design's Error Handling table and report it), and whether a restless plot is distinguishable from a plain tombstone and from a plain ghost.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - [~] 9.3 Write the property test for the variant set
    - `tests/ui/view-model/ledger-variant.property.test.ts`: kinds from the plot kind list, random strings (including Unicode) for the key; `variantOf` is repeatable and a member of `SPRITE_VARIANTS[kind]`; the tombstone and restless lists equal `['rounded', 'cross', 'obelisk', 'slab']`; render the sprite sheet once with `renderToStaticMarkup` and check that the full and the `-flat` symbol id of every chosen variant exists.
    - **Property 1: AP-P1 Variant choice stays deterministic and total over the variant set**
    - **Validates: Requirements 6.2, 6.3, 6.4**
  - [~] 9.4 Write the property test for the restless geometry
    - `tests/ui/view-model/restless-art.property.test.ts`: `fc.constantFrom(...SPRITE_VARIANTS.restless)`; assert from `restlessGeometry` (eyes bottom above stone top, wisp scale at least 0.85, wisp top at least `-RESTLESS_MAX_OVERFLOW_PX`, overlap ratio at most `RESTLESS_MAX_OVERLAP`) and from the rendered `GhostSymbols` markup (the transforms in the full and flat restless symbols equal the helpers' output, the stone `<use>` comes before the wisp group).
    - **Property 3: AP-P3 The restless ghost rises above its stone**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.5**
  - [~] 9.5 Write the greyscale distinctness test
    - Create `tests/ui/components/sprites-greyscale.test.tsx`: extract the outline path data (the `d` of the stone-filled path) of each tombstone shape and of each flat twin from the rendered sheet; assert that the four outlines are pairwise different, that the width-to-height ratio of the ledger stone's flat outline differs from each of rounded, cross and obelisk by at least 0.5 (bounding box computed from the numbers in `d`, supporting `M`, `L`, `H`, `V`, `C`, `Q`, `Z`), and that the markup of the four restless symbols and of the plain ghost and the plain tombstones are pairwise different.
    - _Requirements: 6.5_

- [ ] 10. Checkpoint - Sprites
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [~] 10.1 Commit and push the sprites group (orchestrator-only)
    - Stage by name the files of group 9 (including `view-model/restless-art.ts` if task 9.2 changed it) and commit with the subject `art-polish: ledger stone and a clear restless ghost (group 9)`. Push. Record the hash.
    - _Requirements: 10.6_

- [ ] 11. Landing hero
  - [~] 11.1 Add the hero silhouettes and the path (Visual)
    - In `components/scene-backdrop.tsx` add to the `VariantConfig` an optional `silhouettes` list and a `path` flag, used by the `hero` variant only (the `stage` and `scanning` configs omit them): at least four headstone silhouettes of different shapes (rounded, cross-topped, obelisk) and one cross, drawn after the trees and before the fence, and a faint path (trapezoid narrowing upward from the gate base, `--color-iron` at 0.5 opacity) drawn after the ground band. Tokens only (`--color-iron`, `--color-hill`), `aria-hidden` through the existing root, no text, no title, no animation. Starting positions are in the design's Hero landscape table; adjust them to the screenshot. The gate, the copy plate, the Hero height and `components/hero.tsx` do not change.
    - Visual: take preview screenshots of the landing at 1440x760 and 390x700, open both and report: whether the headstones and the cross are visible behind the fence and not hidden by the gate or the copy plate, whether the path is visible through the gate and faint, whether the copy text is still readable, and whether the hero looks cluttered.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_
  - [~] 11.2 Test the hero landscape
    - Create `tests/ui/components/backdrop-hero.test.tsx`: the `hero` backdrop contains at least five silhouette shapes and one cross shape that come before the fence element in document order, the path comes after the ground rectangle, there is no `<text>`, `<title>`, `animate` or `<animateTransform>` and no colour literal, every fill and stroke is a `var(--color-*)`; the `stage` and `scanning` backdrops contain none of these shapes (compare element counts with a snapshot of the class names).
    - _Requirements: 8.1, 8.2, 8.3, 8.6_

- [ ] 12. Checkpoint - Hero
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.
  - [~] 12.1 Commit and push the hero group (orchestrator-only)
    - Stage by name the files of group 11 and commit with the subject `art-polish: hero headstones and path (group 11)`. Push. Record the hash.
    - _Requirements: 10.6_

- [ ] 13. Traceability
  - [~] 13.1 Add the AP traceability test
    - Create `tests/ui/ap-traceability.test.ts`, modelled on `tests/ui/ru-traceability.test.ts` and `art-traceability.test.ts`: each of `AP-P1` to `AP-P4` appears in exactly one `// Feature: art-polish, Property AP-P<n>:` tag, every tagged file has a `// Validates:` line, and every `it` or `test` title in a tagged file starts with the property number of its tag. Check that `tests/ui/traceability.test.ts`, `art-traceability.test.ts` and `ru-traceability.test.ts` stay green (they must not match the new tags).
    - _Requirements: 9.1_
  - [~] 13.2 Update the property traceability document
    - If `docs/property-traceability.md` lists the properties of the other specs, add `AP-P1` to `AP-P4` in the same format (title, file, requirements) and update its counts; otherwise leave the file unchanged and say so. This task is the only owner of that file.
    - _Requirements: 9.1_

- [ ] 14. Final checkpoint - All checks and end-to-end
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, then `npm run test:e2e` (all projects, mocked) and `npm run check:bundle`, and ensure all pass: in particular `above-fold`, `headline-lines`, `art`, `layout-shift`, `reflow`, `reduced-motion`, `scene-perf` and `js-budget`. Fix a failure in the file that causes it, in a separate commit. Ask the user if questions arise.
  - [~] 14.1 Commit and push the traceability group (orchestrator-only)
    - Stage by name the files of group 13 and any fix files and commit with the subject `art-polish: traceability (group 13)`. Push. Record the hash.
    - _Requirements: 10.6_

- [ ] 15. Delivery: screenshots, budgets, deploy, report
  - [~] 15.1 Regenerate the committed screenshots (Visual)
    - Run `$env:SCREENSHOTS = '1'; npx playwright test tests/e2e/screenshots.spec.ts --project=desktop --project=mobile`, compute a SHA-256 of every file under `docs/screenshots/*.png` (not the `m1`, `m2`, `m3` and `resurrect` folders), run the same command a second time and compare; the two runs must give identical hashes (if not, report the differing files and the cause, and do not continue). Run the resurrect report spec as in `docs/resurrect-upgrade-report.md` to rewrite `docs/screenshots/resurrect/*.png` (twice, same comparison). Confirm with `git status --short docs/screenshots` that `m1`, `m2` and `m3` are untouched, and that the results scenes, landing, detail panels with a scene, empty states (including the results-empty images deferred earlier) and the resurrect images changed. Open at least: one results scene (desktop and mobile), the landing (desktop), the empty graveyard, one detail panel with a restless plot, and one resurrect image, and report what each shows. List the changed files by name for the commit in task 15.4.
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - [~] 15.2 Take the report screenshots (Visual)
    - Run `$env:POLISH_REPORT = '1'; npx playwright test tests/e2e/polish-report.spec.ts --project=desktop`. Check that the four files exist in `docs/screenshots/polish/` and that axe reported no violation on any of the four screens (`test-results/polish-measurements.json`). Open all four images and report what you see: the first row on the ground in front of the fence, the fog (no hard edge, no stripes), the headline lines and the Plaque, the ledger stone and the restless ghost where they appear, and on the landing the headstones, the cross and the path. Keep the measurements file for the report.
    - _Requirements: 10.1, 10.2, 10.7_
  - [~] 15.3 Measure the render and the bundle budgets
    - Run `npx playwright test tests/e2e/scene-perf.spec.ts --project=desktop` three times and record the median of the request scene (40 plots) and of the synthetic 300-plot scene (4x CPU throttle) as the tests record them, and compare each with 100 ms and 80.4 ms. Run `npm run check:bundle` and `npx playwright test tests/e2e/js-budget.spec.ts --project=desktop` and record the client JavaScript gzip size against 256,000 bytes. If a budget is exceeded, stop and report the numbers.
    - _Requirements: 9.3, 9.4, 10.4, 10.5_
  - [~] 15.4 Commit and push the screenshots (orchestrator-only)
    - Stage by name the files listed by task 15.1 and `docs/screenshots/polish/*.png` and commit with the subject `art-polish: regenerated screenshots and report images`. Push. Record the hash.
    - _Requirements: 10.6, 11.1_
  - [~] 15.5 Verify the deploy (orchestrator-only)
    - Check that all commits of this spec are pushed to `main`, run `npm run verify:deploy` until it passes (Vercel deploys on push), and keep the output. Open the production landing page and a results page in the Playwright browser at 1440x760 once (read-only, no token), and note whether the first row stands on the ground and the fog shows no edge; if production still shows the old art, wait for the deployment and retry.
    - _Requirements: 10.6_
  - [~] 15.6 Write the report (orchestrator-only)
    - Create `docs/art-polish-report.md` with the sections `# Art polish report`, `## What changed` (the decisions table of the requirements: how the band was removed, horizon values 240 and 150 unchanged, the stage lead 104 and 14 px, header changes, the `slab` id decision and the coffin finding of task 9.1, restless arrangement numbers, fog technique, new tokens with their contrast numbers), `## Above the fold` (the measured numbers of task 7.4 for 1440x760, 1280x720 and 390x700), `## Headline` (bounds 28 to 40 px from 1280 px, measured line counts), `## Screenshots` (the four images embedded and what was seen on each), `## Regenerated screenshots` (task 15.1: files, the two-run identity result), `## Accessibility` (axe per screen), `## Budgets` (task 15.3: medians against 100 ms and 80.4 ms, JavaScript size against 256,000), `## Test changes` (every changed assertion with old and new values, including `art-css.test.ts`), `## Properties` (AP-P1 to AP-P4 with results of `npm run test:deep -- <files>` run now, never setting `FC_NUM_RUNS`), `## Deploy` (task 15.5), `## Findings` (anything surprising, any limit) and `## Commits and CI` (filled by task 15.7).
    - _Requirements: 10.4, 10.5, 10.6, 10.7_
  - [~] 15.7 Commit the report and append the commits with CI status (orchestrator-only)
    - Stage `docs/art-polish-report.md` (and `docs/property-traceability.md` if task 13.2 changed it and it is not yet committed) by name and commit with the subject `art-polish: report`. Push. Collect the commits of this spec (the hashes recorded in tasks 2.1, 4.1, 6.1, 8.1, 10.1, 12.1, 14.1, 15.4 and this one, plus any fix commit) with `git log --oneline`, and the CI status of each with `gh run list --limit 30` (workflow `ci.yml`: status and conclusion, `pending` for an unfinished run). Append the table (hash, subject, CI status) to `## Commits and CI`, commit with the subject `art-polish: report commits and CI status` and push; the CI status of this last commit is `pending`.
    - _Requirements: 10.6_

- [~] 16. STOP
  - Stop here. Report to the user: the above-the-fold numbers at 1440x760, 1280x720 and 390x700, the headline line counts, what was seen on the four screenshots, the changed assertions of `tests/ui/art-css.test.ts`, the budgets (render medians against 100 ms and 80.4 ms, JavaScript against 256,000), the properties with any counterexample, the commits with CI status, and the path of `docs/art-polish-report.md`. Do not start any other work, spec or refactor.

## Notes

- Every task, including the property-based tests, is required. Nothing is marked optional.
- Tasks 2.1, 4.1, 6.1, 8.1, 10.1, 12.1, 14.1, 15.4, 15.5, 15.6 and 15.7 use `git push`, the deployed site or the network; the orchestrator does them.
- The `slab` id stays (design AP-D8): only its drawing changes, so `GA-P1`, `GA-P10` and every key's variant are unchanged.
- The grass strip is CSS-only and depends on `--cell-h` only, so no property is added for its independence from the plot layout; `graveyard-ui` P14 to P16, `GA-P4` and the CSS test cover it.
- Tasks 3.4 and 7.3 add end-to-end tests that fail until task 7.4 (3.4) or task 7.1 (7.3); end-to-end runs happen in task 7.4 and checkpoint 14.
- `.kiro/specs/*` task lists and `tasks.meta.json` files of other specs are not edited.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.5"] },
    { "id": 1, "tasks": ["1.2", "1.4"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["3.1", "3.4"] },
    { "id": 4, "tasks": ["3.2", "3.3"] },
    { "id": 5, "tasks": ["4.1"] },
    { "id": 6, "tasks": ["5.1"] },
    { "id": 7, "tasks": ["5.2"] },
    { "id": 8, "tasks": ["6.1"] },
    { "id": 9, "tasks": ["7.1"] },
    { "id": 10, "tasks": ["7.2", "7.3"] },
    { "id": 11, "tasks": ["7.4"] },
    { "id": 12, "tasks": ["7.5"] },
    { "id": 13, "tasks": ["8.1"] },
    { "id": 14, "tasks": ["9.1"] },
    { "id": 15, "tasks": ["9.2"] },
    { "id": 16, "tasks": ["9.3", "9.4", "9.5"] },
    { "id": 17, "tasks": ["10.1"] },
    { "id": 18, "tasks": ["11.1"] },
    { "id": 19, "tasks": ["11.2"] },
    { "id": 20, "tasks": ["12.1"] },
    { "id": 21, "tasks": ["13.1", "13.2"] },
    { "id": 22, "tasks": ["14.1"] },
    { "id": 23, "tasks": ["15.1"] },
    { "id": 24, "tasks": ["15.2"] },
    { "id": 25, "tasks": ["15.3"] },
    { "id": 26, "tasks": ["15.4"] },
    { "id": 27, "tasks": ["15.5"] },
    { "id": 28, "tasks": ["15.6"] },
    { "id": 29, "tasks": ["15.7"] }
  ]
}
```
