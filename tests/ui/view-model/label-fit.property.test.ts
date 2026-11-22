// Feature: polish-leftovers, Property 3: Label wrapping preserves the name and breaks only at hyphens
// Feature: polish-leftovers, Property 5: Labels that fit the model are never clipped
// Validates: Requirements 2.1, 2.2, 2.3, 2.4
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LABEL_MAX_LINES } from '../../../view-model/constants';
import {
  LABEL_CHAR_WIDTH_PX,
  mayTruncateLabel,
  wrapLabel,
} from '../../../view-model/label-fit';
import { cfg } from '../../support/fc-config';

const NAME_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.@/'.split('');
const nameArb = fc.array(fc.constantFrom(...NAME_CHARS), { maxLength: 80 }).map((c) => c.join(''));
const capacityArb = fc.integer({ min: 1, max: 40 });
const widthArb = fc.integer({ min: 0, max: 400 });

describe('Property 3: wrapping preserves the name and breaks only at hyphens', () => {
  it('lines join back to the name, fit the capacity, and break only after - / or at a forced cut', () => {
    fc.assert(
      fc.property(nameArb, capacityArb, (name, capacity) => {
        const lines = wrapLabel(name, capacity);
        expect(lines.join('')).toBe(name);
        for (const line of lines) {
          expect(line.length).toBeGreaterThan(0);
          expect(line.length).toBeLessThanOrEqual(capacity);
        }
        for (let i = 0; i + 1 < lines.length; i += 1) {
          const line = lines[i];
          expect(line.endsWith('-') || line.endsWith('/') || line.length === capacity).toBe(true);
        }
      }),
      cfg(),
    );
  });
});

describe('Property 5: labels that fit the model are never clipped', () => {
  it('mayTruncateLabel false implies at most LABEL_MAX_LINES lines', () => {
    fc.assert(
      fc.property(nameArb, widthArb, (name, widthPx) => {
        const capacity = Math.max(1, Math.floor(widthPx / LABEL_CHAR_WIDTH_PX));
        const lines = wrapLabel(name, capacity);
        if (!mayTruncateLabel(name, widthPx)) {
          expect(lines.length).toBeLessThanOrEqual(LABEL_MAX_LINES);
        } else {
          expect(lines.length).toBeGreaterThan(LABEL_MAX_LINES);
        }
      }),
      cfg(),
    );
  });
});

describe('label-fit examples at 80 px', () => {
  it('browserify-istanbul wraps to two lines after the hyphen', () => {
    expect(wrapLabel('browserify-istanbul', 11)).toEqual(['browserify-', 'istanbul']);
    expect(mayTruncateLabel('browserify-istanbul', 80)).toBe(false);
  });

  it('karma-phantomjs-launcher needs three lines and may truncate', () => {
    expect(wrapLabel('karma-phantomjs-launcher', 11)).toEqual(['karma-', 'phantomjs-', 'launcher']);
    expect(mayTruncateLabel('karma-phantomjs-launcher', 80)).toBe(true);
  });

  it('performance-now wraps as performance / -now', () => {
    expect(wrapLabel('performance-now', 11)).toEqual(['performance', '-now']);
  });

  it('empty name gives no lines and no truncation', () => {
    expect(wrapLabel('', 11)).toEqual([]);
    expect(mayTruncateLabel('', 80)).toBe(false);
  });

  it('width below one character clamps capacity to 1 and terminates', () => {
    expect(wrapLabel('abc', 0)).toEqual(['a', 'b', 'c']);
    expect(mayTruncateLabel('abc', 3)).toBe(true);
    expect(mayTruncateLabel('ab', 3)).toBe(false);
  });
});
