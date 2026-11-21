import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isStrictVersion } from '../../../core';
import { needsVersionDocument } from '../../../pipeline/mapping/version-doc-plan';
import { cfg } from '../../support/fc-config';

// Independent oracle of the npm row of the Strict_Version table in design.md:
// at most 64 code points, `N.N.N` with N = 0 or no leading zero, then an
// optional `-` followed by dot-separated non-empty identifiers of [0-9A-Za-z-].
// Written by hand; it does not call `isStrictVersion` (a separate RU-P1 case below
// compares the two).
function isNumber(s: string): boolean {
  if (s.length === 0) return false;
  for (const c of s) if (c < '0' || c > '9') return false;
  return s === '0' || s[0] !== '0';
}
function isIdent(s: string): boolean {
  if (s.length === 0) return false;
  for (const c of s) {
    const ok = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '-';
    if (!ok) return false;
  }
  return true;
}
function strictNpm(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  if ([...v].length > 64) return false;
  const dash = v.indexOf('-');
  const core = dash >= 0 ? v.slice(0, dash) : v;
  const pre = dash >= 0 ? v.slice(dash + 1) : null;
  const parts = core.split('.');
  if (parts.length !== 3 || !parts.every(isNumber)) return false;
  if (pre !== null && !pre.split('.').every(isIdent)) return false;
  return true;
}

const num = fc.oneof(fc.nat(30).map(String), fc.constantFrom('0', '00', '01', '10', '1x', '', '-1'));
const goodVersion: fc.Arbitrary<string> = fc
  .tuple(
    fc.nat(20),
    fc.nat(20),
    fc.nat(20),
    fc.option(fc.constantFrom('beta', 'rc.1', 'alpha-2', 'x.y.z', '0', '01'), { nil: null }),
  )
  .map(([a, b, c, pre]) => `${a}.${b}.${c}${pre === null ? '' : `-${pre}`}`);
const longVersion = fc.integer({ min: 55, max: 80 }).map((n) => `1.0.0-${'a'.repeat(n - 6)}`);
const hostileVersion: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(num, num, num).map(([a, b, c]) => `${a}.${b}.${c}`),
  fc.tuple(goodVersion, fc.constantFrom(' ', ';', '"', '$(x)', '`x`', '+b', '@1', '!', '\n', 'é', '..', '-', '=')).map(
    ([v, s]) => `${v}${s}`,
  ),
  fc.constantFrom('', ' ', 'latest', '1.2', 'v1.2.3', '1.2.3.4', '1.2.3-', '1.2.3-a..b', '1.2.3+build'),
  fc.string({ maxLength: 10 }),
);
const versionArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 5, arbitrary: goodVersion },
  { weight: 1, arbitrary: longVersion },
  { weight: 3, arbitrary: hostileVersion },
);

type DepKind = 'true' | 'false' | 'string' | 'number' | 'null' | 'absent' | 'object' | 'throws';
const depKind: fc.Arbitrary<DepKind> = fc.constantFrom(
  'true', 'true', 'true', 'false', 'string', 'number', 'null', 'absent', 'object', 'throws',
);
type DefKind = 'true' | 'false' | 'string' | 'absent' | 'throws';
const defKind: fc.Arbitrary<DefKind> = fc.constantFrom('true', 'false', 'string', 'absent', 'throws');

interface EntrySpec {
  version: string;
  dep: DepKind;
  def: DefKind;
}

function realizeEntry(e: EntrySpec): unknown {
  const o: Record<string, unknown> = { versionKey: { system: 'NPM', name: 'p', version: e.version } };
  const set = (key: string, kind: string, truthy: unknown) => {
    switch (kind) {
      case 'true': o[key] = true; break;
      case 'false': o[key] = false; break;
      case 'string': o[key] = 'true'; break;
      case 'number': o[key] = 1; break;
      case 'null': o[key] = null; break;
      case 'object': o[key] = truthy; break;
      case 'throws':
        Object.defineProperty(o, key, {
          enumerable: true,
          get() {
            throw new Error('hostile');
          },
        });
        break;
      default: break;
    }
  };
  set('isDeprecated', e.dep, {});
  set('isDefault', e.def, {});
  return o;
}

const JUNK: readonly unknown[] = [null, 5, 'x', [], { versionKey: null }, { versionKey: { version: 7 } }];

type BodyKind = 'normal' | 'throws' | 'nonObject' | 'noVersions';
interface Scenario {
  entries: EntrySpec[]; // unique versions, at most one default-true entry
  shuffled: EntrySpec[];
  junk: unknown[];
  bodyKind: BodyKind;
  ecosystem: unknown;
  selected: string | null;
  latest: LatestSpec;
}
type LatestSpec =
  | { kind: 'absent' }
  | { kind: 'noVersion' }
  | { kind: 'version'; value: unknown }
  | { kind: 'throws' }
  | { kind: 'nonObject' };

const ecosystemArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 8, arbitrary: fc.constant('npm') },
  { weight: 3, arbitrary: fc.constantFrom('pypi', 'cargo', 'NPM', 'maven', '', 'npm ') },
  { weight: 1, arbitrary: fc.constantFrom(null, undefined, 5, {}) },
);

const latestArb = (pool: readonly string[]): fc.Arbitrary<LatestSpec> =>
  fc.oneof(
    { weight: 2, arbitrary: fc.constant<LatestSpec>({ kind: 'absent' }) },
    { weight: 1, arbitrary: fc.constant<LatestSpec>({ kind: 'noVersion' }) },
    { weight: 1, arbitrary: fc.constant<LatestSpec>({ kind: 'throws' }) },
    { weight: 1, arbitrary: fc.constantFrom<LatestSpec>({ kind: 'nonObject' }) },
    {
      weight: 6,
      arbitrary: fc
        .oneof(
          fc.constantFrom(...(pool.length > 0 ? pool : ['9.9.9'])),
          versionArb,
          fc.constantFrom<unknown>('', 7, null, ['1.0.0']),
        )
        .map((value): LatestSpec => ({ kind: 'version', value })),
    },
  );

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    versions: fc.uniqueArray(versionArb, { minLength: 0, maxLength: 7 }),
    defaultIndex: fc.option(fc.nat(6), { nil: null }),
  })
  .chain(({ versions, defaultIndex }) =>
    fc
      .tuple(
        fc.array(fc.tuple(depKind, defKind), { minLength: versions.length, maxLength: versions.length }),
      )
      .chain(([kinds]) => {
        const entries: EntrySpec[] = versions.map((version, i) => {
          const [dep, def] = kinds[i] as [DepKind, DefKind];
          // at most one default-true entry; extra ones become `false`
          const isDefaultSlot = defaultIndex !== null && i === defaultIndex % Math.max(1, versions.length);
          return { version, dep, def: def === 'true' ? (isDefaultSlot ? 'true' : 'false') : def };
        });
        return fc.record({
          entries: fc.constant(entries),
          shuffled: fc.shuffledSubarray(entries, { minLength: entries.length, maxLength: entries.length }),
          junk: fc.array(fc.constantFrom(...JUNK), { maxLength: 3 }),
          bodyKind: fc.oneof(
            { weight: 12, arbitrary: fc.constant<BodyKind>('normal') },
            { weight: 1, arbitrary: fc.constantFrom<BodyKind>('throws', 'nonObject', 'noVersions') },
          ),
          ecosystem: ecosystemArb,
          selected: fc.oneof(
            { weight: 7, arbitrary: entries.length > 0 ? fc.constantFrom(...entries.map((e) => e.version)) : fc.constant('1.0.0') },
            { weight: 2, arbitrary: versionArb },
            { weight: 1, arbitrary: fc.constant(null) },
          ),
          latest: latestArb(versions),
        });
      }),
  );

function realizeBody(kind: BodyKind, list: readonly EntrySpec[], junk: readonly unknown[]): unknown {
  switch (kind) {
    case 'throws':
      return {
        get versions(): unknown {
          throw new Error('hostile');
        },
      };
    case 'nonObject':
      return 'not an object';
    case 'noVersions':
      return { versions: 'none' };
    default:
      return { versions: [...junk, ...list.map(realizeEntry)] };
  }
}

function realizeLatest(l: LatestSpec): unknown {
  switch (l.kind) {
    case 'absent': return undefined;
    case 'noVersion': return { name: 'p' };
    case 'nonObject': return 'x';
    case 'throws':
      return {
        get version(): unknown {
          throw new Error('hostile');
        },
      };
    default: return { version: l.value };
  }
}

// Expected value computed from the abstract scenario, not from the body.
function expected(s: Scenario): boolean {
  if (s.ecosystem !== 'npm') return false;
  if (s.selected === null || !strictNpm(s.selected)) return false;
  if (s.bodyKind !== 'normal') return false;
  const entry = s.entries.find((e) => e.version === s.selected);
  if (entry === undefined || entry.dep !== 'true') return false;
  const def = s.entries.find((e) => e.def === 'true')?.version ?? null;
  const fromLatest =
    s.latest.kind === 'version' && typeof s.latest.value === 'string' && s.latest.value !== ''
      ? s.latest.value
      : null;
  const latest = fromLatest ?? def;
  return s.selected !== latest;
}

const call = (s: Scenario, list: readonly EntrySpec[]): boolean =>
  needsVersionDocument({
    ecosystem: s.ecosystem as string,
    depsdevBody: realizeBody(s.bodyKind, list, s.junk),
    selected: s.selected,
    latestBody: realizeLatest(s.latest),
  });

// Feature: resurrect-upgrade, Property RU-P1: A version document is requested exactly for a deprecated, differing, strict npm version
// Validates: Requirements 1.1, 1.2, 1.3, 1.4
describe('RU-P1: A version document is requested exactly for a deprecated, differing, strict npm version', () => {
  it('RU-P1: needsVersionDocument equals the oracle, never throws, and ignores the order of versions[]', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const want = expected(s);
        expect(call(s, s.entries)).toBe(want);
        expect(call(s, s.shuffled)).toBe(want);
      }),
      cfg(),
    );
  });

  it('RU-P1: the hand-written strict npm oracle agrees with isStrictVersion', () => {
    fc.assert(
      fc.property(fc.oneof(versionArb, fc.string({ maxLength: 12 }), fc.anything()), (v) => {
        expect(isStrictVersion('npm', v)).toBe(strictNpm(v));
      }),
      cfg(),
    );
  });
});
