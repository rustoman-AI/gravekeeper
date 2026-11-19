# Requirements Document

## Introduction

Session 14 covers three independent operations tasks for Gravekeeper: a live audit of the classifier output for request/request, a UI design steering file, and a production smoke test with a log entry. No changes are made to core, pipeline, adapters, app, or tests.

## Glossary

- **Auditor**: The agent performing the request/request scan and analysis.
- **Scan_Script**: A throwaway script, outside the repository or deleted afterwards, that runs the production stack once.
- **Production_Stack**: The wiring used by tests/live/smoke-scan.live.test.ts and app/api/scan/route.ts.
- **Steering_File**: The file .kiro/steering/ui-design.md.
- **Smoke_Tester**: The agent performing the production smoke test.
- **Production_Site**: https://gravekeeper-chi.vercel.app
- **Kiro_Log**: The file KIRO_LOG.md at the repository root.

## Requirements

### Requirement 1: Audit request/request

**User Story:** As a maintainer, I want an audit of the DEAD and HAUNTED dependencies of request/request, so that I can judge classifier accuracy on a real repository.

#### Acceptance Criteria

1. WHEN the audit runs, THE Auditor SHALL execute exactly one live scan of https://github.com/request/request through the Production_Stack with GRAVEKEEPER_RUNTIME_CACHE set to off.
2. WHILE the Scan_Script runs, THE Auditor SHALL expose the output of `gh auth token` only in the environment of the Scan_Script process.
3. WHEN the scan finishes, THE Auditor SHALL remove the token from the environment and leave no repository file changed.
4. THE Auditor SHALL report a table of every DEAD and HAUNTED dependency with name, status, score, fired ruleIds, daysSinceLastRelease, daysSinceLastCommit, archived, deprecated, and linked Source_Repo.
5. WHEN a dependency is DEAD and is a healthy, maintained package, THE Auditor SHALL flag it as a likely false positive and explain, from the core classifier rules and the dependency-graveyard-core spec, which rules produced the status.
6. THE Auditor SHALL leave every classifier rule unchanged.

### Requirement 2: UI design steering file

**User Story:** As a designer, I want a UI design steering file, so that future UI work follows one art direction and accessibility standard.

#### Acceptance Criteria

1. THE Steering_File SHALL contain fewer than 80 lines.
2. THE Steering_File SHALL use the same front-matter and format as the existing files in .kiro/steering/.
3. THE Steering_File SHALL state the art direction: a moonlit Victorian cemetery at night, atmospheric, without gore or blood, with the specified palette and drifting fog layers.
4. THE Steering_File SHALL state that all art is original SVG or CSS made in this repository and that fonts come from next/font using OFL-licensed families, one gothic display face and one readable sans.
5. THE Steering_File SHALL state that themed copy wraps the plain API message and that the plain message is visible or one click away.
6. THE Steering_File SHALL state the accessibility rules: WCAG AA contrast, text label for every status, full keyboard navigation, visible focus, prefers-reduced-motion disabling fog, drift and glow pulsing, and a real table of the same data for screen readers.

### Requirement 3: Production smoke test

**User Story:** As an operator, I want a production smoke test, so that I can confirm the deployed scan API works with its server-side token.

#### Acceptance Criteria

1. WHEN the Smoke_Tester sends POST /api/scan to the Production_Site with {"repoUrl":"https://github.com/revmic/canopy"} and Content-Type application/json, THE Smoke_Tester SHALL report status, ok, grade, status counts, the six source statuses, notes by code, and response time.
2. WHEN the Smoke_Tester repeats the same request immediately, THE Smoke_Tester SHALL report the response time and whether it indicates a scan cache hit.
3. WHEN the Smoke_Tester sends GET /api/scan, THE Smoke_Tester SHALL confirm status 405 and an Allow header of POST.
4. WHEN the Smoke_Tester sends POST /api/scan with the URL https://gitlab.com/a/b, THE Smoke_Tester SHALL confirm status 400 with error code invalid-url.
5. IF any response contains a github-token-missing note, THEN THE Smoke_Tester SHALL report that the environment variable is not reaching the function, stop, and omit a success entry from the Kiro_Log.
6. THE Smoke_Tester SHALL print no token value.
7. WHEN all checks pass, THE Smoke_Tester SHALL append a "## Session 14" entry with the results to the Kiro_Log in the existing format, without committing.
