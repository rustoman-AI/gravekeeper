import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GRAPHQL_BATCH_SIZE } from '../../../pipeline/constants';
import { mapGraphqlRepos, planGraphqlBatches } from '../../../pipeline/mapping/github-repos';
import type { GraphqlBatch } from '../../../pipeline/mapping/types';
import { cfg } from '../../support/fc-config';
import {
  arbInvalidDate,
  arbNonBoolean,
  arbValidDate,
  graphqlBody,
  rawNode,
} from '../../support/arbitraries/shapes/ef-17';
import { arbUnattributableError, notFoundError } from '../../support/arbitraries/shapes/ef-19';

const AS_OF = '2024-06-01T00:00:00Z';
const ALIAS = 'r0';
const BATCH: GraphqlBatch = { aliases: [{ alias: ALIAS, repo: { owner: 'o', name: 'n' } }] };

const arbPart = fc.stringMatching(/^[A-Za-z0-9._-]{1,4}$/);
const arbRepo = fc.record({ owner: arbPart, name: arbPart });

function lower(r: { owner: string; name: string }): string {
  return `${r.owner.toLowerCase()}/${r.name.toLowerCase()}`;
}

describe('github-repos properties', () => {
  // Feature: scan-pipeline, Property 33: archived and daysSinceLastCommit are independent
  // Validates: Requirements 11.11
  it('P33 archived and daysSinceLastCommit are null independently of each other', () => {
    const arbArchived = fc.oneof(fc.boolean(), arbNonBoolean);
    const arbDate = fc.oneof(
      arbValidDate.map((d) => ({ d, valid: true })),
      arbInvalidDate.map((d) => ({ d, valid: false })),
    );
    fc.assert(
      fc.property(arbArchived, arbDate, (isArchived, { d: date, valid: dateIsValid }) => {
        const body = graphqlBody({ [ALIAS]: rawNode(isArchived, date) });
        const [r] = mapGraphqlRepos(body, BATCH, AS_OF);
        expect(r?.kind).toBe('ok');
        if (r?.kind !== 'ok') return;
        expect(r.archived).toBe(typeof isArchived === 'boolean' ? isArchived : null);
                if (dateIsValid) {
          expect(r.daysSinceLastCommit).not.toBeNull();
          expect(r.daysSinceLastCommit).toBeGreaterThanOrEqual(0);
        } else {
          expect(r.daysSinceLastCommit).toBeNull();
        }
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 34: GraphQL batching covers each source repository once
  // Validates: Requirements 11.14
  it('P34 batches cover each distinct repository once, in bounded batches with r0.. aliases', () => {
    const arbList = fc
      .array(arbRepo, { maxLength: 3 * GRAPHQL_BATCH_SIZE + 5 })
      .chain((repos) => {
        const variants = repos.flatMap((r) => [
          r,
          { owner: r.owner.toUpperCase(), name: r.name.toLowerCase() },
        ]);
        return fc
          .tuple(
            fc.shuffledSubarray(variants, { minLength: variants.length, maxLength: variants.length }),
            fc.shuffledSubarray(variants, { minLength: variants.length, maxLength: variants.length }),
          )
          .map(([a, b]) => ({ a, b }));
      });
    fc.assert(
      fc.property(arbList, ({ a, b }) => {
        const distinct = new Set(a.map(lower));
        for (const list of [a, b]) {
          const batches = planGraphqlBatches(list, GRAPHQL_BATCH_SIZE);
          expect(batches).toHaveLength(Math.ceil(distinct.size / GRAPHQL_BATCH_SIZE));
          const seen: string[] = [];
          for (const batch of batches) {
            expect(batch.aliases.length).toBeGreaterThan(0);
            expect(batch.aliases.length).toBeLessThanOrEqual(GRAPHQL_BATCH_SIZE);
            batch.aliases.forEach((x, i) => {
              expect(x.alias).toBe(`r${i}`);
              seen.push(lower(x.repo));
            });
          }
          expect(seen).toHaveLength(distinct.size);
          expect(new Set(seen)).toEqual(distinct);
        }
        // permutation gives the same plan keys in the same order
        const ka = planGraphqlBatches(a, GRAPHQL_BATCH_SIZE).map((x) => x.aliases.map((y) => lower(y.repo)));
        const kb = planGraphqlBatches(b, GRAPHQL_BATCH_SIZE).map((x) => x.aliases.map((y) => lower(y.repo)));
        expect(kb).toEqual(ka);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 75: Unattributable GraphQL errors do not change alias outcomes
  // Validates: Requirements 11.16
  it('P75 unattributable errors leave every alias outcome unchanged', () => {
    const arbAlias = fc.oneof(
      fc.record({
        kind: fc.constant('node' as const),
        archived: fc.oneof(fc.boolean(), arbNonBoolean),
        date: fc.oneof(arbValidDate, arbInvalidDate),
      }),
      // 'nfmissing': key absent from data with an own NOT_FOUND. User-approved
      // behaviour change (task 1.52): maps to not-found, same as null + NOT_FOUND (11.5).
      fc.record({
        kind: fc.constantFrom('null' as const, 'missing' as const, 'notfound' as const, 'nfmissing' as const),
      }),
    );
    fc.assert(
      fc.property(
        fc.array(arbAlias, { minLength: 1, maxLength: 6 }),
        fc.array(arbUnattributableError, { minLength: 1, maxLength: 5 }),
        (specs, extra) => {
          const batch: GraphqlBatch = {
            aliases: specs.map((_, i) => ({ alias: `r${i}`, repo: { owner: 'o', name: `n${i}` } })),
          };
          const data: Record<string, unknown> = {};
          const own: unknown[] = [];
          specs.forEach((s, i) => {
            const alias = `r${i}`;
            if (s.kind === 'node') data[alias] = rawNode(s.archived, s.date);
            else if (s.kind === 'null') data[alias] = null;
            else if (s.kind === 'notfound') {
              data[alias] = null;
              own.push(notFoundError(alias));
            } else if (s.kind === 'nfmissing') own.push(notFoundError(alias));
          });
          const base = mapGraphqlRepos(graphqlBody(data, own.length > 0 ? own : undefined), batch, AS_OF);
          const withExtra = mapGraphqlRepos(graphqlBody(data, [...own, ...extra]), batch, AS_OF);
          expect(withExtra).toEqual(base);
          specs.forEach((s, i) => {
            const r = withExtra[i];
            if (s.kind === 'node') expect(r?.kind).toBe('ok');
            else if (s.kind === 'notfound' || s.kind === 'nfmissing') expect(r?.kind).toBe('not-found');
            else expect(r?.kind).toBe('failed');
          });
        },
      ),
      cfg(),
    );
  });
});
