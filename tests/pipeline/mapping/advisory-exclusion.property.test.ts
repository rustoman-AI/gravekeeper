import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { advisoryUrl } from '../../../pipeline/mapping/advisories';
import { assembleFacts } from '../../../pipeline/mapping/assemble';
import { aggregateAdvisories, mapOsvAdvisory } from '../../../pipeline/mapping/osv-advisory';
import type { AdvisoryRecord, Fetched, RawTargetInputs } from '../../../pipeline/mapping/types';
import { cfg } from '../../support/fc-config';

const IDS = ['I0', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6'];
const ALIASES = ['A1', 'A2', 'A3', 'I0', 'I1', 'I2', ''];
const ASOF = '2024-06-01T00:00:00Z';

const advisoryArb = fc.record({
  state: fc.constantFrom('ok', 'ok', 'ok', 'junk', 'absent', 'unavailable', 'missing'),
  withdrawn: fc.boolean(),
  informational: fc.boolean(),
  unmaintained: fc.boolean(),
  aliases: fc.array(fc.constantFrom(...ALIASES), { maxLength: 3 }),
});

const scenario = fc.record({
  ecosystem: fc.constantFrom('npm', 'pypi', 'cargo'),
  ids: fc.uniqueArray(fc.constantFrom(...IDS), { maxLength: 7 }),
  unfetched: fc.uniqueArray(fc.constantFrom(...IDS), { maxLength: 3 }),
  specs: fc.tuple(...IDS.map(() => advisoryArb)),
});

describe('advisory exclusion properties', () => {
  it('P34: Advisory exclusion kind agrees with the counted vulnerabilities (pipeline)', () => {
    // Feature: graveyard-ui, Property 34: Advisory exclusion kind agrees with the counted vulnerabilities (pipeline)
    // Validates: Requirements 22.1, 22.2, 22.3, 22.4, 22.5, 22.7
    fc.assert(
      fc.property(scenario, ({ ecosystem, ids, unfetched, specs }) => {
        const advisories = new Map<string, { osv: Fetched<unknown>; depsdev: Fetched<unknown> }>();
        specs.forEach((s, i) => {
          const id = IDS[i] as string;
          if (unfetched.includes(id)) return; // an unfetched id has no fetched body
          let osv: Fetched<unknown>;
          if (s.state === 'ok') {
            osv = {
              state: 'ok',
              body: {
                id,
                aliases: s.aliases,
                ...(s.withdrawn ? { withdrawn: '2023-01-01T00:00:00Z' } : {}),
                affected: s.informational
                  ? [{ database_specific: { informational: s.unmaintained ? 'unmaintained' : 'notice' } }]
                  : [{ database_specific: {} }],
              },
            };
          } else if (s.state === 'junk') osv = { state: 'ok', body: [1, 2] };
          else if (s.state === 'missing') return;
          else osv = { state: s.state as 'absent' | 'unavailable' };
          advisories.set(id, { osv, depsdev: { state: 'unavailable' } });
        });
        const raw: RawTargetInputs = {
          ecosystem,
          name: 'pkg',
          versionSpecs: [],
          depsdevPackage: {
            state: 'ok',
            body: {
              versions: [
                { versionKey: { version: '1.0.0' }, publishedAt: '2023-12-27T00:00:00Z', isDefault: true },
              ],
            },
          },
          npmLatest: { state: 'unavailable' },
          maintainers: { state: 'unavailable' },
          repository: 'no-source-repo',
          webHost: 'github.com',
          osv: { queryResult: { kind: 'ids', ids, truncated: false }, advisories, unfetchedIds: unfetched },
        };

        const out = assembleFacts(raw, ASOF);
        const wanted = [...new Set([...ids, ...unfetched])].sort();

        // Independent reference built from the generated flags.
        const records: AdvisoryRecord[] = [];
        const expectedExcluded = new Map<string, 'withdrawn' | 'informational' | null>();
        const unfetchedRef = new Set(unfetched);
        for (const id of wanted) {
          const entry = advisories.get(id);
          const rec = entry && entry.osv.state === 'ok' ? mapOsvAdvisory(entry.osv.body, null) : null;
          if (rec === null) {
            unfetchedRef.add(id);
            expectedExcluded.set(id, null);
            continue;
          }
          records.push(rec);
          const spec = specs[IDS.indexOf(id)] as (typeof specs)[number];
          expectedExcluded.set(id, spec.withdrawn ? 'withdrawn' : spec.informational ? 'informational' : null);
        }
        const reference = aggregateAdvisories(records, [...unfetchedRef]);

        expect(out.advisories.map((a) => a.id)).toEqual(wanted);
        for (const a of out.advisories) {
          expect(a.excluded).toBe(expectedExcluded.get(a.id));
          // the other fields are those of the record, unaffected by the new field
          const rec = records.find((r) => r.id === a.id);
          expect(a.url).toBe(advisoryUrl(a.id));
          expect(a.aliases).toEqual(
            rec === undefined
              ? []
              : [...new Set(rec.aliases.filter((x) => x !== '' && x !== a.id))].sort(),
          );
          expect(a.severity).toBe(rec === undefined ? null : rec.severity);
        }

        const counted = out.advisories.filter((a) => a.excluded === null);
        expect(counted.length).toBeGreaterThanOrEqual(Number(out.facts.openVulnerabilityCount));
        expect(out.facts.openVulnerabilityCount).toBe(reference.openVulnerabilityCount);
        expect(out.facts.maxSeverity).toBe(reference.maxSeverity);

        const informationalIds = out.advisories.filter((a) => a.excluded === 'informational').map((a) => a.id);
        const note = out.notes.find((n) => n.code === 'informational-advisory-excluded');
        if (informationalIds.length === 0) expect(note).toBeUndefined();
        else expect((note?.details as { ids?: string[] } | undefined)?.ids).toEqual(informationalIds);
        expect(informationalIds).toEqual(reference.informationalIds);

        // determinism: same inputs give the same entries and notes
        expect(assembleFacts(raw, ASOF)).toEqual(out);
      }),
      cfg(),
    );
  });
});
