// Feature: resurrect, Property RS-P8: Hint extraction is total and well-shaped
// Validates: Requirements 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.7
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ADVISORY_URL_PREFIX, HINTS_MAX_PER_PACKAGE } from '../../../pipeline/constants';
import { advisoryNoticeHints, npmDeprecationHint } from '../../../pipeline/mapping/hints';
import { normalizeHintText } from '../../../pipeline/mapping/hint-text';
import type { AdvisoryRecord, UpstreamHint } from '../../../pipeline/mapping/types';
import { cfg } from '../../support/fc-config';

const MAX = 600;
const SAFE_ID = /^[A-Za-z0-9._:-]*$/;
const URL_SHAPE = /^https:\/\/osv\.dev\/vulnerability\/[A-Za-z0-9._:%-]*$/;

/** A value whose every access throws. */
const hostileProxy = (): unknown =>
  new Proxy(
    {},
    {
      get() {
        throw new Error('get');
      },
      has() {
        throw new Error('has');
      },
      ownKeys() {
        throw new Error('ownKeys');
      },
      getOwnPropertyDescriptor() {
        throw new Error('gopd');
      },
      getPrototypeOf() {
        throw new Error('gpo');
      },
    },
  );

/** An object whose listed own properties are getters that throw. */
const throwingGetters = (keys: readonly string[]): unknown => {
  const o: Record<string, unknown> = {};
  for (const k of keys) {
    Object.defineProperty(o, k, {
      enumerable: true,
      get() {
        throw new Error(`getter ${k}`);
      },
    });
  }
  return o;
};

const anyText = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 20 }),
  fc.constantFrom('', ' ', '\t\n', '\u202e', '\u0000', 'this library is no longer supported', '<a href="x">y</a>'),
  fc.integer({ min: 590, max: 700 }).map((n) => 'ab '.repeat(n)),
  fc.integer({ min: 590, max: 700 }).map((n) => '\u{1F480}'.repeat(n)),
);

const nonStringValue = fc.oneof(
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.string(), { maxLength: 3 }),
  fc.constant({ toString: () => 'x' }),
);

const hostileDeprecated = fc.constantFrom(
  () => throwingGetters(['deprecated']),
  () => hostileProxy(),
  () => Object.create({ deprecated: 'inherited' }) as unknown,
);

/** Thunks: fast-check must never touch a hostile value while generating. */
const latestBody: fc.Arbitrary<() => unknown> = fc.oneof(
  { weight: 4, arbitrary: anyText.map((t) => () => ({ deprecated: t })) },
  { weight: 2, arbitrary: nonStringValue.map((v) => () => ({ deprecated: v })) },
  { weight: 1, arbitrary: anyText.map((t) => () => ({ version: '1.0.0', name: t })) },
  { weight: 1, arbitrary: fc.array(anyText, { maxLength: 3 }).map((a) => () => a) },
  { weight: 1, arbitrary: anyText.map((t) => () => t) },
  { weight: 1, arbitrary: nonStringValue.map((v) => () => v) },
  { weight: 2, arbitrary: hostileDeprecated },
);

const idArb = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom('GHSA-aaaa', 'RUSTSEC-2020-0001', 'RUSTSEC-2020-0002', 'RUSTSEC-2021-0003', 'CVE-1', '') },
  { weight: 3, arbitrary: fc.string({ unit: 'binary', maxLength: 6 }) },
  { weight: 2, arbitrary: fc.constantFrom('\ud800', 'a\udc00', '\u{1F480}', '\uffff', '\u{10000}', 'a/b?c#d', 'é') },
);

interface Plain {
  id: string;
  withdrawn: boolean;
  unmaintained: boolean;
  details: string | null;
  summary: string | null;
}

const textField = fc.oneof(
  { weight: 3, arbitrary: anyText },
  { weight: 1, arbitrary: fc.constant(null) },
);

const plainRecord: fc.Arbitrary<Plain> = fc.record({
  id: idArb,
  withdrawn: fc.boolean(),
  unmaintained: fc.boolean(),
  details: textField,
  summary: textField,
});

const toRecord = (p: Plain): AdvisoryRecord => ({
  id: p.id,
  aliases: [],
  withdrawn: p.withdrawn,
  informational: p.unmaintained,
  unmaintained: p.unmaintained,
  severity: null,
  details: p.details,
  summary: p.summary,
});

type Item = { kind: 'plain'; p: Plain } | { kind: 'hostile'; make: () => unknown };

const item: fc.Arbitrary<Item> = fc.oneof(
  { weight: 8, arbitrary: plainRecord.map((p): Item => ({ kind: 'plain', p })) },
  {
    weight: 1,
    arbitrary: fc
      .constantFrom<() => unknown>(
        () => hostileProxy(),
        () => throwingGetters(['id', 'withdrawn', 'unmaintained', 'details', 'summary']),
        () => throwingGetters(['details', 'summary']),
        () => null,
        () => 42,
        () => ({ id: 7, unmaintained: true, details: 'x' }),
      )
      .map((make): Item => ({ kind: 'hostile', make })),
  },
);

/** Small id pool makes duplicate ids common. */
const poolIds = fc.constantFrom('A', 'B', 'C', 'D', 'E', 'a', '\u{1F480}', '\uffff');
const pooledPlain: fc.Arbitrary<Plain> = fc.record({
  id: poolIds,
  withdrawn: fc.boolean(),
  unmaintained: fc.boolean(),
  details: textField,
  summary: textField,
});

const items: fc.Arbitrary<Item[]> = fc.oneof(
  fc.array(item, { maxLength: 8 }),
  fc.array(pooledPlain.map((p): Item => ({ kind: 'plain', p })), { maxLength: 10 }),
);

const cpCompare = (a: string, b: string): number => {
  const x = Array.from(a).map((c) => c.codePointAt(0) as number);
  const y = Array.from(b).map((c) => c.codePointAt(0) as number);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
  }
  return x.length - y.length;
};

/** Independent selection: eligibility, first usable record per id, ascending ids, cap. */
const oracle = (plains: readonly Plain[]): Array<{ id: string; text: string }> => {
  const firstById = new Map<string, string>();
  for (const p of plains) {
    if (p.withdrawn || !p.unmaintained) continue;
    const text = normalizeHintText(p.details) ?? normalizeHintText(p.summary);
    if (text === null || firstById.has(p.id)) continue;
    firstById.set(p.id, text);
  }
  return [...firstById.entries()]
    .map(([id, text]) => ({ id, text }))
    .sort((a, b) => cpCompare(a.id, b.id))
    .slice(0, HINTS_MAX_PER_PACKAGE);
};

/** Own data property of a plain object; undefined for anything else, hostile values included. */
const ownDataValue = (body: unknown, key: string): unknown => {
  try {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return undefined;
    const d = Object.getOwnPropertyDescriptor(body, key);
    return d !== undefined && 'value' in d ? d.value : undefined;
  } catch {
    return undefined;
  }
};

const wellShaped = (h: UpstreamHint): boolean => {
  if (h.kind !== 'deprecation-notice' && h.kind !== 'advisory-notice') return false;
  const n = Array.from(h.text).length;
  return n >= 1 && n <= MAX && h.text === normalizeHintText(h.text);
};

describe('RS-P8 hint extraction is total and well-shaped', () => {
  it('RS-P8 npm extractor never throws and yields at most one well-shaped hint', () => {
    fc.assert(
      fc.property(latestBody, (make) => {
        const body = make();
        const out = npmDeprecationHint(body);
        return (
          Array.isArray(out) &&
          out.length <= 1 &&
          out.every((h) => wellShaped(h) && h.kind === 'deprecation-notice' && h.sourceUrl === null)
        );
      }),
      cfg(),
    );
  });

  it('RS-P8 npm extractor returns one hint exactly when deprecated is a string non-empty after normalization', () => {
    fc.assert(
      fc.property(latestBody, (make) => {
        const body = make();
        const value = ownDataValue(body, 'deprecated');
        const expected = normalizeHintText(value);
        const out = npmDeprecationHint(body);
        return expected === null
          ? out.length === 0
          : out.length === 1 && out[0]?.text === expected;
      }),
      cfg(),
    );
  });

  it('RS-P8 advisory extractor never throws and keeps kind, source URL and the cap', () => {
    fc.assert(
      fc.property(items, (list) => {
        const records = list.map((i) => (i.kind === 'plain' ? toRecord(i.p) : (i.make() as AdvisoryRecord)));
        const out = advisoryNoticeHints(records);
        return (
          Array.isArray(out) &&
          out.length <= HINTS_MAX_PER_PACKAGE &&
          out.every(
            (h) =>
              wellShaped(h) &&
              h.kind === 'advisory-notice' &&
              h.sourceUrl !== null &&
              h.sourceUrl.startsWith(ADVISORY_URL_PREFIX) &&
              URL_SHAPE.test(h.sourceUrl),
          )
        );
      }),
      cfg(),
    );
  });

  it('RS-P8 advisory extractor matches the independent selection oracle, ids ascending and unique', () => {
    fc.assert(
      fc.property(items, (list) => {
        const records = list.map((i) => (i.kind === 'plain' ? toRecord(i.p) : (i.make() as AdvisoryRecord)));
        const plains = list.flatMap((i) => (i.kind === 'plain' ? [i.p] : []));
        const expected = oracle(plains);
        const out = advisoryNoticeHints(records);
        if (out.length !== expected.length) return false;
        const urls = out.map((h) => h.sourceUrl);
        const sortedUnique = new Set(expected.map((e) => e.id)).size === expected.length;
        return (
          sortedUnique &&
          expected.every((e, i) => {
            const h = out[i] as UpstreamHint;
            const url = SAFE_ID.test(e.id) ? ADVISORY_URL_PREFIX + e.id : h.sourceUrl;
            return h.text === e.text && h.sourceUrl === url;
          }) &&
          new Set(urls).size === urls.length
        );
      }),
      cfg(),
    );
  });

  it('RS-P8 withdrawn or not-unmaintained records never produce a hint', () => {
    const blocked = plainRecord.map((p): Plain => ({ ...p, details: 'some text', summary: 'more text' }));
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(blocked, fc.constantFrom('withdrawn', 'not-unmaintained', 'both')).map(([p, why]): Plain => ({
            ...p,
            withdrawn: why !== 'not-unmaintained',
            unmaintained: why === 'withdrawn' ? true : false,
          })),
          { maxLength: 6 },
        ),
        (plains) => advisoryNoticeHints(plains.map(toRecord)).length === 0,
      ),
      cfg(),
    );
  });

  it('RS-P8 advisory extractor is total for a hostile list', () => {
    expect(() => advisoryNoticeHints(hostileProxy() as AdvisoryRecord[])).not.toThrow();
    expect(advisoryNoticeHints(hostileProxy() as AdvisoryRecord[])).toEqual([]);
  });
});
