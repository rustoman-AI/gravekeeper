# Requirements Document

## Introduction

Property tests in five scan-pipeline files lack the `P<n>` title prefix used elsewhere in the repository. This feature adds the prefixes and publishes a traceability table that maps every design property of the `scan-pipeline` and `dependency-graveyard-core` specs to its test and status.

## Glossary

- **Test_Suite**: The vitest tests under `tests/`.
- **Property_Test**: A test titled with a `P<n>` prefix that checks one design property.
- **Design_Property**: A numbered property in a spec's `design.md` (P1..P75 for scan-pipeline, 39 for dependency-graveyard-core).
- **Traceability_Doc**: The file `docs/property-traceability.md`.
- **Tag_Comment**: A `// Feature: <spec>, Property <n>` comment above a Property_Test.

## Requirements

### Requirement 1: Property test title prefixes

**User Story:** As a maintainer, I want every property test title to start with its property number, so that failures map directly to the design.

#### Acceptance Criteria

1. THE Test_Suite SHALL title each Property_Test in `day-count.property.test.ts`, `deps-dev.property.test.ts`, `github-resolve.property.test.ts`, `github.property.test.ts` and `parse-repo-url.property.test.ts` with the prefix `P<n>`, where n is the property number from the Tag_Comment or the matching Design_Property.
2. THE Test_Suite SHALL keep all assertions, generators, and the `core` and `pipeline` source code unchanged by this feature.
3. WHEN a test in those files is an example and not a property, THE Test_Suite SHALL keep its title without a `P<n>` prefix.

### Requirement 2: Traceability table

**User Story:** As a reviewer, I want a table of all design properties with their tests, so that I can see coverage at a glance.

#### Acceptance Criteria

1. THE Traceability_Doc SHALL contain one row per Design_Property of both specs with the columns Property, Requirement(s), Test file, Test title, and Status.
2. THE Traceability_Doc SHALL take each row's test file and title from the actual files, matched by Tag_Comment or title prefix.
3. WHEN the matching test exists and passes in `npx vitest --run`, THE Traceability_Doc SHALL set Status to "passing".
4. IF no test exists for a Design_Property, THEN THE Traceability_Doc SHALL set Status to "not yet implemented".
5. THE Traceability_Doc SHALL list, after the table, every Design_Property without a test.
