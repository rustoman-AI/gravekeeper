// Feature: resurrect-upgrade, Property RU-P3: An upgrade is offered only to an existing, healthy, higher default version of a deprecated checked version
// Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.6
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pepCompare } from '../../../pipeline/mapping/range-pep440';
import { semverCompare } from '../../../pipeline/mapping/range-semver';
import { chooseUpgrade } from '../../../pipeline/mapping/upgrade';
import { cfg } from '../../support/fc-config';

type Eco = 'npm' | 'pypi' | 'cargo';

// Independent ordering oracle. Generated parseable versions are restricted to
// forms where a plain numeric tuple comparator is exact:
//  - npm and cargo: `X.Y.Z`, no leading zeros, no pre-release, no build part
//    (semver precedence is then the lexicographic order of the three numbers);
//  - pypi: `N(.N){0,3}`, no leading zeros, no pre/post/dev/local/epoch
//    (PEP 440 compares release segments as integers with missing segments as 0,
//    so `1.0` equals `1.0.0`).
// Anything else (UNPARSABLE) is treated as not comparable, so no upgrade.
function parseTuple(v: string, eco: Eco): number[] | null {
  const re = eco === 'pypi' ? /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/ : /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){2}$/;
  return re.test(v) ? v.split('.').map(Number) : null;
}
function tupleCmp(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

interface Entry {
  readonly v: string;
  readonly isDefault: boolean;
  readonly dep: unknown; // undefined = field absent
  readonly key: number;
}

const UNPARSABLE = ['banana', 'not-a-version', '1.2.x', 'x.y.z', 'latest'];
const DEP_VALUES: readonly unknown[] = [true, true, false, undefined, 'true', 1, null];

const num = fc.integer({ min: 0, max: 4 });
const versionArb = (eco: Eco): fc.Arbitrary<string> => {
  const parsable =
    eco === 'pypi'
      ? fc.array(num, { minLength: 1, maxLength: 4 }).map((a) => a.join('.'))
      : fc.tuple(num, num, num).map((t) => t.join('.'));
  return fc.oneof({ weight: 6, arbitrary: parsable }, { weight: 1, arbitrary: fc.constantFrom(...UNPARSABLE) });
};

const latestDeprecatedArb = fc.constantFrom<unknown>(undefined, 'use x instead', 'old', '', '   ', null, true, 5);

const scenario = fc
  .constantFrom<Eco>('npm', 'pypi', 'cargo')
  .chain((eco) =>
    fc
      .record({
        versions: fc.uniqueArray(versionArb(eco), { minLength: 0, maxLength: 6 }),
        deps: fc.array(fc.constantFrom(...DEP_VALUES), { minLength: 6, maxLength: 6 }),
        keys: fc.array(fc.nat(1000), { minLength: 6, maxLength: 6 }),
        defaultIdx: fc.integer({ min: -1, max: 5 }),
        selectedIdx: fc.integer({ min: -2, max: 5 }), // -1 unlisted, -2 null
        unlisted: versionArb(eco),
        latestShape: fc.constantFrom('none', 'default', 'other-listed', 'unrelated', 'junk'),
        latestDeprecated: latestDeprecatedArb,
        latestOtherIdx: fc.nat(5),
      })
      .map((r) => ({ eco, ...r })),
  );

describe('RU-P3 chooseUpgrade', () => {
  it('RU-P3: offered iff deprecated checked version, listed healthy default, strictly higher, npm /latest not deprecating it', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const { eco, versions } = s;
        const entries: Entry[] = versions.map((v, i) => ({
          v,
          isDefault: i === s.defaultIdx,
          dep: s.deps[i],
          key: s.keys[i] as number,
        }));
        const list = entries.map((e) => ({
          versionKey: { version: e.v },
          ...(e.isDefault ? { isDefault: true } : {}),
          ...(e.dep === undefined ? {} : { isDeprecated: e.dep }),
        }));
        // Shuffle by the generated sort keys (stable for ties).
        const shuffled = entries
          .map((e, i) => ({ e, i }))
          .sort((a, b) => a.e.key - b.e.key || a.i - b.i)
          .map(({ i }) => list[i]);

        let selected: string | null;
        if (s.selectedIdx === -2) selected = null;
        else if (s.selectedIdx === -1 || s.selectedIdx >= versions.length) selected = s.unlisted;
        else selected = versions[s.selectedIdx] as string;

        const def = entries.find((e) => e.isDefault);
        let latestBody: unknown;
        switch (s.latestShape) {
          case 'none':
            latestBody = undefined;
            break;
          case 'default':
            latestBody = { version: def?.v ?? '9.9.9', deprecated: s.latestDeprecated };
            break;
          case 'other-listed':
            latestBody = {
              version: versions.length > 0 ? versions[s.latestOtherIdx % versions.length] : '9.9.9',
              deprecated: s.latestDeprecated,
            };
            break;
          case 'unrelated':
            latestBody = { version: '77.77.77', deprecated: s.latestDeprecated };
            break;
          default:
            latestBody = 'junk';
        }

        const body = { versions: shuffled };
        const actual = chooseUpgrade({ ecosystem: eco, depsdevBody: body, selected, latestBody });

        // Oracle
        const sel = selected === null ? undefined : entries.find((e) => e.v === selected);
        const selDeprecated = sel !== undefined && sel.dep === true;
        const defDeprecated = def !== undefined && def.dep === true;
        const latestDeprecates =
          eco === 'npm' &&
          def !== undefined &&
          typeof latestBody === 'object' &&
          latestBody !== null &&
          (latestBody as { version?: unknown }).version === def.v &&
          typeof (latestBody as { deprecated?: unknown }).deprecated === 'string' &&
          ((latestBody as { deprecated: string }).deprecated).trim() !== '';
        let higher = false;
        if (selected !== null && def !== undefined) {
          const a = parseTuple(def.v, eco);
          const b = parseTuple(selected, eco);
          higher = a !== null && b !== null && tupleCmp(a, b) > 0;
        }
        const expected =
          selDeprecated && def !== undefined && !defDeprecated && !latestDeprecates && higher
            ? { version: def.v, basis: 'registry-default' }
            : null;

        expect(actual).toEqual(expected);

        if (actual !== null) {
          // Consequences of an offered upgrade.
          expect(selDeprecated).toBe(true);
          expect(def).toBeDefined();
          expect(defDeprecated).toBe(false);
          expect(versions).toContain(actual.version);
          expect(actual.version).not.toBe(selected);
          if (eco === 'npm') expect(latestDeprecates).toBe(false);
          // The existing comparator agrees the offer is strictly higher.
          const cmp = eco === 'pypi' ? pepCompare : semverCompare;
          expect(cmp(actual.version, selected as string)).toBeGreaterThan(0);
        }
        if (!selDeprecated) expect(actual).toBeNull();
      }),
      cfg(),
    );
  });
});
