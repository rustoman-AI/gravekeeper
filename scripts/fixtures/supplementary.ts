import { buildRepositoriesQuery, planGraphqlBatches } from '../../pipeline/mapping';
import type { AttemptGate, RequestContext } from '../../pipeline/ports/http';
import type { SourceResult } from '../../pipeline/ports/github-source';
import type { RecordingStack } from './recorder-stack';

// Requirement 23.2 (supplementary recordings of the design: ef8, ef10, ef19)

export interface SupplementarySpec {
  /** Directory name under `tests/fixtures/_supplementary/`. */
  readonly name: string;
  /** Sends the requests of the set through the stack and checks the answers it needs. */
  readonly run: (stack: RecordingStack, ctx: RequestContext, gate: AttemptGate) => Promise<void>;
}

const ALLOW_ALL: AttemptGate = { allow: () => true, observe: () => undefined };

export function supplementaryGate(): AttemptGate {
  return ALLOW_ALL;
}

function expectKind(label: string, result: SourceResult, kind: 'ok' | 'absent'): void {
  if (result.kind !== kind) throw new Error(`${label}: expected ${kind}, got ${result.kind}`);
}

function bodyText(result: SourceResult): string {
  return result.kind === 'ok' ? JSON.stringify(result.body) : '';
}

/** EF-8 withdrawn advisory: OSV detail has `withdrawn`, deps.dev answers 404. */
const EF8_ID = 'GHSA-w2j9-qh3j-4h63';
/** EF-6 withdrawn advisory (2023-10-09) carrying every EF-6 path in one response. */
const EF6_ID = 'GHSA-wq4c-wm6x-jw44';
/** EF-10 informational advisory: OSV `informational` is `unmaintained`, deps.dev has `cvss3Score`. */
const EF10_ID = 'RUSTSEC-2020-0036';

export const SUPPLEMENTARY_SPECS: readonly SupplementarySpec[] = [
  {
    name: 'ef8-withdrawn',
    async run({ sources }, ctx) {
      const osv = await sources.osv.getVulnerability(EF8_ID, ctx);
      expectKind('OSV vulnerability', osv, 'ok');
      if (!bodyText(osv).includes('"withdrawn"')) {
        throw new Error(`OSV no longer reports "withdrawn" for ${EF8_ID}; pick another withdrawn id`);
      }
      expectKind('deps.dev advisory', await sources.depsdev.getAdvisory(EF8_ID, ctx), 'absent');
      // EF-6: a withdrawn advisory that also carries aliases, database_specific, affected[] and severity[].
      const full = await sources.osv.getVulnerability(EF6_ID, ctx);
      expectKind('OSV vulnerability (EF-6)', full, 'ok');
      const text = bodyText(full);
      for (const key of ['"withdrawn"', '"aliases"', '"database_specific"', '"affected"', '"severity"']) {
        if (!text.includes(key)) throw new Error(`OSV ${EF6_ID} no longer has ${key}`);
      }
    },
  },
  {
    name: 'ef2-version-document',
    async run({ sources }, ctx) {
      const result = await sources.depsdev.getVersion('npm', 'lodash', '4.17.21', ctx);
      expectKind('deps.dev version', result, 'ok');
      if (!bodyText(result).includes('"relatedProjects"')) {
        throw new Error('deps.dev version document has no relatedProjects');
      }
    },
  },
  {
    name: 'ef18-rate-limit',
    async run({ sources }, ctx, gate) {
      const query = '{ rateLimit { limit used remaining resetAt cost nodeCount } }';
      const result = await sources.github.queryRepositories(query, {}, ctx, gate);
      expectKind('GraphQL rateLimit', result, 'ok');
      if (!bodyText(result).includes('"nodeCount"')) throw new Error('GraphQL answer has no rateLimit.nodeCount');
    },
  },
  {
    name: 'ef10-informational',
    async run({ sources }, ctx) {
      const osv = await sources.osv.getVulnerability(EF10_ID, ctx);
      expectKind('OSV vulnerability', osv, 'ok');
      if (!bodyText(osv).includes('"unmaintained"')) {
        throw new Error(`OSV does not report informational "unmaintained" for ${EF10_ID}`);
      }
      expectKind('deps.dev advisory', await sources.depsdev.getAdvisory(EF10_ID, ctx), 'ok');
    },
  },
  {
    name: 'ef19-not-found-alias',
    async run({ sources }, ctx, gate) {
      const batches = planGraphqlBatches(
        [
          { owner: 'ajeetdsouza', name: 'zoxide' },
          { owner: 'gravekeeper-no-such-owner', name: 'no-such-repository' },
        ],
        2,
      );
      const batch = batches[0];
      if (batch === undefined) throw new Error('no GraphQL batch planned');
      const { query, variables } = buildRepositoriesQuery(batch.aliases);
      const result = await sources.github.queryRepositories(query, variables, ctx, gate);
      expectKind('GraphQL repositories', result, 'ok');
      if (!bodyText(result).includes('"NOT_FOUND"')) {
        throw new Error('GraphQL answer has no NOT_FOUND error for the nonexistent alias');
      }
    },
  },
];
