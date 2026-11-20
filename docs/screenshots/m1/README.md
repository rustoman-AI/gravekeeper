# Milestone 1 screenshots

Produced by `tests/e2e/m1-report.spec.ts` (`M1_REPORT=1`, `desktop` project): 1440x900 viewport,
`reducedMotion: 'reduce'`, fake clock fixed at 2026-11-19T12:00:00Z, `/api/scan` mocked with the
recorded fixture `tests/e2e/.generated/scan-request.json` (repository `request/request`).

| File | What it shows |
| --- | --- |
| `landing.png` | Landing page. |
| `scanning.png` | Scanning screen with stage 3 ("Consulting the vulnerability records") in progress, 6.5 s into a scan that never answers. |
| `results-scene-request.png` | Results Scene for `request/request`, top of the page (header and first rows). |
| `results-list-request.png` | Results List view for `request/request`. |
| `detail-uuid.png` | Detail panel of the package `uuid` (npm) of `request/request`. |
| `detail-forgotten.png` | Detail panel of `aws-sign2` (npm), Grave_Type `forgotten`. |

## Forgotten package

The recorded `request` replay has 20 packages with Grave_Type `forgotten`. The view-model
(`buildPackageRows`) returns rows in scene order; the first one with `graveType === 'forgotten'` is
`aws-sign2` (npm, score 25), so that package is shown.
No synthetic result was needed.
