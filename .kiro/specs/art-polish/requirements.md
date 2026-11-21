# Requirements Document

## Introduction

This spec is a visual polish pass on the finished `graveyard-art` work. It changes how the graveyard looks and where it sits on the screen. It changes no scan, score or layout data. Six things change:

1. **Graves stand in the landscape.** Today the Stage reserves a full Backdrop height (240 px, 150 px under 640 px) above the first row, so an empty ground band separates the fence from the graves. The first row will stand on the Ground directly in front of the fence, and the Ground will continue under every row with a grass silhouette at each row base.
2. **Fog without hard edges.** The fog bands fade to transparent on all four sides, and alternate rows place their bands at different horizontal positions.
3. **A shorter headline** at 1280 px and wider, so the results header takes less height and the first rows are visible without scrolling at real browser viewports (1440x760, 1280x720, 390x700).
4. **Better sprites.** The low tombstone variant becomes a flat ledger stone with an engraved cross, and the restless ghost becomes about as large as a normal ghost and rises clearly above its stone.
5. **A richer landing hero:** headstones and a cross behind the fence and a faint path through the gate.
6. **Verification and delivery:** screenshots, an accessibility scan per screen, render and bundle budgets, deploy verification, a report, and regenerated committed screenshots.

The art may move only through CSS on decorative layers or through the Stage offset. The Plot layout boxes of `graveyard-ui` (P14 to P16) and `graveyard-art` (GA-P4) do not change.

### Facts the requirements start from

Read from the repository before this spec was written:

- `.gk-stage` has `padding-top: var(--horizon-h)` and `--horizon-h` is 240 px (150 px under 640 px). `tests/ui/art-css.test.ts` asserts those two values. The Backdrop is absolutely positioned in that padding, so the first row starts below it.
- A Plot cell is 156 px high (`PLOT_CELL_HEIGHT_PX`). The first row's Plot box starts `SCENE_PADDING_PX` (16) + `PLOT_JITTER_MAX_PX` (8) below the Scene top and is 104 px high, so its feet are 128 px below the Scene top, plus a jitter of -8 to +8 px. The label band (28 px) lies under the box.
- `.gk-fog` is a 200 %-wide layer (`left` and `right` at -50 %) that repeats one small mist puff (`18 % x --cell-h`) in both directions. That repetition produces the stripes. `FOG_OPACITY_LOW` is 0.25 and `FOG_OPACITY_HIGH` is 0.35. Only `transform` animates. The Hero uses the same fog classes.
- `.gk-headline` uses `clamp(2rem, 5vw + 0.5rem, 3.5rem)` (32 to 56 px) from 640 px and `clamp(1.625rem, ...)` (26 px lower bound) under 640 px. The grid puts the Plaque beside the headline from 640 px.
- The tombstone variants are `rounded`, `cross`, `obelisk` and `slab` (`TOMBSTONE_VARIANTS`). No variant, id or comment uses the word "coffin". The `slab` variant is the lowest and widest stone: a half-sunk rectangular slab with carved lines. It is the closest to a coffin lid, so this spec treats `slab` as the variant that the brief calls the coffin (task 5.1 checks this on a screenshot).
- The restless symbol draws the stone, then the wisp at `translate(24 -2) scale(0.62)`, so the wisp is 62 % of a normal ghost, overlaps the stone top, and its gradient fades to transparent exactly where it overlaps.
- The Hero is `NightLandscape variant="hero"` (Backdrop plus fog), the `CemeteryGate` SVG at the bottom centre, and the copy plate. Its height is fixed (360 px, 300 px under 640 px).
- `tests/e2e/above-fold.spec.ts` currently measures 1440x900, 1280x800 and 390x844. `tests/e2e/screenshots.spec.ts` (`SCREENSHOTS=1`) writes `docs/screenshots/*.png`. `tests/e2e/m3-report.spec.ts` is the model for a gated report spec. The earlier "greyscale distinctness" guarantee is carried by markup-distinctness tests in `tests/ui/components/sprites-*.test.tsx`; no raster greyscale test exists yet.

### Decisions this document fixes

| Topic | Decision |
|---|---|
| How the empty band is removed | The Backdrop keeps its height and stays absolutely positioned. The Stage `padding-top` becomes `var(--stage-lead)` = `var(--horizon-h) - 136px` (104 px desktop, 14 px under 640 px), so the first row's feet land 8 px below the fence base and the Backdrop's lower band lies behind the first row. The art is not shrunk. |
| Horizon heights | 240 px and 150 px stay. `tests/ui/art-css.test.ts` keeps its horizon test and gains tests for the lead. |
| Ground | A decorative full-bleed `.gk-stage::after` layer: a dark mossy gradient plus a repeating grass strip, one strip per row, at the row's base. No DOM per row. |
| Fog technique | Radial gradients that end in `transparent`, in a 200 %-wide layer, with a vertical tile of two rows. Even rows and odd rows use different horizontal centres. No `mask`, no `filter`. |
| Header | The Plaque stays beside the headline. Only the headline clamp at 1280 px and wider changes (28 px to 40 px). Further compaction is CSS-only (spacing), DOM order unchanged, and is used only if a measurement shows it is needed. |
| Coffin variant | The id `slab` stays. Only its drawing changes. Variant choice and symbol ids are therefore unchanged and `GA-P1` and `GA-P10` keep their meaning. |
| Restless arrangement | Stone at 50 % scale anchored at its feet, wisp at 85 % of a normal ghost drawn after the stone with its top 10 px above the symbol box, eyes above the stone top, overlap at most 40 % of the stone height. |
| New tokens | `--color-ground-moss` and `--color-grass`, both text-bearing (labels sit on them) and contrast-tested. No new token for the Hero (existing `--color-iron`, `--color-hill`). |

## Glossary

- **Gravekeeper**: The Next.js application under test.
- **Stage**: The full-width `.gk-stage` wrapper of the results scene view.
- **Backdrop**: The static night-landscape SVG (`SceneBackdrop`) with sky, hills, trees and fence.
- **Stage_Lead**: The `padding-top` of the Stage, `var(--horizon-h) - 136px`.
- **Ground**: The decorative layer under the rows, a dark mossy gradient with a Grass_Strip at each row base.
- **Grass_Strip**: A 14 px high grass silhouette drawn with gradients at the base of each row.
- **Fog_Layer**: One of the two decorative fog elements (`gk-fog-low`, `gk-fog-high`) in the Scene or the Hero.
- **Fog_Band**: One feathered mist ellipse inside the Fog_Layer background.
- **Row_Offset**: The horizontal centre of a Fog_Band, as a percentage of the Fog_Layer width, for the even or the odd row.
- **Results_Header**: The `ResultsHeader` component and its CSS grid.
- **Headline**: The `.gk-headline` sentence of the Results_Header.
- **Plaque**: The grade plaque beside the Headline.
- **Ledger_Stone**: The redrawn `slab` tombstone variant, a flat low stone with an engraved cross.
- **Restless_Plot**: A plot of kind `restless`: a stone with a ghost.
- **Sprite_Sheet**: The hidden SVG that holds every `<symbol>`.
- **Hero**: The landing hero (`Hero` component).
- **Hero_Silhouettes**: The headstones, the cross and the path added to the Hero landscape.
- **Request_Fixture**: The recorded scan of `request/request`, the repository used by the end-to-end tests.
- **Above_Fold_Target**: The visibility goal of Requirement 2 for a viewport size.
- **Polish_Report_Spec**: `tests/e2e/polish-report.spec.ts`, gated by `POLISH_REPORT=1`.

## Requirements

### Requirement 1: Graves stand in the landscape

**User Story:** As a visitor, I want the first row of graves to stand on the ground in front of the fence, so that the page reads as one cemetery and not as a picture above a list.

#### Acceptance Criteria

1. THE Stage SHALL set its `padding-top` to the Stage_Lead, defined as `var(--horizon-h) - 136px`, so that the feet of a first-row Plot box with zero jitter lie 8 px below the Backdrop ground top.
2. THE Backdrop SHALL keep its height `var(--horizon-h)` (240 px, 150 px under 640 px) and SHALL be positioned behind the Plot rows, so that the lower band of the Backdrop lies behind the first row.
3. THE Gravekeeper SHALL leave the values of `x`, `y`, `width`, `height` and `phase` of every plot produced by `buildSceneModel` unchanged.
4. THE Ground SHALL be a decorative layer of the Stage that starts at the Backdrop ground top, spans the full width of the Stage, and continues to the bottom of the Scene.
5. THE Ground SHALL use a gradient from `--color-ground` through `--color-ground-moss` to `--color-night` and SHALL use no image, no `mask` and no `filter`.
6. THE Ground SHALL draw one Grass_Strip at the base of each row, repeating every `PLOT_CELL_HEIGHT_PX` (156 px), built from gradients only.
7. THE Ground SHALL be marked `aria-hidden` by being a CSS pseudo-element, SHALL receive no pointer events, and SHALL add no DOM node per row.
8. WHILE the Scene is in the simplified form (more than `SCENE_MAX_PLOTS` plots), THE Ground SHALL render identically to the normal form.
9. WHEN the Scene height changes because of the viewport width or the plot count, THE Ground SHALL cover the new height without a rule that depends on the plot count.

### Requirement 2: Above-the-fold targets at real viewports

**User Story:** As a visitor on a laptop or a phone, I want to see the first graves without scrolling, so that the page shows its main content at once.

#### Acceptance Criteria

1. WHILE the viewport is 1440x760, THE Gravekeeper SHALL show all Plot boxes and labels of the first row of the Request_Fixture inside the viewport, and SHALL show at least 40 px of the art box of the first plot of the second row, with the page not scrolled.
2. WHILE the viewport is 1280x720, THE Gravekeeper SHALL meet the same visibility as in criterion 1.
3. WHILE the viewport is 390x700, THE Gravekeeper SHALL show all Plot boxes and labels of at least one full row inside the viewport, with the page not scrolled.
4. THE above-the-fold test SHALL use exactly these three sizes and SHALL replace the sizes 1440x900, 1280x800 and 390x844.
5. THE Results_Header SHALL keep the Plaque beside the Headline in the same grid row at 1280 px and wider.
6. IF the targets of criteria 1 to 3 are not met after Requirement 5 and Requirement 1 are applied, THEN THE Results_Header SHALL reduce only its CSS spacing (gaps, paddings, font sizes of secondary lines), SHALL keep the DOM order, the heading levels, the text and the accessible names unchanged, and SHALL record each change and its measured effect in the report.
7. THE Gravekeeper SHALL meet the cumulative layout shift limit of 0.01 on the landing page and on the results page.

### Requirement 3: Ground tokens and label contrast

**User Story:** As a visitor with low vision, I want plot labels to stay readable on the new ground, so that the art never costs legibility.

#### Acceptance Criteria

1. THE stylesheet SHALL declare the tokens `--color-ground-moss` and `--color-grass` in the `@theme` block and SHALL use no colour literal outside that block for the Ground.
2. THE token test SHALL verify that `--color-bone` has a contrast ratio of at least 4.5 on `--color-ground`, `--color-ground-moss`, `--color-grass` and `--color-night`.
3. THE token test SHALL verify that `--color-bone` has a contrast ratio of at least 4.5 on the composite of `--color-mist` at `FOG_OPACITY_HIGH` over the darkest and over the lightest of those ground stops.
4. FOR ALL positions along the Ground gradient and FOR ALL fog opacities between 0 and `FOG_OPACITY_HIGH`, THE plot label colour `--color-bone` SHALL have a contrast ratio of at least 4.5 against the resulting background.
5. THE Gravekeeper SHALL apply no text colour from `--color-ground-moss` or `--color-grass`.

### Requirement 4: Fog without hard edges

**User Story:** As a visitor, I want soft drifting mist, so that no fog band shows an edge or a stripe.

#### Acceptance Criteria

1. THE Fog_Layer background SHALL consist only of radial gradients whose last colour stop is `transparent`, and SHALL contain no `url()`, no `mask`, no `filter` and no hard colour stop.
2. THE Fog_Layer SHALL be full-bleed: it SHALL span the Scene width plus the drift margin, and no Fog_Band SHALL touch the left or right edge of the Fog_Layer.
3. THE Fog_Band SHALL fade to transparent before the top and before the bottom of its half of the vertical tile, so that no band touches the tile border.
4. THE Fog_Layer SHALL repeat vertically with a tile height of two rows (`2 x --cell-h`), SHALL place the even-row Fog_Band at one Row_Offset and the odd-row Fog_Band at another, and the two offsets SHALL differ by at least 15 percentage points.
5. THE Hero Fog_Layer SHALL use the same rules as the Scene Fog_Layer.
6. THE Fog_Layer SHALL keep `FOG_OPACITY_LOW` (0.25) and `FOG_OPACITY_HIGH` (0.35) as the peak opacities of the two layers.
7. THE Fog_Layer SHALL animate only `transform`.
8. WHILE the user prefers reduced motion or the Scene is simplified, THE Fog_Layer SHALL be static.
9. FOR ALL non-negative integer row numbers, THE Row_Offset function SHALL return the same value for the same row, and SHALL return different values for row `r` and row `r + 1`.
10. THE CSS test SHALL parse every rule whose selector contains `.gk-fog` and SHALL fail if any background is not made of radial gradients that end in `transparent`, if any band geometry leaves its tile, or if the alternate Row_Offsets are missing or differ from the constants in the View_Model.

### Requirement 5: Headline at 1280 px and wider

**User Story:** As a visitor on a desktop, I want the verdict headline to fit in two lines beside the Plaque, so that the header stays compact.

#### Acceptance Criteria

1. WHILE the viewport width is at least 1280 px, THE Headline SHALL use `clamp(1.75rem, 2.2vw + 0.5rem, 2.5rem)` (28 px lower bound, 40 px upper bound).
2. WHILE the viewport width is under 1280 px, THE Headline SHALL keep its current clamp bounds: 26 px to 56 px under 640 px and 32 px to 56 px from 640 px.
3. WHILE the viewport width is at least 1280 px, THE Headline of the Request_Fixture ("31 of 40 dependencies are in the graveyard: 6 buried, 20 forgotten, 5 haunted.") SHALL occupy at most two lines with the Plaque beside it.
4. THE end-to-end test SHALL measure the line count of the Headline with `getClientRects` over a text range at 1280x720 and at 1440x760, and SHALL fail above two lines.
5. THE art style test SHALL assert the three clamp bounds of criteria 1 and 2.

### Requirement 6: Ledger stone with an engraved cross

**User Story:** As a visitor, I want the low stone to look like a grave marker, so that every tombstone variant reads as a tombstone.

#### Acceptance Criteria

1. THE Sprite_Sheet SHALL draw the `slab` variant of the kinds `tombstone` and `restless` as a flat ledger stone: a low, wide, rectangular stone with a flat top and a stepped base, with an engraved cross carved in `--color-night`.
2. THE Sprite_Sheet SHALL keep the symbol ids `plot-tombstone-slab`, `plot-tombstone-slab-flat`, `plot-restless-slab` and `plot-restless-slab-flat`.
3. THE `TOMBSTONE_VARIANTS` list SHALL stay `rounded`, `cross`, `obelisk`, `slab`, so that every package key keeps the variant it has today.
4. FOR ALL kinds and keys, `variantOf` SHALL return the same member of `SPRITE_VARIANTS[kind]` on every call, and `symbolIdOf` of that variant SHALL name a symbol that exists in the rendered Sprite_Sheet.
5. THE greyscale test SHALL verify that the outline path data of the Ledger_Stone differs from the outline of `rounded`, `cross` and `obelisk`, that the width-to-height ratio of its flat twin outline differs from each of them by at least 0.5, and that the same holds for the restless arrangement of each variant.
6. THE Ledger_Stone SHALL use tokens only and SHALL use no filter, no mask and no text.

### Requirement 7: Restless ghost rises above its stone

**User Story:** As a visitor, I want a restless plot to show a clear ghost over a stone, so that I can tell it from a plain tombstone and from a plain ghost.

#### Acceptance Criteria

1. THE Sprite_Sheet SHALL draw the wisp of a Restless_Plot at a scale of at least 0.85 of the wisp of a plain ghost.
2. THE Sprite_Sheet SHALL draw the stone of a Restless_Plot first and the wisp after it, so that the wisp is in front of the stone.
3. FOR ALL restless variants, THE Sprite_Sheet SHALL place the wisp so that the bottom of both eyes lies above the top of the stone, and so that the vertical overlap of the wisp box with the stone box is at most 40 % of the stone height.
4. THE Restless_Plot symbol SHALL extend upward beyond the 0 0 80 104 viewBox by at most 14 px, SHALL do so only through `overflow: visible` on the symbol, and SHALL change no Plot layout box.
5. THE flat twin of each Restless_Plot symbol SHALL use the same placement as its full symbol.
6. THE restless animation SHALL stay opacity-only.

### Requirement 8: Landing hero landscape

**User Story:** As a first-time visitor, I want the landing page to look like a cemetery gate with graves behind it, so that the page sets its theme at once.

#### Acceptance Criteria

1. THE Hero landscape SHALL draw at least four headstone silhouettes and one cross behind the fence, in paint order before the fence.
2. THE Hero landscape SHALL draw a faint path that narrows upward from the gate base and leads through the gate.
3. THE Hero_Silhouettes SHALL be part of the Hero Backdrop SVG, SHALL be `aria-hidden`, SHALL contain no text and no `<title>`, SHALL use only existing tokens, and SHALL add no animation.
4. THE Hero_Silhouettes SHALL leave the copy plate, the gate and the Hero height (360 px, 300 px under 640 px) unchanged.
5. THE Hero SHALL keep its cumulative layout shift at or below 0.01, SHALL reflow without horizontal scrolling at a viewport width of 320 px, and SHALL have no axe violations.
6. THE Hero_Silhouettes SHALL NOT appear in the scene Backdrop variants `stage` and `scanning`.

### Requirement 9: Guarantees stay green

**User Story:** As a maintainer, I want the polish to cost no accessibility, performance or test guarantee, so that it ships safely.

#### Acceptance Criteria

1. THE Gravekeeper SHALL keep every graveyard-ui property (P1 to P34), every graveyard-art property (GA-P1 to GA-P14) and every property of the later specs passing.
2. THE Gravekeeper SHALL keep WCAG 2.2 AA contrast for all text and SHALL show no axe violation on the landing page, the results scene and the detail panel.
3. THE Gravekeeper SHALL keep the 300-plot scene render within `SCENE_RENDER_BUDGET_MS` (100 ms) and within the regression limit of 80.4 ms (`GA_RENDER_REGRESSION_MAX_MS`) of `tests/e2e/scene-perf.spec.ts`.
4. THE Gravekeeper SHALL keep the client JavaScript at or below 256,000 bytes gzip.
5. THE Gravekeeper SHALL keep the reduced-motion block complete: every selector with `animation` or `transition` appears in it, and this spec adds no animation.
6. THE Gravekeeper SHALL reflow without horizontal scrolling at 320 px.
7. THE art style test SHALL keep its `mask`, `filter` and `backdrop-filter` ban.
8. WHEN `tests/ui/art-css.test.ts` changes, THE change SHALL be listed with the new values in the report.

### Requirement 10: Screenshots, measurements, deploy and report

**User Story:** As the project owner, I want evidence of the new look and of the unchanged budgets, so that I can accept the pass.

#### Acceptance Criteria

1. WHEN `POLISH_REPORT=1` is set, THE Polish_Report_Spec SHALL write `docs/screenshots/polish/landing-1440x760.png`, `landing-390x700.png`, `results-request-1440x760.png` and `results-request-390x700.png`, using the mocked API, reduced motion and loaded fonts.
2. THE Polish_Report_Spec SHALL run axe on each of the four screens and SHALL fail on any violation.
3. WHEN `POLISH_REPORT` is not set, THE Polish_Report_Spec SHALL skip and SHALL write no file.
4. THE report SHALL contain the render medians of the request scene and of the synthetic 300-plot scene, each compared with 100 ms and 80.4 ms.
5. THE report SHALL contain the client JavaScript size compared with 256,000 bytes.
6. THE report SHALL contain the deploy verification result, the commits of this spec and the CI status of each, and SHALL be saved as `docs/art-polish-report.md`.
7. THE report SHALL contain the measured above-the-fold numbers, the measured headline line counts, and what the author saw on each screenshot.

### Requirement 11: Committed screenshots are regenerated

**User Story:** As a reviewer, I want the committed screenshots to match the shipped look, so that the documentation is not stale.

#### Acceptance Criteria

1. WHEN the art changes, THE `SCREENSHOTS=1` spec SHALL regenerate every committed image of `docs/screenshots/*.png` that shows the scene, the landing page, a detail panel with a scene, an empty state or a resurrect screen, including the results-empty images deferred from the earlier visual pass.
2. THE regenerated images SHALL be identical across two consecutive runs.
3. THE regeneration SHALL leave `docs/screenshots/m1`, `m2` and `m3` unchanged.
4. THE `docs/screenshots/resurrect/` images SHALL be regenerated with their existing report spec.
