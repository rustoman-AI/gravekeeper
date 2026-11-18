# Implementation Plan: Property Traceability

## Overview

Prefix untagged property test titles with `P<n>`, then document the property-to-test mapping. Do not commit; the orchestrator commits both changes together.

## Tasks

- [x] 1. Add `P<n>` title prefixes to five property test files
  - Edit titles only in `tests/pipeline/mapping/day-count.property.test.ts`, `deps-dev.property.test.ts`, `github-resolve.property.test.ts`, `github.property.test.ts`, and `tests/pipeline/url/parse-repo-url.property.test.ts` (verify exact paths)
  - Take n from the `// Feature: scan-pipeline, Property <n>` comment, or match against `.kiro/specs/scan-pipeline/design.md`
  - Leave example tests without a prefix; do not change assertions or generators
  - Run `npx vitest --run` on those files, `npx tsc --noEmit`, and `npm run lint`
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Create `docs/property-traceability.md`
  - Build one row per property from both design.md files (scan-pipeline P1..P75, dependency-graveyard-core 39), with columns Property, Requirement(s), Test file, Test title, Status
  - Verify each row by grepping tag comments and titles in `tests/`
  - Run the full `npx vitest --run` and mark "passing" only for existing, passing tests
  - Add a list of every design property without a test after the table
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

## Notes

- Neither task commits; the orchestrator creates one commit for both changes.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] }
  ]
}
```
