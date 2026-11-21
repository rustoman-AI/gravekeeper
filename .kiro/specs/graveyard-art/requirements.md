# Requirements Document

## Introduction

This spec is the art and voice pass of Gravekeeper for the Kiroween Costume Contest. It makes the interface haunting and memorable while every accessibility, performance and test guarantee of `.kiro/specs/graveyard-ui` stays in force. It changes presentation only: the scan pipeline, the API and `/core` are not touched, and the View_Model stays a pure module.

The pass has seven parts, in the order of the user's priority:

1. **Scene atmosphere.** The results scene becomes a full-width night landscape (sky, moon with halo, stars, hills with bare trees, an iron fence, a ground plane, two low fog layers, depth between rows, warm light pools under lanterns) instead of a lighter box.
2. **Sprite variety and tone.** Four tombstone silhouettes, ivy levels, small tilts, wispy translucent ghosts, iron lanterns that flicker, unmarked mounds with a wooden marker.
3. **Results header.** A very large display-font headline, the grade on a stone plaque, status chips with plot icons, a small muted meta line.
4. **Human epitaphs.** The detail panel opens with an engraved epitaph, durations are humanised, and each reason has a plain-language line with the exact core message behind a "Show the rule" disclosure.
5. **Landing page.** A hero with the shared landscape and a cemetery gate, a "How the caretaker decides" section, headstone-shaped featured cards.
6. **Scanning screen.** A small night scene where the caretaker's lantern moves past four stones that light as the stages begin.
7. **Empty states.** One clear sentence instead of three overlapping ones, and the "No manifests" message once.

Two housekeeping items come first in the task order: the deployed Playwright project runs with one worker (an ENOENT artifact collision with two workers), and Vite's native `resolve.tsconfigPaths` replaces the `vite-tsconfig-paths` plugin so that its deprecation warning disappears. The work ends with Milestone 3: deploy, measure, screenshot and report, then stop.

### Unchanged constraints

- All art is original SVG or CSS made in this repository. No third-party images, no icon fonts, no raster images (`.kiro/steering/ui-design.md`).
- Colour comes from tokens only. New tokens are allowed in the `@theme` block of `app/globals.css` and each is contrast-tested (`tests/ui/tokens.test.ts`).
- WCAG 2.2 AA. Every status keeps a text label. Reduced motion removes all motion.
- Scene render budget `SCENE_RENDER_BUDGET_MS` (100 ms for 300 plots, 4x CPU throttle, median of 5 runs). Client JavaScript budget `CLIENT_JS_BUDGET_BYTES` (256000 bytes gzip).
- graveyard-ui Properties 14, 15 and 16 (plots and labels do not overlap, plots lie inside the scene, the scene is deterministic) and all existing tests stay green. A test is updated only where the art legitimately changed, and the task that updates it says which test and why.
- Plain API and core messages are never rewritten or hidden for good: themed or plain-language copy wraps them, and the exact text stays one click away (graveyard-ui Requirement 15, criterion 6).

### Out of Scope

- Any change to `/core`, `/pipeline`, `/adapters` or the API.
- Sound, canvas, WebGL, SVG filters, CSS filters, `backdrop-filter`, masks and raster images.
- Changes to the documents of other specs. The graveyard-ui spec is complete and is referenced only by number.
- Localisation. All copy is English.
- New Resurrect behaviour. The Resurrect slot stays inert.

### Conventions

- Criteria tagged **[PBT]** are verified with fast-check in files named `<module>.property.test.ts` (steering `structure.md`). Untagged criteria use example-based tests (Vitest, Testing Library, Playwright, axe).
- Property numbers of this spec use the namespace `GA-P1` to `GA-P14` and the Feature tag `graveyard-art` (see the design, "Property namespace and traceability"). The graveyard-ui numbers P1 to P34 are cited as "graveyard-ui P<n>".
- "graveyard-ui R<n>.<m>" means criterion m of Requirement n of `.kiro/specs/graveyard-ui/requirements.md`.
- Every threshold and size is a named constant in the Constants table. Criteria refer to constants by name.
- Source code cites the requirement number in a comment above each rule (steering `structure.md`). Files use kebab-case, components use PascalCase, one component per file, no default exports except Next.js route files.

## Glossary

- **Gravekeeper_UI**: The whole user interface: pages, components, the View_Model and the CSS.
- **View_Model**: The pure TypeScript module under `/view-model` (no React, no DOM, no clock, no randomness, no fetch).
- **Night_Landscape**: The shared set of decorative components that draw the night: Backdrop, Ground, Fog_Layers. It is used by the Scene_Stage, the Hero and the Caretaker_Scene.
- **Backdrop**: One static SVG element that draws the sky gradient, the moon with its halo, the stars, the distant hill line, the bare tree silhouettes and the iron fence. Its gradients are defined once in the sprite sheet.
- **Ground**: The plane under the plots, drawn by CSS gradients on the Scene_Stage, from `--color-ground` at the horizon to `--color-night` at the bottom edge.
- **Fog_Layer**: A decorative element with a soft radial gradient that drifts horizontally over the Ground. The Scene has two: Fog_Low and Fog_High.
- **Scene_Stage**: The full-width section that holds the Backdrop, the Ground and the Scene on the results page (scene view only).
- **Horizon_Strip**: The part of the Scene_Stage above the first plot row that shows the Backdrop. Its height is `HORIZON_HEIGHT_DESKTOP_PX`, or `HORIZON_HEIGHT_MOBILE_PX` below `HORIZON_BREAKPOINT_PX`.
- **Scene**: The graveyard drawing of all Plots (graveyard-ui glossary).
- **Plot**, **PlotKind**, **Package_Row**, **Package_Key**, **Merged_Classification**, **Glow_Level**, **Grave_Type**, **Restless_Ghost**, **Unmarked_Grave**, **Header_Model**, **Detail_Model**, **Reduced_Motion**, **Simplified_Form**: As defined in the graveyard-ui glossary. Simplified_Form is the flat-symbol form used when the Scene holds more than `SCENE_MAX_PLOTS` plots.
- **Stone_Kind**: A PlotKind drawn as a stone: `tombstone`, `overgrown` or `restless`.
- **Variant_Id**: The name of one silhouette of a PlotKind: `rounded`, `cross`, `obelisk`, `slab` for `tombstone` and `restless`; `ivy-light`, `ivy-medium`, `ivy-heavy` for `overgrown`; `wisp` for `ghost`; `iron` for `lantern`; `mound` for `unmarked`.
- **Symbol_Id**: The `id` of a `<symbol>` in the sprite sheet: `plot-<kind>-<variant>`, or `plot-<kind>-<variant>-flat` in the Simplified_Form.
- **Tilt**: The rotation, in whole degrees, of a Stone_Kind plot, derived from the Package_Key.
- **Depth**: The pair (Depth_Scale, Depth_Brightness) of a plot, derived from its row index and the number of rows.
- **Depth_Scale**: A number from `DEPTH_SCALE_BACK` (back row) to 1 (front row) that scales the plot art around the bottom centre of its box.
- **Depth_Brightness**: A number from `DEPTH_BRIGHTNESS_BACK` (back row) to 1 (front row) that sets the opacity of the plot art. The plot label is not dimmed.
- **Light_Pool**: The soft warm radial-gradient ellipse on the Ground under a lantern.
- **Humanised_Duration**: Text produced by `humanizeDays` from a number of days: "less than a day", "40 days", "7 months", "9 years".
- **Epitaph_Block**: The engraved block at the top of the Detail_Panel that states, in plain sentences, what the records say about the package.
- **Epitaph_Model**: The View_Model output of the Epitaph_Block: an ordered list of sentences (`lines`) and their joined `text`.
- **Plain_Reason_Line**: One plain-language sentence generated per `ruleId` of a core Reason, shown above the Rule_Disclosure.
- **Rule_Disclosure**: A native `<details>` element labelled "Show the rule" that holds the exact core message and the rule id of one Reason.
- **Plaque**: The carved-stone panel of the Results_Header that holds the grade letter and the words "worst single risk".
- **Status_Chip**: A small pill of the Results_Header with a plot icon and a text count, for one status.
- **Results_Header**: The `ResultsHeader` component with the Header_Model.
- **Hero**: The top section of the landing page: Night_Landscape, Cemetery_Gate and the title.
- **Cemetery_Gate**: An original SVG drawing of two stone pillars and an iron gate in the Hero.
- **Caretaker_Scene**: The small night scene of the Scanning_Screen: a path, four Stones and the caretaker's lantern.
- **Stone**: One of the four headstones of the Caretaker_Scene. Stone i belongs to scan stage i (graveyard-ui R4).
- **Lit_Stones**: The set of Stones drawn lit. A Stone is lit when its stage state is `in progress` or `done` (graveyard-ui `stageStates`).
- **Headstone_Card**: A featured-graveyard link whose outline is a headstone (arched top, flat bottom).
- **Empty_Sentence**: The single sentence of the Results_Header when no package was assessed.
- **Sprite_Sheet**: The hidden SVG (`SceneSprites`) that holds every `<symbol>`, gradient and shared shape.
- **Token**: A colour custom property declared in the `@theme` block of `app/globals.css`.
- **Decorative_Token**: A Token marked `DECORATIVE ONLY` in its comment. It is never used for text or for any information.
- **Gravekeeper_Tests**: The Vitest, Playwright and axe suites of the repository.
- **Deployed_Project**: The Playwright project `deployed`, active when `E2E_BASE_URL` is set.
- **Milestone_3_Report**: The file `docs/milestone-3-report.md`, written by `scripts/write-m3-report.ts`.

## Constants

| Name | Value | Home | Used by |
|---|---|---|---|
| `TOMBSTONE_VARIANTS` | `rounded`, `cross`, `obelisk`, `slab` (4) | `view-model/constants.ts` | R3 |
| `OVERGROWN_VARIANTS` | `ivy-light`, `ivy-medium`, `ivy-heavy` (3) | `view-model/constants.ts` | R3 |
| `TILT_MAX_DEG` | 6 (whole degrees, range −6 to 6) | `view-model/constants.ts` | R3 |
| `DEPTH_SCALE_BACK` | 0.88 | `view-model/constants.ts` | R2 |
| `DEPTH_BRIGHTNESS_BACK` | 0.7 | `view-model/constants.ts` | R2 |
| `FOG_OPACITY_LOW` | 0.25 (Fog_Low) | `app/globals.css`, mirrored in `view-model/constants.ts` | R2 |
| `FOG_OPACITY_HIGH` | 0.35 (Fog_High) | `app/globals.css`, mirrored in `view-model/constants.ts` | R2 |
| `FOG_DRIFT_SECONDS_LOW` / `_HIGH` | 70 / 110 | `app/globals.css` | R2, R12 |
| `LANTERN_FLICKER_SECONDS` | 2.4 | `app/globals.css` | R4, R12 |
| `LANTERN_FLICKER_MIN_OPACITY` | 0.8 | `app/globals.css` | R4, R12 |
| `STAR_COUNT` | 24 | `components/scene-backdrop.tsx` | R1 |
| `HORIZON_HEIGHT_DESKTOP_PX` | 240 | `app/globals.css` | R1, R14 |
| `HORIZON_HEIGHT_MOBILE_PX` | 150 | `app/globals.css` | R1, R14 |
| `HORIZON_BREAKPOINT_PX` | 640 | `app/globals.css` | R1 |
| `HERO_HEIGHT_DESKTOP_PX` / `HERO_HEIGHT_MOBILE_PX` | 360 / 300 | `app/globals.css` | R9, R14 |
| `CARETAKER_SCENE_HEIGHT_PX` | 180 | `app/globals.css` | R10, R14 |
| `DURATION_DAYS_MAX_EXCLUSIVE` | 60 (below: days) | `view-model/constants.ts` | R6 |
| `DURATION_MONTHS_MAX_EXCLUSIVE` | 730 (below: months, from: years) | `view-model/constants.ts` | R6 |
| `DAYS_PER_MONTH_TEXT` | 30 | `view-model/constants.ts` | R6 |
| `DAYS_PER_YEAR_TEXT` | 365 | `view-model/constants.ts` | R6 |
| `HEADLINE_FONT_MIN_PX` / `_MAX_PX` | 32 / 56 | `app/globals.css` | R5 |
| `SCAN_STONE_COUNT` | 4 (equals `SCAN_STAGES.length`) | `view-model/constants.ts` | R10 |
| `GA_RENDER_REGRESSION_MAX_MS` | 15 | tests | R14 |
| `GA_CLIENT_JS_SOFT_CEILING_BYTES` | 180000 | tests | R14 |
| `SCENE_RENDER_BUDGET_MS`, `CLIENT_JS_BUDGET_BYTES`, `SCENE_MAX_PLOTS` | 100, 256000, 300 (unchanged) | `view-model/constants.ts` | R14 |

## Requirements

### Requirement 1: Night landscape backdrop

**User Story:** As a visitor, I want the results scene to look like a night landscape, so that the graveyard feels like a place and not a box.

#### Acceptance Criteria

1. THE Backdrop SHALL draw, in one static SVG element, a sky gradient, a moon with a soft halo in the upper right quarter, `STAR_COUNT` stars, a distant hill line, bare tree silhouettes and a wrought-iron fence along the back.
2. WHEN the Scene is displayed, THE Scene_Stage SHALL span the full width of the page and SHALL show the Backdrop in the Horizon_Strip above the first plot row.
3. THE Backdrop SHALL begin at its top edge with the colour `--color-night` and the Ground SHALL end at its bottom edge with the colour `--color-night`, so that the page background flows into the Scene_Stage without a visible edge.
4. THE Horizon_Strip SHALL be `HORIZON_HEIGHT_DESKTOP_PX` high, and `HORIZON_HEIGHT_MOBILE_PX` high where the viewport is narrower than `HORIZON_BREAKPOINT_PX`.
5. THE Backdrop SHALL be hidden from assistive technology (`aria-hidden="true"`), SHALL contain no focusable element and no text, and SHALL use no filter, mask, raster image or external reference.
6. THE Backdrop SHALL take every colour from Tokens, and SHALL be identical on every render (star positions and tree shapes come from constant tables, not from randomness).
7. THE Night_Landscape components SHALL be shared by the Scene_Stage, the Hero and the Caretaker_Scene, each through one component with a `variant` property, so that no Backdrop markup is duplicated.
8. WHEN the page shows the list view, THE Gravekeeper_UI SHALL omit the Scene_Stage.

### Requirement 2: Ground, fog, depth and light pools

**User Story:** As a visitor, I want depth, drifting fog and warm light in the graveyard, so that the scene feels atmospheric and alive.

#### Acceptance Criteria

1. THE Ground SHALL be a plane under the plots, drawn with CSS gradients only.
2. THE Scene SHALL contain two Fog_Layers that drift slowly across the Ground in front of the plot rows, Fog_Low with the opacity `FOG_OPACITY_LOW` and Fog_High with the opacity `FOG_OPACITY_HIGH`.
3. THE Fog_Layers SHALL animate `transform` only (the opacity of each layer is constant), with a drift duration of `FOG_DRIFT_SECONDS_LOW` and `FOG_DRIFT_SECONDS_HIGH` seconds.
4. WHILE Reduced_Motion is active, THE Fog_Layers SHALL be static and SHALL keep their opacity.
5. WHILE the Scene is in the Simplified_Form, THE Fog_Layers SHALL be static and SHALL keep their opacity.
6. THE View_Model SHALL give every Plot a Depth_Scale and a Depth_Brightness derived from the row index of the Plot and the number of rows of the Scene.
7. **[PBT]** FOR ALL Scenes and all row indices r1 < r2, THE View_Model SHALL give Depth_Scale(r1) ≤ Depth_Scale(r2) and Depth_Brightness(r1) ≤ Depth_Brightness(r2), every value SHALL lie in [`DEPTH_SCALE_BACK`, 1] and [`DEPTH_BRIGHTNESS_BACK`, 1], and the front row and a Scene of one row SHALL have the value 1 for both (GA-P3).
8. **[PBT]** FOR ALL Scenes, THE x, y, width and height of every Plot SHALL equal the values of the cell formula of graveyard-ui R8.2, R8.3 and R8.11 (the Depth does not change any layout box), so that graveyard-ui P14, P15 and P16 hold unchanged (GA-P4).
9. THE Gravekeeper_UI SHALL apply the Depth_Scale to the plot art around the bottom centre of the plot box and SHALL apply the Depth_Brightness to the plot art only, so that the plot label keeps full brightness and its text contrast.
10. THE lantern symbol SHALL include a Light_Pool: a warm radial-gradient ellipse on the Ground under the lantern, drawn without a filter.
11. WHILE the Scene is in the Simplified_Form, THE flat lantern symbol SHALL omit the Light_Pool gradient.

### Requirement 3: Tombstone silhouettes, ivy levels and tilt

**User Story:** As a visitor, I want the stones to differ from each other, so that the graveyard looks lived in and not stamped.

#### Acceptance Criteria

1. THE Sprite_Sheet SHALL provide at least four tombstone silhouettes: `rounded`, `cross`, `obelisk` and `slab` (`TOMBSTONE_VARIANTS`).
2. **[PBT]** FOR ALL Package_Keys and PlotKinds, THE View_Model SHALL choose the Variant_Id by a function of the PlotKind and the Package_Key only, the result SHALL be an element of the variant list of that PlotKind, and the same inputs SHALL give the same result on every call and for every column count and row order (GA-P1).
3. THE Variant_Id of a `tombstone` or `restless` plot SHALL be chosen from `TOMBSTONE_VARIANTS` by `hashKey("variant:" + key)` modulo the number of variants.
4. THE Variant_Id of an `overgrown` plot SHALL be chosen from `OVERGROWN_VARIANTS`, which differ in the amount of ivy, by `hashKey("variant:" + key)` modulo the number of variants.
5. WHEN 1000 distinct keys of the form `npm:name-<i>:registry` are chosen, THE View_Model SHALL select every variant of `TOMBSTONE_VARIANTS` and of `OVERGROWN_VARIANTS` for at least 5 percent of the keys.
6. **[PBT]** FOR ALL Package_Keys, THE View_Model SHALL give a Stone_Kind plot a Tilt that is an integer from −`TILT_MAX_DEG` to `TILT_MAX_DEG` derived from `hashKey("tilt:" + key)`, and SHALL give a `ghost`, `lantern` or `unmarked` plot a Tilt of 0 (GA-P2).
7. THE Gravekeeper_UI SHALL apply the Tilt as a CSS `rotate` of the plot art around the bottom centre of the plot box, so that no layout box changes.
8. THE `restless` plot SHALL use the same Variant_Id and Tilt as a `tombstone` plot with the same Package_Key.

### Requirement 4: Ghosts, lanterns and unmarked graves

**User Story:** As a visitor, I want ghosts that look like ghosts and lanterns that look like lanterns, so that the mood is eerie and each status is easy to tell apart.

#### Acceptance Criteria

1. THE ghost symbol SHALL draw a wispy translucent figure: a body filled with a gradient that fades into a trailing tail, two hollow dark eyes and no mouth.
2. THE ghost and restless symbols SHALL keep a glow whose intensity follows the Glow_Level from 1 to 4, as in graveyard-ui R7.7.
3. THE restless symbol SHALL draw the ghost rising out of its own tombstone, with the tail of the ghost overlapping the top of the stone.
4. THE lantern symbol SHALL draw an iron lantern that hangs from a short crooked post.
5. WHILE the Scene is animated, THE lantern plot art SHALL flicker by animating `opacity` only, between 1 and `LANTERN_FLICKER_MIN_OPACITY`, with a period of `LANTERN_FLICKER_SECONDS` seconds.
6. THE unmarked symbol SHALL draw a low mound with a small wooden marker.
7. THE Sprite_Sheet SHALL contain, for every PlotKind and every Variant_Id, one non-flat `<symbol>` and one flat `<symbol>` whose Symbol_Id ends in `-flat`.
8. **[PBT]** FOR ALL Scenes, THE Symbol_Id of every Plot SHALL be an `id` that exists in the Sprite_Sheet, the Symbol_Ids of different PlotKinds SHALL be different, and the flat Symbol_Id SHALL be the non-flat Symbol_Id followed by `-flat` (GA-P10).
9. THE Sprite_Sheet SHALL give every `<symbol>` an outline whose markup differs from every other `<symbol>` of the same form, so that the silhouettes of the six PlotKinds stay distinguishable in greyscale.
10. THE Gravekeeper_UI SHALL keep the text status word, the accessible label and the tooltip of every Plot unchanged.

### Requirement 5: Results header

**User Story:** As a visitor, I want the verdict to be the first and biggest thing I read, so that I understand the state of the repository at a glance.

#### Acceptance Criteria

1. THE Results_Header SHALL show the headline sentence in the display font at a size from `HEADLINE_FONT_MIN_PX` to `HEADLINE_FONT_MAX_PX`, scaling with the viewport width, except that criterion 14 sets a lower mobile bound under 640 px.
2. THE Results_Header SHALL show the grade letter in a large display font on a Plaque, with the words "worst single risk" directly under the letter.
3. THE Plaque SHALL be drawn with CSS only (gradient, border and carved-text shadow, no filter) and SHALL take its colours from Tokens.
4. THE Results_Header SHALL show the status counts as Status_Chips, each with the plot icon of its status and a text label with the count, in this order: dead (with the buried and forgotten counts), haunted, alive, unassessed.
5. THE plot icon of a Status_Chip SHALL be hidden from assistive technology, and the text label of the chip SHALL carry the status in words.
6. THE Results_Header SHALL show the commit, the branch and the scan age in one line of small muted text.
7. THE Results_Header SHALL keep the repository name as the `h1` of the page, with `id="results-heading"` and `tabIndex={-1}`.
8. THE Results_Header SHALL keep the grade explanation and the closed "Grade scale" disclosure of graveyard-ui R5.5 and R5.6.
9. **[PBT]** FOR ALL Scan_Results with at least one assessed package, THE counts of the Status_Chips SHALL equal `summary.counts.DEAD`, the buried and forgotten counts of the Header_Model, `summary.counts.HAUNTED`, `summary.counts.ALIVE` and `summary.unassessed`, and the headline text SHALL equal the headline of graveyard-ui R5.2 (GA-P12).
10. WHILE the viewport width is at least 1024 px, THE Results_Header SHALL place the Plaque beside the headline in the same row and SHALL lay out the grade explanation line, the Status_Chips and the meta line as a compact block, so that on the request fixture at 1440x900 and at 1280x800 the top of at least one plot row of the scene is visible within the viewport without scrolling.
11. WHILE the viewport width is 390 px, THE Results_Header SHALL reduce the lower bound of the headline clamp and the size of the Plaque so that, on the request fixture at 390x844, the top of the art box of at least one plot is visible within the viewport without scrolling.
12. THE Results_Header SHALL keep the DOM order, the heading level, the text content, the accessible names and all status text labels unchanged by the compact layout, and only CSS layout and sizes SHALL change.
13. THE Results_Header SHALL keep the headline in the display font and SHALL keep the desktop clamp bounds `HEADLINE_FONT_MIN_PX` (32 px) and `HEADLINE_FONT_MAX_PX` (56 px) for viewport widths of 640 px and above.
14. WHILE the viewport width is under 640 px, THE Results_Header SHALL use a headline lower bound of 26 px, SHALL keep text contrast at WCAG 2.2 AA and SHALL reflow without horizontal scrolling at a viewport width of 320 px.

### Requirement 6: Humanised durations

**User Story:** As a visitor, I want "9 years" and not "3,285 days", so that I can read ages the way a person says them.

#### Acceptance Criteria

1. THE View_Model SHALL provide the function `humanizeDays(days: number): string`.
2. **[PBT]** FOR ALL numbers, including `NaN`, infinities, negative numbers, fractions and values above 10^9, `humanizeDays` SHALL return a non-empty string and SHALL not throw, and for a finite number of at least 0 the result SHALL match one of the forms "less than a day", "<n> day(s)", "<n> months" or "<n> years" with a positive integer n (GA-P5).
3. THE `humanizeDays` function SHALL return "less than a day" for a finite value below 1, "<n> day(s)" with n = floor(days) for a value from 1 to below `DURATION_DAYS_MAX_EXCLUSIVE`, "<n> months" with n = floor(days / `DAYS_PER_MONTH_TEXT`) from `DURATION_DAYS_MAX_EXCLUSIVE` to below `DURATION_MONTHS_MAX_EXCLUSIVE`, and "<n> years" with n = floor(days / `DAYS_PER_YEAR_TEXT`) from `DURATION_MONTHS_MAX_EXCLUSIVE`.
4. **[PBT]** FOR ALL finite values a ≤ b of at least 0, THE pair (unit rank, count) of `humanizeDays(a)` SHALL be less than or equal to that of `humanizeDays(b)` in lexicographic order, and the unit SHALL change exactly at the values 1, `DURATION_DAYS_MAX_EXCLUSIVE` and `DURATION_MONTHS_MAX_EXCLUSIVE` (GA-P6).
5. THE `humanizeDays` function SHALL return "1 day" for 1 and "40 days" for 40, "7 months" for 210 and "9 years" for 3285.
6. THE `humanizeDays` function SHALL return "an unknown time" for a value that is not finite or is below 0.

### Requirement 7: Epitaph block

**User Story:** As a visitor, I want a human sentence at the top of the detail panel, so that I understand the package before I read the reasons.

#### Acceptance Criteria

1. THE Detail_Panel SHALL show the Epitaph_Block directly under the panel header and the status line, above the "Reasons" section.
2. THE View_Model SHALL build the Epitaph_Model of a Package_Row from its name, its facts and its Merged_Classification, in this order: "Here lies <name>.", the release sentence, the commit sentence, the verdict sentence.
3. WHEN `daysSinceLastRelease` is a finite number of at least 0, THE Epitaph_Model SHALL contain the sentence "Last release <Humanised_Duration> ago." and WHEN `daysSinceLastCommit` is a finite number of at least 0, THE Epitaph_Model SHALL contain the sentence "Last commit <Humanised_Duration> ago."
4. IF `daysSinceLastRelease` and `daysSinceLastCommit` are both unknown, THEN THE Epitaph_Model SHALL contain the sentence "The records do not say when it was last released or changed."
5. IF exactly one of `daysSinceLastRelease` and `daysSinceLastCommit` is unknown, THEN THE Epitaph_Model SHALL omit the sentence of the unknown fact.
6. THE verdict sentence SHALL be: "It may be finished, or abandoned." for an `overgrown` plot; "It was archived." for a `tombstone` with rule `8.1`; "It was deprecated." for a `tombstone` with rule `8.2`; "An advisory flags it as unmaintained." for a `tombstone` with neither rule; "It is haunted by <n> open vulnerabilities." (with "of severity <SEVERITY>" only when `maxSeverity` is known) for a `ghost`; the ghost sentence plus "It is also archived." or "It is also deprecated." for a `restless` plot; "The records show no risk signals." for a `lantern`; and "The caretaker could not assess it: <unassessed label>." for an `unmarked` plot.
7. **[PBT]** FOR ALL Package_Rows, THE text of the Epitaph_Model SHALL contain the display name of the package, and every sentence SHALL end with a full stop (GA-P8).
8. **[PBT]** FOR ALL Package_Rows, THE Epitaph_Model SHALL contain "Last release" only when `daysSinceLastRelease` is a finite number of at least 0, "Last commit" only when `daysSinceLastCommit` is a finite number of at least 0, "archived" only when the rule `8.1` is present, "deprecated" only when the rule `8.2` is present, and the vulnerability count only as the value of `openVulnerabilityCount` (GA-P9).
9. THE Epitaph_Block SHALL be an engraved block in the display font with a carved text shadow, and every string in it SHALL be a React text node.
10. THE Detail_Panel SHALL keep the human fact labels of graveyard-ui tasks 30.2 and 30.3, the version section, the advisory groups, the links and the Resurrect slot unchanged.

### Requirement 8: Plain-language reasons

**User Story:** As a visitor, I want each reason in plain language, so that I do not have to decode rule ids, while the exact message stays available.

#### Acceptance Criteria

1. THE View_Model SHALL generate one Plain_Reason_Line for each Reason of the Merged_Classification, by `ruleId`, and the Detail_Model SHALL carry it as `plain` next to the unchanged `ruleId`, `message` and `isMain`.
2. **[PBT]** FOR ALL Reasons, including a `ruleId` that core does not define and a Reason whose facts are missing, empty or of the wrong type, THE function `plainReasonLine` SHALL return a non-empty string that does not contain "undefined", "NaN" or "[object", SHALL not throw, and SHALL give the same string for the same input (GA-P7).
3. THE Plain_Reason_Line of a `ruleId` that core does not define SHALL say that the caretaker has no plain wording for this rule and point to the rule disclosure.
4. THE Plain_Reason_Line SHALL contain a number only when the same number is a fact value of the Reason.
5. THE Detail_Panel SHALL show, under each Plain_Reason_Line, a Rule_Disclosure labelled "Show the rule" that holds the exact core message and the text "rule <ruleId>", closed by default.
6. **[PBT]** FOR ALL Merged_Classifications, THE reasons of the Detail_Model SHALL be in the same order as the reasons of the classification, and each SHALL carry the `ruleId` and the `message` of the core Reason character for character (GA-P14).
7. THE Rule_Disclosure SHALL be a native `<details>` element with a `<summary>`, operable with Enter and Space and shown with the focus ring of graveyard-ui R16.5.
8. THE Detail_Panel SHALL keep the "main reason" marker on the Strongest_Reason.

### Requirement 9: Landing page

**User Story:** As a first-time visitor, I want the landing page to set the mood and tell me how the verdict is reached, so that I trust it before I paste a URL.

#### Acceptance Criteria

1. THE landing page SHALL show a Hero that draws the shared Night_Landscape with a Cemetery_Gate, with the `h1` "Gravekeeper" over it and the pitch sentence under it.
2. THE landing page SHALL show the repository form directly under the Hero.
3. THE landing page SHALL show a section "How the caretaker decides" with an `h2` and exactly three sentences.
4. THE three sentences SHALL name the sources deps.dev, OSV, GitHub and the package registries (npm, PyPI and crates.io), and SHALL name the three states dead, haunted and alive and the unmarked graves.
5. THE section "How the caretaker decides" SHALL contain a link whose target is the Legend section of the same page.
6. THE landing page SHALL show each Featured_Graveyard as a Headstone_Card: a link with an arched top and a flat bottom, labelled with `owner/repo`.
7. THE Hero title SHALL meet the contrast ratio of 4.5 against the brightest Backdrop colour behind it.
8. THE static shell `GateFallback` SHALL reserve the same height as the Hero, so that the hydration of the landing page adds no layout shift.
9. WHILE Reduced_Motion is active, THE Hero SHALL be static.
10. THE landing page SHALL keep one `h1`, the Legend, the grade sentence and the font licence footer of graveyard-ui R1, R2 and R15.

### Requirement 10: Scanning scene

**User Story:** As a visitor waiting for a scan, I want a small scene that shows progress, so that the wait feels like part of the story.

#### Acceptance Criteria

1. THE Scanning_Screen SHALL show a Caretaker_Scene: a night landscape strip with a path, four Stones along the path and the caretaker's lantern.
2. WHEN a scan stage begins, THE Caretaker_Scene SHALL light the Stone of that stage and SHALL move the lantern to that Stone.
3. **[PBT]** FOR ALL elapsed times t1 ≤ t2 from 0 up to 10^6 ms, THE Lit_Stones at t1 SHALL be a prefix of the Lit_Stones at t2, the number of Lit_Stones SHALL equal the index of the current stage plus 1, and the lantern position SHALL be that of the last Lit_Stone (GA-P11).
4. THE Caretaker_Scene SHALL be hidden from assistive technology, and THE text stage list and the status region of graveyard-ui R4 SHALL remain the accessible source of truth with unchanged text.
5. WHILE Reduced_Motion is active, THE Caretaker_Scene SHALL show all `SCAN_STONE_COUNT` Stones lit, SHALL draw the lantern at the last Stone and SHALL not animate.
6. THE Caretaker_Scene SHALL move the lantern with a CSS transition of `transform` and SHALL light a Stone with a transition of `opacity`.
7. THE Scanning_Screen SHALL show no percentage, no numeric progress and no remaining time, as in graveyard-ui R4.
8. THE Cancel button SHALL remain the first focusable element of the Scanning_Screen.

### Requirement 11: Empty states

**User Story:** As a visitor, I want one clear message when nothing could be graded, so that I am not shown three versions of the same fact.

#### Acceptance Criteria

1. WHEN no package was assessed, THE Results_Header SHALL show the Empty_Sentence and SHALL omit the Plaque, the grade letter, the Status_Chips, the headline and the texts "NO GRADE", "no grade" and "No dependencies could be assessed".
2. THE Empty_Sentence SHALL be "This repository declares no dependencies, so there is nothing to grade." WHEN the scan found at least one manifest and `summary.total` is 0.
3. THE Empty_Sentence SHALL be "The caretaker could not assess any of the <total> dependencies, so there is no grade." WHEN `summary.total` is at least 1 and `summary.assessed` is 0.
4. WHEN the scan found no manifest, THE Results_Header SHALL show no Empty_Sentence and the empty graveyard message SHALL be the only sentence about the missing manifests.
5. **[PBT]** FOR ALL Scan_Results, WHEN `summary.assessed` is at least 1, THE Header_Model SHALL have a headline, a grade letter and Status_Chips and no Empty_Sentence, and WHEN `summary.assessed` is 0, THE Header_Model SHALL have no headline, no grade letter and no Status_Chips, and at most one sentence (GA-P12).
6. **[PBT]** FOR ALL Scan_Results, THE message shown by the empty graveyard SHALL appear in no Note_Group of the Caretaker's notes, so that the message appears once on the page (GA-P13).
7. WHEN the scan found no root manifest, THE Results_Page SHALL keep the manifest picker directly under the empty graveyard message.
8. THE Gravekeeper_UI SHALL keep every other note of the Caretaker's notes with its exact plain message.

### Requirement 12: Motion, reduced motion and the simplified form

**User Story:** As a visitor who is sensitive to motion, I want all motion off when I ask for it, so that the art never gets in my way.

#### Acceptance Criteria

1. THE Gravekeeper_UI SHALL implement every new animation in CSS with `transform` or `opacity` only: the fog drift, the ghost drift and pulse, the lantern flicker, the lantern movement of the Caretaker_Scene and the lighting of a Stone.
2. WHILE Reduced_Motion is active, THE Gravekeeper_UI SHALL set `animation: none` and `transition: none` for every selector that carries a new animation or transition.
3. WHILE the Scene is in the Simplified_Form, THE Gravekeeper_UI SHALL use the flat symbols, SHALL run no animation and SHALL keep the Tilt and the Depth as static values.
4. THE keyframes of the lantern flicker SHALL declare `opacity` and no other property.
5. THE Gravekeeper_UI SHALL use no `filter`, `backdrop-filter`, `mask` or SVG filter element in any new rule.
6. THE reduced-motion style test (`tests/ui/reduced-motion-css.test.ts`) SHALL cover every `animation` and `transition` declaration added by this spec.

### Requirement 13: Tokens and contrast

**User Story:** As a visitor with low vision, I want the new art to keep every text readable, so that atmosphere never costs legibility.

#### Acceptance Criteria

1. THE `@theme` block SHALL declare the new Tokens `--color-sky-low`, `--color-moon`, `--color-ground`, `--color-hill`, `--color-iron`, `--color-mist` and `--color-plaque`, each with a comment that names its use, and each of `--color-moon`, `--color-hill`, `--color-iron` and `--color-mist` marked `DECORATIVE ONLY`.
2. THE contrast of each text Token (`bone`, `bone-muted`, `amber`, `spectral`, `stone`, `moss`) against `--color-sky-low`, `--color-ground` and `--color-plaque` SHALL be at least 4.5.
3. THE contrast of `--color-bone` against the colour of `--color-mist` at `FOG_OPACITY_HIGH` composited over `--color-night` SHALL be at least 4.5.
4. THE contrast of `--color-focus` against `--color-sky-low`, `--color-ground` and `--color-plaque` SHALL be at least 3.
5. THE components and `app/**/*.tsx` SHALL contain no colour literal, so that every colour of the art comes from a Token.
6. THE axe scan of WCAG 2.2 A and AA SHALL report 0 violations on the landing page, the scanning screen, the results scene and the detail panel, with the new art in place.
7. THE Decorative_Tokens SHALL not be used in a `color` or `text-` rule.

### Requirement 14: Performance, size and stability

**User Story:** As a visitor on a slow device, I want the richer scene to load and render as fast as before, so that atmosphere does not cost speed.

#### Acceptance Criteria

1. THE Scene SHALL render 300 synthetic plots in at most `SCENE_RENDER_BUDGET_MS` milliseconds (median of 5 runs, 4x CPU throttle, the method of graveyard-ui R17.1).
2. THE median of the 300-plot render time SHALL exceed the median recorded in `docs/milestone-2-report.md` (65.4 ms in Milestone 1) by at most `GA_RENDER_REGRESSION_MAX_MS` milliseconds.
3. THE client JavaScript of the route `/` SHALL be at most `CLIENT_JS_BUDGET_BYTES` bytes gzip, and SHALL be at most `GA_CLIENT_JS_SOFT_CEILING_BYTES` bytes gzip.
4. THE Backdrop SHALL be exactly one SVG element per screen, and THE Scene SHALL add no DOM element per plot beyond the four of graveyard-ui D4 (button, svg, use, label).
5. THE Scene SHALL keep the row bands with `content-visibility: auto`, the windowed mounting and the single delegated set of handlers.
6. THE Gravekeeper_UI SHALL apply Tilt, Depth_Scale and Depth_Brightness through CSS custom properties and individual transform properties set on the plot button, and SHALL add no per-plot style rule.
7. THE cumulative layout shift of the landing page, the scanning screen and the results page SHALL stay within the limit of graveyard-ui R17.3.
8. THE Scene_Stage SHALL reserve its height (Horizon_Strip plus `sceneHeight`) before any plot renders.
9. THE screenshots of the Milestone 3 report SHALL be taken with Reduced_Motion, a fixed clock and mocked `/api/scan` responses, so that the images do not depend on animation timing.

### Requirement 15: Deployed Playwright project runs with one worker

**User Story:** As a maintainer, I want the deployed tests to run without artifact collisions, so that a green run is reliable.

#### Acceptance Criteria

1. WHERE `E2E_BASE_URL` is set, THE file `playwright.config.ts` SHALL set `workers` to 1.
2. WHERE `E2E_BASE_URL` is not set, THE file `playwright.config.ts` SHALL keep the default number of workers.
3. THE unit test of the Playwright config SHALL import the config and check both cases.
4. THE Milestone 3 deploy tasks SHALL run the Deployed_Project with `--workers=1` as well.

### Requirement 16: Native Vite path resolution

**User Story:** As a maintainer, I want the Vitest start-up warning gone, so that real warnings are not buried.

#### Acceptance Criteria

1. THE file `vitest.config.mts` SHALL resolve the `@/` path alias through the Vite option `resolve.tsconfigPaths` and SHALL not import `vite-tsconfig-paths`.
2. THE command `npx vitest --run` SHALL print no warning that names `vite-tsconfig-paths`.
3. WHEN no other file imports `vite-tsconfig-paths`, THE package `vite-tsconfig-paths` SHALL be removed from `devDependencies`, from `package-lock.json` and from the UI tooling list of `tests/packages.test.ts`.
4. IF another file still imports `vite-tsconfig-paths`, THEN THE package SHALL stay pinned and the task SHALL record the file that uses it.
5. THE tests that depend on the alias (`tests/ui`, `tests/architecture`) SHALL pass with the native option.

### Requirement 17: Existing guarantees stay in force

**User Story:** As a maintainer, I want the art pass to leave every earlier guarantee intact, so that the contest build is as safe as the previous milestone.

#### Acceptance Criteria

1. THE Gravekeeper_Tests SHALL keep graveyard-ui P1 to P34 passing, each number appearing in exactly one tag, as `tests/ui/traceability.test.ts` requires.
2. WHEN a test of graveyard-ui must change because the art legitimately changed, THE task SHALL name the test, state the reason and keep the assertion's intent.
3. THE architecture rules of graveyard-ui (View_Model purity, no literal colours, no inner HTML, kebab-case files, no default exports) SHALL stay green for all new files.
4. THE keyboard model of the Scene (graveyard-ui R8.16 to R8.18), the focus trap of the Detail_Panel and the tab order SHALL stay unchanged.
5. THE Content-Security-Policy of graveyard-ui R21 SHALL stay unchanged, and the new art SHALL need no `style-src` or `img-src` change.
6. THE Gravekeeper_UI SHALL load no new font, image or third-party asset.

### Requirement 18: Test coverage and traceability of this spec

**User Story:** As a maintainer, I want every property of this spec traceable to a test, so that the art pass is as verifiable as the logic.

#### Acceptance Criteria

1. THE file `tests/ui/art-traceability.test.ts` SHALL check that each of `GA-P1` to `GA-P14` appears in exactly one tag of the form `// Feature: graveyard-art, Property GA-P<n>: <title>`, that every tagged file has a `// Validates:` line and that every test title in a tagged file starts with `GA-P<n>`.
2. THE tags of this spec SHALL use the Feature name `graveyard-art`, so that `tests/ui/traceability.test.ts` (which counts only `graveyard-ui` tags) stays unchanged and green.
3. THE property tests of this spec SHALL use `cfg()` from `tests/support/fc-config.ts` and SHALL never set `FC_NUM_RUNS` in the shell.
4. THE Gravekeeper_Tests SHALL include component tests for the Results_Header, the Epitaph_Block, the Rule_Disclosure, the landing page, the Caretaker_Scene, the empty states and the sprite sheet.
5. THE Gravekeeper_Tests SHALL include Playwright specs with axe for the landing page, the scanning screen (each of 4 stages), the results scene and the detail panel, in the `desktop` and `mobile` projects.

### Requirement 19: Milestone 3 deploy and report

**User Story:** As the project owner, I want the finished art pass deployed and documented with evidence, so that I can submit it with confidence.

#### Acceptance Criteria

1. WHEN all groups before the deploy group pass, THE deploy group SHALL run `npm run verify:deploy` and the deployed and live-scan specs of the Deployed_Project with `--workers=1`.
2. WHEN `M3_REPORT=1` is set, THE spec `tests/e2e/m3-report.spec.ts` SHALL write 1440x900 screenshots, with Reduced_Motion and a fixed clock, of: the landing page, the scanning screen, the results scene for `request/request`, the results scene for `ajeetdsouza/zoxide`, the detail panel for `uuid` and the detail panel for `aws-sign2`, and one 390x844 screenshot of the results scene, into `docs/screenshots/m3/`.
3. THE spec `tests/e2e/m3-report.spec.ts` SHALL record the axe result of each screenshotted screen and the measured render times (`request/request` and the 300-plot synthetic scene) in `test-results/m3-measurements.json`.
4. THE script `scripts/write-m3-report.ts` SHALL write `docs/milestone-3-report.md` with: the screenshots, the measured render times against `SCENE_RENDER_BUDGET_MS`, the client JavaScript size against `CLIENT_JS_BUDGET_BYTES`, the axe result per screen, the design changes, the known gaps and a credits line.
5. THE credits line SHALL state that credit usage cannot be seen.
6. THE report writer SHALL print "not measured" for a missing measurement, and SHALL read or print no environment variable and no token.
7. THE unit test `tests/ui/write-m3-report.test.ts` SHALL check the section order, the "not measured" fallback, the screenshot list and the credits line.
8. WHEN the Milestone 3 report is written, THE workflow SHALL stop and SHALL start no further task.
