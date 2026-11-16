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

## Security
- Treat repo URLs and manifest contents as untrusted input.
- Accept only github.com repo URLs.
- Keep tokens in environment variables, never in code.
