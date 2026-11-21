import type { Classification, Reason, RuleId } from '../core';
import { REASON_PRIORITY } from './constants';
import { plotKindOf, statusWordOf } from './grave-type';
import { plural } from './plural';
import type { PlotKind } from './types';

export { REASON_PRIORITY, statusWordOf };

// Requirement 7.4: first REASON_PRIORITY entry present; otherwise reasons[0]; null without any.
export function strongestReason(c: Classification | null): Reason | null {
  if (c === null) return null;
  for (const ruleId of REASON_PRIORITY) {
    const found = c.reasons.find((r) => r.ruleId === ruleId);
    if (found !== undefined) return found;
  }
  return c.reasons[0] ?? null;
}

function factValue(reason: Reason, field: string): unknown {
  return reason.facts.find((f) => f.field === field)?.value;
}

const SHORT_FORMS: Readonly<Record<Exclude<RuleId, '7.2'>, string>> = {
  '8.1': 'archived',
  '8.2': 'deprecated',
  '8.3': 'no release or commit for a long time, may be finished or abandoned',
  '8.4': 'dormant releases',
  '10.7': 'no maintainers',
  '10.8': 'single maintainer',
  '10.6': 'stale release',
  '6.3': 'some facts unknown',
  '11.2': 'no risk signals found',
};

// Requirement 7.5: short label of a rule; 7.2 takes its numbers from the reason facts.
export function shortForm(reason: Reason): string {
  if (reason.ruleId !== '7.2') return SHORT_FORMS[reason.ruleId];
  const count = factValue(reason, 'openVulnerabilityCount');
  const severity = factValue(reason, 'maxSeverity');
  const n = typeof count === 'number' ? `${String(count)} open ${plural(count, 'vulnerability', 'vulnerabilities')}` : 'open vulnerabilities';
  return typeof severity === 'string' ? `${n} (${severity})` : n;
}

/** Epitaph text after the name (requirements 7.5, 7.19, 7.20). Empty string when there is nothing to say. */
export function epitaphOf(name: string, c: Classification | null): string {
  const kind: PlotKind = plotKindOf(c);
  if (c === null || kind === 'unmarked') return name;
  if (kind === 'overgrown') {
    const reason = c.reasons.find((r) => r.ruleId === '8.3');
    const days = reason === undefined ? null : factValue(reason, 'daysSinceLastRelease');
    const tail = typeof days === 'number' && Number.isFinite(days) ? `, last release ${String(days)} ${plural(days, 'day', 'days')} ago` : '';
    return `${name} may be finished or abandoned${tail}`;
  }
  const strongest = strongestReason(c);
  if (strongest === null) return name;
  let text = `${name}, ${shortForm(strongest)}`;
  if (kind === 'restless') {
    const archived = c.reasons.some((r) => r.ruleId === '8.1');
    const deprecated = c.reasons.some((r) => r.ruleId === '8.2');
    if (archived && deprecated) text += ', also archived and deprecated';
    else if (archived) text += ', also archived';
    else if (deprecated) text += ', also deprecated';
  }
  return text;
}
