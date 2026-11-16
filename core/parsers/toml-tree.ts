import { parse } from 'smol-toml';
import { err, ok, type Result } from '../internal/result';

export type TomlTable = { readonly [key: string]: unknown };

const MAX_MESSAGE_LENGTH = 200;

function truncate(text: string): string {
  if (text.length <= MAX_MESSAGE_LENGTH) return text;
  // Do not cut a surrogate pair in half.
  let end = MAX_MESSAGE_LENGTH;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}...`;
}

function safeString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return '';
  }
}

function describe(e: unknown): { message: string; line?: number } {
  let name = 'Error';
  let detail = '';
  let line: number | undefined;
  try {
    if (e instanceof Error) {
      if (typeof e.name === 'string' && e.name !== '') name = e.name;
      detail = typeof e.message === 'string' ? e.message : '';
    } else {
      detail = safeString(e);
    }
    if (typeof e === 'object' && e !== null) {
      const candidate: unknown = (e as { line?: unknown }).line;
      if (typeof candidate === 'number' && Number.isFinite(candidate)) line = candidate;
    }
  } catch {
    // Hostile getters: fall back to what was collected so far.
  }
  // smol-toml embeds a multi-line code block; keep only the first line.
  detail = detail.split(/\r\n|\r|\n/, 1)[0] ?? '';
  const message = truncate(detail === '' ? name : `${name}: ${detail}`);
  return line === undefined ? { message } : { message, line };
}

/** Parses TOML text. Never throws: every failure becomes an `err` Result. */
export function parseToml(text: string): Result<TomlTable, { message: string; line?: number }> {
  try {
    return ok(parse(text));
  } catch (e: unknown) {
    return err(describe(e));
  }
}
