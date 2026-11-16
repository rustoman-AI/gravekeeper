import { describe, expect, it } from 'vitest';
import { HEALTH_FACT_FIELDS, normalizeFacts } from '../../../core/facts/normalize';

const valid = {
  daysSinceLastRelease: 10,
  daysSinceLastCommit: 5,
  archived: false,
  deprecated: true,
  openVulnerabilityCount: 2,
  maxSeverity: 'HIGH',
  maintainerCount: 3,
};

describe('normalizeFacts', () => {
  it('passes valid facts through with no unknown fields', () => {
    const r = normalizeFacts(valid);
    expect(r).toEqual({ ...valid, unknownFields: [] });
  });

  it('treats null and missing fields as unknown', () => {
    const r = normalizeFacts({ ...valid, archived: null, maintainerCount: undefined });
    expect(r.archived).toBeNull();
    expect(r.maintainerCount).toBeNull();
    const { deprecated: _d, ...missing } = valid;
    void _d;
    const r2 = normalizeFacts(missing);
    expect(r2.deprecated).toBeNull();
    expect(r2.unknownFields).toEqual(['deprecated']);
  });

  it.each([NaN, Infinity, -Infinity, -1, '5', true, null, {}])(
    'rejects invalid day value %s',
    (bad) => {
      for (const f of ['daysSinceLastRelease', 'daysSinceLastCommit'] as const) {
        const r = normalizeFacts({ ...valid, [f]: bad });
        expect(r[f]).toBeNull();
        expect(r.unknownFields).toEqual([f]);
      }
    },
  );

  it.each([NaN, Infinity, -1, 0.5, '2', false])('rejects invalid count %s', (bad) => {
    for (const f of ['openVulnerabilityCount', 'maintainerCount'] as const) {
      const r = normalizeFacts({ ...valid, [f]: bad });
      expect(r[f]).toBeNull();
      expect(r.unknownFields).toEqual([f]);
    }
  });

  it('accepts fractional days but not fractional counts', () => {
    const r = normalizeFacts({ ...valid, daysSinceLastCommit: 0.5 });
    expect(r.daysSinceLastCommit).toBe(0.5);
    expect(r.unknownFields).toEqual([]);
  });

  it('accepts 0 and -0 as valid', () => {
    const r = normalizeFacts({
      ...valid,
      daysSinceLastRelease: -0,
      daysSinceLastCommit: 0,
      openVulnerabilityCount: -0,
      maintainerCount: 0,
    });
    expect(r.unknownFields).toEqual([]);
    expect(Object.is(r.daysSinceLastRelease, -0)).toBe(true);
    expect(r.maintainerCount).toBe(0);
  });

  it('rejects wrong types for booleans', () => {
    const r = normalizeFacts({ ...valid, archived: 'true', deprecated: 1 });
    expect(r.archived).toBeNull();
    expect(r.deprecated).toBeNull();
    expect(r.unknownFields).toEqual(['archived', 'deprecated']);
  });

  it('rejects lowercase and unknown severities', () => {
    for (const bad of ['critical', 'high', 'SEVERE', '', 3, null]) {
      const r = normalizeFacts({ ...valid, maxSeverity: bad });
      expect(r.maxSeverity).toBeNull();
      expect(r.unknownFields).toEqual(['maxSeverity']);
    }
  });

  it('accepts every defined severity', () => {
    for (const s of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) {
      expect(normalizeFacts({ ...valid, maxSeverity: s }).maxSeverity).toBe(s);
    }
  });

  it.each([null, undefined, 5, 'str', [], [1, 2], true])(
    'treats non-object input %s as all unknown',
    (input) => {
      const r = normalizeFacts(input);
      expect(r.unknownFields).toEqual([...HEALTH_FACT_FIELDS]);
      for (const f of HEALTH_FACT_FIELDS) expect(r[f]).toBeNull();
    },
  );

  it('ignores inherited properties', () => {
    const proto = { archived: true, daysSinceLastCommit: 4 };
    const obj = Object.create(proto) as Record<string, unknown>;
    obj.deprecated = false;
    const r = normalizeFacts(obj);
    expect(r.archived).toBeNull();
    expect(r.daysSinceLastCommit).toBeNull();
    expect(r.deprecated).toBe(false);
  });

  it('marks a throwing getter unknown and still reads other fields', () => {
    const obj = { ...valid };
    Object.defineProperty(obj, 'archived', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    let r!: ReturnType<typeof normalizeFacts>;
    expect(() => {
      r = normalizeFacts(obj);
    }).not.toThrow();
    expect(r.archived).toBeNull();
    expect(r.unknownFields).toEqual(['archived']);
    expect(r.daysSinceLastCommit).toBe(5);
    expect(r.maxSeverity).toBe('HIGH');
  });

  it('does not throw when a Proxy traps throw', () => {
    const p = new Proxy(
      {},
      {
        has() {
          throw new Error('x');
        },
        getOwnPropertyDescriptor() {
          throw new Error('x');
        },
        get() {
          throw new Error('x');
        },
      },
    );
    expect(normalizeFacts(p).unknownFields).toEqual([...HEALTH_FACT_FIELDS]);
  });

  it('lists unknownFields in canonical field order without duplicates', () => {
    const r = normalizeFacts({
      maintainerCount: -1,
      maxSeverity: 'x',
      archived: 1,
      daysSinceLastCommit: NaN,
    });
    expect(r.unknownFields).toEqual([
      'daysSinceLastRelease',
      'daysSinceLastCommit',
      'archived',
      'deprecated',
      'openVulnerabilityCount',
      'maxSeverity',
      'maintainerCount',
    ]);
    expect(new Set(r.unknownFields).size).toBe(r.unknownFields.length);
  });
});
