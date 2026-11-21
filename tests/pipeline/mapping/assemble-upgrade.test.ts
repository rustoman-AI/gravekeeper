import { describe, expect, it } from 'vitest';
import { assembleFacts } from '../../../pipeline/mapping/assemble';
import type { Fetched, RawTargetInputs } from '../../../pipeline/mapping/types';

// Feature: resurrect-upgrade, task 3.8
// Validates: Requirements 2.1, 2.2, 4.1, 4.2
const AS_OF = '2024-01-01T00:00:00Z';
const ok = <T>(body: T): Fetched<T> => ({ state: 'ok', body });

/** deps.dev package: 1.0.0 (deprecated), 2.0.0 default and healthy. */
function pkg(): unknown {
  return {
    versions: [
      {
        versionKey: { version: '1.0.0' },
        publishedAt: '2023-01-01T00:00:00Z',
        isDeprecated: true,
      },
      {
        versionKey: { version: '2.0.0' },
        publishedAt: '2023-12-27T00:00:00Z',
        isDefault: true,
        isDeprecated: false,
      },
    ],
  };
}

function inputs(overrides: Partial<RawTargetInputs> = {}): RawTargetInputs {
  return {
    ecosystem: 'npm',
    name: 'left-pad',
    versionSpecs: ['1.0.0'],
    depsdevPackage: ok(pkg()),
    npmLatest: ok({ version: '2.0.0' }),
    maintainers: ok({ maintainers: [{ name: 'a' }] }),
    osv: { queryResult: { kind: 'ids', ids: [], truncated: false }, advisories: new Map(), unfetchedIds: [] },
    repository: 'no-source-repo',
    webHost: 'github.com',
    ...overrides,
  };
}

const UPGRADE = { version: '2.0.0', basis: 'registry-default' };

describe('assembleFacts upgrade and npm hints (resurrect-upgrade 3.8)', () => {
  it('gives the version hint and the upgrade for a deprecated checked version with a version document', () => {
    const result = assembleFacts(
      inputs({ npmVersion: ok({ version: '1.0.0', deprecated: 'Use v2' }) }),
      AS_OF,
    );
    expect(result.hints).toEqual([{ kind: 'deprecation-notice', text: 'Use v2', sourceUrl: null }]);
    expect(result.upgrade).toEqual(UPGRADE);
  });

  it('gives the /latest hint and the upgrade when there is no version document', () => {
    const result = assembleFacts(
      inputs({ npmLatest: ok({ version: '2.0.0-old', deprecated: 'Latest note' }) }),
      AS_OF,
    );
    expect(result.hints).toEqual([{ kind: 'deprecation-notice', text: 'Latest note', sourceUrl: null }]);
    expect(result.upgrade).toEqual(UPGRADE);
  });

  it('gives the /latest hint and no upgrade when the checked version is the latest', () => {
    const body = {
      versions: [
        {
          versionKey: { version: '2.0.0' },
          publishedAt: '2023-12-27T00:00:00Z',
          isDefault: true,
          isDeprecated: true,
        },
      ],
    };
    const result = assembleFacts(
      inputs({
        versionSpecs: ['2.0.0'],
        depsdevPackage: ok(body),
        npmLatest: ok({ version: '2.0.0', deprecated: 'Gone' }),
      }),
      AS_OF,
    );
    expect(result.hints).toEqual([{ kind: 'deprecation-notice', text: 'Gone', sourceUrl: null }]);
    expect(result.upgrade).toBeNull();
  });

  it.each(['pypi', 'cargo'] as const)('gives a %s target an upgrade without any hint', (ecosystem) => {
    const spec = ecosystem === 'pypi' ? '==1.0.0' : '1.0.0';
    const result = assembleFacts(inputs({ ecosystem, versionSpecs: [spec] }), AS_OF);
    expect(result.hints).toEqual([]);
    expect(result.upgrade).toEqual(UPGRADE);
  });

  it('gives no upgrade when the deps.dev package is unavailable', () => {
    expect(assembleFacts(inputs({ depsdevPackage: { state: 'unavailable' } }), AS_OF).upgrade).toBeNull();
  });
});
