import { describe, expect, it } from 'vitest';
import { advisoryUrl } from '../../../pipeline/mapping/advisories';
import { assembleFacts } from '../../../pipeline/mapping/assemble';
import type { Fetched, RawTargetInputs } from '../../../pipeline/mapping/types';

// Feature: resurrect, task 1.7
// Validates: Requirements 2.1, 2.4, 2.6, 3.1, 3.6
const AS_OF = '2024-01-01T00:00:00Z';
const ok = <T>(body: T): Fetched<T> => ({ state: 'ok', body });
const unavailable: Fetched<never> = { state: 'unavailable' };

function pkg(isDeprecated?: boolean) {
  return {
    versions: [
      {
        versionKey: { version: '2.0.0' },
        publishedAt: '2023-12-27T00:00:00Z',
        isDefault: true,
        ...(isDeprecated === undefined ? {} : { isDeprecated }),
      },
    ],
  };
}

const unmaintainedBody = (id: string) => ({
  id,
  summary: 'Crate is unmaintained',
  details: 'The author stopped maintaining it.',
  affected: [{ database_specific: { informational: 'unmaintained' } }],
});

function osvWith(id: string): RawTargetInputs['osv'] {
  return {
    queryResult: { kind: 'ids', ids: [id], truncated: false },
    advisories: new Map([[id, { osv: ok(unmaintainedBody(id)), depsdev: unavailable as Fetched<unknown> }]]),
    unfetchedIds: [],
  };
}

function inputs(overrides: Partial<RawTargetInputs> = {}): RawTargetInputs {
  return {
    ecosystem: 'npm',
    name: 'left-pad',
    versionSpecs: [],
    depsdevPackage: ok(pkg(false)),
    npmLatest: ok({ maintainers: [{ name: 'a' }] }),
    maintainers: ok({ maintainers: [{ name: 'a' }] }),
    osv: { queryResult: { kind: 'ids', ids: [], truncated: false }, advisories: new Map(), unfetchedIds: [] },
    repository: 'no-source-repo',
    webHost: 'github.com',
    ...overrides,
  };
}

describe('assembleFacts hints (resurrect 1.7)', () => {
  it('gives an npm deprecation-notice hint for a deprecated latest body', () => {
    const { hints } = assembleFacts(inputs({ npmLatest: ok({ deprecated: 'Use other-pkg instead' }) }), AS_OF);
    expect(hints).toEqual([{ kind: 'deprecation-notice', text: 'Use other-pkg instead', sourceUrl: null }]);
  });

  it('gives no npm hint when npmLatest is unavailable', () => {
    expect(assembleFacts(inputs({ npmLatest: unavailable }), AS_OF).hints).toEqual([]);
  });

  it('gives no npm hint when latest has no deprecated field, even if deps.dev marks the version deprecated (R2.4)', () => {
    const result = assembleFacts(
      inputs({ name: 'uuid', depsdevPackage: ok(pkg(true)), npmLatest: ok({ maintainers: [{ name: 'a' }] }) }),
      AS_OF,
    );
    expect(result.facts.deprecated).toBe(true);
    expect(result.hints).toEqual([]);
  });

  it('gives a cargo target with an unmaintained advisory one advisory-notice with the advisory URL', () => {
    const result = assembleFacts(
      inputs({
        ecosystem: 'cargo',
        name: 'crate',
        maintainers: ok({ users: [{ kind: 'user', login: 'u' }] }),
        osv: osvWith('RUSTSEC-2025-0141'),
      }),
      AS_OF,
    );
    expect(result.hints).toEqual([
      {
        kind: 'advisory-notice',
        text: 'The author stopped maintaining it.',
        sourceUrl: advisoryUrl('RUSTSEC-2025-0141'),
      },
    ]);
  });

  it('gives an npm target with an unmaintained-looking advisory no advisory-notice', () => {
    const result = assembleFacts(inputs({ osv: osvWith('GHSA-1') }), AS_OF);
    expect(result.hints.filter((h) => h.kind === 'advisory-notice')).toEqual([]);
  });

  it('gives a pypi target no hints', () => {
    const result = assembleFacts(
      inputs({
        ecosystem: 'pypi',
        name: 'pkg',
        npmLatest: ok({ deprecated: 'nope' }),
        maintainers: ok({ ownership: { roles: [{ role: 'Owner', user: 'a' }], organization: null } }),
        osv: osvWith('PYSEC-1'),
      }),
      AS_OF,
    );
    expect(result.hints).toEqual([]);
  });
});
