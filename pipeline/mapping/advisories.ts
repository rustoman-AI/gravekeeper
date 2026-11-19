import { ADVISORY_URL_PREFIX } from '../constants';
import { compareCodePoints } from './compare-code-points';
import type { AdvisoryEntry, AdvisoryRecord } from './types';

// Requirement 6.1 - 6.9

const HEX = '0123456789ABCDEF';

function isUnreserved(byte: number): boolean {
  return (
    (byte >= 0x41 && byte <= 0x5a) || // A-Z
    (byte >= 0x61 && byte <= 0x7a) || // a-z
    (byte >= 0x30 && byte <= 0x39) || // 0-9
    byte === 0x2e || // .
    byte === 0x5f || // _
    byte === 0x3a || // :
    byte === 0x2d // -
  );
}

/**
 * `ADVISORY_URL_PREFIX` plus the id with every UTF-8 byte outside
 * `A-Za-z0-9._:-` percent-encoded. A lone surrogate becomes `%EF%BF%BD`
 * (TextEncoder substitutes U+FFFD). Never throws.
 */
export function advisoryUrl(id: string): string {
  let out = ADVISORY_URL_PREFIX;
  for (const byte of new TextEncoder().encode(id)) {
    out += isUnreserved(byte)
      ? String.fromCharCode(byte)
      : `%${HEX[byte >> 4]}${HEX[byte & 15]}`;
  }
  return out;
}

/**
 * One entry per distinct non-empty string id, ascending by code point. An id
 * with a record lists the record's aliases (distinct, ascending, without the
 * id, non-empty) and severity; an id without one lists no
 * aliases and a null severity.
 */
export function buildAdvisoryEntries(
  ids: readonly unknown[],
  records: ReadonlyMap<string, AdvisoryRecord>,
): readonly AdvisoryEntry[] {
  const distinct = new Set<string>();
  for (const id of ids) {
    if (typeof id === 'string' && id !== '') distinct.add(id);
  }
  return [...distinct].sort(compareCodePoints).map((id): AdvisoryEntry => {
    const record = records.get(id);
    if (record === undefined) return { id, aliases: [], severity: null, url: advisoryUrl(id) };
    const aliases = new Set<string>();
    for (const alias of record.aliases) {
      if (alias !== '' && alias !== id) aliases.add(alias);
    }
    return {
      id,
      aliases: [...aliases].sort(compareCodePoints),
      severity: record.severity,
      url: advisoryUrl(id),
    };
  });
}
