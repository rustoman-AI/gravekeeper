// Requirement 20.13, 23.6

const TOKEN_PREFIXES: readonly string[] = ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'github_pat_'];

/** Raised by `assertNoSecrets`. The message names the rule that matched and never the matched text. */
export class SecretFoundError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`fixture rejected: ${reason}`);
    this.name = 'SecretFoundError';
    this.reason = reason;
  }
}

/**
 * Rejects serialized fixture text that contains the token, `Bearer `, an `Authorization`
 * header name (any case, like the hygiene test) or a GitHub token prefix. Never echoes the
 * text or the token.
 */
export function assertNoSecrets(serialized: string, token: string | null): void {
  if (token !== null && token !== '') {
    if (serialized.includes(token)) throw new SecretFoundError('contains the token');
    if (serialized.includes(`Bearer ${token}`)) throw new SecretFoundError('contains a Bearer token');
  }
  if (serialized.includes('Bearer ')) throw new SecretFoundError('contains "Bearer "');
  if (/authorization/i.test(serialized)) throw new SecretFoundError('contains "Authorization"');
  for (const prefix of TOKEN_PREFIXES) {
    if (serialized.includes(prefix)) throw new SecretFoundError(`contains token prefix ${prefix}`);
  }
}
