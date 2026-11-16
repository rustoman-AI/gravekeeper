# Gravekeeper: Structure

## Layout
- /core: pure logic (parsers, scoring, classification, patch generation).
- /adapters: network adapters (osv, depsdev, github, registries) and fixtures loader.
- /app: Next.js routes, layouts, API route handlers.
- /components: React UI components.
- /tests: unit, property-based, and fixture files.
- /tests/fixtures: recorded upstream responses.

## Naming
- Files use kebab-case.
- React components use PascalCase names.
- Types and interfaces use PascalCase.
- Functions and variables use camelCase.
- Tests are named `<module>.test.ts`.
- Property tests are named `<module>.property.test.ts`.
- Adapter interfaces are named `<Name>Source`.

## Rules
- /core must not import from /adapters, /app, or /components.
- /core must not use fetch, fs, or Date.now directly.
- Pass time and data into /core functions as arguments.
- Every classification rule maps to a numbered requirement in the spec.
- Cite the requirement number in a comment above each rule.
- One component per file.
- No default exports except Next.js route files.

## Accessibility
- Meet WCAG AA contrast.
- Support full keyboard navigation.
- Support reduced motion via `prefers-reduced-motion`.
- Every visual status also has a text label.
- Never rely on color alone to convey status.
