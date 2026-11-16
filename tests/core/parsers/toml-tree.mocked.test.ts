import { describe, expect, it, vi } from 'vitest';

const parseMock = vi.hoisted(() => vi.fn());
vi.mock('smol-toml', () => ({ parse: parseMock }));

import { parseToml } from '../../../core/parsers/toml-tree';

describe('parseToml (mocked smol-toml)', () => {
  it('turns a thrown Error into a Result', () => {
    parseMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const r = parseToml('x');
    expect(r).toEqual({ ok: false, error: { message: 'Error: boom' } });
  });

  it('turns a thrown string into a Result', () => {
    parseMock.mockImplementationOnce(() => {
      throw 'plain string';
    });
    const r = parseToml('x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('plain string');
  });

  it('turns a thrown undefined into a Result', () => {
    parseMock.mockImplementationOnce(() => {
      throw undefined;
    });
    const r = parseToml('x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.error.message).toBe('string');
  });

  it('keeps only the first line of a multi-line message', () => {
    parseMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('bad value at row 2\n\n1 | a\n2 | b\n  ^'), { line: 2 });
    });
    const r = parseToml('x');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toBe('Error: bad value at row 2');
      expect(r.error.message).not.toMatch(/[\r\n]/);
      expect(r.error.line).toBe(2);
    }
  });
});
