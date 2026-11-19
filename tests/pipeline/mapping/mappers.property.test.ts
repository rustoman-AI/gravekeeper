import * as fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  assembleFacts,
  discoverManifests,
  mapCratesOwners,
  mapDepsDevAdvisory,
  mapDepsDevPackage,
  mapDepsDevVersion,
  mapDepsDevVersionBatch,
  mapGraphqlRepos,
  mapNpmLatest,
  mapOsvAdvisory,
  mapOsvQueryBatch,
  mapPypiOwnership,
  readCommitSha,
  readGraphqlRateLimit,
  readRepository,
  readRestRateLimit,
} from '../../../pipeline/mapping';
import type {
  DiscoveryLimits,
  Fetched,
  GraphqlBatch,
  RawTargetInputs,
} from '../../../pipeline/mapping';
import { arbJson } from '../../support/arbitraries/json';
import { applyMutation, arbMutated } from '../../support/arbitraries/mutate';
import type { JsonPath } from '../../support/arbitraries/mutate';
import { ef1Body, ef1Version } from '../../support/arbitraries/shapes/ef-1';
import { graphqlBody, repoNode } from '../../support/arbitraries/shapes/ef-17';
import { notFoundError } from '../../support/arbitraries/shapes/ef-19';
import { ef2Body, ef2Project } from '../../support/arbitraries/shapes/ef-2';
import { ef3Body, ef3Response } from '../../support/arbitraries/shapes/ef-3';
import { osvBatchBody, osvResult } from '../../support/arbitraries/shapes/ef-5';
import { osvAdvisoryBody } from '../../support/arbitraries/shapes/ef-6';
import { ENDPOINT_FACT_MAP } from '../../support/endpoint-fact-map';
import { cfg } from '../../support/fc-config';
import { MAPPERS } from '../../support/mapper-registry';

// ---------------------------------------------------------------------------
// Structural helpers: snapshot (own keys, descriptors, -0, NaN) and deep copy
// ---------------------------------------------------------------------------

/** Serialization that tells apart -0 and 0, keeps NaN, own `__proto__` keys and descriptor flags. */
function snapshot(value: unknown, depth = 0): string {
  if (depth > 1000) return '<too deep>';
  switch (typeof value) {
    case 'number':
      return Object.is(value, -0) ? 'n:-0' : `n:${String(value)}`;
    case 'string':
      return `s:${JSON.stringify(value)}`;
    case 'object': {
      if (value === null) return 'null';
      const tag = Array.isArray(value) ? 'A' : Object.getPrototypeOf(value) === null ? 'N' : 'O';
      const parts: string[] = [];
      for (const key of Reflect.ownKeys(value)) {
        const d = Object.getOwnPropertyDescriptor(value, key);
        const name = typeof key === 'symbol' ? key.toString() : JSON.stringify(key);
        const flags = d === undefined ? '?' : `${d.enumerable ? 'e' : '-'}${d.writable ? 'w' : '-'}${d.configurable ? 'c' : '-'}`;
        const content = d !== undefined && 'value' in d ? snapshot(d.value, depth + 1) : 'accessor';
        parts.push(`${name}${flags}=${content}`);
      }
      return `${tag}{${parts.join(',')}}`;
    }
    default:
      return `${typeof value}:${String(value)}`;
  }
}

/** Deep copy that keeps property descriptors (accessors are shared, so a throwing getter still throws). */
function deepCopy(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const out: object = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype);
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (d === undefined) continue;
    if ('value' in d) d.value = deepCopy(d.value);
    Object.defineProperty(out, key, d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbIso: fc.Arbitrary<string> = fc
  .date({ min: new Date('2015-01-01T00:00:00Z'), max: new Date('2025-01-01T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z'));

const ISO_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

/** Strings that are not ISO 8601 UTC timestamps: wrong shape, or a shape-correct calendar impossibility. */
const arbInvalidAsOf: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 30 }).filter((s) => !ISO_SHAPE.test(s)),
  fc.constantFrom(
    '',
    'not a date',
    '2024-02-30T00:00:00Z',
    '2024-13-01T00:00:00Z',
    '2024-00-10T00:00:00Z',
    '2024-01-01T25:00:00Z',
    '2024-01-01T00:60:00Z',
    '2024-01-01',
    '2024-01-01T00:00:00',
    '2024-01-01T00:00:00+01:00',
    ' 2024-01-01T00:00:00Z',
  ),
  arbIso.map((s) => s.slice(0, -1)),
  arbIso.map((s) => s.toLowerCase()),
);

interface AsOfCase {
  readonly asOf: string;
  readonly valid: boolean;
}

/** An asOf string, tagged with whether it is a valid ISO 8601 UTC timestamp by construction. */
const arbAsOf: fc.Arbitrary<AsOfCase> = fc.oneof(
  arbIso.map((asOf): AsOfCase => ({ asOf, valid: true })),
  arbInvalidAsOf.map((asOf): AsOfCase => ({ asOf, valid: false })),
);

const CVSS_VECTORS = [
  'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
  'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N',
  'CVSS:3.0/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N',
] as const;

/** One valid body that every Mapper of the registry can read at once (disjoint top-level keys). */
const arbOmnibus: fc.Arbitrary<Record<string, unknown>> = fc
  .tuple(arbIso, arbIso, arbIso)
  .map(([published, other, committed]) =>
    Object.assign(
      {},
      ef1Body([
        ef1Version({ version: '1.0.0', publishedAt: published, isDefault: true, isDeprecated: false }),
        ef1Version({ version: '0.9.0', publishedAt: other, isDefault: false, isDeprecated: true }),
      ]) as Record<string, unknown>,
      ef2Body([ef2Project('github.com/o/n')]),
      ef3Body([ef3Response({ system: 'NPM', name: 'a', version: '1.0.0' }, [ef2Project('github.com/o/n')])]) as Record<string, unknown>,
      osvBatchBody([osvResult(['GHSA-1'])]) as Record<string, unknown>,
      osvAdvisoryBody('GHSA-0', {
        aliases: ['CVE-1'],
        withdrawn: 'x',
        informational: 'unmaintained',
        databaseSeverity: 'HIGH',
        cvss: [CVSS_VECTORS[0]],
      }),
      {
        data: {
          r0: repoNode({ committedDate: committed }),
          r1: repoNode({ isArchived: true }),
          rateLimit: { remaining: 10, resetAt: committed },
        },
        tree: [{ path: 'package.json', type: 'blob', sha: 'a'.repeat(40), size: 10 }],
        truncated: false,
        cvss3Score: 7,
        maintainers: [{ name: 'a', email: 'a@b.c' }],
        deprecated: 'x',
        users: [{ login: 'a', kind: 'user' }],
        ownership: { roles: [{ role: 'Owner', user: 'a' }], organization: null },
        commit: { sha: 'b'.repeat(40) },
        full_name: 'o/n',
        default_branch: 'main',
        private: false,
      },
    ),
  );

// ---------------------------------------------------------------------------
// Property 16
// ---------------------------------------------------------------------------

describe('Mapper registry properties', () => {
  const clock = {
    now: vi.spyOn(Date, 'now'),
    random: vi.spyOn(Math, 'random'),
    perf: vi.spyOn(performance, 'now'),
  };
  beforeAll(() => {
    clock.now.mockClear();
  });
  afterAll(() => {
    clock.now.mockRestore();
    clock.random.mockRestore();
    clock.perf.mockRestore();
  });

  const arbP16Json: fc.Arbitrary<unknown> = fc.oneof(
    { weight: 5, arbitrary: arbJson },
    { weight: 3, arbitrary: arbMutated(arbOmnibus).map((m) => m.mutated) },
    { weight: 1, arbitrary: arbOmnibus },
  );

  describe('P16: Every Mapper is total, typed and non-mutating', () => {
    // Feature: scan-pipeline, Property 16: Every Mapper is total, typed and non-mutating
    // Validates: Requirements 8.11, 9.16, 9.19, 10.8, 11.10, 12.8, 13.10, 13.15
    for (const entry of MAPPERS) {
      for (const variant of entry.variants) {
        it(`P16 ${entry.name} (${variant.label}) is total, typed, clock-free and non-mutating`, () => {
          fc.assert(
            fc.property(arbP16Json, arbAsOf, (json, { asOf, valid }) => {
              const before = snapshot(json);
              clock.now.mockClear();
              clock.random.mockClear();
              clock.perf.mockClear();
              const first = variant.call(json, asOf); // must not throw
              expect(clock.now).not.toHaveBeenCalled();
              expect(clock.random).not.toHaveBeenCalled();
              expect(clock.perf).not.toHaveBeenCalled();

              expect(entry.validate(first)).toBe(true);
              expect(snapshot(json)).toBe(before);

              const copy = deepCopy(json);
              expect(snapshot(copy)).toBe(before);
              const second = variant.call(copy, asOf);
              expect(snapshot(second)).toBe(snapshot(first));
              expect(snapshot(copy)).toBe(before);

              if (!valid && entry.dayCountFacts !== undefined) {
                expect(entry.dayCountFacts(first).every((fact) => fact === null)).toBe(true);
              }
            }),
            cfg(),
          );
        });
      }
    }

    it('P16 day-count facts are null for an invalid asOf and non-null for a valid asOf on a valid body', () => {
      const withDayCounts = MAPPERS.filter((e) => e.dayCountFacts !== undefined);
      expect(withDayCounts.length).toBeGreaterThan(0);
      fc.assert(
        fc.property(arbOmnibus, arbInvalidAsOf, arbIso, (body, invalid, valid) => {
          for (const entry of withDayCounts) {
            for (const variant of entry.variants) {
              const facts = (entry.dayCountFacts as (v: unknown) => readonly unknown[])(variant.call(body, invalid));
              expect(facts.every((fact) => fact === null)).toBe(true);
              const known = (entry.dayCountFacts as (v: unknown) => readonly unknown[])(variant.call(body, valid));
              expect(known.length).toBeGreaterThan(0);
              expect(known.every((fact) => typeof fact === 'number')).toBe(true);
            }
          }
        }),
        cfg(),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Property 17
// ---------------------------------------------------------------------------

const ASOF = '2025-06-01T00:00:00Z';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * Concrete JSON paths of an Endpoint_Fact_Map path in `node`. `a[]` inside a
 * path visits every element; as the last segment it names the array field
 * itself. `rN` matches every GraphQL alias. Header names are lowercase keys.
 */
function expand(node: unknown, segments: readonly string[], prefix: JsonPath): JsonPath[] {
  const [head, ...rest] = segments;
  if (head === undefined) return [prefix];
  if (!isObject(node)) return [];
  const last = rest.length === 0;
  if (head === 'rN') {
    return Object.keys(node)
      .filter((key) => /^r\d+$/.test(key))
      .flatMap((key) => (last ? [[...prefix, key]] : expand(node[key], rest, [...prefix, key])));
  }
  const each = head.endsWith('[]');
  const base = each ? head.slice(0, -2) : head;
  const name = prefix.length === 1 && prefix[0] === 'headers' ? base.toLowerCase() : base;
  if (!Object.hasOwn(node, name)) return [];
  if (last) return [[...prefix, name]];
  const child = node[name];
  if (each) {
    return Array.isArray(child) ? child.flatMap((el, i) => expand(el, rest, [...prefix, name, i])) : [];
  }
  return expand(child, rest, [...prefix, name]);
}

/** Delete-only mutation: removes the field at `path` everywhere it occurs in `body`. */
function removeField(body: unknown, path: string): unknown {
  let current = body;
  for (const concrete of expand(body, path.split('.'), [])) {
    current = applyMutation(current, { kind: 'delete', path: concrete, pick: 0 });
  }
  return current;
}

type Key = string | number;
const at = (value: unknown, ...keys: readonly Key[]): unknown => {
  let node = value;
  for (const key of keys) {
    if (!isObject(node)) return undefined;
    node = (node as Record<Key, unknown>)[key];
  }
  return node;
};

type Expectation = (base: unknown, after: unknown) => void;
/** The value at `keys` is known (not null) before and null after the removal. */
const nullAt =
  (...keys: Key[]): Expectation =>
  (base, after) => {
    const before = at(base, ...keys);
    expect(before === null || before === undefined).toBe(false);
    expect(at(after, ...keys)).toBeNull();
  };
/** The value at `keys` differs from `value` before and equals it after (a value another requirement defines). */
const valueAt =
  (keys: readonly Key[], value: unknown): Expectation =>
  (base, after) => {
    expect(at(base, ...keys)).not.toEqual(value);
    expect(at(after, ...keys)).toEqual(value);
  };
const sameAt =
  (...keys: Key[]): Expectation =>
  (base, after) => {
    expect(at(after, ...keys)).toEqual(at(base, ...keys));
  };
const sameAll: Expectation = (base, after) => {
  expect(after).toEqual(base);
};
const allOf =
  (...expectations: Expectation[]): Expectation =>
  (base, after) => {
    for (const e of expectations) e(base, after);
  };

interface Generated<C> {
  readonly body: unknown;
  readonly ctx: C;
}

interface FieldCase {
  readonly row: string;
  readonly path: string;
  readonly check: () => void;
}

/** One property run per Endpoint_Fact_Map path: generate a valid body, remove the field, observe both. */
function fieldCase<C>(
  row: string,
  path: string,
  arb: fc.Arbitrary<Generated<C>>,
  observe: (body: unknown, ctx: C) => unknown,
  expectation: Expectation,
): FieldCase {
  return {
    row,
    path,
    check: () => {
      fc.assert(
        fc.property(arb, ({ body, ctx }) => {
          const original = snapshot(body);
          const base = observe(body, ctx);
          const mutated = removeField(body, path);
          expect(snapshot(body)).toBe(original);
          // The path must exist in the valid body, otherwise the removal tests nothing.
          expect(snapshot(mutated)).not.toBe(original);
          expectation(base, observe(mutated, ctx));
        }),
        cfg(),
      );
    },
  };
}

function fieldCases<C>(
  row: string,
  arb: fc.Arbitrary<Generated<C>>,
  observe: (body: unknown, ctx: C) => unknown,
  expectations: Readonly<Record<string, Expectation>>,
): FieldCase[] {
  return Object.entries(expectations).map(([path, expectation]) =>
    fieldCase(row, path, arb, observe, expectation),
  );
}

const ok = <T>(body: T): Fetched<T> => ({ state: 'ok', body });

function raw(over: Partial<RawTargetInputs>): RawTargetInputs {
  return {
    ecosystem: 'pypi',
    name: 'pkg',
    versionSpecs: [],
    depsdevPackage: { state: 'unavailable' },
    npmLatest: { state: 'unavailable' },
    maintainers: { state: 'unavailable' },
    osv: { queryResult: 'unavailable', advisories: new Map(), unfetchedIds: [] },
    repository: 'no-source-repo',
    webHost: 'github.com',
    ...over,
  };
}

/** A deps.dev package document with a default version and no `isDeprecated`. */
const PACKAGE_OK = ok(ef1Body([ef1Version({ version: '1.0.0', isDefault: true })]));

const BATCH: GraphqlBatch = {
  aliases: [
    { alias: 'r0', repo: { owner: 'o0', name: 'n0' } },
    { alias: 'r1', repo: { owner: 'o1', name: 'n1' } },
  ],
};

const LIMITS: DiscoveryLimits = {
  maxDepth: 4,
  maxManifests: 10,
  manifestNames: ['package.json', 'requirements.txt', 'Cargo.toml'],
  skipDirs: ['node_modules'],
};

const arbName = fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/);
const arbVersion = fc.stringMatching(/^[1-9]\.[0-9]{1,2}\.[0-9]{1,2}$/);
const arbId = fc.stringMatching(/^GHSA-[a-z0-9]{4}$/);
const arbSha = fc.stringMatching(/^[0-9a-f]{40}$/);

/** Every registry Mapper variant applied to `body`: used for paths no Mapper reads. */
const observeAll = (body: unknown): unknown =>
  MAPPERS.flatMap((entry) => entry.variants.map((v) => [`${entry.name}/${v.label}`, v.call(body, ASOF)]));

// ----- EF-1: deps.dev package document ----------------------------------------------------------

const arbEf1 = fc
  .tuple(
    fc.uniqueArray(arbVersion, { minLength: 1, maxLength: 4 }),
    fc.array(fc.tuple(arbIso, fc.boolean()), { minLength: 4, maxLength: 4 }),
    fc.nat({ max: 3 }),
  )
  .map(([versions, extras, defaultAt]): Generated<{ selected: string }> => {
    const defaultIndex = defaultAt % versions.length;
    const entries = versions.map((version, i) =>
      ef1Version({
        version,
        publishedAt: (extras[i] as [string, boolean])[0],
        isDefault: i === defaultIndex,
        isDeprecated: (extras[i] as [string, boolean])[1],
      }),
    );
    return { body: ef1Body(entries), ctx: { selected: versions[defaultIndex] as string } };
  });

const observeEf1 = (body: unknown, ctx: { selected: string }): unknown => ({
  pkg: mapDepsDevPackage(body, ctx.selected, ASOF),
  asm: assembleFacts(raw({ depsdevPackage: ok(body) }), ASOF),
});

// ----- EF-2 / EF-3: version documents -----------------------------------------------------------

const arbEf2 = fc.tuple(arbName, arbName).map(([owner, repo]): Generated<null> => ({
  body: ef2Body([ef2Project(`github.com/${owner}/${repo}`), ef2Project('github.com/x/y', 'OTHER')]),
  ctx: null,
}));

const arbEf3 = fc
  .tuple(fc.uniqueArray(arbName, { minLength: 1, maxLength: 3 }), arbName, arbName)
  .map(([names, owner, repo]): Generated<{ requests: { system: string; name: string; version: string }[] }> => {
    const requests = names.map((name) => ({ system: 'npm', name, version: '1.0.0' }));
    return {
      body: {
        ...(ef3Body(
          requests.map((r) =>
            ef3Response({ system: 'NPM', name: r.name, version: r.version }, [ef2Project(`github.com/${owner}/${repo}`)]),
          ),
        ) as Record<string, unknown>),
        nextPageToken: 'token',
      },
      ctx: { requests },
    };
  });

// ----- EF-4: unused deps.dev project document ---------------------------------------------------

const arbEf4 = fc.tuple(fc.nat(), fc.nat(), fc.nat(), arbName).map(([issues, stars, forks, check]): Generated<null> => ({
  body: {
    openIssuesCount: issues,
    starsCount: stars,
    forksCount: forks,
    scorecard: { checks: [{ name: check }], overallScore: 5 },
  },
  ctx: null,
}));

// ----- EF-5 / EF-11: OSV querybatch -------------------------------------------------------------

const arbEf5 = fc
  .array(fc.uniqueArray(arbId, { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 3 })
  .map((idLists): Generated<{ count: number }> => ({
    body: osvBatchBody(idLists.map((ids) => osvResult(ids, 'next'))),
    ctx: { count: idLists.length },
  }));

const everyResult =
  (predicate: (result: Record<string, unknown>) => boolean): ((value: unknown) => boolean) =>
  (value) => {
    const results = at(value, 'results');
    return Array.isArray(results) && results.length > 0 && results.every((r) => isObject(r) && predicate(r));
  };

const idsAreEmpty = (r: Record<string, unknown>): boolean =>
  r.kind === 'ids' && Array.isArray(r.ids) && r.ids.length === 0;
const idsAreKnown = (r: Record<string, unknown>): boolean =>
  r.kind === 'ids' && Array.isArray(r.ids) && r.ids.length > 0;

// ----- EF-6 to EF-10: OSV advisory --------------------------------------------------------------

type AdvisoryOptions = Parameters<typeof osvAdvisoryBody>[1];

const arbAdvisory = (options: (id: string) => fc.Arbitrary<AdvisoryOptions>): fc.Arbitrary<Generated<{ id: string }>> =>
  arbId.chain((id) =>
    options(id).map((opts): Generated<{ id: string }> => ({ body: osvAdvisoryBody(id, opts), ctx: { id } })),
  );

const observeAdvisory = (body: unknown, ctx: { id: string }): unknown => ({
  rec: mapOsvAdvisory(body, null),
  asm: assembleFacts(
    raw({
      ecosystem: 'cargo',
      depsdevPackage: PACKAGE_OK,
      osv: {
        queryResult: { kind: 'ids', ids: [ctx.id], truncated: false },
        advisories: new Map([[ctx.id, { osv: ok(body), depsdev: { state: 'unavailable' } }]]),
        unfetchedIds: [],
      },
    }),
    ASOF,
  ),
});

const advisoryPlain = arbAdvisory(() => fc.constant({}));
const advisoryAliases = arbAdvisory(() =>
  fc.uniqueArray(arbId, { minLength: 1, maxLength: 3 }).map((aliases) => ({ aliases })),
);
const advisoryWithdrawn = arbAdvisory(() => fc.string({ minLength: 1, maxLength: 8 }).map((withdrawn) => ({ withdrawn })));
const advisoryLabel = arbAdvisory(() =>
  fc.constantFrom('LOW', 'MODERATE', 'HIGH', 'CRITICAL').map((databaseSeverity) => ({ databaseSeverity })),
);
const advisoryCvss = arbAdvisory(() => fc.constantFrom(...CVSS_VECTORS).map((vector) => ({ cvss: [vector] })));
const advisoryInformational = arbAdvisory(() => fc.constant({ informational: 'unmaintained' }));

const withdrawnExpectation = valueAt(['rec', 'withdrawn'], false);
const aliasesExpectation = valueAt(['rec', 'aliases'], []);
const severityExpectation = allOf(nullAt('rec', 'severity'), nullAt('asm', 'facts', 'maxSeverity'));
const informationalExpectation = allOf(
  valueAt(['rec', 'informational'], false),
  valueAt(['rec', 'unmaintained'], false),
  // Requirement 9.6: only a present `unmaintained` value sets `deprecated` of a cargo target.
  valueAt(['asm', 'facts', 'deprecated'], null),
);

// ----- EF-12 to EF-14: GitHub repository, branch, tree ------------------------------------------

const arbEf12 = fc.tuple(arbName, arbName, arbIso).map(([owner, repo, pushed]): Generated<null> => ({
  body: {
    full_name: `${owner}/${repo}`,
    default_branch: 'main',
    private: false,
    visibility: 'public',
    archived: false,
    disabled: false,
    pushed_at: pushed,
  },
  ctx: null,
}));
const observeEf12 = (body: unknown): unknown => ({
  repository: readRepository(body),
  all: observeAll(body),
});

const arbEf13 = arbSha.map((sha): Generated<null> => ({ body: { commit: { sha } }, ctx: null }));

const arbEf14 = fc
  .tuple(fc.nat({ max: 5000 }), fc.nat({ max: 5000 }), arbSha)
  .map(([a, b, sha]): Generated<null> => ({
    body: {
      tree: [
        { path: 'package.json', type: 'blob', sha, size: a },
        { path: 'sub/Cargo.toml', type: 'blob', sha, size: b },
      ],
      truncated: true,
    },
    ctx: null,
  }));
const noCandidates = (value: unknown): boolean => {
  const candidates = at(value, 'value', 'candidates');
  return Array.isArray(candidates) && candidates.length === 0;
};
const candidatesWithSize = (value: unknown, known: boolean): boolean => {
  const candidates = at(value, 'value', 'candidates');
  return (
    Array.isArray(candidates) &&
    candidates.length > 0 &&
    candidates.every((c) => (known ? typeof at(c, 'sizeBytes') === 'number' : at(c, 'sizeBytes') === null))
  );
};

// ----- EF-16, EF-18, EF-23: rate-limit headers and body -----------------------------------------

const arbHeaders = fc
  .tuple(fc.nat({ max: 5000 }), fc.integer({ min: 1_000_000_000, max: 2_000_000_000 }), fc.nat({ max: 60 }))
  .map(([remaining, reset, retry]): Generated<null> => ({
    body: {
      headers: {
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': String(remaining),
        'x-ratelimit-used': '1',
        'x-ratelimit-resource': 'core',
        'x-ratelimit-reset': String(reset),
        'retry-after': String(retry),
      },
    },
    ctx: null,
  }));
const observeHeaders = (body: unknown): unknown =>
  readRestRateLimit(at(body, 'headers') as Readonly<Record<string, string>>);

const arbGraphqlRateLimit = fc.tuple(fc.nat({ max: 5000 }), arbIso).map(([remaining, resetAt]): Generated<null> => ({
  body: { data: { rateLimit: { limit: 5000, remaining, used: 1, cost: 1, resetAt, nodeCount: 2 } } },
  ctx: null,
}));

// ----- EF-17, EF-19: GraphQL repositories -------------------------------------------------------

const arbEf17 = fc.tuple(fc.boolean(), arbIso, arbName, arbIso).map(([archived, committed, name, pushed]): Generated<null> => {
  const node = (): Record<string, unknown> => ({
    ...repoNode({ isArchived: archived, committedDate: committed }),
    nameWithOwner: `o/${name}`,
    isDisabled: false,
    pushedAt: pushed,
  });
  return { body: graphqlBody({ r0: node(), r1: node() }), ctx: null };
});
const observeEf17 = (body: unknown): unknown => {
  const gql = mapGraphqlRepos(body, BATCH, ASOF);
  const first = gql[0];
  return {
    gql,
    asm: assembleFacts(
      raw({
        depsdevPackage: PACKAGE_OK,
        repository: first === undefined ? 'no-source-repo' : ok(first),
      }),
      ASOF,
    ),
  };
};
const eachGql = (field: string, expected: unknown): Expectation => (base, after) => {
  for (const results of [base, after]) {
    const list = at(results, 'gql');
    expect(Array.isArray(list) && list.length === 2).toBe(true);
  }
  expect((at(base, 'gql') as unknown[]).every((r) => at(r, field) !== null && at(r, field) !== undefined)).toBe(true);
  expect((at(after, 'gql') as unknown[]).every((r) => at(r, field) === expected)).toBe(true);
};

const arbEf19 = arbIso.map((committed): Generated<null> => ({
  body: graphqlBody({ r0: null, r1: repoNode({ committedDate: committed }) }, [notFoundError('r0')]),
  ctx: null,
}));
const observeEf19 = (body: unknown): unknown => mapGraphqlRepos(body, BATCH, ASOF);

// ----- EF-20 to EF-22: maintainers --------------------------------------------------------------

const arbNpm = fc
  .tuple(fc.uniqueArray(arbName, { minLength: 1, maxLength: 3 }), fc.string({ minLength: 1, maxLength: 8 }))
  .map(([names, deprecated]): Generated<null> => ({
    body: { maintainers: names.map((name) => ({ name, email: `${name}@x.io` })), deprecated },
    ctx: null,
  }));
const observeNpm = (body: unknown): unknown => ({
  npm: mapNpmLatest(body),
  asm: assembleFacts(
    raw({ ecosystem: 'npm', depsdevPackage: PACKAGE_OK, npmLatest: ok(body), maintainers: ok(body) }),
    ASOF,
  ),
});

const arbCrates = fc.uniqueArray(arbName, { minLength: 1, maxLength: 3 }).map((logins): Generated<null> => ({
  body: { users: logins.map((login) => ({ login, kind: 'user' })) },
  ctx: null,
}));
const observeCrates = (body: unknown): unknown => ({
  crates: mapCratesOwners(body),
  asm: assembleFacts(raw({ ecosystem: 'cargo', depsdevPackage: PACKAGE_OK, maintainers: ok(body) }), ASOF),
});

const arbPypiRoles = fc.uniqueArray(arbName, { minLength: 1, maxLength: 3 }).map((users): Generated<null> => ({
  body: { ownership: { roles: users.map((user) => ({ role: 'Owner', user })), organization: null } },
  ctx: null,
}));
const arbPypiOrganization = arbName.map((organization): Generated<null> => ({
  body: { ownership: { roles: [], organization } },
  ctx: null,
}));
const observePypi = (body: unknown): unknown => ({
  pypi: mapPypiOwnership(body),
  asm: assembleFacts(raw({ ecosystem: 'pypi', depsdevPackage: PACKAGE_OK, maintainers: ok(body) }), ASOF),
});

// ----- EF-25: deps.dev advisory -----------------------------------------------------------------

const arbEf25 = fc.tuple(arbId, fc.integer({ min: 0, max: 10 })).map(([id, score]): Generated<null> => ({
  body: { advisoryKey: { id }, cvss3Score: score },
  ctx: null,
}));

// ----- The cases --------------------------------------------------------------------------------

const rateLimitHeaderExpectations = (row: string): FieldCase[] =>
  fieldCases(row, arbHeaders, observeHeaders, {
    'headers.X-RateLimit-Limit': sameAll,
    'headers.X-RateLimit-Remaining': nullAt('remaining'),
    'headers.X-RateLimit-Used': sameAll,
    'headers.X-RateLimit-Resource': sameAll,
    'headers.X-RateLimit-Reset': nullAt('resetAt'),
  });

const FIELD_CASES: readonly FieldCase[] = [
  ...fieldCases('EF-1', arbEf1, observeEf1, {
    'versions[].publishedAt': allOf(
      nullAt('pkg', 'daysSinceLastRelease'),
      nullAt('asm', 'facts', 'daysSinceLastRelease'),
      sameAt('pkg', 'deprecated'),
    ),
    'versions[].isDefault': allOf(
      nullAt('pkg', 'defaultVersion'),
      nullAt('asm', 'selection', 'selected'),
      nullAt('asm', 'facts', 'deprecated'),
      sameAt('pkg', 'daysSinceLastRelease'),
      sameAt('asm', 'facts', 'daysSinceLastRelease'),
    ),
    'versions[].isDeprecated': allOf(
      nullAt('pkg', 'deprecated'),
      nullAt('asm', 'facts', 'deprecated'),
      sameAt('pkg', 'daysSinceLastRelease'),
    ),
    'versions[].versionKey.version': allOf(
      valueAt(['pkg', 'versions'], []),
      nullAt('pkg', 'defaultVersion'),
      nullAt('pkg', 'deprecated'),
      nullAt('asm', 'facts', 'deprecated'),
      sameAt('pkg', 'daysSinceLastRelease'),
    ),
    'packageKey.system': sameAll,
  }),
  ...fieldCases('EF-2', arbEf2, (body) => mapDepsDevVersion(body, 'github.com'), {
    'relatedProjects[].projectKey.id': nullAt(),
    'relatedProjects[].relationType': nullAt(),
  }),
  ...fieldCases(
    'EF-3',
    arbEf3,
    (body, ctx) => mapDepsDevVersionBatch(body, ctx.requests, 'github.com'),
    {
      'responses[].request': (base, after) => {
        expect((base as { found: boolean }[]).every((e) => e.found)).toBe(true);
        expect(after).toEqual((after as unknown[]).map(() => ({ found: false })));
      },
      'responses[].version': (base, after) => {
        expect((base as { sourceRepo: unknown }[]).every((e) => e.sourceRepo !== null)).toBe(true);
        expect(after).toEqual((after as unknown[]).map(() => ({ found: true, sourceRepo: null })));
      },
      nextPageToken: sameAll,
    },
  ),
  ...fieldCases('EF-4', arbEf4, observeAll, {
    openIssuesCount: sameAll,
    starsCount: sameAll,
    forksCount: sameAll,
    'scorecard.checks[].name': sameAll,
    'scorecard.overallScore': sameAll,
  }),
  ...fieldCases('EF-5', arbEf5, (body, ctx) => mapOsvQueryBatch(body, ctx.count), {
    'results[]': (base, after) => {
      expect(at(base, 'kind')).toBe('ok');
      expect(after).toEqual({ kind: 'length-mismatch' });
    },
    'results[].vulns[].id': (base, after) => {
      expect(everyResult(idsAreKnown)(base)).toBe(true);
      expect(everyResult(idsAreEmpty)(after)).toBe(true);
    },
    'results[].vulns[].modified': sameAll,
  }),
  ...fieldCases('EF-6', advisoryPlain, observeAdvisory, { id: nullAt('rec') }),
  ...fieldCases('EF-6', advisoryAliases, observeAdvisory, { aliases: aliasesExpectation }),
  ...fieldCases('EF-6', advisoryWithdrawn, observeAdvisory, { withdrawn: withdrawnExpectation }),
  ...fieldCases('EF-6', advisoryLabel, observeAdvisory, { database_specific: severityExpectation }),
  ...fieldCases('EF-6', advisoryInformational, observeAdvisory, { 'affected[]': informationalExpectation }),
  ...fieldCases('EF-6', advisoryCvss, observeAdvisory, { 'severity[]': severityExpectation }),
  ...fieldCases('EF-7', advisoryLabel, observeAdvisory, { 'database_specific.severity': severityExpectation }),
  ...fieldCases('EF-7', advisoryCvss, observeAdvisory, {
    'severity[].score': severityExpectation,
    'severity[].type': severityExpectation,
  }),
  ...fieldCases('EF-8', advisoryWithdrawn, observeAdvisory, { withdrawn: withdrawnExpectation }),
  ...fieldCases('EF-9', advisoryAliases, observeAdvisory, { aliases: aliasesExpectation }),
  ...fieldCases('EF-10', advisoryInformational, observeAdvisory, {
    'affected[].database_specific.informational': informationalExpectation,
  }),
  ...fieldCases('EF-11', arbEf5, (body, ctx) => mapOsvQueryBatch(body, ctx.count), {
    'results[].next_page_token': (base, after) => {
      expect(everyResult((r) => r.truncated === true)(base)).toBe(true);
      expect(everyResult((r) => r.truncated === false)(after)).toBe(true);
    },
  }),
  ...fieldCases('EF-12', arbEf12, observeEf12, {
    full_name: (_base, after) =>
      expect(at(after, 'repository')).toEqual({ ok: false, error: 'invalid' }),
    // Requirement 3.9: a missing default_branch is invalid, with or without a requested branch.
    default_branch: (_base, after) =>
      expect(at(after, 'repository')).toEqual({ ok: false, error: 'invalid' }),
    // A missing `private` is read as not private (Requirement 3.2): the result does not change.
    private: sameAll,
    visibility: sameAll,
    archived: sameAll,
    disabled: sameAll,
    pushed_at: sameAll,
  }),
  ...fieldCases('EF-13', arbEf13, readCommitSha, { 'commit.sha': nullAt() }),
  ...fieldCases('EF-14', arbEf14, (body) => discoverManifests(body, LIMITS), {
    'tree[].path': (base, after) => {
      expect(candidatesWithSize(base, true)).toBe(true);
      expect(noCandidates(after)).toBe(true);
    },
    'tree[].type': (base, after) => {
      expect(candidatesWithSize(base, true)).toBe(true);
      expect(noCandidates(after)).toBe(true);
    },
    'tree[].sha': sameAll,
    'tree[].size': (base, after) => {
      expect(candidatesWithSize(base, true)).toBe(true);
      expect(candidatesWithSize(after, false)).toBe(true);
    },
    truncated: valueAt(['value', 'truncatedTree'], false),
  }),
  // $body is raw file text parsed by the core parsers; no Mapper of the registry reads it.
  ...fieldCases('EF-15', fc.string().map((text): Generated<null> => ({ body: { $body: text }, ctx: null })), observeAll, {
    $body: sameAll,
  }),
  ...rateLimitHeaderExpectations('EF-16'),
  ...fieldCases('EF-17', arbEf17, observeEf17, {
    'data.rN.nameWithOwner': sameAll,
    'data.rN.isArchived': allOf(eachGql('archived', null), nullAt('asm', 'facts', 'archived'), sameAt('asm', 'facts', 'daysSinceLastCommit')),
    'data.rN.isDisabled': sameAll,
    'data.rN.pushedAt': sameAll,
    'data.rN.defaultBranchRef.name': sameAll,
    'data.rN.defaultBranchRef.target.committedDate': allOf(
      eachGql('daysSinceLastCommit', null),
      nullAt('asm', 'facts', 'daysSinceLastCommit'),
      sameAt('asm', 'facts', 'archived'),
    ),
    'data.rN.defaultBranchRef.target.oid': sameAll,
  }),
  ...fieldCases('EF-18', arbGraphqlRateLimit, readGraphqlRateLimit, {
    'data.rateLimit.limit': sameAll,
    'data.rateLimit.remaining': allOf(nullAt('remaining'), sameAt('resetAt')),
    'data.rateLimit.used': sameAll,
    'data.rateLimit.cost': sameAll,
    'data.rateLimit.resetAt': allOf(nullAt('resetAt'), sameAt('remaining')),
    'data.rateLimit.nodeCount': sameAll,
  }),
  ...rateLimitHeaderExpectations('EF-18'),
  ...fieldCases('EF-19', arbEf19, observeEf19, {
    // The alias without a usable error type or path is no longer a NOT_FOUND: it is unknown (failed).
    'errors[].type': allOf(valueAt([0, 'kind'], 'failed'), sameAt(1)),
    'errors[].path': allOf(valueAt([0, 'kind'], 'failed'), sameAt(1)),
    'errors[].message': sameAll,
  }),
  ...fieldCases('EF-20', arbNpm, observeNpm, {
    'maintainers[]': allOf(
      nullAt('npm', 'maintainerCount'),
      nullAt('asm', 'facts', 'maintainerCount'),
      sameAt('npm', 'deprecated'),
    ),
    'maintainers[].name': allOf(nullAt('npm', 'maintainerCount'), nullAt('asm', 'facts', 'maintainerCount')),
    'maintainers[].email': sameAll,
    // Requirement 8.6 and 12: an absent `deprecated` field of the npm answer means false.
    deprecated: allOf(
      valueAt(['npm', 'deprecated'], false),
      valueAt(['asm', 'facts', 'deprecated'], false),
      sameAt('npm', 'maintainerCount'),
    ),
  }),
  ...fieldCases('EF-21', arbCrates, observeCrates, {
    'users[].login': allOf(nullAt('crates', 'maintainerCount'), nullAt('asm', 'facts', 'maintainerCount')),
    'users[].kind': allOf(nullAt('crates', 'maintainerCount'), nullAt('asm', 'facts', 'maintainerCount')),
  }),
  ...fieldCases('EF-22', arbPypiRoles, observePypi, {
    'ownership.roles[].role': sameAll,
    'ownership.roles[].user': allOf(nullAt('pypi', 'maintainerCount'), nullAt('asm', 'facts', 'maintainerCount')),
  }),
  // Requirement 12.5: empty roles and a missing organization mean 0 (a defined value, not unknown).
  ...fieldCases('EF-22', arbPypiOrganization, observePypi, {
    'ownership.organization': allOf(
      (base) => expect(at(base, 'pypi', 'maintainerCount')).toBeNull(),
      valueAt(['pypi', 'maintainerCount'], 0),
      valueAt(['asm', 'facts', 'maintainerCount'], 0),
    ),
  }),
  ...fieldCases(
    'EF-23',
    arbHeaders,
    observeHeaders,
    {
      'headers.Retry-After': sameAll,
      'headers.X-RateLimit-Remaining': nullAt('remaining'),
      'headers.X-RateLimit-Reset': nullAt('resetAt'),
    },
  ),
  ...fieldCases('EF-25', arbEf25, (body) => mapDepsDevAdvisory(body), { cvss3Score: nullAt() }),
  ...fieldCases('EF-25', arbEf25, (body) => mapDepsDevAdvisory(body), { 'advisoryKey.id': sameAll }),
];

// Design P17 names `ownership.roles` itself, which the Endpoint_Fact_Map lists only as `ownership.roles[].role/user`.
const EXTRA_CASES: readonly FieldCase[] = fieldCases('EF-22', arbPypiRoles, observePypi, {
  'ownership.roles[]': allOf(nullAt('pypi', 'maintainerCount'), nullAt('asm', 'facts', 'maintainerCount')),
});

describe('P17: A missing field maps to unknown', () => {
  // Feature: scan-pipeline, Property 17: A missing field maps to unknown
  // Validates: Requirements 8.12, 12.9, 13.12
  it('P17 every path of the Endpoint_Fact_Map has a delete-only case, and every case names a path', () => {
    const covered = new Set(FIELD_CASES.map((c) => `${c.row} ${c.path}`));
    const listed = new Set<string>();
    for (const row of ENDPOINT_FACT_MAP) {
      for (const path of row.paths) listed.add(`${row.id} ${path}`);
    }
    expect([...listed].filter((key) => !covered.has(key))).toEqual([]);
    expect([...covered].filter((key) => !listed.has(key))).toEqual([]);
  });

  for (const fieldCase of [...FIELD_CASES, ...EXTRA_CASES]) {
    it(`P17 ${fieldCase.row} removing ${fieldCase.path} maps to unknown`, fieldCase.check);
  }
});
