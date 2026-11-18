// EF-5: OSV querybatch response shapes.

export function osvVuln(id: unknown): unknown {
  return { id, modified: '2024-01-01T00:00:00Z' };
}

export function osvResult(ids: readonly unknown[], nextPageToken?: unknown): Record<string, unknown> {
  const entry: Record<string, unknown> = {};
  if (ids.length > 0) entry.vulns = ids.map(osvVuln);
  if (nextPageToken !== undefined) entry.next_page_token = nextPageToken;
  return entry;
}

export function osvBatchBody(results: readonly unknown[]): unknown {
  return { results };
}
