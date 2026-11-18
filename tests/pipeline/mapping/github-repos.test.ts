import { describe, expect, it } from 'vitest';
import { GRAPHQL_BATCH_SIZE } from '../../../pipeline/constants';
import {
  buildRepositoriesQuery,
  mapGraphqlRepos,
  planGraphqlBatches,
} from '../../../pipeline/mapping/github-repos';
import type { GraphqlBatch } from '../../../pipeline/mapping/types';
import { graphqlBody, repoNode } from '../../support/arbitraries/shapes/ef-17';
import {
  foreignError,
  notFoundError,
  unattributableErrors,
} from '../../support/arbitraries/shapes/ef-19';

const AS_OF = '2024-01-11T00:00:00Z';

function batchOf(n: number): GraphqlBatch {
  return {
    aliases: Array.from({ length: n }, (_, i) => ({
      alias: `r${i}`,
      repo: { owner: `o${i}`, name: `n${i}` },
    })),
  };
}

describe('buildRepositoriesQuery', () => {
  it('uses variables for one alias and requests rateLimit', () => {
    const { query, variables } = buildRepositoriesQuery(batchOf(1).aliases);
    expect(query).toContain('rateLimit { remaining resetAt }');
    expect(query).toContain('r0: repository(owner: $r0Owner, name: $r0Name)');
    expect(query).toContain('$r0Owner: String!');
    expect(variables).toEqual({ r0Owner: 'o0', r0Name: 'n0' });
    expect(query).not.toContain('o0');
  });

  it('builds GRAPHQL_BATCH_SIZE aliases', () => {
    const { query, variables } = buildRepositoriesQuery(batchOf(GRAPHQL_BATCH_SIZE).aliases);
    expect(Object.keys(variables)).toHaveLength(2 * GRAPHQL_BATCH_SIZE);
    expect(query).toContain(`r${GRAPHQL_BATCH_SIZE - 1}: repository(`);
    expect(query).not.toContain(`r${GRAPHQL_BATCH_SIZE}: repository(`);
  });

  it('never interpolates hostile owner text', () => {
    const { query, variables } = buildRepositoriesQuery([
      { alias: 'r0', repo: { owner: '") { x }', name: 'a' } },
    ]);
    expect(query).not.toContain('") { x }');
    expect(variables.r0Owner).toBe('") { x }');
  });
});

describe('planGraphqlBatches', () => {
  it('splits at the batch boundary, sorted, deduplicated case-insensitively', () => {
    const repos = Array.from({ length: GRAPHQL_BATCH_SIZE + 1 }, (_, i) => ({
      owner: 'o',
      name: `n${String(i).padStart(3, '0')}`,
    }));
    repos.push({ owner: 'O', name: 'N000' });
    const batches = planGraphqlBatches([...repos].reverse(), GRAPHQL_BATCH_SIZE);
    expect(batches).toHaveLength(2);
    expect(batches[0]?.aliases).toHaveLength(GRAPHQL_BATCH_SIZE);
    expect(batches[1]?.aliases).toHaveLength(1);
    expect(batches[0]?.aliases[0]).toEqual({ alias: 'r0', repo: { owner: 'O', name: 'N000' } });
    expect(batches[1]?.aliases[0]?.alias).toBe('r0');
    expect(planGraphqlBatches([], 50)).toEqual([]);
  });
});

describe('mapGraphqlRepos', () => {
  const batch = batchOf(2);

  it('maps ok facts by alias name regardless of key order', () => {
    const body = graphqlBody({
      r1: repoNode({ isArchived: true, committedDate: '2024-01-01T00:00:00Z' }),
      r0: repoNode({ isArchived: false, committedDate: '2024-01-10T00:00:00Z' }),
    });
    expect(mapGraphqlRepos(body, batch, AS_OF)).toEqual([
      { alias: 'r0', kind: 'ok', archived: false, daysSinceLastCommit: 1 },
      { alias: 'r1', kind: 'ok', archived: true, daysSinceLastCommit: 10 },
    ]);
  });

  it('maps NOT_FOUND with HTTP 200 and keeps the other alias', () => {
    const body = graphqlBody({ r0: null, r1: repoNode() }, [notFoundError('r0')]);
    const out = mapGraphqlRepos(body, batch, AS_OF);
    expect(out[0]).toEqual({ alias: 'r0', kind: 'not-found' });
    expect(out[1]?.kind).toBe('ok');
  });

  it('fails an alias with a foreign error type and keeps the other', () => {
    const body = graphqlBody({ r0: null, r1: repoNode() }, [foreignError('r0')]);
    const out = mapGraphqlRepos(body, batch, AS_OF);
    expect(out[0]).toEqual({ alias: 'r0', kind: 'failed' });
    expect(out[1]?.kind).toBe('ok');
  });

  it('gives null facts for missing defaultBranchRef and invalid committedDate', () => {
    const body = graphqlBody({
      r0: repoNode({ noBranch: true }),
      r1: repoNode({ committedDate: '2024-01-01' }),
    });
    expect(mapGraphqlRepos(body, batch, AS_OF)).toEqual([
      { alias: 'r0', kind: 'ok', archived: false, daysSinceLastCommit: null },
      { alias: 'r1', kind: 'ok', archived: false, daysSinceLastCommit: null },
    ]);
  });

  it('gives null archived for a non-boolean isArchived', () => {
    const out = mapGraphqlRepos(graphqlBody({ r0: repoNode({ isArchived: 'yes' }), r1: repoNode() }), batch, AS_OF);
    expect(out[0]).toMatchObject({ kind: 'ok', archived: null });
  });

  it('fails every alias for unusable bodies', () => {
    for (const body of [null, 'x', 3, [], {}, { data: null }, { data: [] }]) {
      expect(mapGraphqlRepos(body, batch, AS_OF).map((r) => r.kind)).toEqual(['failed', 'failed']);
    }
  });

  describe('unattributable errors (R11.15)', () => {
    it('ignores them for aliases with a data object', () => {
      const body = graphqlBody({ r0: repoNode({ isArchived: true }), r1: repoNode() });
      const plain = mapGraphqlRepos(body, batch, AS_OF);
      const withErrors = mapGraphqlRepos(
        graphqlBody(body.data as Record<string, unknown>, unattributableErrors()),
        batch,
        AS_OF,
      );
      expect(withErrors).toEqual(plain);
      expect(withErrors.every((r) => r.kind === 'ok')).toBe(true);
    });

    it('fails aliases whose data is null or missing without a NOT_FOUND of their own', () => {
      const body = graphqlBody({ r0: null }, unattributableErrors());
      expect(mapGraphqlRepos(body, batch, AS_OF)).toEqual([
        { alias: 'r0', kind: 'failed' },
        { alias: 'r1', kind: 'failed' },
      ]);
    });

    it('maps an absent key with an own NOT_FOUND to not-found (data object present)', () => {
      const body = graphqlBody({ r1: repoNode() }, [notFoundError('r0')]);
      expect(mapGraphqlRepos(body, batch, AS_OF).map((r) => r.kind)).toEqual(['not-found', 'ok']);
    });

    it('maps no data at all with own NOT_FOUND to not-found, others stay failed', () => {
      for (const data of [undefined, null]) {
        const body = graphqlBody(data, [notFoundError('r0')]);
        expect(mapGraphqlRepos(body, batch, AS_OF)).toEqual([
          { alias: 'r0', kind: 'not-found' },
          { alias: 'r1', kind: 'failed' },
        ]);
      }
    });

    it('still maps an own NOT_FOUND next to unattributable errors', () => {
      const body = graphqlBody({ r0: null, r1: repoNode() }, [
        ...unattributableErrors(),
        notFoundError('r0'),
      ]);
      const out = mapGraphqlRepos(body, batch, AS_OF);
      expect(out.map((r) => r.kind)).toEqual(['not-found', 'ok']);
    });
  });
});
