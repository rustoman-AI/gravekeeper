const REDACTED = "[redacted]";
const BEARER_PREFIX = "Bearer ";

/**
 * Replaces every occurrence of each secret, and of `Bearer ` followed by a
 * secret, with `[redacted]`. Empty secrets are ignored. Matching is a single
 * left-to-right scan that prefers the longest match at each position, so
 * overlapping secrets are fully covered. No regular expression is built from
 * a secret. The `Bearer ` prefix is matched case-insensitively; secrets are
 * matched exactly.
 */
export function scrubSecrets(text: string, secrets: readonly string[]): string {
  const unique = Array.from(new Set(secrets.filter((s) => s.length > 0)));
  if (unique.length === 0 || text.length === 0) return text;
  unique.sort((a, b) => b.length - a.length);

  let out = "";
  let i = 0;
  let last = 0;
  while (i < text.length) {
    const len = matchLengthAt(text, i, unique);
    if (len > 0) {
      out += text.slice(last, i) + REDACTED;
      i += len;
      last = i;
    } else {
      i += 1;
    }
  }
  return last === 0 ? text : out + text.slice(last);
}

function matchLengthAt(text: string, i: number, secrets: readonly string[]): number {
  let best = 0;
  const hasBearer =
    text.length - i >= BEARER_PREFIX.length &&
    text.slice(i, i + BEARER_PREFIX.length).toLowerCase() === "bearer ";
  for (const s of secrets) {
    if (text.startsWith(s, i)) best = Math.max(best, s.length);
    if (hasBearer && text.startsWith(s, i + BEARER_PREFIX.length)) {
      best = Math.max(best, BEARER_PREFIX.length + s.length);
    }
  }
  return best;
}
