// Requirement 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.9, 11.12, 11.14, 11.15
import { compareCodePoints } from './compare-code-points';
import { dayCount } from './day-count';
import { readOwn } from './read-own';
import type { GraphqlAlias, GraphqlBatch, GraphqlRepoResult, SourceRepo } from './types';

const REPOSITORY_FIELDS =
  'nameWithOwner isArchived isDisabled pushedAt defaultBranchRef { name target { oid ... on Commit { committedDate } } }';

/**
 * Builds the GraphQL request of one batch (EF-17, EF-18). Owner and name are
 * passed as variables (`<alias>Owner`, `<alias>Name`), never interpolated into
 * the query text. `rateLimit` is requested in every request.
 */
export function buildRepositoriesQuery(batch: readonly GraphqlAlias[]): {
  query: string;
  variables: Record<string, string>;
} {
  const variables: Record<string, string> = {};
  const declarations: string[] = [];
  const selections: string[] = [];
  for (const { alias, repo } of batch) {
    const ownerVar = `${alias}Owner`;
    const nameVar = `${alias}Name`;
    variables[ownerVar] = repo.owner;
    variables[nameVar] = repo.name;
    declarations.push(`$${ownerVar}: String!`, `$${nameVar}: String!`);
    selections.push(
      `${alias}: repository(owner: $${ownerVar}, name: $${nameVar}) { ${REPOSITORY_FIELDS} }`,
    );
  }
  const head = declarations.length > 0 ? `query(${declarations.join(', ')})` : 'query';
  const query = `${head} { rateLimit { remaining resetAt } ${selections.join(' ')} }`;
  return { query, variables };
}

function sortKey(repo: SourceRepo): string {
  return `github.com/${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}`;
}

/**
 * Splits the distinct Source_Repos (case-insensitive, first spelling kept) into
 * batches of at most `batchSize` aliases `r0`, `r1`, ..., ordered by ascending
 * lowercase `github.com/<owner>/<repo>` in code point order.
 */
export function planGraphqlBatches(
  repos: readonly SourceRepo[],
  batchSize: number,
): readonly GraphqlBatch[] {
  const size = Number.isFinite(batchSize) && batchSize >= 1 ? Math.floor(batchSize) : 1;
  const distinct = new Map<string, SourceRepo>();
  for (const repo of repos) {
    const key = sortKey(repo);
    if (!distinct.has(key)) distinct.set(key, repo);
  }
  const keys = [...distinct.keys()].sort(compareCodePoints);
  const batches: GraphqlBatch[] = [];
  for (let start = 0; start < keys.length; start += size) {
    const aliases: GraphqlAlias[] = keys.slice(start, start + size).map((key, index) => ({
      alias: `r${index}`,
      repo: distinct.get(key) as SourceRepo,
    }));
    batches.push({ aliases });
  }
  return batches;
}

function isObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

function readErrors(body: unknown): readonly unknown[] {
  const errors = readOwn(body, 'errors');
  if (!Array.isArray(errors)) return [];
  try {
    return Array.from(errors as unknown[]);
  } catch {
    return [];
  }
}

/** First path element of an error when it is a string, else null. */
function errorAlias(error: unknown): string | null {
  const path = readOwn(error, 'path');
  if (!Array.isArray(path)) return null;
  const first: unknown = readOwn(path, '0');
  return typeof first === 'string' ? first : null;
}

function isExactAliasPath(error: unknown, alias: string): boolean {
  const path = readOwn(error, 'path');
  return Array.isArray(path) && path.length === 1 && readOwn(path, '0') === alias;
}

/**
 * Maps one GraphQL answer to a result per alias of `batch`, matched by alias
 * name (EF-17, EF-19). Total: never throws, never reads the clock.
 */
export function mapGraphqlRepos(
  body: unknown,
  batch: GraphqlBatch,
  asOf: string,
): readonly GraphqlRepoResult[] {
  const results: GraphqlRepoResult[] = [];
  try {
    const bodyIsObject = isObject(body) && !Array.isArray(body);
    const data: unknown = bodyIsObject ? readOwn(body, 'data') : undefined;
    const dataIsObject = isObject(data) && !Array.isArray(data);
    const errors = bodyIsObject ? readErrors(body) : [];

    for (const { alias } of batch.aliases) {
      if (!bodyIsObject) {
        results.push({ alias, kind: 'failed' });
        continue;
      }
      const aliasErrors = errors.filter((e) => errorAlias(e) === alias);
      const foreign = aliasErrors.some((e) => readOwn(e, 'type') !== 'NOT_FOUND');
      if (foreign) {
        results.push({ alias, kind: 'failed' });
        continue;
      }
      const node: unknown = dataIsObject ? readOwn(data, alias) : undefined;
      const notFound =
        (node === null || (dataIsObject === false && node === undefined)) &&
        aliasErrors.some((e) => readOwn(e, 'type') === 'NOT_FOUND' && isExactAliasPath(e, alias));
      if (notFound) {
        results.push({ alias, kind: 'not-found' });
        continue;
      }
      if (!dataIsObject) {
        results.push({ alias, kind: 'failed' });
        continue;
      }
      if (node === null || node === undefined) {
        // Requirement 11.15: no data for the alias and no NOT_FOUND of its own.
        results.push({ alias, kind: 'failed' });
        continue;
      }
      const nodeIsObject = isObject(node) && !Array.isArray(node);
      const isArchived: unknown = nodeIsObject ? readOwn(node, 'isArchived') : undefined;
      const branch: unknown = nodeIsObject ? readOwn(node, 'defaultBranchRef') : undefined;
      const target: unknown = isObject(branch) ? readOwn(branch, 'target') : undefined;
      const committedDate: unknown = isObject(target) ? readOwn(target, 'committedDate') : undefined;
      results.push({
        alias,
        kind: 'ok',
        archived: typeof isArchived === 'boolean' ? isArchived : null,
        daysSinceLastCommit: dayCount(committedDate, asOf),
      });
    }
  } catch {
    return batch.aliases.map(({ alias }) => ({ alias, kind: 'failed' as const }));
  }
  return results;
}
