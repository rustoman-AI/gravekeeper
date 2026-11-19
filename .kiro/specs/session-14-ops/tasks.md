# Implementation Plan: Session 14 Ops

## Overview

Three independent tasks that can run in parallel. No changes to core, pipeline, adapters, app, or tests. No commits.

## Tasks

- [x] 1. Audit DEAD and HAUNTED dependencies of request/request (no code changes)
  - Run one live scan of https://github.com/request/request with the production stack, GRAVEKEEPER_RUNTIME_CACHE=off, and the token from `gh auth token` set only in that process's environment, never printed, removed afterwards
  - Use a throwaway script outside the repo or delete it afterwards; no repo files change
  - Report a table of every DEAD and HAUNTED dependency: name, status, score, ruleIds, daysSinceLastRelease, daysSinceLastCommit, archived, deprecated, linked Source_Repo
  - Flag likely false positives (healthy, maintained package classified DEAD) and explain from core/ classifier and the dependency-graveyard-core requirements and design why the rules produced that; change no rule
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Create .kiro/steering/ui-design.md
  - Read existing .kiro/steering/ files and match their front-matter and format
  - Include art direction, original-assets and OFL fonts rule, voice rule, and accessibility rules; keep under 80 lines
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 3. Production smoke test and log results
  - Against https://gravekeeper-chi.vercel.app: POST canopy scan, immediate repeat, GET (405, Allow: POST), POST gitlab URL (400 invalid-url)
  - Report status, ok, grade, status counts, six source statuses, notes by code, and response times; print no token
  - If any github-token-missing note appears, report it and stop without logging success
  - Otherwise read KIRO_LOG.md and append a "## Session 14" entry in the existing format; do not commit
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

## Notes

- Tasks touch disjoint files and have no dependencies on each other.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "3"] }
  ]
}
```
