// Requirement 23.7, 20.13

/** True for the only header names a fixture may store: content-type, retry-after, x-ratelimit-*. */
export function isAllowedHeaderName(lowerName: string): boolean {
  return (
    lowerName === 'content-type' || lowerName === 'retry-after' || lowerName.startsWith('x-ratelimit-')
  );
}

/**
 * Keeps only the allow-listed headers. Names are compared case-insensitively and stored
 * lowercase, keys are in ascending order, and every other header (Authorization, set-cookie,
 * x-request-id, ...) is dropped.
 */
export function allowHeaders(
  headers: Readonly<Record<string, string | undefined>> | null | undefined,
): Record<string, string> {
  const kept: Record<string, string> = {};
  if (headers === null || headers === undefined) return kept;
  for (const name of Object.keys(headers)) {
    const value = headers[name];
    const lower = name.toLowerCase();
    if (typeof value === 'string' && isAllowedHeaderName(lower)) kept[lower] = value;
  }
  const sorted: Record<string, string> = {};
  for (const name of Object.keys(kept).sort()) sorted[name] = kept[name] as string;
  return sorted;
}
