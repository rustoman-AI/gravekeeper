import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { assembleFacts } from '../../../pipeline/mapping/assemble';
import type { Fetched, GraphqlRepoResult, RawTargetInputs } from '../../../pipeline/mapping/types';
import { cfg } from '../../support/fc-config';

const ECOSYSTEMS = ['npm', 'pypi', 'cargo'] as const;
const FACT_KEYS = [
  'archived',
  'daysSinceLastCommit',
  'daysSinceLastRelease',
  'deprecated',
  'maintainerCount',
  'maxSeverity',
  'openVulnerabilityCount',
];

const MIN_MS = Date.UTC(2015, 0, 1);
const MAX_MS = Date.UTC(2025, 0, 1);
const isoArb = fc.integer({ min: MIN_MS, max: MAX_MS }).map((ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z'));

const junk = fc.jsonValue({ maxDepth: 3 });
const nameArb = fc.stringMatching(/^[a-z][a-z0-9_-]{0,8}$/);
const versionArb = fc.stringMatching(/^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{1,2}$/);

const versionEntry = fc.record(
  {
    versionKey: fc.record({ version: fc.oneof(versionArb, junk) }),
    publishedAt: fc.oneof(isoArb, junk),
    isDefault: fc.oneof(fc.boolean(), junk),
    isDeprecated: fc.oneof(fc.boolean(), junk),
  },
  { requiredKeys: [] },
);
const depsdevBody = fc.oneof(
  fc.record({ versions: fc.array(versionEntry, { maxLength: 5 }) }),
  junk,
);
const npmBody = fc.oneof(
  fc.record(
    {
      deprecated: fc.oneof(fc.string(), fc.boolean(), junk),
      maintainers: fc.array(fc.record({ name: fc.string({ maxLength: 3 }) }), { maxLength: 4 }),
    },
    { requiredKeys: [] },
  ),
  junk,
);
const cratesBody = fc.oneof(
  fc.record({
    users: fc.array(
      fc.record({
        kind: fc.constantFrom('user', 'team'),
        login: fc.string({ maxLength: 3 }),
      }),
      { maxLength: 4 },
    ),
  }),
  junk,
);
const pypiBody = fc.oneof(
  fc.record({
    ownership: fc.record({
      roles: fc.array(fc.record({ user: fc.string({ maxLength: 3 }) }), { maxLength: 4 }),
    }),
  }),
  junk,
);

function fetched<T>(body: fc.Arbitrary<T>): fc.Arbitrary<Fetched<T>> {
  return fc.oneof(
    { weight: 6, arbitrary: body.map((b): Fetched<T> => ({ state: 'ok', body: b })) },
    { weight: 1, arbitrary: fc.constant<Fetched<T>>({ state: 'absent' }) },
    { weight: 1, arbitrary: fc.constant<Fetched<T>>({ state: 'unavailable' }) },
  );
}

const informationalValue = fc.constantFrom('unmaintained', 'unsound', 'notice', 'other');
const osvBody = (id: string) =>
  fc.record(
    {
      id: fc.constant(id),
      aliases: fc.array(fc.constantFrom('A1', 'A2', 'A3'), { maxLength: 2 }),
      withdrawn: fc.oneof(isoArb, fc.constant('')),
      affected: fc.array(
        fc.record(
          {
            database_specific: fc.record(
              { informational: fc.oneof(informationalValue, junk) },
              { requiredKeys: [] },
            ),
          },
          { requiredKeys: [] },
        ),
        { maxLength: 3 },
      ),
    },
    { requiredKeys: ['id'] },
  );

const IDS = ['I0', 'I1', 'I2', 'I3', 'I4', 'I5'];

const osvArb: fc.Arbitrary<RawTargetInputs['osv']> = fc
  .record({
    query: fc.oneof(
      fc.constant<'unavailable'>('unavailable'),
      fc.record({
        kind: fc.constant<'ids'>('ids'),
        ids: fc.uniqueArray(fc.constantFrom(...IDS), { maxLength: 6 }),
        truncated: fc.boolean(),
      }),
    ),
    unfetchedIds: fc.uniqueArray(fc.constantFrom(...IDS), { maxLength: 3 }),
    bodies: fc.tuple(
      ...IDS.map((id) =>
        fc.oneof(
          { weight: 5, arbitrary: fetched(osvBody(id)) },
          { weight: 1, arbitrary: fetched(junk) },
          { weight: 1, arbitrary: fc.constant<undefined>(undefined) },
        ),
      ),
    ),
    depsdev: fc.oneof(
      fc.constant<Fetched<unknown>>({ state: 'unavailable' }),
      fc.record({ score: fc.double({ min: 0, max: 10, noNaN: true }) }).map(
        (b): Fetched<unknown> => ({ state: 'ok', body: { cvssV3Score: b.score } }),
      ),
    ),
  })
  .map(({ query, unfetchedIds, bodies, depsdev }) => {
    const advisories = new Map<string, { osv: Fetched<unknown>; depsdev: Fetched<unknown> }>();
    bodies.forEach((b, i) => {
      if (b !== undefined) advisories.set(IDS[i] as string, { osv: b, depsdev });
    });
    return { queryResult: query, advisories, unfetchedIds };
  });

const repoResult: fc.Arbitrary<GraphqlRepoResult> = fc.oneof(
  fc.record({
    alias: fc.constant('r0'),
    kind: fc.constant<'ok'>('ok'),
    archived: fc.oneof(fc.boolean(), fc.constant(null)),
    daysSinceLastCommit: fc.oneof(fc.nat({ max: 5000 }), fc.constant(null)),
  }),
  fc.constant<GraphqlRepoResult>({ alias: 'r0', kind: 'not-found' }),
  fc.constant<GraphqlRepoResult>({ alias: 'r0', kind: 'failed' }),
);

const rawInputs: fc.Arbitrary<RawTargetInputs> = fc.record({
  ecosystem: fc.constantFrom(...ECOSYSTEMS),
  name: nameArb,
  versionSpecs: fc.array(fc.oneof(versionArb, fc.string({ maxLength: 6 })), { maxLength: 3 }),
  depsdevPackage: fetched<unknown>(depsdevBody),
  npmLatest: fetched<unknown>(npmBody),
  maintainers: fetched<unknown>(fc.oneof(npmBody, cratesBody, pypiBody)),
  osv: osvArb,
  repository: fc.oneof(
    fc.constant<'no-source-repo'>('no-source-repo'),
    fetched(repoResult),
  ),
  webHost: fc.constant('github.com'),
});

const isCount = (v: unknown): boolean => v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0);
const isBoolOrNull = (v: unknown): boolean => v === null || typeof v === 'boolean';

describe('assembleFacts properties', () => {
  it('P37: Assembled facts have the declared types', () => {
    // Feature: scan-pipeline, Property 37: Assembled facts have the declared types
    // Validates: Requirements 13.11
    fc.assert(
      fc.property(rawInputs, isoArb, (raw, asOf) => {
        const { facts } = assembleFacts(raw, asOf);
        expect(Object.keys(facts).sort()).toEqual(FACT_KEYS);
        expect(isCount(facts.daysSinceLastRelease)).toBe(true);
        expect(isCount(facts.daysSinceLastCommit)).toBe(true);
        expect(isCount(facts.openVulnerabilityCount)).toBe(true);
        expect(isCount(facts.maintainerCount)).toBe(true);
        expect(isBoolOrNull(facts.archived)).toBe(true);
        expect(isBoolOrNull(facts.deprecated)).toBe(true);
        expect([null, 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(facts.maxSeverity);
      }),
      cfg(),
    );
  });

  it('P38: Assembly is deterministic', () => {
    // Feature: scan-pipeline, Property 38: Assembly is deterministic
    // Validates: Requirements 13.13
    fc.assert(
      fc.property(rawInputs, isoArb, (raw, asOf) => {
        expect(assembleFacts(raw, asOf)).toEqual(assembleFacts(raw, asOf));
      }),
      cfg(),
    );
  });

  it('P26: Unmaintained advisories set deprecated for crates', () => {
    // Feature: scan-pipeline, Property 26: Unmaintained advisories set deprecated for crates
    // Validates: Requirements 9.22
    const advisoryKind = fc.constantFrom('unmaintained', 'unsound', 'notice', 'other', 'none');
    const advisory = fc.record({
      kind: advisoryKind,
      withdrawn: fc.boolean(),
      fetched: fc.constantFrom('ok', 'ok', 'ok', 'unavailable', 'absent'),
    });
    const scenario = fc.record({
      ecosystem: fc.constantFrom(...ECOSYSTEMS),
      initial: fc.constantFrom(true, false, undefined),
      list: fc.array(advisory, { maxLength: 5 }),
      extraEntry: fc.boolean(),
    });

    fc.assert(
      fc.property(scenario, isoArb, ({ ecosystem, initial, list, extraEntry }, asOf) => {
        const advisories = new Map<string, { osv: Fetched<unknown>; depsdev: Fetched<unknown> }>();
        const ids: string[] = [];
        let expectNote = false;
        list.forEach((a, i) => {
          const id = `ID${i}`;
          ids.push(id);
          const affected =
            a.kind === 'none'
              ? [{ database_specific: {} }]
              : [{ database_specific: { informational: a.kind } }];
          const body = {
            id,
            ...(extraEntry ? { affected: [{ database_specific: { informational: 'unsound' } }, ...affected] } : { affected }),
            ...(a.withdrawn ? { withdrawn: '2023-01-01T00:00:00Z' } : {}),
          };
          const osv: Fetched<unknown> =
            a.fetched === 'ok' ? { state: 'ok', body } : { state: a.fetched as 'unavailable' | 'absent' };
          advisories.set(id, { osv, depsdev: { state: 'unavailable' } });
          if (a.fetched === 'ok' && !a.withdrawn && a.kind === 'unmaintained') expectNote = true;
        });
        expectNote = expectNote && ecosystem === 'cargo';

        const versions = [
          {
            versionKey: { version: '1.0.0' },
            publishedAt: '2023-12-27T00:00:00Z',
            isDefault: true,
            ...(initial === undefined ? {} : { isDeprecated: initial }),
          },
        ];
        const common = {
          ecosystem,
          name: 'pkg',
          versionSpecs: [],
          depsdevPackage: { state: 'ok', body: { versions } } as Fetched<unknown>,
          npmLatest: { state: 'unavailable' } as Fetched<unknown>,
          maintainers: { state: 'unavailable' } as Fetched<unknown>,
          repository: 'no-source-repo' as const,
          webHost: 'github.com',
        };
        const withOsv: RawTargetInputs = {
          ...common,
          osv: { queryResult: { kind: 'ids', ids, truncated: false }, advisories, unfetchedIds: [] },
        };
        const withoutOsv: RawTargetInputs = {
          ...common,
          osv: { queryResult: 'unavailable', advisories: new Map(), unfetchedIds: [] },
        };

        const initialDeprecated = assembleFacts(withoutOsv, asOf).facts.deprecated;
        expect(initialDeprecated).toBe(initial ?? null);

        const { facts, notes } = assembleFacts(withOsv, asOf);
        expect(facts.deprecated).toBe(expectNote ? true : initialDeprecated);
        expect(notes.some((n) => n.code === 'unmaintained-advisory')).toBe(expectNote);
      }),
      cfg(),
    );
  });
});

describe('assembleFacts advisories properties', () => {
  it('P10: Assembled advisories mirror the OSV ids, are deterministic and do not mutate the input', () => {
    // Feature: scan-accuracy, Property 10: Advisory entries mirror the OSV ids
    // Validates: Requirements 6.1, 6.9, 6.10
    fc.assert(
      fc.property(rawInputs, isoArb, (raw, asOf) => {
        const before = structuredClone(raw);
        const first = assembleFacts(raw, asOf);
        expect(raw).toEqual(before);
        expect(assembleFacts(raw, asOf)).toEqual(first);
        expect(Array.isArray(first.advisories)).toBe(true);
        const query = raw.osv.queryResult;
        const usable =
          raw.depsdevPackage.state === 'ok' &&
          query !== 'unavailable' &&
          query.kind === 'ids' &&
          first.selection.selected !== null;
        if (!usable) {
          expect(first.advisories).toEqual([]);
          return;
        }
        const wanted = [...new Set([...query.ids, ...raw.osv.unfetchedIds])].sort();
        expect(first.advisories.map((a) => a.id)).toEqual(wanted);
        for (const a of first.advisories) expect(a.aliases).not.toContain(a.id);
      }),
      cfg(),
    );
  });
});
