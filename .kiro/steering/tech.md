# Gravekeeper: Tech

## Stack
- Next.js (App Router) with TypeScript in strict mode.
- Tailwind CSS for styling.
- Vitest for unit tests.
- fast-check for property-based tests.
- Deploy target: Vercel free tier.

## Architecture
- /core holds the scoring engine and manifest parsers.
- Everything in /core is a pure function with zero I/O.
- /core may depend only on pure parsing libraries with no I/O (currently smol-toml, pinned to an exact version).
- All network access goes through adapters in /adapters.
- Each adapter implements an interface defined in /core.
- Tests use recorded fixtures, never live network calls.

## Network behavior
- Cache upstream responses.
- Handle rate limits gracefully (respect Retry-After, back off).
- Show partial results when some sources fail.
- Mark each failed source in the UI instead of hiding it.

## Testing
- Parsers and classification rules get property-based tests.
- Adapters are tested against fixtures.
- Run tests with `npx vitest --run`.
- Agents must never set `FC_NUM_RUNS` in the shared shell.
- Start a deeper property run with `npm run test:deep`, optionally followed by test paths. It sets `FC_NUM_RUNS=1000` for that one process only.

## Security
- Treat repo URLs and manifest contents as untrusted input.
- Accept only github.com repo URLs.
- Keep tokens in environment variables, never in code.
