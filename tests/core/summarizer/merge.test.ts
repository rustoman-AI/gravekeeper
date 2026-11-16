import { describe, expect, it } from 'vitest';
import {
  classificationTieKey,
  compareClassifications,
  mergeClassifications,
} from '../../../core/summarizer/merge';
import { canonicalKey } from '../../../core/internal/deep-equal-key';
import type { Classification, RuleId, Status } from '../../../core/model';

function make(over: Partial<Classification> = {}, ruleIds: RuleId[] = ['6.3'], message = 'm'): Classification {
  return {
    status: 'DEAD',
    score: 50,
    reasons: ruleIds.map((ruleId) => ({ ruleId, message, facts: [] })),
    vulnerable: false,
    abandoned: false,
    dormant: false,
    ...over,
  };
}

describe('mergeClassifications', () => {
  it('returns null for an empty list', () => {
    expect(mergeClassifications([])).toBeNull();
  });

  it('returns the only element of a single-element list', () => {
    const a = make();
    expect(mergeClassifications([a])).toBe(a);
  });

  it('picks the highest score regardless of status', () => {
    const low = make({ score: 10, status: 'HAUNTED' });
    const high = make({ score: 90, status: 'ALIVE' });
    expect(mergeClassifications([low, high])).toBe(high);
    expect(mergeClassifications([high, low])).toBe(high);
  });

  it('breaks score ties by HAUNTED, DEAD, ALIVE', () => {
    const byStatus = (s: Status) => make({ status: s });
    const h = byStatus('HAUNTED');
    const d = byStatus('DEAD');
    const a = byStatus('ALIVE');
    for (const list of [[a, d, h], [h, d, a], [d, a, h], [a, h, d]]) {
      expect(mergeClassifications(list)).toBe(h);
    }
    expect(mergeClassifications([a, d])).toBe(d);
  });

  it('breaks status ties by the lowest tie key (flags, then ruleIds)', () => {
    const clean = make({}, ['7.2']);
    const vuln = make({ vulnerable: true }, ['6.3']);
    expect(classificationTieKey(clean) < classificationTieKey(vuln)).toBe(true);
    expect(mergeClassifications([vuln, clean])).toBe(clean);
    expect(mergeClassifications([clean, vuln])).toBe(clean);

    const r1 = make({}, ['6.3', '7.2']);
    const r2 = make({}, ['6.3', '8.1']);
    expect(mergeClassifications([r2, r1])).toBe(r1);
    expect(mergeClassifications([r1, r2])).toBe(r1);
  });

  it('orders false before true for each flag in the tie key', () => {
    expect(classificationTieKey(make({ abandoned: true }))).toBe('010|6.3');
    expect(classificationTieKey(make({ dormant: true, vulnerable: true }, ['6.3', '7.2']))).toBe('101|6.3,7.2');
    const d = make({ dormant: true });
    const a = make({ abandoned: true });
    expect(mergeClassifications([a, d])).toBe(d);
  });

  it('breaks full ties with different Reason text by the canonical key, in either order (12.22)', () => {
    const a = make({}, ['6.3'], 'Last release 800 days ago');
    const b = make({}, ['6.3'], 'Last release 900 days ago');
    expect(classificationTieKey(a)).toBe(classificationTieKey(b));
    const expected = canonicalKey(a) < canonicalKey(b) ? a : b;
    expect(expected).toBe(a);
    expect(mergeClassifications([a, b])).toBe(expected);
    expect(mergeClassifications([b, a])).toBe(expected);
  });

  it('compareClassifications is antisymmetric and zero only for equal canonical keys', () => {
    const a = make({}, ['6.3'], 'x');
    const b = make({}, ['6.3'], 'y');
    expect(compareClassifications(a, b)).toBe(-compareClassifications(b, a));
    expect(compareClassifications(a, b)).not.toBe(0);
    expect(compareClassifications(a, make({}, ['6.3'], 'x'))).toBe(0);
  });

  it('does not mutate the input list or its elements', () => {
    const list = [make({ score: 1 }), make({ score: 2 }), make({ score: 2, status: 'HAUNTED' })];
    const snapshot = JSON.stringify(list);
    const copy = [...list];
    mergeClassifications(list);
    expect(JSON.stringify(list)).toBe(snapshot);
    expect(list).toEqual(copy);
    list.forEach((item, i) => expect(item).toBe(copy[i]));
  });
});

describe('canonicalKey', () => {
  it('sorts object keys at every depth', () => {
    expect(canonicalKey({ b: 1, a: { d: 2, c: [{ z: 1, y: 2 }] } })).toBe('{"a":{"c":[{"y":2,"z":1}],"d":2},"b":1}');
  });

  it('keeps array order', () => {
    expect(canonicalKey([3, 1, 2])).toBe('[3,1,2]');
    const r = (ruleId: RuleId) => ({ ruleId, message: 'm', facts: [] });
    const x = make();
    const forward = { ...x, reasons: [r('6.3'), r('7.2')] };
    const reversed = { ...x, reasons: [r('7.2'), r('6.3')] };
    expect(canonicalKey(forward)).not.toBe(canonicalKey(reversed));
    expect(canonicalKey(forward).indexOf('6.3')).toBeLessThan(canonicalKey(forward).indexOf('7.2'));
  });

  it('is independent of property insertion order', () => {
    const a = make();
    const shuffled = {
      dormant: a.dormant,
      reasons: a.reasons,
      score: a.score,
      abandoned: a.abandoned,
      status: a.status,
      vulnerable: a.vulnerable,
    };
    expect(canonicalKey(shuffled)).toBe(canonicalKey(a));
  });
});
