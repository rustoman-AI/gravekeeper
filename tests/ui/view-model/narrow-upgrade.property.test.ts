// Feature: resurrect-upgrade, Property RU-P5: Client narrowing of the upgrade is total, valid and idempotent
// Validates: Requirements 5.6, 5.7
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isStrictVersion } from '../../../core/versions/strict-version';
import { narrowUpgrade } from '../../../view-model/narrow';
import { cfg } from '../../support/fc-config';

const arbEcosystem = fc.constantFrom('npm', 'pypi', 'cargo');
const arbVersion = fc.oneof(
  fc.constantFrom('1.2.3', '0.0.1', '2.0.0-beta.1', '1.0.post1', '1.0', '1.2.3;rm', '1.2.3 4', '', '1.2.3-' + 'a'.repeat(59), '1.2.3-' + 'a'.repeat(58)),
  fc.string({ unit: fc.constantFrom(...'0123456789.-abcxyz+;$ `"\n\u00e9'.split('')), maxLength: 70 }),
  fc.string({ unit: 'binary', maxLength: 10 }),
);
const arbBasis = fc.oneof(fc.constant('registry-default'), fc.constant('registry-default'), fc.constantFrom('latest', '', 'Registry-Default'), fc.anything());
const arbRecord = fc.record({ version: arbVersion, basis: arbBasis });
const arbValue = fc.oneof(
  arbRecord,
  arbRecord,
  fc.record({ version: arbVersion, basis: arbBasis, extra: fc.anything() }),
  fc.record({ version: arbVersion }),
  fc.record({ basis: arbBasis }),
  fc.array(arbRecord, { maxLength: 2 }),
  fc.constantFrom(undefined, null),
  fc.anything(),
  fc.jsonValue(),
);

describe('RU-P5 Client narrowing of the upgrade is total, valid and idempotent', () => {
  it('RU-P5 never throws, keeps only exact valid records different from the lookupVersion, and is idempotent', () => {
    fc.assert(
      fc.property(arbValue, arbEcosystem, fc.option(arbVersion, { nil: undefined }), fc.boolean(), (value, eco, lookup, useOwn) => {
        const lookupVersion =
          useOwn && typeof (value as { version?: unknown } | null)?.version === 'string' ? (value as { version: string }).version : lookup;
        const out = narrowUpgrade(value, eco, lookupVersion);
        if (out !== null) {
          expect(Object.keys(out).sort()).toEqual(['basis', 'version']);
          expect(out.basis).toBe('registry-default');
          expect(isStrictVersion(eco, out.version)).toBe(true);
          expect(out.version).not.toBe(lookupVersion);
          expect(narrowUpgrade(out, eco, lookupVersion)).toEqual(out);
        }
      }),
      cfg(),
    );
  });

  it('RU-P5 never throws on arbitrary ecosystem and lookupVersion values', () => {
    fc.assert(
      fc.property(arbValue, fc.anything(), fc.anything(), (value, eco, lookup) => {
        expect(() => narrowUpgrade(value, eco, lookup)).not.toThrow();
      }),
      cfg(),
    );
  });

  it('RU-P5 accepts a well-formed upgrade whose version is strict and differs from the lookupVersion', () => {
    fc.assert(
      fc.property(arbEcosystem, arbVersion, arbVersion, (eco, version, lookup) => {
        fc.pre(isStrictVersion(eco, version) && version !== lookup);
        expect(narrowUpgrade({ version, basis: 'registry-default' }, eco, lookup)).toEqual({ version, basis: 'registry-default' });
      }),
      cfg(),
    );
  });
});
