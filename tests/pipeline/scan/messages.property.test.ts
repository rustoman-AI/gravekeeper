import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import {
  ERROR_CODES,
  INVALID_REQUEST_MESSAGES,
  INVALID_URL_MESSAGES,
  NOTE_CODES,
  NOTE_MESSAGES,
  renderErrorMessage,
  renderNoteMessage,
} from '../../../pipeline/scan/messages';
import type { ErrorCode, MessageDetails } from '../../../pipeline/scan/messages';
import { cfg } from '../../support/fc-config';

// Requirement 20.16

const EM_DASH = '\u2014';

/** Raw input alphabet: characters that occur in none of the fixed texts. */
const RAW_CHARS = [...'ΩжあЖ☃€ßñ§¤¿¡Ψ'];
const rawInput = fc.array(fc.constantFrom(...RAW_CHARS), { minLength: 3, maxLength: 24 }).map((a) => a.join(''));

const word = fc.stringMatching(/^[a-z][a-z0-9_-]{0,14}$/);
const token = fc
  .stringMatching(/^[A-Za-z0-9]{20,36}$/)
  .map((t) => `ghp_${t}`);

/** Validated interpolated values, by details key. */
const values = fc.record({
  name: word,
  path: fc.array(word, { minLength: 1, maxLength: 3 }).map((a) => `${a.join('/')}/package.json`),
  pinned: fc.stringMatching(/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/),
  pins: fc.array(fc.stringMatching(/^[0-9]{1,3}\.[0-9]{1,3}$/), { minLength: 1, maxLength: 4 }),
  ecosystem: fc.constantFrom('npm', 'pypi', 'cargo'),
  sourceRepo: fc.tuple(word, word).map(([o, r]) => `${o}/${r}`),
  ids: fc.array(fc.stringMatching(/^[A-Z]{3,6}-[0-9]{1,4}$/), { minLength: 1, maxLength: 4 }),
  total: fc.nat({ max: 5000 }),
  limit: fc.nat({ max: 500 }),
  source: fc.constantFrom('github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'),
  branch: fc.array(word, { minLength: 1, maxLength: 3 }).map((a) => a.join('/')),
});

const webHost = fc
  .array(fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/), { minLength: 2, maxLength: 3 })
  .map((a) => a.join('.'));

const URL_PARTS = Object.keys(INVALID_URL_MESSAGES);
const REASONS = Object.keys(INVALID_REQUEST_MESSAGES);

function flatten(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(flatten);
  return [String(v)];
}

describe('scan messages', () => {
  it('P8 The unresolved-range message contains no range text', () => {
    // Feature: scan-accuracy, Property 8: The unresolved-range message contains no range text
    // Validates: Requirements 11.3, 11.5
    const hostile = fc.oneof(
      rawInput,
      fc.constantFrom('>=1 \u2014 <2', '{name}', '{ranges}', 'GET /v1/pkg?x=1 HTTP/1.1', '^1.2.3 || {name}'),
      fc.array(fc.constantFrom('\u2014', '{', '}', 'name', ' ', '^', '1', 'x'), { minLength: 3, maxLength: 12 }).map((a) => a.join('')),
    );
    fc.assert(
      fc.property(word, fc.array(hostile, { minLength: 1, maxLength: 4 }), (name, ranges) => {
        const message = renderNoteMessage('range-unresolved', { ecosystem: 'npm', name, ranges });
        const expected = NOTE_MESSAGES['range-unresolved'].replace('{name}', name);
        if (message !== expected) throw new Error('message differs: ' + message);
        if (message.includes(EM_DASH)) throw new Error('em dash in message');
        for (const r of ranges) {
          if (expected.includes(r)) continue;
          if (message.includes(r)) throw new Error('range text in message: ' + r);
        }
      }),
      cfg(),
    );
  });

  it('P76 Rendered messages are safe', () => {
    // Feature: scan-pipeline, Property 76: Rendered messages are safe
    // Validates: Requirements 20.16
    fc.assert(
      fc.property(values, token, rawInput, webHost, (vals, tok, raw, host) => {
        const interpolated = [...Object.values(vals).flatMap(flatten), host];
        // Untrusted extras: they are never placeholder keys, so they must never be rendered.
        const extras = { ranges: [raw, EM_DASH + tok], raw, token: tok, message: raw, field: raw, url: raw, resetAt: tok };
        const rendered: string[] = [];
        for (const code of NOTE_CODES) {
          rendered.push(renderNoteMessage(code, { ...vals, ...extras }));
        }
        for (const code of ERROR_CODES as readonly ErrorCode[]) {
          const base: MessageDetails = { ...vals, ...extras };
          if (code === 'invalid-url') {
            for (const part of [...URL_PARTS, raw, tok]) {
              rendered.push(renderErrorMessage(code, { ...base, part }, host));
            }
          } else if (code === 'invalid-request') {
            for (const reason of [...REASONS, raw, tok]) {
              rendered.push(renderErrorMessage(code, { ...base, reason }, host));
            }
          } else {
            rendered.push(renderErrorMessage(code, base, host));
          }
        }
        rendered.push(renderErrorMessage('invalid-url', undefined, host));
        rendered.push(renderErrorMessage('invalid-request', undefined, host));

        const chars = [...raw];
        for (const message of rendered) {
          if (message.includes(tok)) throw new Error(`token in message: ${message}`);
          if (message.includes(EM_DASH)) throw new Error(`em dash in message: ${message}`);
          for (let i = 0; i + 3 <= chars.length; i += 1) {
            for (let j = i + 3; j <= chars.length; j += 1) {
              const sub = chars.slice(i, j).join('');
              if (interpolated.some((v) => v.includes(sub))) continue;
              if (message.includes(sub)) throw new Error(`raw input "${sub}" in message: ${message}`);
            }
          }
        }
      }),
      cfg(),
    );
  });
});
