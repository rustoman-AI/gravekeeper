import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { formatRepoUrl } from '../../../pipeline/url/format-repo-url';
import { parseRepoUrl } from '../../../pipeline/url/parse-repo-url';
import type { RepoRef } from '../../../pipeline/url/parse-repo-url';
import {
  anyInputString,
  mutatedUrl,
  refWithSpelling,
  urlSpelling,
  validRepoRef,
  WEB_HOSTS,
} from '../../support/arbitraries/urls';
import { cfg } from '../../support/fc-config';

function mustParse(input: string, webHost: string): RepoRef {
  const result = parseRepoUrl(input, webHost);
  if (!result.ok) throw new Error(`rejected (${result.error.details.part}): ${JSON.stringify(input)}`);
  return result.value;
}

describe('URL parser properties', () => {
  // Feature: scan-pipeline, Property 1: Repository reference round trip
  // Validates: Requirements 1.12
  it('parse(format(ref)) equals ref for every valid Repo_Ref', () => {
    fc.assert(
      fc.property(validRepoRef(), (ref) => {
        const result = parseRepoUrl(formatRepoUrl(ref), ref.host);
        return result.ok && JSON.stringify(result.value) === JSON.stringify(ref);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 2: URL normalization is idempotent and variant-invariant
  // Validates: Requirements 1.13, 1.15
  it('normalization is idempotent for every accepted input', () => {
    fc.assert(
      fc.property(refWithSpelling(), ({ webHost, spelling }) => {
        const once = formatRepoUrl(mustParse(spelling.input, webHost));
        const twice = formatRepoUrl(mustParse(once, webHost));
        return once === twice;
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 2: URL normalization is idempotent and variant-invariant
  // Validates: Requirements 1.13, 1.15
  it('every spelling variant of an accepted input parses to equal Repo_Refs', () => {
    fc.assert(
      fc.property(
        validRepoRef().chain((ref) =>
          fc.tuple(urlSpelling(ref), urlSpelling(ref)).map(([a, b]) => ({ ref, a, b })),
        ),
        ({ ref, a, b }) => {
          const first = mustParse(a.input, ref.host);
          const second = mustParse(b.input, ref.host);
          return (
            JSON.stringify(first) === JSON.stringify(second) &&
            JSON.stringify(first) === JSON.stringify(ref)
          );
        },
      ),
      cfg(),
    );
  });
});

describe('URL parser totality and mutation properties', () => {
  // Feature: scan-pipeline, Property 3: URL parsing is total
  // Validates: Requirements 1.14
  it('returns a Repo_Ref or invalid-url for any string and never throws', () => {
    fc.assert(
      fc.property(anyInputString, fc.constantFrom(...WEB_HOSTS), (input, webHost) => {
        const result = parseRepoUrl(input, webHost);
        return result.ok || result.error.code === 'invalid-url';
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 4: One mutation of an accepted URL is rejected
  // Validates: Requirements 1.17
  it('rejects an accepted URL after exactly one mutation', () => {
    fc.assert(
      fc.property(mutatedUrl(), ({ webHost, original, input }) => {
        if (!parseRepoUrl(original, webHost).ok) return false;
        const result = parseRepoUrl(input, webHost);
        return !result.ok && result.error.code === 'invalid-url';
      }),
      cfg(),
    );
  });
});
