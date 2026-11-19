# Design Document

## Overview

Three independent operations tasks. None change application code. Each produces a report or a documentation file. Property-based tests do not apply: the work is a one-off audit, a Markdown file, and a network check. Language: TypeScript (existing workspace), used only for the throwaway scan script.

## Architecture

### Task 1: request/request audit

- Write a throwaway script outside the repo (for example in the OS temp directory) that imports the composition from adapters/composition.ts and runs the same call sequence as tests/live/smoke-scan.live.test.ts and app/api/scan/route.ts.
- Start the process with GRAVEKEEPER_RUNTIME_CACHE=off and GITHUB_TOKEN taken from `gh auth token` in that process only. The token is never printed and the variable is unset afterwards.
- Filter the result for DEAD and HAUNTED entries and read score, ruleIds, daysSinceLastRelease, daysSinceLastCommit, archived, deprecated, and the Source_Repo link from the facts and classification.
- Read core/classifier (pipeline.ts, rules/) and .kiro/specs/dependency-graveyard-core requirements and design to explain each likely false positive.
- Delete the script and confirm with `git status` that no repository file changed.

### Task 2: steering file

- Read the existing files in .kiro/steering/ and copy their front-matter and heading style.
- Write .kiro/steering/ui-design.md with sections: Art direction, Assets and fonts, Voice, Accessibility. Keep it under 80 lines and keep the user-provided rules unchanged in substance.

### Task 3: production smoke test

- Use curl.exe or Invoke-WebRequest against the Production_Site with no token on the client side.
- Run in order: POST canopy, immediate repeat, GET (expect 405 and Allow: POST), POST gitlab URL (expect 400 invalid-url).
- Measure response time per request and extract status, ok, grade, counts, six source statuses, and notes grouped by code.
- Check every response body for a github-token-missing note. If found, report and stop without logging.
- Read KIRO_LOG.md first, then append a "## Session 14" entry in the same format.

## Components and Interfaces

- Scan_Script: temporary, calls the existing scan entry point; no new interface in the repository.
- Steering_File: Markdown document, no interface.
- Smoke_Tester: HTTP client calls to POST/GET /api/scan on the Production_Site.

## Data Models

No new data models. The audit reads the existing scan result (dependencies, facts, classification, notes, source statuses). The smoke test reads the existing response body and headers.

## Error Handling

- Task 1: IF the scan fails or the token is unavailable, THEN report the failure and make no repository change.
- Task 3: IF a github-token-missing note appears, THEN stop and report that the environment variable is not reaching the function.

## Testing Strategy

No automated tests are added. Verification is the produced report, `git status` showing only the new steering file, the spec files, and the KIRO_LOG.md edit, and format validation of each spec document.
