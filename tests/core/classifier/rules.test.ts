import { describe, expect, it } from 'vitest';
import { unknownFactsRule } from '../../../core/classifier/rules/unknown-facts';
import { vulnerabilityRule } from '../../../core/classifier/rules/vulnerability';
import { HEALTH_FACT_FIELDS, normalizeFacts } from '../../../core/facts/normalize';
import { archivedRule } from '../../../core/classifier/rules/archived';
import { deprecatedRule } from '../../../core/classifier/rules/deprecated';
import { releaseAbandonedRule } from '../../../core/classifier/rules/release-abandoned';
import { releaseDormantRule } from '../../../core/classifier/rules/release-dormant';
import { releaseStaleRule } from '../../../core/classifier/rules/release-stale';
import { noMaintainersRule } from '../../../core/classifier/rules/no-maintainers';
import { singleMaintainerRule } from '../../../core/classifier/rules/single-maintainer';
import { ABANDONMENT_DAYS, COMMIT_ABANDONMENT_DAYS, DEFAULT_SEVERITY, STALE_DAYS } from '../../../core/model/constants';

const validAll = {
  daysSinceLastRelease: 10,
  daysSinceLastCommit: 5,
  archived: false,
  deprecated: false,
  openVulnerabilityCount: 0,
  maxSeverity: 'LOW',
  maintainerCount: 3,
};

const run = (raw: unknown) => ({
  unknown: unknownFactsRule.evaluate(normalizeFacts(raw)),
  vuln: vulnerabilityRule.evaluate(normalizeFacts(raw)),
});

const expectOneSentence = (message: string) => {
  expect(message.length).toBeGreaterThanOrEqual(1);
  expect(message.length).toBeLessThanOrEqual(200);
  expect(message.endsWith('.')).toBe(true);
  expect(message.slice(0, -1)).not.toMatch(/[.!?]/);
};

describe('rule 6.3 unknown facts', () => {
  it('lists all seven fields when every fact is unknown', () => {
    const reason = run({}).unknown;
    expect(reason?.ruleId).toBe('6.3');
    for (const f of HEALTH_FACT_FIELDS) expect(reason?.message).toContain(f);
    expectOneSentence(reason!.message);
  });

  it('lists exactly the one unknown field', () => {
    for (const field of HEALTH_FACT_FIELDS) {
      const raw: Record<string, unknown> = { ...validAll };
      delete raw[field];
      const reason = run(raw).unknown;
      // scan-accuracy 2.8: maxSeverity is not reportable when the open count is a valid 0.
      if (field === 'maxSeverity') {
        expect(reason).toBeNull();
        continue;
      }
      expect(reason).not.toBeNull();
      expect(reason!.message).toContain(field);
      for (const other of HEALTH_FACT_FIELDS) {
        if (other !== field) expect(reason!.message).not.toContain(other);
      }
      expectOneSentence(reason!.message);
    }
  });

  it('does not fire when all facts are valid', () => {
    expect(run(validAll).unknown).toBeNull();
  });
});

describe('rule 7.2 vulnerability', () => {
  it('fires with the known severity and count', () => {
    const reason = run({ ...validAll, openVulnerabilityCount: 3, maxSeverity: 'HIGH' }).vuln;
    expect(reason?.ruleId).toBe('7.2');
    expect(reason!.message).toContain('openVulnerabilityCount');
    expect(reason!.message).toContain('3');
    expect(reason!.message).toContain('maxSeverity');
    expect(reason!.message).toContain('HIGH');
    expect(reason!.message).not.toContain('assumed');
    expectOneSentence(reason!.message);
  });

  it('assumes DEFAULT_SEVERITY when severity is unknown', () => {
    const raw: Record<string, unknown> = { ...validAll, openVulnerabilityCount: 2 };
    delete raw.maxSeverity;
    const reason = run(raw).vuln;
    expect(reason?.ruleId).toBe('7.2');
    expect(reason!.message).toContain('maxSeverity');
    expect(reason!.message).toContain(DEFAULT_SEVERITY);
    expect(reason!.message).toContain('assumed');
    expect(reason!.facts).toContainEqual({ field: 'maxSeverity', value: DEFAULT_SEVERITY });
    expectOneSentence(reason!.message);
  });

  it('ignores severity when the count is 0', () => {
    expect(run({ ...validAll, openVulnerabilityCount: 0, maxSeverity: 'CRITICAL' }).vuln).toBeNull();
    expect(run({ ...validAll, openVulnerabilityCount: 0, maxSeverity: 'bogus' }).vuln).toBeNull();
  });

  it('does not fire for negative, fractional or missing counts', () => {
    expect(run({ ...validAll, openVulnerabilityCount: -1, maxSeverity: 'HIGH' }).vuln).toBeNull();
    expect(run({ ...validAll, openVulnerabilityCount: 1.5, maxSeverity: 'HIGH' }).vuln).toBeNull();
    const raw: Record<string, unknown> = { ...validAll };
    delete raw.openVulnerabilityCount;
    expect(run(raw).vuln).toBeNull();
  });
});

const abandonRules = [archivedRule, deprecatedRule, releaseAbandonedRule, releaseDormantRule];
const evalAbandon = (raw: unknown) =>
  abandonRules.flatMap((r) => {
    const reason = r.evaluate(normalizeFacts(raw));
    return reason ? [reason] : [];
  });
const ids = (raw: unknown) => evalAbandon(raw).map((r) => r.ruleId);

describe('rules 8.1 to 8.4 abandonment', () => {
  it('8.1 archived fires alone', () => {
    const reasons = evalAbandon({ ...validAll, archived: true });
    expect(reasons.map((r) => r.ruleId)).toEqual(['8.1']);
    expect(reasons[0].message).toContain('archived');
    expect(reasons[0].message).toContain('true');
    expect(reasons[0].facts).toContainEqual({ field: 'archived', value: true });
    expectOneSentence(reasons[0].message);
  });

  it('8.2 deprecated fires alone', () => {
    const reasons = evalAbandon({ ...validAll, deprecated: true });
    expect(reasons.map((r) => r.ruleId)).toEqual(['8.2']);
    expect(reasons[0].message).toContain('deprecated');
    expect(reasons[0].message).toContain('true');
    expect(reasons[0].facts).toContainEqual({ field: 'deprecated', value: true });
    expectOneSentence(reasons[0].message);
  });

  it('8.3 fires alone with release and commit both stale', () => {
    const reasons = evalAbandon({
      ...validAll,
      daysSinceLastRelease: ABANDONMENT_DAYS + 5,
      daysSinceLastCommit: COMMIT_ABANDONMENT_DAYS + 5,
    });
    expect(reasons.map((r) => r.ruleId)).toEqual(['8.3']);
    const m = reasons[0].message;
    expect(m).toContain('daysSinceLastRelease');
    expect(m).toContain(String(ABANDONMENT_DAYS + 5));
    expect(m).toContain('daysSinceLastCommit');
    expect(m).toContain(String(COMMIT_ABANDONMENT_DAYS + 5));
    expect(m).toContain('COMMIT_ABANDONMENT_DAYS (730)');
    expect(m).not.toContain('assumed');
    expectOneSentence(m);
  });

  it('8.4 fires alone with old release and recent commit', () => {
    const reasons = evalAbandon({
      ...validAll,
      daysSinceLastRelease: ABANDONMENT_DAYS + 5,
      daysSinceLastCommit: 3,
    });
    expect(reasons.map((r) => r.ruleId)).toEqual(['8.4']);
    const m = reasons[0].message;
    expect(m).toContain('daysSinceLastRelease');
    expect(m).toContain(String(ABANDONMENT_DAYS + 5));
    expect(m).toContain('daysSinceLastCommit');
    expect(m).toContain('3');
    expectOneSentence(m);
  });

  it('gives one Reason per rule when several apply', () => {
    const reasons = evalAbandon({
      ...validAll,
      archived: true,
      deprecated: true,
      daysSinceLastRelease: ABANDONMENT_DAYS,
      daysSinceLastCommit: COMMIT_ABANDONMENT_DAYS,
    });
    expect(reasons.map((r) => r.ruleId)).toEqual(['8.1', '8.2', '8.3']);
    const dormant = evalAbandon({
      ...validAll,
      archived: true,
      deprecated: true,
      daysSinceLastRelease: ABANDONMENT_DAYS,
      daysSinceLastCommit: 0,
    });
    expect(dormant.map((r) => r.ruleId)).toEqual(['8.1', '8.2', '8.4']);
  });

  it('gives no 8.1 to 8.4 when none is met', () => {
    expect(evalAbandon(validAll)).toEqual([]);
  });

  it('does not fire 8.1 or 8.2 for false or non-true values', () => {
    expect(ids({ ...validAll, archived: false, deprecated: false })).toEqual([]);
    expect(ids({ ...validAll, archived: 'yes', deprecated: 1 })).toEqual([]);
  });

  it('release at ABANDONMENT_DAYS - 1 gives neither 8.3 nor 8.4', () => {
    for (const commit of [0, STALE_DAYS - 1, STALE_DAYS, COMMIT_ABANDONMENT_DAYS - 1, COMMIT_ABANDONMENT_DAYS, COMMIT_ABANDONMENT_DAYS + 100]) {
      expect(
        ids({ ...validAll, daysSinceLastRelease: ABANDONMENT_DAYS - 1, daysSinceLastCommit: commit }),
      ).toEqual([]);
    }
    const raw: Record<string, unknown> = { ...validAll, daysSinceLastRelease: ABANDONMENT_DAYS - 1 };
    delete raw.daysSinceLastCommit;
    expect(ids(raw)).toEqual([]);
  });

  it('release 730 with commit 364, 365 and 729 gives 8.4 and no 8.3', () => {
    for (const commit of [STALE_DAYS - 1, STALE_DAYS, COMMIT_ABANDONMENT_DAYS - 1]) {
      expect(
        ids({ ...validAll, daysSinceLastRelease: ABANDONMENT_DAYS, daysSinceLastCommit: commit }),
      ).toEqual(['8.4']);
    }
  });
  it('release 730 with commit 730 gives 8.3 and no 8.4', () => {
    expect(
      ids({ ...validAll, daysSinceLastRelease: ABANDONMENT_DAYS, daysSinceLastCommit: COMMIT_ABANDONMENT_DAYS }),
    ).toEqual(['8.3']);
  });
  it('8.3 text names COMMIT_ABANDONMENT_DAYS (730) for a known commit age', () => {
    const reasons = evalAbandon({
      ...validAll,
      daysSinceLastRelease: ABANDONMENT_DAYS,
      daysSinceLastCommit: COMMIT_ABANDONMENT_DAYS,
    });
    expect(reasons[0].message).toContain('COMMIT_ABANDONMENT_DAYS (730)');
  });
  it('release 729 gives neither 8.3 nor 8.4 for commit 364, 365, 729, 730 and null', () => {
    for (const commit of [364, 365, 729, 730]) {
      expect(
        ids({ ...validAll, daysSinceLastRelease: ABANDONMENT_DAYS - 1, daysSinceLastCommit: commit }),
      ).toEqual([]);
    }
  });
  it('unknown commit gives 8.3 naming COMMIT_ABANDONMENT_DAYS (730)', () => {
    const raw: Record<string, unknown> = { ...validAll, daysSinceLastRelease: ABANDONMENT_DAYS };
    delete raw.daysSinceLastCommit;
    const reasons = evalAbandon(raw);
    expect(reasons.map((r) => r.ruleId)).toEqual(['8.3']);
    expect(reasons[0].message).toContain('daysSinceLastCommit');
    expect(reasons[0].message).toContain('unknown');
    expect(reasons[0].message).toContain('COMMIT_ABANDONMENT_DAYS (730)');
    expectOneSentence(reasons[0].message);
  });

  it('unknown release gives neither 8.3 nor 8.4', () => {
    const raw: Record<string, unknown> = { ...validAll };
    delete raw.daysSinceLastRelease;
    expect(ids(raw)).toEqual([]);
  });
});

const evalOne = (rule: { evaluate: (f: ReturnType<typeof normalizeFacts>) => unknown }, raw: unknown) =>
  rule.evaluate(normalizeFacts(raw)) as { ruleId: string; message: string; facts: unknown[] } | null;

describe('rule 10.6 stale release', () => {
  it('fires at STALE_DAYS', () => {
    const r = evalOne(releaseStaleRule, { ...validAll, daysSinceLastRelease: STALE_DAYS });
    expect(r?.ruleId).toBe('10.6');
    expect(r!.message).toContain('daysSinceLastRelease');
    expect(r!.message).toContain(String(STALE_DAYS));
    expect(r!.facts).toContainEqual({ field: 'daysSinceLastRelease', value: STALE_DAYS });
    expectOneSentence(r!.message);
  });

  it('fires at ABANDONMENT_DAYS - 1', () => {
    const r = evalOne(releaseStaleRule, { ...validAll, daysSinceLastRelease: ABANDONMENT_DAYS - 1 });
    expect(r?.ruleId).toBe('10.6');
    expect(r!.message).toContain(String(ABANDONMENT_DAYS - 1));
    expectOneSentence(r!.message);
  });

  it('does not fire at STALE_DAYS - 1, ABANDONMENT_DAYS, or when unknown', () => {
    expect(evalOne(releaseStaleRule, { ...validAll, daysSinceLastRelease: STALE_DAYS - 1 })).toBeNull();
    expect(evalOne(releaseStaleRule, { ...validAll, daysSinceLastRelease: ABANDONMENT_DAYS })).toBeNull();
    const raw: Record<string, unknown> = { ...validAll };
    delete raw.daysSinceLastRelease;
    expect(evalOne(releaseStaleRule, raw)).toBeNull();
  });
});

describe('rules 10.7 and 10.8 maintainers', () => {
  it('10.7 fires for 0 maintainers with a Reason only', () => {
    const r = evalOne(noMaintainersRule, { ...validAll, maintainerCount: 0 });
    expect(r?.ruleId).toBe('10.7');
    expect(r!.message).toContain('maintainerCount');
    expect(r!.facts).toContainEqual({ field: 'maintainerCount', value: 0 });
    expectOneSentence(r!.message);
    expect(evalOne(singleMaintainerRule, { ...validAll, maintainerCount: 0 })).toBeNull();
  });

  it('10.8 fires for 1 maintainer', () => {
    const r = evalOne(singleMaintainerRule, { ...validAll, maintainerCount: 1 });
    expect(r?.ruleId).toBe('10.8');
    expect(r!.message).toContain('maintainerCount');
    expect(r!.facts).toContainEqual({ field: 'maintainerCount', value: 1 });
    expectOneSentence(r!.message);
    expect(evalOne(noMaintainersRule, { ...validAll, maintainerCount: 1 })).toBeNull();
  });

  it('neither fires for 2 or null', () => {
    for (const rule of [noMaintainersRule, singleMaintainerRule]) {
      expect(evalOne(rule, { ...validAll, maintainerCount: 2 })).toBeNull();
      const raw: Record<string, unknown> = { ...validAll };
      delete raw.maintainerCount;
      expect(evalOne(rule, raw)).toBeNull();
    }
  });
});

describe('requirement 11.4 message length', () => {
  it('6.3 with all seven fields unknown is at most 200 characters', () => {
    const r = unknownFactsRule.evaluate(normalizeFacts({}));
    expect(r!.message.length).toBeLessThanOrEqual(200);
  });

  it('8.3 with 22-character numbers is at most 200 characters', () => {
    const big = 1.7976931348623157e308;
    expect(String(big).length).toBeGreaterThanOrEqual(22);
    for (const n of [1e21, big]) {
      const reasons = evalAbandon({ ...validAll, daysSinceLastRelease: n, daysSinceLastCommit: n });
      expect(reasons.map((x) => x.ruleId)).toEqual(['8.3']);
      expect(reasons[0].message.length).toBeLessThanOrEqual(200);
    }
  });
});
