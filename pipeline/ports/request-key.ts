import type { HttpRequest } from './http';

// Requirement 19.3
function compareKeys(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ca = a.codePointAt(i) as number;
    const cb = b.codePointAt(j) as number;
    if (ca !== cb) return ca < cb ? -1 : 1;
    i += ca > 0xffff ? 2 : 1;
    j += cb > 0xffff ? 2 : 1;
  }
  if (i < a.length) return 1;
  if (j < b.length) return -1;
  return 0;
}

function isOmitted(value: unknown): boolean {
  return value === undefined || typeof value === 'function' || typeof value === 'symbol';
}

function write(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
      return Number.isFinite(value) ? JSON.stringify(value) : 'null';
    case 'boolean':
      return value ? 'true' : 'false';
    case 'bigint':
      return JSON.stringify(value.toString());
    case 'object': {
      if (Array.isArray(value)) {
        const items: string[] = [];
        for (let i = 0; i < value.length; i += 1) {
          const item: unknown = value[i];
          items.push(isOmitted(item) ? 'null' : write(item));
        }
        return `[${items.join(',')}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort(compareKeys);
      const parts: string[] = [];
      for (const key of keys) {
        const item = record[key];
        if (isOmitted(item)) continue;
        parts.push(`${JSON.stringify(key)}:${write(item)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      return 'null';
  }
}

/**
 * Serializes a JSON-like value with object keys in ascending code point order
 * and array order kept. Injective on JSON values. Pure.
 */
export function canonicalJson(value: unknown): string {
  return write(value);
}

// Requirement 19.2, 19.4, 23.3
/** Key of an upstream request. Holds no header and no token. */
export function requestKey(
  request: Pick<HttpRequest, 'source' | 'method' | 'url' | 'body'>,
): string {
  return canonicalJson(['req', request.source, request.method, request.url, request.body]);
}
