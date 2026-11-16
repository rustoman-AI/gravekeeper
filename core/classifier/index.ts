// classify(): total, pure entry point for health classification.
import { normalizeFacts, type NormalizedFacts } from '../facts/normalize';
import { isAbandoned, isDormant, isVulnerable } from '../facts/predicates';
import { guard } from '../internal/safe';
import type { Classification } from '../model/types';
import { computeScore } from '../scoring';
import { runRules } from './pipeline';
import { statusOf } from './status';

// Requirement 10.1: Risk_Score is an integer 0..100
const MAX_RISK_SCORE = 100;

const clampScore = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_RISK_SCORE, Math.max(0, Math.round(n)));
};

function classifyNormalized(facts: NormalizedFacts): Classification {
  const vulnerable = isVulnerable(facts);
  const abandoned = isAbandoned(facts);
  return {
    status: statusOf(vulnerable, abandoned),
    score: clampScore(computeScore(facts)),
    reasons: runRules(facts),
    vulnerable,
    abandoned,
    dormant: isDormant(facts),
  };
}

// Requirements 6.4, 6.5, 9.1-9.4, 10.1, 11.1-11.3, 11.5
export function classify(facts: unknown): Classification {
  return guard(
    () => classifyNormalized(normalizeFacts(facts)),
    () => classifyNormalized(normalizeFacts(undefined)),
  );
}
