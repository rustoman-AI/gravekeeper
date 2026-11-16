import { describe, expect, it } from 'vitest';
import { parseToml } from '../../../core/parsers/toml-tree';

describe('parseToml (real smol-toml)', () => {
  it('passes the line number through for invalid TOML', () => {
    const r = parseToml('a = 1\nb = = 2\n');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.line).toBe(2);
      expect(r.error.message).not.toMatch(/[\r\n]/);
      expect(r.error.message.length).toBeLessThanOrEqual(203);
    }
  });

  it('keeps __proto__, constructor and prototype as own enumerable properties', () => {
    const objectProtoKeys = Object.getOwnPropertyNames(Object.prototype).sort();
    const protoBefore = Object.getPrototypeOf({});
    const text = [
      '[dependencies]',
      '"__proto__" = "1"',
      'constructor = "2"',
      'prototype = "3"',
      '',
    ].join('\n');
    const r = parseToml(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const deps = r.value.dependencies as Record<string, unknown>;
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      expect(Object.prototype.hasOwnProperty.call(deps, key)).toBe(true);
      expect(Object.getOwnPropertyDescriptor(deps, key)?.enumerable).toBe(true);
    }
    expect(Object.entries(deps)).toEqual(
      expect.arrayContaining([
        ['__proto__', '1'],
        ['constructor', '2'],
        ['prototype', '3'],
      ]),
    );
    expect(Object.getPrototypeOf({})).toBe(protoBefore);
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(objectProtoKeys);
    expect(({} as Record<string, unknown>).__proto__).toBe(Object.prototype);
    expect((Object.prototype as Record<string, unknown>).prototype).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
