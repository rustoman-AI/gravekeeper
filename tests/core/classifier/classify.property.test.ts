// Properties for classify (design: Correctness Properties 13 and 14).
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classify } from '../../../core';
import { normalizeFacts } from '../../../core/facts/normalize';
import { scoreComponents } from '../../../core/scoring';
import { arbAnyFactsInput, arbRawFacts, arbValidFacts } from '../../support/arbitraries/facts';
import { arbHauntedAndAbandoned, arbMaintainerChange, arbNoRisk, arbUnknownSeverityPair, removeAbandonment, removeVulnerability } from '../../support/arbitraries/facts-metamorphic';
import { cfg } from '../../support/fc-config';
import { FACT_FIELDS, oracleAbandoned, oracleDormant, oracleFlags, oracleReportableUnknownFields, oracleUnknownFactsMessage, oracleUnknownFields, oracleVulnerable } from '../../support/oracles/facts-oracle';

const proxyThatThrows = (): unknown =>
  new Proxy(
    {},
    {
      get() {
        throw new Error('trap get');
      },
      has() {
        throw new Error('trap has');
      },
      ownKeys() {
        throw new Error('trap ownKeys');
      },
      getOwnPropertyDescriptor() {
        throw new Error('trap gopd');
      },
      getPrototypeOf() {
        throw new Error('trap proto');
      },
    },
  );

const countOccurrences = (text: string, name: string): number =>
  text.match(new RegExp(`\\b${name}\\b`, 'g'))?.length ?? 0;

describe('classify properties', () => {
  // Feature: dependency-graveyard-core, Property 13: Classifier never throws
  it('Property 13: never throws and always returns a Classification', () => {
    // **Validates: Requirements 6.4**
    fc.assert(
      fc.property(arbAnyFactsInput, (input) => {
        const c = classify(input);
        expect(typeof c).toBe('object');
        expect(['HAUNTED', 'DEAD', 'ALIVE']).toContain(c.status);
        expect(Number.isInteger(c.score) && c.score >= 0 && c.score <= 100).toBe(true);
        expect(Array.isArray(c.reasons)).toBe(true);
        expect(c.reasons.length).toBeGreaterThanOrEqual(1);
      }),
      cfg(),
    );
  });

  it('Property 13: never throws for Proxies with throwing traps and exotic values', () => {
    // **Validates: Requirements 6.4**
    // Factories, so fast-check never probes the throwing Proxy while generating values.
    const exotic = fc.constantFrom<() => unknown>(
      proxyThatThrows,
      () => new Proxy([], {}),
      () => Object.create(null),
      () => Object.create({ archived: true }),
      () => Symbol('s'),
      () => BigInt(1),
      () => () => 1,
      () => new Date(NaN),
    );
    fc.assert(
      fc.property(exotic, (make) => {
        const c = classify(make());
        expect(['HAUNTED', 'DEAD', 'ALIVE']).toContain(c.status);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 14: Unknown facts are reported exactly once
  // (changed by scan-accuracy: the reportable set replaces the unknown set, exact singular and plural text)
  it('Property 14: 6.3 Reason is present iff reportable unknown fields exist and lists each exactly once', () => {
    // **Validates: Requirements 6.3, 6.5, 6.6**
    fc.assert(
      fc.property(arbAnyFactsInput, (input) => {
        const unknown = oracleUnknownFields(input);
        const reportable = oracleReportableUnknownFields(input);
        const c = classify(input);
        const r63 = c.reasons.filter((r) => r.ruleId === '6.3');
        if (reportable.length === 0) {
          expect(r63).toHaveLength(0);
          return;
        }
        expect(r63).toHaveLength(1);
        const message = r63[0]!.message;
        expect(message).toBe(oracleUnknownFactsMessage(reportable));
        for (const field of FACT_FIELDS) {
          expect(countOccurrences(message, field)).toBe(reportable.includes(field) ? 1 : 0);
        }
        if (unknown.length === FACT_FIELDS.length) {
          expect(c.status).toBe('ALIVE');
          expect(c.score).toBe(0);
          expect(c.reasons).toHaveLength(1);
        }
      }),
      cfg(),
    );
  });
});
describe('classify flag properties', () => {
  // Feature: dependency-graveyard-core, Property 15: Abandoned flag matches its definition (changed by scan-accuracy: commit threshold)
  it('Property 15: abandoned equals archived, deprecated or the 8.3 release condition with the commit threshold', () => {
    // **Validates: Requirements 8.10**
    fc.assert(
      fc.property(fc.oneof(arbAnyFactsInput, arbRawFacts), (input) => {
        expect(classify(input).abandoned).toBe(oracleAbandoned(input));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 16: Dormant flag matches its definition (changed by scan-accuracy: commit threshold)
  it('Property 16: dormant equals the 8.4 definition and never co-occurs with an 8.3 Reason', () => {
    // **Validates: Requirements 8.11**
    fc.assert(
      fc.property(fc.oneof(arbAnyFactsInput, arbRawFacts), (input) => {
        const c = classify(input);
        expect(c.dormant).toBe(oracleDormant(input));
        if (c.dormant) expect(c.reasons.some((r) => r.ruleId === '8.3')).toBe(false);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 17: Maintainer count never changes abandonment or status
  it('Property 17: changing maintainerCount leaves abandoned and status unchanged', () => {
    // **Validates: Requirements 8.12**
    fc.assert(
      fc.property(arbMaintainerChange, ({ before, after }) => {
        const b = classify(before);
        const a = classify(after);
        expect(a.abandoned).toBe(b.abandoned);
        expect(a.status).toBe(b.status);
        expect(a.abandoned).toBe(oracleAbandoned(after));
      }),
      cfg(),
    );
  });
});

describe('classify status, determinism and score properties', () => {
  const arbInput = fc.oneof(arbAnyFactsInput, arbRawFacts);

  // Feature: dependency-graveyard-core, Property 18: Exactly one status, consistent with the flags
  it('Property 18: status is HAUNTED iff vulnerable, DEAD iff not vulnerable and abandoned, else ALIVE', () => {
    // **Validates: Requirements 9.5**
    fc.assert(
      fc.property(arbInput, (input) => {
        const c = classify(input);
        const o = oracleFlags(input);
        expect({ v: c.vulnerable, a: c.abandoned, d: c.dormant }).toEqual({ v: o.vulnerable, a: o.abandoned, d: o.dormant });
        expect(['HAUNTED', 'DEAD', 'ALIVE']).toContain(c.status);
        expect(c.status === 'HAUNTED').toBe(c.vulnerable);
        expect(c.status === 'DEAD').toBe(!c.vulnerable && c.abandoned);
        expect(c.status === 'ALIVE').toBe(!c.vulnerable && !c.abandoned);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 19: Classifier determinism
  it('Property 19: repeated calls return deeply equal results, including Reasons order', () => {
    // **Validates: Requirements 9.6**
    fc.assert(
      fc.property(arbInput, (input) => {
        const first = classify(input);
        const second = classify(input);
        expect(second).toEqual(first);
        expect(second.reasons.map((r) => r.ruleId)).toEqual(first.reasons.map((r) => r.ruleId));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 20: Score is an integer from 0 to 100
  it('Property 20: score is an integer in [0, 100]', () => {
    // **Validates: Requirements 10.10**
    fc.assert(
      fc.property(arbInput, (input) => {
        const { score } = classify(input);
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 21: Score is the sum of its components (classify level)
  it('Property 21: classify score equals the sum of the score components', () => {
    // **Validates: Requirements 10.22, 10.1**
    fc.assert(
      fc.property(arbInput, (input) => {
        const c = scoreComponents(normalizeFacts(input));
        expect(classify(input).score).toBe(c.vulnerability + c.abandonment + c.maintainer);
      }),
      cfg(),
    );
  });
});

describe('classify unknown severity, combination and no-risk properties', () => {
  // Feature: dependency-graveyard-core, Property 24: Unknown severity scores like MEDIUM (changed by scan-accuracy: 6.3 uses the reportable set)
  it('Property 24: unknown maxSeverity classifies like MEDIUM apart from the 6.3 and 11.2 Reasons', () => {
    // **Validates: Requirements 10.24, 7.3**
    // Reasons are compared after removing the 6.3 (unknown fields) and 11.2 (severity) entries from both sides.
    const checkPair = ({ unknown, known }: { unknown: unknown; known: unknown }): void => {
      expect(oracleUnknownFields(unknown)).toContain('maxSeverity');
      const u = classify(unknown);
      const k = classify(known);
      expect(u.status).toBe(k.status);
      expect(u.score).toBe(k.score);
      expect({ v: u.vulnerable, a: u.abandoned, d: u.dormant }).toEqual({ v: k.vulnerable, a: k.abandoned, d: k.dormant });
      const ids = (c: typeof u) => c.reasons.map((r) => r.ruleId).filter((id) => id !== '6.3' && id !== '11.2');
      expect(ids(u)).toEqual(ids(k));
      expect(u.reasons.some((r) => r.ruleId === '6.3')).toBe(oracleReportableUnknownFields(unknown).length > 0);
    };
    const base = { daysSinceLastRelease: 0, daysSinceLastCommit: 0, archived: false, deprecated: false, maintainerCount: 100, openVulnerabilityCount: 0 };
    const shrunk = { unknown: { ...base, maxSeverity: null }, known: { ...base, maxSeverity: 'MEDIUM' } };
    fc.assert(
      fc.property(arbUnknownSeverityPair, checkPair),
      { ...cfg(), examples: [[shrunk]] },
    );
  });

  it('Property 24: shrunk counterexample with no vulnerabilities', () => {
    // **Validates: Requirements 10.24, 7.3**
    const base = { daysSinceLastRelease: 0, daysSinceLastCommit: 0, archived: false, deprecated: false, maintainerCount: 100, openVulnerabilityCount: 0 };
    const u = classify({ ...base, maxSeverity: null });
    const k = classify({ ...base, maxSeverity: 'MEDIUM' });
    const ids = (c: typeof u) => c.reasons.map((r) => r.ruleId).filter((id) => id !== '6.3' && id !== '11.2');
    expect(u.status).toBe(k.status);
    expect(u.score).toBe(k.score);
    expect(ids(u)).toEqual(ids(k));
    expect(u.reasons.some((r) => r.ruleId === '6.3')).toBe(false);
  });

  // Feature: dependency-graveyard-core, Property 28: Combined haunted and abandoned strictly exceeds either alone (changed by scan-accuracy: removeAbandonment sets commit age 0)
  it('Property 28: haunted and abandoned scores strictly above either alone', () => {
    // **Validates: Requirements 10.18**
    fc.assert(
      fc.property(arbHauntedAndAbandoned, (facts) => {
        expect(oracleVulnerable(facts) && oracleAbandoned(facts)).toBe(true);
        const noVuln = removeVulnerability(facts);
        const noAband = removeAbandonment(facts);
        expect(oracleVulnerable(noVuln)).toBe(false);
        expect(oracleAbandoned(noAband)).toBe(false);
        const both = classify(facts);
        expect(both.status).toBe('HAUNTED');
        expect(both.score).toBeGreaterThan(classify(noVuln).score);
        expect(both.score).toBeGreaterThan(classify(noAband).score);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 29: No risk signals means ALIVE (changed by scan-accuracy: dormant needs a commit below the threshold)
  it('Property 29: no vulnerability and no 8.1 to 8.3 criterion gives ALIVE', () => {
    // **Validates: Requirements 10.15**
    fc.assert(
      fc.property(arbNoRisk, (facts) => {
        expect(oracleVulnerable(facts)).toBe(false);
        expect(oracleAbandoned(facts)).toBe(false);
        expect(classify(facts).status).toBe('ALIVE');
      }),
      cfg(),
    );
  });
});


describe('classify Reasons properties', () => {
  const arbReasonInput = fc.oneof(arbAnyFactsInput, arbRawFacts, arbValidFacts);
  const RULE_IDS = ['6.3', '7.2', '8.1', '8.2', '8.3', '8.4', '10.6', '10.7', '10.8', '11.2'];
  const toPair = (id: string): [number, number] => {
    const [a, b] = id.split('.');
    return [Number(a), Number(b)];
  };

  // Feature: dependency-graveyard-core, Property 30: Reasons are well formed and ordered
  it('Property 30: Reasons are well formed and ordered', () => {
    // **Validates: Requirements 11.6, 11.1, 11.3, 11.4, 11.5, 11.2**
    fc.assert(
      fc.property(arbReasonInput, (input) => {
        const { reasons } = classify(input);
        expect(reasons.length).toBeGreaterThanOrEqual(1);
        expect(reasons.length).toBeLessThanOrEqual(20);
        for (const r of reasons) {
          expect(RULE_IDS).toContain(r.ruleId);
          for (const f of r.facts) expect(FACT_FIELDS as readonly string[]).toContain(f.field);
          expect(r.message.length).toBeGreaterThanOrEqual(1);
          expect(r.message.length).toBeLessThanOrEqual(200);
        }
        for (let i = 1; i < reasons.length; i++) {
          const [pa, pb] = toPair(reasons[i - 1]!.ruleId);
          const [ca, cb] = toPair(reasons[i]!.ruleId);
          expect(pa < ca || (pa === ca && pb < cb)).toBe(true);
        }
        const r112 = reasons.filter((r) => r.ruleId === '11.2');
        if (r112.length > 0) {
          expect(reasons).toHaveLength(1);
          expect(r112[0]!.facts).toHaveLength(0);
        }
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 31: Status is explained by Reasons
  it('Property 31: status is explained by Reasons', () => {
    // **Validates: Requirements 11.7**
    fc.assert(
      fc.property(arbReasonInput, (input) => {
        const c = classify(input);
        const ids = c.reasons.map((r) => r.ruleId);
        if (c.status === 'HAUNTED') expect(ids).toContain('7.2');
        if (c.status === 'DEAD') expect(ids.some((id) => id === '8.1' || id === '8.2' || id === '8.3')).toBe(true);
      }),
      cfg(),
    );
  });
});
