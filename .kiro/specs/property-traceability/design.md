# Design Document

## Overview

This is a documentation and test-title change. No `core` or `pipeline` code, assertion, or generator changes. The implementation language is TypeScript (vitest, fast-check).

## Architecture

1. Title prefixing: for each of the five files, read the `// Feature: scan-pipeline, Property <n>` comment above each test. If the comment is missing, match the test against the properties in `.kiro/specs/scan-pipeline/design.md`. Edit only the title string to `P<n> ...`.
2. Traceability table: build rows from both `design.md` files. For each property, search `tests/` for its tag comment and `P<n>` title, then record file, title, and requirements from the `**Validates:**` line. Core spec tests may use other title conventions, so match them by tag comment.
3. Status comes from a full `npx vitest --run`: "passing" if the test exists and passes, otherwise "not yet implemented".

## Components and Interfaces

- `tests/pipeline/mapping/day-count.property.test.ts`, `deps-dev.property.test.ts`, `github-resolve.property.test.ts`, `github.property.test.ts`, `tests/pipeline/url/parse-repo-url.property.test.ts`: title edits only. Example tests (for example the repeated-keys first-match case) keep their titles unless they assert a property.
- `docs/property-traceability.md`: header, table `| Property | Requirement(s) | Test file | Test title | Status |`, then a "Properties without a test" list.

## Data Models

None. The only structured artifact is the Markdown table in `docs/property-traceability.md`.

## Error Handling

IF a test cannot be matched to exactly one property, THEN the implementer leaves the title unchanged and reports it. IF a test fails in the full run, its row does not get "passing".

## Testing Strategy

Property-based testing does not apply, because this change edits titles and documentation. Verification uses `npx vitest --run`, `npx tsc --noEmit`, and `npm run lint`.
