# Gravekeeper: Product

Gravekeeper is a web app for the Kiroween 2026 hackathon (Costume Contest category).

## What it does
- The user pastes a public GitHub repo URL.
- The app reads dependency manifests: package.json, requirements.txt, Cargo.toml.
- It gathers health data for each dependency from public sources only:
  - OSV.dev: known vulnerabilities.
  - deps.dev: project metadata.
  - GitHub API: archived status and last activity.
  - Package registries: deprecation flag and last release date.
- It renders the result as an interactive graveyard:
  - Tombstone: abandoned package.
  - Ghost: package with unpatched vulnerabilities.
  - Lit lantern: healthy package.
- A "Resurrect" action suggests a maintained alternative and produces a manifest patch.

## Constraints
- No login.
- No paid APIs.
- No LLM calls at runtime.

## Audience
Developers and maintainers auditing supply chain risk.

## Principles
- Results are explainable: every status shows the rule and the data behind it.
- Partial results are better than an error page.
- The theme is playful, but the data stays accurate and readable.
