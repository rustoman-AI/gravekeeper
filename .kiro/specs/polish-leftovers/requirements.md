# Requirements Document

## Introduction

This feature closes the leftover polish items for Gravekeeper: a visually distinct restless ghost, non-truncating grave labels, stale spec and test-file cleanup, a flaky unit test investigation, and CI and deployment verification. Each item is committed separately after its related tests pass, and the deep test suite runs once at the end.

Out of scope: the header wordmark stays visible on every page, including the landing page. Hiding the header wordmark on the landing page is excluded from this session because the wordmark would be hidden for a moment on a direct `/?repo=` visit, which is a visible glitch on the URL opened from the README and the video.

## Glossary

- **Gravekeeper**: The Next.js web application that renders a dependency graveyard scene.
- **Scene**: The graveyard rendering composed of grave sprites, ghosts, and labels.
- **Restless_Sprite**: The sprite for a dependency in the restless state (DEAD with open advisories).
- **Haunted_Sprite**: The sprite for a dependency in the haunted state, drawn with a cyan ghost.
- **Buried_Stone**: The headstone drawn for a buried grave at full size.
- **Stone_Variant**: The headstone shape of a grave: cross, slab/ledger, rounded, or obelisk.
- **Grave_Label**: The `.gk-plot-label` text element inside `button.gk-plot` that shows a package name.
- **Label_Line_Budget**: The maximum of 2 text lines per Grave_Label.
- **Header_Wordmark**: The top-left "Gravekeeper" link in the site header.
- **Above_Fold_Budget**: The existing layout constraints: at 390x700 the first-row label bottom is at most 700 px, and at 1440x760 and 1280x720 at least 40 px of row 2 is visible.
- **Spec_Ledger**: The scan-count and geometry numbers recorded in `.kiro/specs/*/design.md`.
- **Reference_Scan**: The scan of the request/request repository: 6 buried, 20 forgotten, 5 haunted, 9 alive, grade D, uuid score 60.
- **Flaky_Test**: The unit test that fails intermittently without a known cause.
- **Quarantine_Note**: A written reason, recorded beside a skipped test, explaining why the test is excluded.
- **CI**: The GitHub Actions workflows in `.github/workflows`.
- **Deploy_Verifier**: The `npm run verify:deploy` script.
- **Session_Log**: The file `KIRO_LOG.md` at the repository root.
- **Polish_Screenshots**: Images stored in `docs/screenshots/polish/`.

## Requirements

### Requirement 1: Distinct restless ghost

**User Story:** As a user, I want the restless ghost to look different from the haunted ghost, so that I can tell the two states apart at a glance.

#### Acceptance Criteria

1. WHEN a dependency is in the restless state, THE Restless_Sprite SHALL draw a ghost rising out of a headstone of the same size as the Buried_Stone.
2. THE Restless_Sprite SHALL draw the headstone using the Stone_Variant of that grave.
3. WHEN the Restless_Sprite uses a cross Stone_Variant, THE Restless_Sprite SHALL draw a cross at the full Buried_Stone size.
4. THE Restless_Sprite SHALL draw the ghost at 70% of the current ghost size, within a tolerance of 2 percentage points.
5. THE Restless_Sprite SHALL offset the ghost so that the headstone remains visible.
6. THE Restless_Sprite SHALL tint the ghost with a faint red-violet colour that differs from the cyan tint of the Haunted_Sprite.
7. THE Scene SHALL render Restless_Sprite and Haunted_Sprite with different SVG markup.
8. THE Scene SHALL keep Restless_Sprite, Haunted_Sprite, and the other sprite states pairwise distinct when rendered in greyscale.
9. THE Scene SHALL report 0 axe violations with Restless_Sprite rendered.
10. THE Scene SHALL keep the scene render time within the 100 ms budget and the 80.4 ms regression threshold.

### Requirement 2: Non-truncating grave labels

**User Story:** As a user, I want grave labels that show the full package name, so that I can identify each dependency without ellipsis truncation.

#### Acceptance Criteria

1. THE Grave_Label SHALL render without an ellipsis truncation.
2. WHEN a package name contains hyphens, THE Grave_Label SHALL wrap the name at hyphens within the Label_Line_Budget.
3. WHEN the name "browserify-istanbul" is rendered, THE Grave_Label SHALL display it on 2 lines broken at the hyphen.
4. IF a package name overflows the Label_Line_Budget after wrapping, THEN THE Grave_Label SHALL truncate the second line.
5. WHEN the Grave_Label truncates a name, THE Grave_Label SHALL expose the full package name in the accessible name of `button.gk-plot`.
6. WHEN the Grave_Label truncates a name, THE Grave_Label SHALL include the full package name in a `<title>` element.
7. WHEN the name "karma-phantomjs-launcher" is rendered, THE Grave_Label SHALL expose the full name in the accessible name and in a `<title>` element.
8. THE Grave_Label SHALL satisfy the Above_Fold_Budget by adjusting spacing, line-height, or font size, without changing the budget values or the tests that check them.
9. THE Grave_Label SHALL render text with a contrast ratio that meets WCAG AA.
10. THE Grave_Label SHALL render text at a font size of at least 11 px.
11. THE Scene SHALL keep a cumulative layout shift of at most 0.01 and reflow at a 320 px viewport width.

### Requirement 3: Spec and test leftovers

**User Story:** As a maintainer, I want stale spec numbers and file artefacts corrected, so that the repository documentation matches current behaviour.

#### Acceptance Criteria

1. THE Spec_Ledger in the art-polish `design.md` SHALL state the ledger stone top as 70 instead of 62.
2. THE Spec_Ledger in the art-polish `design.md` SHALL state the restless slab top as 84 instead of 80.
3. THE Spec_Ledger in every `.kiro/specs/*/design.md` SHALL state the Reference_Scan counts of 6 buried, 20 forgotten, 5 haunted, 9 alive, grade D, and uuid score 60 wherever a request/request scan count appears.
4. THE file `tests/e2e/above-fold.spec.ts` SHALL contain no byte-order mark.
5. WHEN the Flaky_Test investigation starts, THE maintainer SHALL identify the failing file by running the full vitest suite repeatedly with a JSON reporter.
6. WHEN the failing file is identified, THE maintainer SHALL run that file 20 times and record the failing test name and root cause.
7. WHEN the root cause is known, THE maintainer SHALL either fix the Flaky_Test or quarantine the Flaky_Test with a Quarantine_Note.
8. WHEN the Flaky_Test is fixed, THE failing file SHALL pass 20 consecutive runs.

### Requirement 4: CI, deploy, and session log

**User Story:** As a maintainer, I want verified CI, a verified deployment, and a session log, so that the release state is auditable.

#### Acceptance Criteria

1. WHEN verification starts, THE maintainer SHALL confirm through `gh run list` that CI is green on commit 5117bb5.
2. WHEN all items are committed and pushed, THE maintainer SHALL confirm through `gh run list` that CI is green on each new commit.
3. WHEN CI is green, THE maintainer SHALL redeploy Gravekeeper to https://gravekeeper-chi.vercel.app.
4. WHEN the redeploy completes, THE maintainer SHALL run the Deploy_Verifier against https://gravekeeper-chi.vercel.app and record the result.
5. WHEN `KIRO_LOG.md` does not exist, THE maintainer SHALL create the Session_Log; otherwise THE maintainer SHALL append to the Session_Log.
6. THE Session_Log SHALL record the session items, commit hashes, the flake root cause, and the CI status.
7. THE Polish_Screenshots SHALL include an image of the uuid grave and an image of the landing hero.
8. THE maintainer SHALL leave `docs/screenshots/m1`, `docs/screenshots/m2`, and `docs/screenshots/m3` unchanged.

### Requirement 5: Workflow and constraints

**User Story:** As a maintainer, I want a disciplined workflow and unchanged project constraints, so that the changes remain safe and reviewable.

#### Acceptance Criteria

1. WHEN an item passes its related tests, THE maintainer SHALL commit that item as a separate commit.
2. WHEN all items are committed, THE maintainer SHALL run `npm run test:deep` once.
3. THE maintainer SHALL run deep tests through `npm run test:deep -- <files>` without setting FC_NUM_RUNS in the shell.
4. THE existing property AP-P3 in `tests/ui/view-model/restless-art.property.test.ts` SHALL describe the new stone and ghost arrangement.
5. THE Gravekeeper SHALL keep the client JavaScript bundle at or below 256,000 bytes gzip.
6. THE maintainer SHALL keep each file under a single owner during parallel work, with the orchestrator performing commits and pushes.
7. THE maintainer SHALL keep access tokens out of all printed output and committed files.
8. THE Polish_Screenshots SHALL be produced deterministically so that repeated captures yield identical images.
9. WHILE the reduced-motion preference is set, THE Scene SHALL render without animation for the Restless_Sprite.
10. THE Gravekeeper SHALL display the Header_Wordmark on every page, including the landing page, to avoid a visibility glitch on direct `/?repo=` visits.
