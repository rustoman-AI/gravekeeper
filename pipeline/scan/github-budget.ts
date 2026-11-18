// Requirement 14.2, 14.3, 14.4, 14.6, 14.8, 14.9
import { GITHUB_BUDGET_THRESHOLD } from '../constants';
import { readGraphqlRateLimit, readRestRateLimit } from '../mapping/rate-limit';
import type { RateLimitReading } from '../mapping/rate-limit';
import type { AttemptGate, SourceHeaders } from '../ports/http';

/**
 * GitHub_Budget of one scan. Create a new instance per scan: it starts unknown
 * (R14.6). `remaining` changes only when a reading holds an integer, and
 * `resetAt` only when a reading holds a valid instant, so the last known
 * values survive responses that carry neither.
 */
export class GithubBudget implements AttemptGate {
  private remainingValue: number | null = null;
  private resetAtValue: string | null = null;

  get remaining(): number | null {
    return this.remainingValue;
  }

  get resetAt(): string | null {
    return this.resetAtValue;
  }

  /** False when the budget is known and below GITHUB_BUDGET_THRESHOLD. */
  allow(): boolean {
    return this.remainingValue === null || this.remainingValue >= GITHUB_BUDGET_THRESHOLD;
  }

  /** Reads the REST rate limit headers of one attempt that received a response. */
  observe(headers: SourceHeaders): void {
    this.apply(readRestRateLimit(headers));
  }

  /** Reads `data.rateLimit` of a parsed GraphQL body. */
  observeGraphql(body: unknown): void {
    this.apply(readGraphqlRateLimit(body));
  }

  private apply(reading: RateLimitReading): void {
    if (reading.remaining !== null) this.remainingValue = reading.remaining;
    if (reading.resetAt !== null) this.resetAtValue = reading.resetAt;
  }
}
