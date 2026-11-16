import { compareCodePoints } from './compare';

function write(value: unknown, out: string[]): void {
  if (value === null || value === undefined) {
    out.push('null');
    return;
  }
  if (Array.isArray(value)) {
    out.push('[');
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out.push(',');
      write(value[i], out);
    }
    out.push(']');
    return;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort(compareCodePoints);
    out.push('{');
    for (let i = 0; i < keys.length; i++) {
      if (i > 0) out.push(',');
      out.push(JSON.stringify(keys[i]), ':');
      write(record[keys[i]], out);
    }
    out.push('}');
    return;
  }
  const text = JSON.stringify(value);
  out.push(text === undefined ? 'null' : text);
}

/**
 * Classification_Canonical_Key: canonical JSON with no insignificant whitespace,
 * object keys sorted by code point at every depth, array order kept.
 * Deeply equal values yield equal keys.
 */
export function canonicalKey(value: unknown): string {
  const out: string[] = [];
  write(value, out);
  return out.join('');
}
