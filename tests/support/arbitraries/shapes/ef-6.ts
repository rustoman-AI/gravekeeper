// EF-6: OSV advisory body shapes.

export interface OsvAdvisoryOptions {
  readonly aliases?: unknown;
  readonly withdrawn?: unknown;
  readonly informational?: unknown;
  readonly databaseSeverity?: unknown;
  readonly cvss?: readonly string[];
}

export function osvAdvisoryBody(id: unknown, options: OsvAdvisoryOptions = {}): Record<string, unknown> {
  const body: Record<string, unknown> = { id, modified: '2024-01-01T00:00:00Z' };
  if (options.aliases !== undefined) body.aliases = options.aliases;
  if (options.withdrawn !== undefined) body.withdrawn = options.withdrawn;
  if (options.informational !== undefined) {
    body.affected = [{ package: { name: 'x', ecosystem: 'crates.io' }, database_specific: { informational: options.informational } }];
  }
  if (options.databaseSeverity !== undefined) body.database_specific = { severity: options.databaseSeverity };
  if (options.cvss !== undefined) body.severity = options.cvss.map((score) => ({ type: 'CVSS_V3', score }));
  return body;
}

/** RUSTSEC-2020-0036 (failure): informational "unmaintained". */
export const RUSTSEC_2020_0036: Record<string, unknown> = osvAdvisoryBody('RUSTSEC-2020-0036', {
  aliases: ['GHSA-jq66-xh47-j9f3', 'RUSTSEC-2019-0036'],
  informational: 'unmaintained',
});
