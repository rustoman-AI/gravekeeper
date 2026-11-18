import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { readGithubConfig } from '../../../pipeline/config/github-config';
import { GHES_API_PATH_SUFFIX } from '../../../pipeline/constants';
import { cfg } from '../../support/fc-config';

const urlish: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.string({ unit: 'binary' }),
  fc.constant(''),
  fc.webUrl(),
  fc.webUrl({ validSchemes: ['http', 'ftp', 'file'] }),
  fc
    .tuple(fc.domain(), fc.constantFrom('', '/', GHES_API_PATH_SUFFIX, `${GHES_API_PATH_SUFFIX}/`))
    .map(([host, path]) => `https://${host}${path}`),
  fc
    .tuple(fc.constantFrom('https', 'HTTPS', 'http', 'ws', ''), fc.string())
    .map(([scheme, rest]) => `${scheme}://${rest}`),
);

const WEB_HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

// Fixed configuration error messages, copied from pipeline/config/github-config.ts
// (API_URL_MESSAGE, GRAPHQL_URL_MESSAGE, GRAPHQL_HOST_MESSAGE); the module does not export them.
const FIXED_MESSAGES: readonly string[] = [
  'GITHUB_API_URL is not a supported GitHub API URL.',
  'GITHUB_GRAPHQL_URL is not a supported GitHub GraphQL URL.',
  'GITHUB_GRAPHQL_URL must have the same host as GITHUB_API_URL.',
];

// Feature: scan-pipeline, Property 5: GitHub configuration derivation is total and does not echo input
// Validates: Requirements 2.10
describe('Property 5: GitHub configuration derivation is total and does not echo input', () => {
  it('returns a bare lowercase Web_Host or an error with a fixed message independent of the input, and never throws', () => {
    fc.assert(
      fc.property(urlish, urlish, (api, graphql) => {
        const result = readGithubConfig({ GITHUB_API_URL: api, GITHUB_GRAPHQL_URL: graphql });
        if (result.ok) {
          return WEB_HOST.test(result.value.webHost);
        }
        return (
          result.error.code === 'internal-error' && FIXED_MESSAGES.includes(result.error.message)
        );
      }),
      cfg({ examples: [['http://a.aa', ' ']] }),
    );
  });
});
