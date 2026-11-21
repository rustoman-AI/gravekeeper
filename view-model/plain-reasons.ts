// Plain-language wording of a core Reason (graveyard-art GA-D10, GA-P7).
// Pure and total: the line is chosen from the ruleId table; numbers come only from the
// reason facts. The core message is never read and the ruleId is never interpolated.
import type { Reason } from '../core/model/types';
import { plural } from './plural';

const SEVERITIES: readonly string[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// Requirement 8.3: a ruleId that core does not define gets this fixed line.
const UNKNOWN_RULE_LINE =
  'The caretaker has no plain wording for this rule yet. Open "Show the rule" to read the exact message.';

/** First fact of the given field, or undefined. Tolerates a malformed facts list. */
function factValue(reason: Reason, field: string): unknown {
  const facts: unknown = (reason as { facts?: unknown }).facts;
  if (!Array.isArray(facts)) return undefined;
  for (const f of facts as unknown[]) {
    if (typeof f === 'object' && f !== null && (f as { field?: unknown }).field === field) {
      return (f as { value?: unknown }).value;
    }
  }
  return undefined;
}

// Requirement 8.4: only a finite integer of at least 0 is usable as a number.
function countFact(reason: Reason): number | null {
  const v = factValue(reason, 'openVulnerabilityCount');
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
}

function severityFact(reason: Reason): string | null {
  const v = factValue(reason, 'maxSeverity');
  return typeof v === 'string' && SEVERITIES.includes(v) ? v : null;
}

// Requirement 8.2: the vulnerability line with or without its facts.
function vulnerabilityLine(reason: Reason): string {
  const count = countFact(reason);
  const severity = severityFact(reason);
  if (count === null) return 'It has open vulnerabilities.';
  const noun = `${String(count)} open ${plural(count, 'vulnerability', 'vulnerabilities')}`;
  return severity === null
    ? `It has ${noun}.`
    : `It has ${noun}, the worst of severity ${severity}.`;
}

// Requirement 8.1: one line for every ruleId that core defines.
const FIXED_LINES: Readonly<Record<string, string>> = {
  '8.1': 'Its maintainers archived the repository, so it takes no more changes.',
  '8.2': 'Its maintainers deprecated this package and point people elsewhere.',
  '8.3': 'It has had no release and no commit for a very long time.',
  '8.4': 'It has not had a release for a long while, but its code is still being changed.',
  '10.6': 'Its last release is old.',
  '10.7': 'No one is listed as maintaining it.',
  '10.8': 'A single person maintains it.',
  '6.3': 'The records leave out some facts, so the caretaker added no risk for them.',
  '11.2': 'The caretaker found no risk signals.',
};

export function plainReasonLine(reason: Reason): string {
  const id: unknown = (reason as { ruleId?: unknown }).ruleId;
  if (id === '7.2') return vulnerabilityLine(reason);
  if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(FIXED_LINES, id)) {
    return FIXED_LINES[id] as string;
  }
  return UNKNOWN_RULE_LINE;
}
