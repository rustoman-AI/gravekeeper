import * as fc from 'fast-check';
import { REDIRECT_MAX_HOPS } from '../../../pipeline/constants';
import type { ScriptFn, Step } from '../scripted-fetch';

// Requirement 15.9, 15.19, 15.21, 16.13, 23.1: redirect chains.

export const REDIRECT_STATUSES = [301, 302, 303, 307, 308] as const;
export const ORIGIN = 'https://api.example.com';
export const CROSS_ORIGIN = 'https://other.example.net';

export type LocationKind =
  | 'relative-path' // "/hopN"
  | 'relative-bare' // "hopN"
  | 'absolute-same' // "https://api.example.com/hopN"
  | 'absolute-cross' // "https://other.example.net/hopN"
  | 'absolute-http-same-host' // "http://api.example.com/hopN" (different scheme, so different origin)
  | 'non-http' // "ftp://api.example.com/hopN"
  | 'unparseable' // "http://["
  | 'empty'
  | 'missing';

export interface RedirectHop {
  readonly status: (typeof REDIRECT_STATUSES)[number];
  readonly kind: LocationKind;
}

export interface RedirectChain {
  /** First request URL: `${ORIGIN}/hop0`. */
  readonly startUrl: string;
  /** Hop i answers the request for `/hop${i}`. After the last hop, `/hop${hops.length}` answers 200. */
  readonly hops: readonly RedirectHop[];
  /** Request headers sent with the first request. */
  readonly requestHeaders: Readonly<Record<string, string>>;
}

const LOCATION_KINDS: readonly LocationKind[] = [
  'relative-path', 'relative-bare', 'absolute-same', 'absolute-cross',
  'absolute-http-same-host', 'non-http', 'unparseable', 'empty', 'missing',
];

const locationKind: fc.Arbitrary<LocationKind> = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom<LocationKind>('relative-path', 'relative-bare', 'absolute-same') },
  { weight: 2, arbitrary: fc.constant<LocationKind>('absolute-cross') },
  { weight: 2, arbitrary: fc.constantFrom<LocationKind>(...LOCATION_KINDS) },
);

const hop: fc.Arbitrary<RedirectHop> = fc.record({
  status: fc.constantFrom(...REDIRECT_STATUSES),
  kind: locationKind,
});

/** Header sets that always include Authorization, with optional extras. */
export const redirectRequestHeaders: fc.Arbitrary<Readonly<Record<string, string>>> = fc
  .record({
    accept: fc.option(fc.constantFrom('application/json', 'application/vnd.github+json'), { nil: undefined }),
    'user-agent': fc.option(fc.constant('gravekeeper-test'), { nil: undefined }),
    'x-github-api-version': fc.option(fc.constant('2022-11-28'), { nil: undefined }),
  })
  .chain((extras) =>
    fc.constantFrom('Bearer ghp_scripted_token', 'Bearer abc').map((authorization) => {
      const headers: Record<string, string> = { Authorization: authorization };
      for (const [name, value] of Object.entries(extras)) if (value !== undefined) headers[name] = value;
      return headers;
    }),
  );

/** Chains of 0 to REDIRECT_MAX_HOPS + 2 hops. */
export const redirectChain: fc.Arbitrary<RedirectChain> = fc.record({
  startUrl: fc.constant(`${ORIGIN}/hop0`),
  hops: fc.array(hop, { minLength: 0, maxLength: REDIRECT_MAX_HOPS + 2 }),
  requestHeaders: redirectRequestHeaders,
});

/** Chains where every hop is a followable same-origin redirect. */
export const sameOriginChain: fc.Arbitrary<RedirectChain> = fc.record({
  startUrl: fc.constant(`${ORIGIN}/hop0`),
  hops: fc.array(
    fc.record({
      status: fc.constantFrom(...REDIRECT_STATUSES),
      kind: fc.constantFrom<LocationKind>('relative-path', 'relative-bare', 'absolute-same'),
    }),
    { minLength: 0, maxLength: REDIRECT_MAX_HOPS + 2 },
  ),
  requestHeaders: redirectRequestHeaders,
});

function locationFor(kind: LocationKind, next: number): string | undefined {
  switch (kind) {
    case 'relative-path': return `/hop${next}`;
    case 'relative-bare': return `hop${next}`;
    case 'absolute-same': return `${ORIGIN}/hop${next}`;
    case 'absolute-cross': return `${CROSS_ORIGIN}/hop${next}`;
    case 'absolute-http-same-host': return `http://api.example.com/hop${next}`;
    case 'non-http': return `ftp://api.example.com/hop${next}`;
    case 'unparseable': return 'http://[';
    case 'empty': return '';
    case 'missing': return undefined;
  }
}

/**
 * Script for a chain, keyed on the `/hopN` path whatever the origin.
 * Requests for `/hopN` with N < hops.length get the redirect; any other path gets 200 `{}`.
 */
export function chainScript(chain: RedirectChain, finalStep?: Step): ScriptFn {
  return (url) => {
    const match = /\/hop(\d+)$/.exec(new URL(url).pathname);
    const index = match === null ? -1 : Number(match[1]);
    const hopSpec = chain.hops[index];
    if (hopSpec === undefined) {
      return (
        finalStep ?? {
          latencyMs: 0,
          response: { status: 200, headers: [['content-type', 'application/json']], body: { kind: 'text', text: '{}' } },
        }
      );
    }
    const location = locationFor(hopSpec.kind, index + 1);
    return {
      latencyMs: 0,
      response: {
        status: hopSpec.status,
        headers: location === undefined ? [] : [['Location', location]],
      },
    };
  };
}

/** Number of redirects a correct client follows before it stops: leading same-origin hops, capped. */
export function expectedFollowableHops(chain: RedirectChain): number {
  let count = 0;
  for (const spec of chain.hops) {
    if (count >= REDIRECT_MAX_HOPS) break;
    if (spec.kind !== 'relative-path' && spec.kind !== 'relative-bare' && spec.kind !== 'absolute-same') break;
    count += 1;
  }
  return count;
}
