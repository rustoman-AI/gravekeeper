# Implementation Plan: graveyard-art

## Overview

This plan implements `requirements.md` and `design.md` of the spec `graveyard-art` (Requirements 1 to 19, Properties 1 to 14, written GA-P1 to GA-P14 in tags). It adds the night landscape, sprite variety, the new header, human epitaphs, the landing hero, the scanning scene and the empty-state fixes to the finished graveyard-ui, then deploys and reports Milestone 3. Execution stops after the Milestone 3 report (task 28).

Groups follow the user's priority: housekeeping first (a small group that can be committed alone), then scene atmosphere, sprites, header, epitaphs, landing page, scanning screen, empty states, then end-to-end, axe and performance updates, traceability and docs, screenshots (only where the art legitimately changed), deploy, the Milestone 3 report spec, the report writer, and a final stop task.

Every group ends with a checkpoint that runs `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`. Property tests are written next to the code they validate. Unlike the optional-test convention of the generic workflow, tests here are mandatory (no `*` suffix), as in graveyard-ui: the repository convention and the user's brief require every guarantee to stay tested.

Implementation language: TypeScript (strict), the project root is the `gravekeeper` folder. Property tests live in `tests/ui/view-model/<module>.property.test.ts` (or `<module>-<topic>.property.test.ts` when one module has several properties, so no two tasks write one file), use `cfg()` from `tests/support/fc-config.ts`, and carry the two tag lines `// Feature: graveyard-art, Property GA-P<n>: <title>` and `// Validates: Requirements <x.y>`. Every `it` title in such a file starts with `GA-P<n>`. Component tests use the docblock `// @vitest-environment jsdom` and accessible queries. Source code cites the requirement number in a comment above each rule. `AGENTS.md` applies: read the relevant guide in `node_modules/next/dist/docs/` before changing any Next.js code (this plan changes none of layout, fonts, routing or `next.config.ts`).

### Rules for every agent that executes a task

- Never set `FC_NUM_RUNS` in the shared shell. For a deeper property run use `npm run test:deep` (optionally followed by test paths), which sets it for that one process only.
- One owner per file: a task edits only the files it lists. Tasks of one wave in the dependency graph never share a file.
- Never print, log or write a token or any environment variable value to a file, a report or the console. Never run a command that echoes the environment.
- Do not commit or push. The orchestrator commits and pushes after each green group (the deploy tasks need the push, which the orchestrator performs before task 25.1).
- Do not edit the documents of other specs (graveyard-ui, scan-pipeline, scan-accuracy, dependency-graveyard-core, their `tasks.md` and `tasks.meta.json`).
- New modules are imported by their path (for example `../view-model/duration`), so the barrel `view-model/index.ts` is not edited by this plan.
- Update an existing test only when the art legitimately changed it. The task names the test and the reason. Never loosen an assertion to make a test pass.
- New colours exist only as Tokens in the `@theme` block of `app/globals.css`. No colour literal anywhere else.

## Tasks

- [x] 1. Housekeeping (committable alone)
  - [x] 1.1 Run the Deployed_Project with one worker
    - In `playwright.config.ts` set the top-level option `workers: externalBaseUrl ? 1 : undefined`, with a comment that two workers collide on the artifact directory (ENOENT) in the deployed project. Change nothing else in the file.
    - Files: `playwright.config.ts`
    - _Requirements: 15.1, 15.2, 15.4_
  - [x] 1.2 Test the Playwright worker setting
    - Create `tests/ui/playwright-config.test.ts`: import the config with `E2E_BASE_URL` set (use `vi.resetModules()` and set the variable inside the test, restore it after) and expect `workers` to be 1 and a project named `deployed` to exist; import it with the variable unset and expect `workers` to be `undefined` and no `deployed` project. Read and print no other environment variable.
    - Files: `tests/ui/playwright-config.test.ts`
    - _Requirements: 15.1, 15.2, 15.3_
  - [x] 1.3 Replace the Vite tsconfig-paths plugin with the native option
    - First check `node_modules/vite/package.json` (installed 8.3.8) and the Vite docs in `node_modules/vite` for `resolve.tsconfigPaths`. In `vitest.config.mts` delete the `vite-tsconfig-paths` import and the plugin entry, and add `resolve: { tsconfigPaths: true }`. Run `npx vitest --run tests/ui tests/architecture` and confirm the `@/` imports resolve and the output has no warning that names `vite-tsconfig-paths`. If the installed Vite rejects the option, stop, restore the plugin and report the Vite version (R16.4 path).
    - Create `tests/ui/vitest-config.test.ts`: read `vitest.config.mts` as text and expect no `vite-tsconfig-paths` and the text `tsconfigPaths: true`.
    - Files: `vitest.config.mts`, `tests/ui/vitest-config.test.ts`
    - _Requirements: 16.1, 16.2, 16.5_
  - [x] 1.4 Remove the plugin package when nothing else uses it
    - Run a text search for `vite-tsconfig-paths` over the repository (exclude `node_modules`, `.next`, `.git`, `docs/` and `.kiro/`). If only `package.json`, `package-lock.json` and `tests/packages.test.ts` match, remove it from `devDependencies` (`npm uninstall vite-tsconfig-paths`, no other dependency change), remove `'vite-tsconfig-paths'` from `UI_TOOLING` in `tests/packages.test.ts`, and keep the other entries. If another source file still imports it, keep the package and write the file name in the task result. `scripts/write-m2-report.ts` mentions the plugin only in the text of a known gap of the finished Milestone 2 report; leave it.
    - Files: `package.json`, `package-lock.json`, `tests/packages.test.ts`
    - _Requirements: 16.3, 16.4_

- [x] 2. Checkpoint - Housekeeping
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass and that the vitest output has no `vite-tsconfig-paths` warning. This group can be committed alone. Ask the user if questions arise.

- [x] 3. Foundation: constants, hash module and tokens
  - [x] 3.1 Add the art constants and move `hashKey`
    - In `view-model/constants.ts` add the constants of design "Constants (additions)": `TOMBSTONE_VARIANTS`, `OVERGROWN_VARIANTS`, `TILT_MAX_DEG`, `DEPTH_SCALE_BACK`, `DEPTH_BRIGHTNESS_BACK`, `FOG_OPACITY_LOW`, `FOG_OPACITY_HIGH`, `DURATION_DAYS_MAX_EXCLUSIVE`, `DURATION_MONTHS_MAX_EXCLUSIVE`, `DAYS_PER_MONTH_TEXT`, `DAYS_PER_YEAR_TEXT`, `SCAN_STONE_COUNT` (assert in a comment that it equals `SCAN_STAGES.length`) and `SCAN_STONE_X`, each with a requirement comment. Create `view-model/hash.ts` with `hashKey` (FNV-1a exactly as in `scene.ts`) and make `view-model/scene.ts` import it and re-export it (`export { hashKey } from './hash'`), so every existing import keeps working and the hash values do not change.
    - Add `tests/ui/view-model/art-constants.test.ts`: the variant lists have 4 and 3 entries, `SCAN_STONE_COUNT` equals `SCAN_STAGES.length` and `SCAN_STONE_X.length`, the depth constants are in (0, 1), and `hashKey("request:1")` equals the value computed by an inline copy of the FNV-1a loop (guards the move).
    - Files: `view-model/constants.ts`, `view-model/hash.ts`, `view-model/scene.ts`, `tests/ui/view-model/art-constants.test.ts`
    - _Requirements: 2.6, 3.1, 3.3, 3.4, 6.3, 10.1_
  - [x] 3.2 Add the new colour tokens and extend the token test
    - In the `@theme` block of `app/globals.css` add `--color-sky-low`, `--color-moon`, `--color-ground`, `--color-hill`, `--color-iron`, `--color-mist`, `--color-plaque` with the values of the design table (adjust a hex only if the test below fails) and a comment on each; mark `moon`, `hill`, `iron`, `mist` with `DECORATIVE ONLY`. Update the contrast comment above the block. Extend `tests/ui/tokens.test.ts`: the seven tokens exist with 6-digit hex values; the decorative marks exist; each text token (`bone`, `bone-muted`, `amber`, `spectral`, `stone`, `moss`) has contrast at least 4.5 on `sky-low`, `ground` and `plaque`; `focus` has at least 3 on the same three; `bone` has at least 4.5 on `mist` at `FOG_OPACITY_HIGH` composited over `night`; the CSS fog opacities (added later) are checked in task 18.1. Keep every existing assertion.
    - Files: `app/globals.css`, `tests/ui/tokens.test.ts`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 9.7_

- [x] 4. Scene atmosphere
  - [x] 4.1 Backdrop, shared defs and the night landscape
    - Create `components/scene-defs.tsx` (gradients `sky-gradient` from `--color-night` at the top to `--color-sky-low` at the bottom, `moon-halo-gradient`, and the `fence-pattern`; colours by `var(--color-...)` in `stopColor` and `fill`), rendered inside the `<defs>` of `components/scene-sprites.tsx` (one added line; the rest of the sheet is unchanged here). Create `components/scene-backdrop.tsx` (`SceneBackdrop({ variant: 'stage' | 'hero' | 'scanning' })`, one `svg.gk-backdrop`, `aria-hidden="true"`, `focusable="false"`, viewBoxes and layers of the design, `STAR_COUNT` = 24 stars from a constant table, three bare trees, hills, fence, ground band; no filter, no mask, no text, no colour literal) and `components/night-landscape.tsx` (`NightLandscape({ variant, children? })` = `SceneBackdrop` plus `FogLayer`).
    - Add `tests/ui/components/scene-backdrop.test.tsx`: one `svg` per render, `aria-hidden`, 24 star circles, no `filter`, `mask`, `text` or `title` element, two renders have identical markup, each variant has its viewBox.
    - Files: `components/scene-defs.tsx`, `components/scene-backdrop.tsx`, `components/night-landscape.tsx`, `components/scene-sprites.tsx`, `tests/ui/components/scene-backdrop.test.tsx`
    - _Requirements: 1.1, 1.3, 1.5, 1.6, 1.7_
  - [x] 4.2 Stage, ground and fog styles; fog layer names
    - In `app/globals.css` add `.gk-stage` (padding-top `var(--horizon-h)`, `--horizon-h` 240px and 150px under 640px, Ground gradient from `--color-ground` to `--color-night`), `.gk-stage > .gk-backdrop` (absolute, full width, `--horizon-h` high), `.gk-fog-low` and `.gk-fog-high` (opacity 0.25 and 0.35 constant, `transform`-only keyframes `gk-fog-drift` of 70 s and 110 s, positioned over the lower part of the Scene, `pointer-events: none`), static fog under `.gk-scene[data-simplified="true"]` and in the reduced-motion block. Change the keyframes `gk-fog-drift` to `transform` only. Keep the old `.gk-fog`, `.gk-fog-b` as base class and alias so `fog-layer.tsx` renders `gk-fog gk-fog-low` and `gk-fog gk-fog-high`; update `components/fog-layer.tsx`.
    - Files: `app/globals.css`, `components/fog-layer.tsx`
    - _Requirements: 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 12.1_
  - [x] 4.3 Scene stage and the results page layout
    - Create `components/scene-stage.tsx` (`SceneStage({ children })`: `div.gk-stage` with `SceneBackdrop variant="stage"` and an inner `div.gk-stage-inner.mx-auto.w-full.max-w-6xl.px-4`). In `components/results-page.tsx` render the scene view as `SceneStage` around the existing `containerRef` div (the measured width and `columnsFor(width - 2 * SCENE_PADDING_PX)` stay unchanged), keep the list view and the empty-graveyard branch inside the `max-w-6xl` container without a stage, and keep the view toggle, the cap banner and the notes in the container. Reserved height stays `sceneHeight(rows.length, columns)`.
    - Files: `components/scene-stage.tsx`, `components/results-page.tsx`
    - _Requirements: 1.2, 1.8, 14.8_
  - [x] 4.4 Depth in the view-model
    - Create `view-model/depth.ts` (`depthOf(row, rowCount)` as in the design, three decimals, clamped `t`). Add `depthScale` and `depthBrightness` to `PlotModel` in `view-model/types.ts` and set them in `plotOf` of `view-model/scene.ts` (`r = floor(i / cols)`, `rowCount = ceil(rows.length / cols)`); `x`, `y`, `width`, `height`, `phase` keep their formulas and the `hashKey(row.key)` input.
    - Files: `view-model/depth.ts`, `view-model/types.ts`, `view-model/scene.ts`
    - _Requirements: 2.6, 2.7, 2.8_
  - [x] 4.5 Write the property test for depth monotonicity
    - `tests/ui/view-model/depth.property.test.ts`: pairs r1 ≤ r2 below n, and scenes built with the shared arbitrary (`tests/support/ui/`) with columns 2 to 20.
    - **Property 3: Depth is monotone by row and stays in range (GA-P3)**
    - **Validates: Requirements 2.6, 2.7**
  - [x] 4.6 Write the property test for layout independence
    - `tests/ui/view-model/depth-geometry.property.test.ts`: recompute the cell formula in the test (own copy of the jitter arithmetic, using `hashKey`) and compare `x`, `y`, `width`, `height` of every plot; also call the existing P14 and P15 checks (import the helpers of the graveyard-ui property files if exported, else repeat the rectangle test inline) on the same input.
    - **Property 4: Depth does not change any layout box (GA-P4)**
    - **Validates: Requirements 2.8, 17.1**
  - [x] 4.7 Apply depth to the plot and style the plot art
    - In `components/scene-plot.tsx` write `--depth-scale` and `--depth-bright` on the button only when different from 1. In `app/globals.css` add to `.gk-plot-art`: `transform-origin: 50% 100%; scale: var(--depth-scale, 1);` (the `rotate` for tilt is added in task 6.10). Make no change to `.gk-plot-label` (labels are not dimmed or scaled).
    - Files: `components/scene-plot.tsx`, `app/globals.css`
    - _Requirements: 2.9, 14.6_
  - [x] 4.8 Component tests for the stage and the plot
    - Update `tests/ui/components/scene.test.tsx` and `tests/ui/components/scene-render.test.tsx` only where they count plot children or inspect style strings (reason: the plot style gains `--depth-*` values; assertions keep their intent). Add `tests/ui/components/scene-stage.test.tsx`: the stage contains exactly one `svg.gk-backdrop`, the scene view of `ResultsPage` renders a stage, the list view and the empty graveyard render none, each plot still has four elements (button, svg, use, label), the label has no `opacity` style.
    - Files: `tests/ui/components/scene.test.tsx`, `tests/ui/components/scene-render.test.tsx`, `tests/ui/components/scene-stage.test.tsx`
    - _Requirements: 1.2, 1.8, 2.9, 14.4_

- [x] 5. Checkpoint - Scene atmosphere
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [x] 6. Sprite variety and tone
  - [x] 6.1 Variant, tilt and symbol-id functions
    - Create `view-model/variants.ts` with `SPRITE_VARIANTS`, `STONE_KINDS`, `variantOf`, `tiltOf` and `symbolIdOf` exactly as in the design (`hashKey("variant:" + key)` and `hashKey("tilt:" + key)`).
    - Files: `view-model/variants.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.8_
  - [x] 6.2 Write the property test for variant choice
    - `tests/ui/view-model/variant-choice.property.test.ts`: random keys (strings including unicode and the empty string) and kinds; also scenes built at two column counts and rotated row order.
    - **Property 1: Variant choice is a deterministic function of kind and key (GA-P1)**
    - **Validates: Requirements 3.2, 3.3, 3.4**
  - [x] 6.3 Write the property test for tilt
    - `tests/ui/view-model/tilt.property.test.ts`.
    - **Property 2: Tilt stays within the range and only stones lean (GA-P2)**
    - **Validates: Requirements 3.6, 3.8**
  - [x] 6.4 Variant, symbol id and tilt on the plot model
    - Add `variant`, `symbolId` and `tilt` to `PlotModel` (`view-model/types.ts`) and set them in `plotOf` (`view-model/scene.ts`). Add `tests/ui/view-model/variants.test.ts`: fixed-key examples, restless equals tombstone for one key, and the reachability check of R3.5 (keys `npm:name-0:registry` to `npm:name-999:registry`, each variant of both lists chosen for at least 5 percent).
    - Files: `view-model/types.ts`, `view-model/scene.ts`, `tests/ui/view-model/variants.test.ts`
    - _Requirements: 3.5, 3.8_
  - [x] 6.5 Stone symbols: tombstones and overgrown graves
    - Create `components/scene-sprite-stones.tsx` returning the shared shapes (`shape-stone-rounded`, `-cross`, `-obelisk`, `-slab`, `shape-ivy-light`, `-medium`, `-heavy`) and the symbols `plot-tombstone-<v>`, `plot-overgrown-ivy-<level>` and their `-flat` twins, on the `0 0 80 104` viewBox, root `<g style={{ opacity: "var(--depth-bright, 1)" }}>` in every non-flat and flat symbol, colours by Tokens only, no filter, no mask. Remove the built-in `rotate(-9)` of the old overgrown symbol (Tilt supplies the lean). Each variant has a different outline. Add `tests/ui/components/sprites-stones.test.tsx` (ids from `SPRITE_VARIANTS`, flat twins, distinct markup per symbol).
    - Files: `components/scene-sprite-stones.tsx`, `tests/ui/components/sprites-stones.test.tsx`
    - _Requirements: 3.1, 4.7, 4.9_
  - [x] 6.6 Ghost and restless symbols
    - Create `components/scene-sprite-ghosts.tsx`: `shape-ghost-wisp` (narrow head, body filled with `ghost-body-gradient` fading into a trailing tail with two curls, two hollow dark eyes, no mouth, thin low-opacity bone stroke), the glow shape using `--glow`, symbols `plot-ghost-wisp`, `plot-restless-<v>` (the wisp rising from its own stone, tail overlapping the stone top; stone shapes imported by reference `#shape-stone-<v>`) and flat twins. The `ghost-body-gradient` is defined in this file's own `<defs>` fragment. Add `tests/ui/components/sprites-ghosts.test.tsx` (no `ellipse` mouth shape, two eye shapes, gradient fill, restless uses the stone shape of its variant, flat twins).
    - Files: `components/scene-sprite-ghosts.tsx`, `tests/ui/components/sprites-ghosts.test.tsx`
    - _Requirements: 4.1, 4.2, 4.3, 4.7, 4.9_
  - [x] 6.7 Lantern and unmarked symbols
    - Create `components/scene-sprite-props.tsx`: `lantern-pool-gradient`, symbol `plot-lantern-iron` (Light_Pool ellipse on the ground line, short crooked post of two bent segments, hook, iron lantern with cap and cage bars, amber glass, flame) and `plot-unmarked-mound` (low mound, small wooden marker of two planks), plus flat twins (the flat lantern has no pool gradient). Add `tests/ui/components/sprites-props.test.tsx` (pool ellipse only in the non-flat lantern, marker shapes present, distinct markup).
    - Files: `components/scene-sprite-props.tsx`, `tests/ui/components/sprites-props.test.tsx`
    - _Requirements: 2.10, 2.11, 4.4, 4.6, 4.7, 4.9_
  - [x] 6.8 Assemble the sprite sheet and use the symbol id
    - Rebuild `components/scene-sprites.tsx` from `SceneDefs`, the three sprite files and the existing `plot-glow-gradient`; remove the old `plot-<kind>` symbols. In `components/scene-plot.tsx` render `<use href={"#" + plot.symbolId + (simplified ? "-flat" : "")} />`.
    - Files: `components/scene-sprites.tsx`, `components/scene-plot.tsx`
    - _Requirements: 4.7, 4.10, 14.4_
  - [x] 6.9 Write the property test for symbol ids and the sheet test
    - `tests/ui/view-model/symbol-ids.property.test.ts`: for generated scenes, every plot `symbolId` is in the table, per-kind id sets are disjoint, no duplicate id in the table; a unit assertion renders `SceneSprites` and checks that every id of the table and its `-flat` twin exist as `<symbol id>` and that no two symbols of one form serialize identically. Update `tests/ui/components/scene-sprites.test.tsx` (reason: the symbol ids changed from `plot-<kind>` to `plot-<kind>-<variant>`).
    - **Property 10: Every plot resolves to one existing, kind-unique symbol (GA-P10)**
    - **Validates: Requirements 4.7, 4.8**
    - Files: `tests/ui/view-model/symbol-ids.property.test.ts`, `tests/ui/components/scene-sprites.test.tsx`
  - [x] 6.10 Tilt, flicker and motion styles
    - In `app/globals.css` add `rotate: var(--tilt, 0deg)` to `.gk-plot-art`; replace the lantern plot animation by keyframes `gk-lantern-flicker` (opacity only, 1 to 0.8, 2.4 s, `phase` delay); remove the keyframes `gk-lantern-pulse` only if no selector uses it after this task (the scanning dot is removed in task 14.4, so keep it until then); extend the reduced-motion block with every new selector. Update `tests/ui/reduced-motion-css.test.ts` only where its selector list must include the new selectors (reason: the legitimately added animations; the assertion that every animation is disabled stays). In `components/scene-plot.tsx` write `--tilt` (as `<n>deg`) on the button when `plot.tilt` is not 0; task 6.8 finished editing this file in an earlier wave.
    - Files: `app/globals.css`, `components/scene-plot.tsx`, `tests/ui/reduced-motion-css.test.ts`
    - _Requirements: 3.7, 4.5, 12.1, 12.2, 12.4_
  - [x] 6.11 Update the scene tests for the new art
    - Update `tests/ui/components/scene.test.tsx` and `tests/ui/components/scene-render.test.tsx` where they assert symbol hrefs (`#plot-<kind>` becomes `#plot-<kind>-<variant>`, `-flat` kept in the simplified form; reason: GA-D7) and add an assertion that a stone plot carries `--tilt` when its tilt is not 0.
    - Files: `tests/ui/components/scene.test.tsx`, `tests/ui/components/scene-render.test.tsx`
    - _Requirements: 3.7, 4.7, 17.2_
  - [x] 6.12 Measure the render time and the bundle after the sprites
    - Run `npm run build`, `npm run check:bundle` and the perf spec (`npx playwright test tests/e2e/scene-perf.spec.ts --project=perf`). Record the 300-plot median and the gzip total in the task result and compare them with 65.4 ms and 156353 bytes. If the median exceeds baseline plus 15 ms or the total exceeds 180000 bytes, apply the contingencies of the design in order and re-measure. This task changes no file unless a contingency is applied; if one is, name the files in the result.
    - Files: none (measurement); contingency files only if needed: `components/scene-sprite-ghosts.tsx`, `components/scene-sprite-props.tsx`
    - _Requirements: 14.1, 14.2, 14.3_

- [x] 7. Checkpoint - Sprites
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [x] 8. Results header
  - [x] 8.1 Header model: chips and meta line
    - In `view-model/types.ts` add `StatusChipModel` and `chips` to `HeaderModel`; in `view-model/header.ts` build the four chips (texts and icon symbol ids of the design) when `assessed >= 1`, keep every existing field. The grade stays non-null here (task 16.1 changes it).
    - Files: `view-model/types.ts`, `view-model/header.ts`
    - _Requirements: 5.4, 5.5, 5.9_
  - [x] 8.2 Status chip and grade plaque components
    - Create `components/status-chip.tsx` (`li.gk-chip` with an `aria-hidden` `svg > use` icon and a text span) and `components/grade-plaque.tsx` (`figure.gk-plaque` with the letter and `figcaption` "worst single risk"; the explanation paragraph and the closed "Grade scale" `details` follow the figure, as `GradeLine` did). Delete `components/grade-line.tsx` and move its test cases to the new component's test in task 8.4.
    - Files: `components/status-chip.tsx`, `components/grade-plaque.tsx`, `components/grade-line.tsx`
    - _Requirements: 5.2, 5.4, 5.5, 5.8_
  - [x] 8.3 Results header layout and styles
    - Rewrite `components/results-header.tsx`: h1 repo name (kept id, `tabIndex`), headline paragraph `.gk-headline`, a row with `GradePlaque` and the chip list (`ul` with `aria-label="Status counts"`), the small muted meta line (commit abbr, branch, as-of time, `CacheNote`), the `entriesSentence`. In `app/globals.css` add `.gk-headline` (display font, `font-size: clamp(2rem, 5vw + 0.5rem, 3.5rem)`, line-height 1.1), `.gk-plaque` (gradient and border from `--color-plaque` and `--color-stone`, carved text shadow from tokens via `color-mix`, no filter), `.gk-plaque-letter` (display font, about 4.5rem) and `.gk-chip`.
    - Files: `components/results-header.tsx`, `app/globals.css`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8_
  - [x] 8.4 Update the header tests
    - Update `tests/ui/components/results-header.test.tsx` (reason: headline, plaque, chips and meta line replace the old list and the `GradeLine` text), add the former `GradeLine` cases (explanation, closed scale, scale content) for `GradePlaque`, and add `tests/ui/view-model/header-chips.test.ts` (chip texts and order for a fixed result, counts equal the summary).
    - Files: `tests/ui/components/results-header.test.tsx`, `tests/ui/view-model/header-chips.test.ts`
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.7, 5.8_

- [x] 9. Checkpoint - Results header
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [x] 10. Human epitaphs and plain-language reasons
  - [x] 10.1 Humanised durations
    - Create `view-model/duration.ts` with `durationParts` and `humanizeDays` as in the design (constants from `view-model/constants.ts`; no `Date`, no locale formatting). Add `tests/ui/view-model/duration.test.ts`: the boundary table (0.5, 1, 2, 59, 59.9, 60, 61, 729, 730, 731), the four examples (1, 40, 210, 3285), `NaN`, `Infinity`, `-1`.
    - Files: `view-model/duration.ts`, `tests/ui/view-model/duration.test.ts`
    - _Requirements: 6.1, 6.3, 6.5, 6.6_
  - [x] 10.2 Plain reason lines
    - Create `view-model/plain-reasons.ts` with `plainReasonLine(reason)` and the closed table of the design (number-free fallbacks, the unknown-rule line, no use of `reason.message`, numbers only from `openVulnerabilityCount` and `maxSeverity` facts).
    - Files: `view-model/plain-reasons.ts`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 10.3 Write the property test for duration totality
    - `tests/ui/view-model/duration-total.property.test.ts`: `fc.double` with `noNaN: false`, infinities, negatives, values up to 1e15 and `fc.integer` around the boundaries.
    - **Property 5: Duration formatting is total (GA-P5)**
    - **Validates: Requirements 6.1, 6.2, 6.6**
  - [x] 10.4 Write the property test for duration monotonicity
    - `tests/ui/view-model/duration-monotone.property.test.ts`.
    - **Property 6: Duration formatting is monotone with exact unit boundaries (GA-P6)**
    - **Validates: Requirements 6.3, 6.4**
  - [x] 10.5 Write the property test for plain reason lines
    - `tests/ui/view-model/plain-reasons.property.test.ts`: reasons with `fc.string()` rule ids (and the ten core ids), arbitrary messages, facts with wrong types, missing fields and duplicates; check the digit sequences against the integer fact values.
    - **Property 7: Plain reason lines are total and take numbers only from the facts (GA-P7)**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
  - [x] 10.6 Epitaph builder
    - Create `view-model/epitaph.ts` with `buildEpitaph(row)` and `EpitaphModel` as in the design (sentence order, `finiteNonNegative`, verdicts per kind, rule presence from `row.classification.reasons`, the unassessed label from `unassessedLabelOf`). Add `tests/ui/view-model/epitaph.test.ts`: one row each for `overgrown` (the aws-sign2 case: "Here lies aws-sign2. Last release 9 years ago. Last commit 9 years ago. It may be finished, or abandoned." with 3285-day facts), archived and deprecated tombstones, an unmaintained-advisory tombstone, a ghost (with and without severity, one vulnerability), a restless ghost, a lantern, an unmarked grave, both facts unknown, one fact unknown.
    - Files: `view-model/epitaph.ts`, `tests/ui/view-model/epitaph.test.ts`
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_
  - [x] 10.7 Write the property test for the epitaph name and shape
    - `tests/ui/view-model/epitaph-name.property.test.ts`: rows from the shared arbitrary (including names with unicode, spaces and a trailing dot).
    - **Property 8: The epitaph contains the name and is made of sentences (GA-P8)**
    - **Validates: Requirements 7.2, 7.7**
  - [x] 10.8 Write the property test for no invented facts
    - `tests/ui/view-model/epitaph-facts.property.test.ts`: rows whose facts are set to `null`, negative, `NaN` or valid at random; check the if-and-only-if rules and the allowed numbers.
    - **Property 9: The epitaph invents no fact (GA-P9)**
    - **Validates: Requirements 7.3, 7.4, 7.5, 7.6, 7.8**
  - [x] 10.9 Detail model: epitaph and plain reasons
    - In `view-model/types.ts` add `epitaph` to `DetailModel` and `plain` to each reason entry; in `view-model/detail.ts` set `epitaph: buildEpitaph(row)` and `plain: plainReasonLine(r)`, leaving `ruleId`, `message` and `isMain` as they are.
    - Files: `view-model/types.ts`, `view-model/detail.ts`
    - _Requirements: 7.1, 7.2, 8.1, 8.8_
  - [x] 10.10 Write the property test for verbatim reasons
    - `tests/ui/view-model/detail-reasons.property.test.ts`.
    - **Property 14: Reasons keep the core message and rule id verbatim (GA-P14)**
    - **Validates: Requirements 8.1, 8.6, 8.8**
  - [x] 10.11 Epitaph block and reason item components
    - Create `components/epitaph-block.tsx` (`section[aria-label="Epitaph"].gk-epitaph` with `p` of one `span` per sentence, React text nodes only) and `components/reason-item.tsx` (`li` with the optional "main reason:" label, the plain line, and `details.gk-rule > summary "Show the rule"` that holds the exact message and `(rule <id>)`, closed by default).
    - Files: `components/epitaph-block.tsx`, `components/reason-item.tsx`
    - _Requirements: 7.9, 8.5, 8.7, 8.8_
  - [x] 10.12 Detail panel and styles
    - In `components/detail-panel.tsx` render `EpitaphBlock` directly after the status line and before "Reasons", and render each reason with `ReasonItem`; keep every other section. In `app/globals.css` add `.gk-epitaph` (display font 1.25rem, `--color-plaque` background, `--color-iron` border, carved text-shadow from tokens, no filter) and `.gk-rule` (summary focus ring comes from the existing rule).
    - Files: `components/detail-panel.tsx`, `app/globals.css`
    - _Requirements: 7.1, 7.9, 7.10, 8.5, 8.7_
  - [x] 10.13 Update the detail tests
    - Update `tests/ui/components/detail-panel.test.tsx` (reason: reasons render the plain line first and the rule text moves into a closed disclosure; keep every assertion about facts, version, advisories, links, focus trap and Resurrect), and add cases: the epitaph block is the first section after the status line, "Show the rule" is closed by default, Enter on the summary opens it and shows the exact core message and rule id, the main-reason marker stays.
    - Files: `tests/ui/components/detail-panel.test.tsx`
    - _Requirements: 7.1, 7.9, 7.10, 8.5, 8.7, 8.8_

- [x] 11. Checkpoint - Epitaphs
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [x] 12. Landing page
  - [x] 12.1 Hero and cemetery gate
    - Create `components/cemetery-gate.tsx` (original SVG: two stone pillars with caps, an iron gate of bars and an arch, tokens only, `aria-hidden`) and `components/hero.tsx` (`section.gk-hero` with `NightLandscape variant="hero"`, `CemeteryGate`, and the copy block with the `h1` "Gravekeeper" and the pitch sentence; no hook, no browser API, so it is Server Component-safe).
    - Files: `components/cemetery-gate.tsx`, `components/hero.tsx`
    - _Requirements: 9.1, 9.7, 9.8_
  - [x] 12.2 How the caretaker decides
    - Create `components/how-it-decides.tsx` with the `h2` "How the caretaker decides" and the three sentences of the design (naming deps.dev, npm, PyPI, crates.io, OSV, GitHub, dead, haunted, alive, unmarked graves) and the inline link to `#legend-heading` in the third.
    - Files: `components/how-it-decides.tsx`
    - _Requirements: 9.3, 9.4, 9.5_
  - [x] 12.3 Landing page, shell and featured headstones
    - In `components/landing-page.tsx` use `Hero` (then the grade sentence, `RepoForm`, `HowItDecides`, the featured section, the Legend); in `components/gate-fallback.tsx` render the same `Hero`; in `components/featured-graveyards.tsx` give each link the class `gk-headstone` and keep the handler and label. In `app/globals.css` add `.gk-hero` (`--hero-h` 360px, 300px under 640px; relative; fog and gate placement), the hero copy plate (`color-mix` of `--color-night` at 55 percent), `.gk-headstone` (arched top, flat bottom, plinth border, `--color-plaque` background) and the reduced-motion selectors for the hero.
    - Files: `components/landing-page.tsx`, `components/gate-fallback.tsx`, `components/featured-graveyards.tsx`, `app/globals.css`
    - _Requirements: 9.1, 9.2, 9.6, 9.8, 9.9, 9.10_
  - [x] 12.4 Landing tests
    - Update `tests/ui/components/landing-page.test.tsx` (reason: the layout gained the hero and the new section; keep the form, featured, legend, h1 and grade-sentence assertions). Add `tests/ui/components/hero.test.tsx` (one `h1`, one backdrop, gate present and `aria-hidden`), `tests/ui/components/how-it-decides.test.tsx` (three paragraphs, each source and state name present, the link `href` equals the id of the Legend heading in `LandingPage`), `tests/ui/components/gate-fallback.test.tsx` (renders the same hero markup as the landing page).
    - Files: `tests/ui/components/landing-page.test.tsx`, `tests/ui/components/hero.test.tsx`, `tests/ui/components/how-it-decides.test.tsx`, `tests/ui/components/gate-fallback.test.tsx`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 9.10_

- [x] 13. Checkpoint - Landing page
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [ ] 14. Scanning screen
  - [~] 14.1 Caretaker scene model
    - Create `view-model/caretaker-scene.ts` with `caretakerScene(states, still)` and `CaretakerSceneModel` (stones from `SCAN_STONE_X`, lit when `in progress` or `done`, lantern at the last lit stone, all lit and last stone when `still`).
    - Files: `view-model/caretaker-scene.ts`
    - _Requirements: 10.2, 10.3, 10.5_
  - [~] 14.2 Write the property test for the lit stones
    - `tests/ui/view-model/caretaker-scene.property.test.ts`: elapsed times from `fc.integer({ min: 0, max: 1_000_000 })`, pairs t1 ≤ t2, and the `still` case.
    - **Property 11: Lit stones grow as a prefix and the lantern follows the last lit stone (GA-P11)**
    - **Validates: Requirements 10.2, 10.3, 10.5**
  - [~] 14.3 Caretaker scene component
    - Create `components/caretaker-scene.tsx`: `div.gk-caretaker-scene[aria-hidden="true"][data-still]` with `SceneBackdrop variant="scanning"`, an inline `svg` (viewBox `0 0 400 180`) with the path, four stones (`g.gk-stone` with `data-lit`, glow ellipse `.gk-stone-glow` with opacity from `data-lit`), the lantern `g.gk-caretaker` positioned by `style={{ "--lantern-x": x }}`, and `FogLayer`. Tokens only.
    - Files: `components/caretaker-scene.tsx`
    - _Requirements: 10.1, 10.4, 10.6_
  - [~] 14.4 Scanning screen and styles
    - In `components/scanning-screen.tsx` replace the CSS dot and fog decor by `CaretakerScene` fed by `caretakerScene(stages, still)`; keep Cancel first in DOM order, the h1, `StageList`, the approximate-stages note, the slow notice and the status region unchanged. In `app/globals.css` add `.gk-caretaker-scene` (`--caretaker-h` 180px), `.gk-caretaker` (`transform: translateX(calc(var(--lantern-x) * 1px))`, transition 900 ms on `transform`), `.gk-stone-glow` (opacity transition 600 ms), remove `.gk-scanning-decor`, `.gk-scanning-fog`, `.gk-scanning-lantern` and the keyframes `gk-lantern-pulse` (now unused), and add the new selectors to the reduced-motion block (`transition: none`).
    - Files: `components/scanning-screen.tsx`, `app/globals.css`
    - _Requirements: 10.2, 10.4, 10.5, 10.6, 10.7, 10.8, 12.1, 12.2_
  - [~] 14.5 Scanning tests
    - Update `tests/ui/components/scanning-screen.test.tsx` and `tests/ui/components/graveyard-app-scanning.test.tsx` only where they refer to the removed decor (reason: the dot is replaced by the scene). Add `tests/ui/components/caretaker-scene.test.tsx`: `aria-hidden`, four stones, with a fake clock at 0, 2000, 6000 and 10000 ms the lit count is 1, 2, 3, 4 and the lantern is at stone 1, 2, 3, 4; `reducedMotion` shows four lit stones and `data-still="true"`; the stage list text and status region are unchanged; no `%` and no digit progress appears; Cancel is the first focusable element.
    - Files: `tests/ui/components/scanning-screen.test.tsx`, `tests/ui/components/graveyard-app-scanning.test.tsx`, `tests/ui/components/caretaker-scene.test.tsx`
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.7, 10.8_

- [~] 15. Checkpoint - Scanning screen
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [ ] 16. Empty states
  - [~] 16.1 Header empty sentence and nullable grade
    - In `view-model/types.ts` make `grade` of `HeaderModel` nullable, replace `emptyText` by `emptySentence`; in `view-model/header.ts` set `headline`, `chips` and `grade` to null or empty when `assessed === 0`, and `emptySentence` per R11.2 to R11.4; remove the "no grade" explanation path and the constants `NO_ASSESSED_TEXT` and `NO_GRADE_TEXT`.
    - Files: `view-model/types.ts`, `view-model/header.ts`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  - [~] 16.2 Show the empty-graveyard message once
    - In `view-model/notes.ts` remove from every group the messages equal to `empty.message` when `empty !== null` (drop emptied groups and sections, recompute `count` and `previewCount`). Keep the picker, the cap banner and every other note.
    - Files: `view-model/notes.ts`
    - _Requirements: 11.6, 11.7, 11.8_
  - [~] 16.3 Write the property test for the header
    - `tests/ui/view-model/header-empty.property.test.ts`: results from the shared arbitrary with `assessed` forced to 0 (with and without manifests) and above 0.
    - **Property 12: The header shows either a verdict or one empty sentence (GA-P12)**
    - **Validates: Requirements 5.4, 5.9, 11.1, 11.2, 11.3, 11.4, 11.5**
  - [~] 16.4 Write the property test for the message shown once
    - `tests/ui/view-model/notes-once.property.test.ts`: results with `no-manifests` and `no-root-manifest` notes and with other notes of arbitrary codes.
    - **Property 13: The empty-graveyard message appears once (GA-P13)**
    - **Validates: Requirements 11.6, 11.8**
  - [~] 16.5 Render the empty states
    - In `components/results-header.tsx` render nothing but h1, the single `emptySentence` paragraph (`.gk-headline`, smaller clamp) when present, and the meta line when `grade === null`; no plaque, chips, headline or grade scale. In `components/results-page.tsx` keep `EmptyGraveyard` and the picker as they are (the notes model no longer repeats the message).
    - Files: `components/results-header.tsx`, `components/results-page.tsx`
    - _Requirements: 11.1, 11.4, 11.6, 11.7_
  - [~] 16.6 Update the empty-state tests
    - Update `tests/ui/components/results-header.test.tsx`, the header and notes view-model tests and `tests/ui/components/graveyard-app-results.test.tsx` where they assert "No dependencies could be assessed", "no grade" or the old notes group for the empty message (reason: R11). Add `tests/ui/components/empty-state.test.tsx`: the three cases render exactly one sentence, none of "NO GRADE", "no grade" or "No dependencies could be assessed" appears, and the "No manifests" message appears exactly once on the page (header, empty block and notes together).
    - Files: `tests/ui/components/results-header.test.tsx`, `tests/ui/components/graveyard-app-results.test.tsx`, `tests/ui/view-model/header-empty.test.ts`, `tests/ui/components/empty-state.test.tsx`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.7_

- [~] 17. Checkpoint - Empty states
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [ ] 18. End-to-end, axe, style and performance updates
  - [~] 18.1 Art style test
    - Create `tests/ui/art-css.test.ts` parsing `app/globals.css` (comments stripped): horizon heights 240 and 150 with the 640 breakpoint; fog opacities equal `FOG_OPACITY_LOW` and `FOG_OPACITY_HIGH`; the keyframes used by the fog declare only `transform`; `gk-lantern-flicker` declares only `opacity`; `rotate` and `scale` on `.gk-plot-art`; the headline `clamp` bounds are 32 and 56 px (2rem and 3.5rem); no `filter`, `backdrop-filter` or `mask` declaration anywhere in the file; no decorative token in a `color` declaration or `text-` rule; every new `animation` or `transition` selector is in the reduced-motion block.
    - Files: `tests/ui/art-css.test.ts`
    - _Requirements: 1.4, 2.2, 2.3, 5.1, 12.1, 12.4, 12.5, 13.7_
  - [~] 18.2 Final reduced-motion style test
    - Extend `tests/ui/reduced-motion-css.test.ts` so that every selector that has an `animation` or `transition` declaration anywhere in `app/globals.css` (outside the media block) also appears in the reduced-motion block with `animation: none` or `transition: none`. Do not weaken an existing assertion.
    - Files: `tests/ui/reduced-motion-css.test.ts`
    - _Requirements: 12.2, 12.6_
  - [~] 18.3 Art end-to-end spec
    - Create `tests/e2e/art.spec.ts` (mocked `/api/scan`, desktop and mobile): the scene stage is as wide as the viewport, exactly one `svg.gk-backdrop` exists on the results scene, two fog layers have computed opacity 0.25 and 0.35, stone plots carry `--tilt` within −6 and 6 and back-row plots have a smaller `--depth-scale` than front-row plots, no layout box of a plot changes between two loads, and with `emulateMedia({ reducedMotion: 'reduce' })` the computed `animation-name` is `none` for the fog, ghost, lantern and caretaker elements. Use `expectNoA11yViolations` on the results scene.
    - Files: `tests/e2e/art.spec.ts`
    - _Requirements: 1.2, 2.2, 2.4, 2.7, 3.6, 12.2, 13.6, 18.5_
  - [~] 18.4 Update the flow specs and add axe for the new screens
    - Update `tests/e2e/results.spec.ts`, `tests/e2e/detail.spec.ts`, `tests/e2e/landing.spec.ts` and `tests/e2e/scanning.spec.ts` where they assert removed text or markup (the lantern dot, "NO GRADE", `(rule ...)` visible without opening the disclosure; reason: R8, R10, R11); add axe checks for the landing page, the four scanning stages, the results scene (request and zoxide) and the detail panel (uuid and aws-sign2 in the request fixture) in both projects, and assertions that the epitaph appears first in the panel and that "Show the rule" reveals the exact core message.
    - Files: `tests/e2e/results.spec.ts`, `tests/e2e/detail.spec.ts`, `tests/e2e/landing.spec.ts`, `tests/e2e/scanning.spec.ts`
    - _Requirements: 7.1, 8.5, 9.1, 10.2, 11.1, 13.6, 18.5_
  - [~] 18.5 Update the motion, reflow and layout-shift specs
    - Update `tests/e2e/reduced-motion.spec.ts` (hero static, four stones lit, fog static), `tests/e2e/layout-shift.spec.ts` (landing, scanning and results CLS within the graveyard-ui R17.3 limit with the new stage, hero and caretaker scene) and `tests/e2e/reflow.spec.ts` (no horizontal overflow at 320 px with the full-width stage and the hero).
    - Files: `tests/e2e/reduced-motion.spec.ts`, `tests/e2e/layout-shift.spec.ts`, `tests/e2e/reflow.spec.ts`
    - _Requirements: 9.8, 9.9, 10.5, 14.7, 14.8_
  - [~] 18.6 Performance and size gates
    - In `tests/e2e/scene-perf.spec.ts` add the baseline check (median at most baseline + `GA_RENDER_REGRESSION_MAX_MS` using the numbers recorded in `docs/milestone-1-report.md`, read at test time or a named constant `M1_SCENE_BASELINE_MS = 65.4` in the spec) and, only when `M3_REPORT=1`, write `scenePerf` (request and synthetic-300 medians and runs) into `test-results/m3-measurements.json`, keeping other keys. In `tests/e2e/js-budget.spec.ts` add the soft ceiling `GA_CLIENT_JS_SOFT_CEILING_BYTES` check and, when `M3_REPORT=1`, write `jsBudget` (total, budget, margin). Add a case to `tests/ui/check-client-js-budget.test.ts` only if the gate script itself changes (it does not here).
    - Files: `tests/e2e/scene-perf.spec.ts`, `tests/e2e/js-budget.spec.ts`
    - _Requirements: 14.1, 14.2, 14.3, 19.3_

- [~] 19. Checkpoint - End-to-end, axe and performance
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture`, `npx vitest --run` and `npm run test:e2e` (the mocked projects and the perf project), and ensure all pass. Ask the user if questions arise.

- [ ] 20. Traceability and documents
  - [~] 20.1 Traceability test for this spec
    - Create `tests/ui/art-traceability.test.ts` with the three checks of `tests/ui/traceability.test.ts` for the tag regex `/\/\/\s*Feature:\s*graveyard-art,\s*Property\s+GA-P(\d+)\b/g`: each of 1 to 14 appears in exactly one tag, every tagged file has a `// Validates:` line, every `it` or `test` title in a tagged file starts with `GA-P<n>` of its first tag. Do not edit `tests/ui/traceability.test.ts`.
    - Files: `tests/ui/art-traceability.test.ts`
    - _Requirements: 18.1, 18.2, 17.1_
  - [~] 20.2 Add this spec to the property traceability document
    - In `docs/property-traceability.md` add a section "graveyard-art (GA-P1 to GA-P14)" with one row per property: number, title, test file, requirements. Change no existing row.
    - Files: `docs/property-traceability.md`
    - _Requirements: 18.1_
  - [~] 20.3 Write the Milestone 3 design changes
    - Create `docs/m3-design-changes.md` in the style of `docs/m2-design-changes.md`: one bullet per decision that differs from or is not stated in the spec (for example the three variant counts, the horizon heights, the legend anchor, fog placement, any contingency applied in task 6.12), each with its reason. This file is the "design changes" source of the report writer.
    - Files: `docs/m3-design-changes.md`
    - _Requirements: 19.4_

- [~] 21. Checkpoint - Traceability and documents
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [ ] 22. Screenshots of the graveyard-ui set (only if the art changed)
  - [~] 22.1 Decide which screenshots changed
    - Run `tests/e2e/screenshots.spec.ts` and list the screenshot names whose assertions or committed pictures no longer match because the art changed (expected: landing, scanning stages, results scene, results empty, detail panels; not expected: errors, picker, notes, list views). Update `tests/e2e/screenshots.spec.ts` only where an assertion depends on removed markup; keep the file list unchanged.
    - Files: `tests/e2e/screenshots.spec.ts`
    - _Requirements: 14.9, 17.2_
  - [~] 22.2 Regenerate the changed screenshots
    - Regenerate only the images named in task 22.1 under `docs/screenshots/` (desktop and mobile), with the documented command of the spec, and update `docs/screenshots/README.md` only if it lists them. Do not touch `docs/screenshots/m1/` or `m2/`. Look at each new image and report any with clipped text or overlapping labels.
    - Files: `docs/screenshots/*.png` (only those named in task 22.1), `docs/screenshots/README.md`
    - _Requirements: 14.9_

- [~] 23. Checkpoint - Screenshots
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture` and `npx vitest --run`, and ensure all pass. Ask the user if questions arise.

- [~] 24. Final checkpoint - Graveyard art
  - Run `npm run typecheck`, `npm run lint`, `npm run check:core`, `npm run check:architecture`, `npx vitest --run`, `npm run build`, `npm run check:bundle` and `npm run test:e2e`, and ensure all pass. Confirm that `tests/ui/traceability.test.ts` still reports graveyard-ui P1 to P34 once each and `tests/ui/art-traceability.test.ts` reports GA-P1 to GA-P14 once each. The orchestrator commits and pushes before group 25. Ask the user if questions arise.

- [ ] 25. Deploy Milestone 3
  - [~] 25.1 Verify the deployment
    - After the orchestrator has pushed to `main` and the deployment finished, run `npm run verify:deploy` (it polls `https://gravekeeper-chi.vercel.app`). Report the result. Print no environment variable and no token.
    - Files: none
    - _Requirements: 19.1_
  - [~] 25.2 Run the deployed specs with one worker
    - Run `$env:E2E_BASE_URL='https://gravekeeper-chi.vercel.app'; npx playwright test tests/e2e/deployed.spec.ts tests/e2e/live-scan.spec.ts --project=deployed --workers=1` (the live-scan spec uses the deployed server's own GitHub access and needs no local token; never read, print or write a token). Report pass or fail per spec and the live-scan status and timings. If a spec fails because of the new art, fix it in the file that the failure names in a separate follow-up task and re-run; do not edit specs of other groups here.
    - Files: none
    - _Requirements: 15.4, 19.1_

- [ ] 26. Milestone 3 report spec
  - [~] 26.1 Write the report spec
    - Create `tests/e2e/m3-report.spec.ts`, modelled on `tests/e2e/m2-report.spec.ts`: runs only when `M3_REPORT=1` and only in the `desktop` project, `/api/scan` always mocked, `page.emulateMedia({ reducedMotion: 'reduce' })`, fixed clock, fonts ready, and for the scene screenshots a wait until the number of `.gk-plot` buttons equals the number of rows. Captured at 1440x900 into `docs/screenshots/m3/`: `landing.png`, `scanning.png` (stage 3, so three stones are lit before the reduced-motion override is turned off for this one image; use `reducedMotion: 'no-preference'` with the clock paused at 7 s), `results-scene-request.png`, `results-scene-zoxide.png`, `detail-uuid.png`, `detail-aws-sign2.png`; and `results-scene-request-mobile.png` at 390x844. Each screen runs axe (WCAG 2.2 A and AA) and the spec writes `m3A11y` (violation count and rule ids per screen) into `test-results/m3-measurements.json`, keeping other keys, and a `README.md` in `docs/screenshots/m3/` listing the files.
    - Files: `tests/e2e/m3-report.spec.ts`
    - _Requirements: 19.2, 19.3, 14.9_
  - [~] 26.2 Run the report spec, the perf spec and the bundle gate
    - Run, in order: `$env:M3_REPORT='1'; npx playwright test tests/e2e/scene-perf.spec.ts --project=perf`, then `npx playwright test tests/e2e/js-budget.spec.ts --project=desktop`, then `npx playwright test tests/e2e/m3-report.spec.ts --project=desktop` (all with `M3_REPORT=1`, mocked API only, local production build). Look at each PNG. Confirm `test-results/m3-measurements.json` has `scenePerf`, `jsBudget` and `m3A11y`.
    - Files: `docs/screenshots/m3/*.png`, `docs/screenshots/m3/README.md`
    - _Requirements: 19.2, 19.3_

- [ ] 27. Milestone 3 report writer
  - [~] 27.1 Write the report writer
    - Create `scripts/write-m3-report.ts` modelled on `scripts/write-m2-report.ts` and add `"report:m3": "tsx scripts/write-m3-report.ts"` to `package.json`. It reads `test-results/m3-measurements.json`, lists `docs/screenshots/m3/`, reads `docs/m3-design-changes.md` and writes `docs/milestone-3-report.md` with these sections in this order: Screenshots (image links), Render time (request and 300-plot synthetic median against `SCENE_RENDER_BUDGET_MS` with the five runs), Client JavaScript (total against `CLIENT_JS_BUDGET_BYTES`, margin), Accessibility (axe) (a table of the six screens and the mobile shot), Deploy check (URL, verify:deploy, deployed spec, live scan), Design changes (from the file), Known gaps (a fixed list in the script: screenshots use reduced motion so fog and flicker are not visible in them; the render time comes from a local production build, not from the deployed site; tilt and depth need CSS `rotate` and `scale`; axe cannot judge contrast through gradients, the token test does), Credits (the exact line "Credit usage cannot be seen from here, so the credits spent on Milestone 3 are not reported."). The Deploy check section takes its values from the command-line flags `--verify=<pass|fail>`, `--deployed=<pass|fail>`, `--live-status=<n>` and `--live-ms=<n>`; a missing flag prints "not measured". A missing measurement prints "not measured". The script reads and prints no environment variable and no token.
    - Files: `scripts/write-m3-report.ts`, `package.json`
    - _Requirements: 19.4, 19.5, 19.6_
  - [~] 27.2 Test the report writer
    - Create `tests/ui/write-m3-report.test.ts` (pattern of `tests/ui/write-m2-report.test.ts`): the section order, "not measured" for an absent file or key, the screenshot list from a temp directory, the render times and budgets text, the credits line exactly, the flag parsing (present and missing flags), and a check that the script source contains no `process.env` (it must not read the environment at all).
    - Files: `tests/ui/write-m3-report.test.ts`
    - _Requirements: 19.4, 19.5, 19.6, 19.7_
  - [~] 27.3 Generate the report
    - Run `npm run report:m3` and read `docs/milestone-3-report.md`. Confirm all seven screenshot links resolve to files in `docs/screenshots/m3/`, the numbers match `test-results/m3-measurements.json`, and the deploy section reflects the results of tasks 25.1 and 25.2: run the writer as `npm run report:m3 -- --verify=<pass|fail> --deployed=<pass|fail> --live-status=<n> --live-ms=<n>` with the values reported by those tasks.
    - Files: `docs/milestone-3-report.md`
    - _Requirements: 19.4, 19.5_

- [~] 28. Milestone 3 ends here
  - STOP. Do not start any further task, group, refactor or deploy. Report to the user: the screenshot paths, the measured render times against the budget, the JavaScript size against the budget, the axe result per screen, the design changes, the known gaps and the credits line, all as written in `docs/milestone-3-report.md`.
  - _Requirements: 19.8_

## Notes

- Property tests are mandatory in this plan (no `*`): each property is its own sub-task and sits next to the code it validates.
- Requirement numbers are criterion numbers of `.kiro/specs/graveyard-art/requirements.md`. Property numbers are from `.kiro/specs/graveyard-art/design.md`; the heading "Property N" and the tag `GA-PN` always use the same N.
- The graveyard-ui tests P1 to P34 (including P14, P15 and P16) are not edited. The additive fields on the shared builder or arbitrary under `tests/support/ui/` are the only allowed change to that area, and no task in this plan needs one.
- Tasks 22.1 and 22.2 regenerate only the screenshots that the new art changed.
- Group 25 needs the commit and push of the orchestrator; no task pushes.
- The dependency graph orders tasks so that no two tasks of one wave write the same file (`app/globals.css`, `view-model/types.ts`, `view-model/scene.ts`, `view-model/header.ts`, `components/scene-sprites.tsx`, `components/scene-plot.tsx`, `components/results-header.tsx`, `components/results-page.tsx`).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3"] },
    { "id": 1, "tasks": ["1.2", "1.4"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["4.1", "4.4"] },
    { "id": 4, "tasks": ["4.2", "4.5", "4.6"] },
    { "id": 5, "tasks": ["4.3"] },
    { "id": 6, "tasks": ["4.7"] },
    { "id": 7, "tasks": ["4.8"] },
    { "id": 8, "tasks": ["6.1"] },
    { "id": 9, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 10, "tasks": ["6.5", "6.6", "6.7"] },
    { "id": 11, "tasks": ["6.8"] },
    { "id": 12, "tasks": ["6.9", "6.10"] },
    { "id": 13, "tasks": ["6.11"] },
    { "id": 14, "tasks": ["6.12"] },
    { "id": 15, "tasks": ["8.1"] },
    { "id": 16, "tasks": ["8.2"] },
    { "id": 17, "tasks": ["8.3"] },
    { "id": 18, "tasks": ["8.4"] },
    { "id": 19, "tasks": ["10.1", "10.2"] },
    { "id": 20, "tasks": ["10.3", "10.4", "10.5", "10.6"] },
    { "id": 21, "tasks": ["10.7", "10.8", "10.9"] },
    { "id": 22, "tasks": ["10.10", "10.11"] },
    { "id": 23, "tasks": ["10.12"] },
    { "id": 24, "tasks": ["10.13"] },
    { "id": 25, "tasks": ["12.1", "12.2"] },
    { "id": 26, "tasks": ["12.3"] },
    { "id": 27, "tasks": ["12.4"] },
    { "id": 28, "tasks": ["14.1"] },
    { "id": 29, "tasks": ["14.2", "14.3"] },
    { "id": 30, "tasks": ["14.4"] },
    { "id": 31, "tasks": ["14.5"] },
    { "id": 32, "tasks": ["16.1", "16.2"] },
    { "id": 33, "tasks": ["16.3", "16.4", "16.5"] },
    { "id": 34, "tasks": ["16.6"] },
    { "id": 35, "tasks": ["18.1", "18.2"] },
    { "id": 36, "tasks": ["18.3", "18.4", "18.5"] },
    { "id": 37, "tasks": ["18.6"] },
    { "id": 38, "tasks": ["20.1", "20.2", "20.3"] },
    { "id": 39, "tasks": ["22.1"] },
    { "id": 40, "tasks": ["22.2"] },
    { "id": 41, "tasks": ["25.1"] },
    { "id": 42, "tasks": ["25.2"] },
    { "id": 43, "tasks": ["26.1", "27.1"] },
    { "id": 44, "tasks": ["26.2", "27.2"] },
    { "id": 45, "tasks": ["27.3"] }
  ]
}
```
