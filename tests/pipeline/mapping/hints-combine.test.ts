import { describe, expect, it } from 'vitest';
import { combineNpmHints } from '../../../pipeline/mapping/hints';

describe('combineNpmHints', () => {
  it('prefers the version notice over a different /latest notice', () => {
    const hints = combineNpmHints(
      { deprecated: 'Please upgrade to version 7 or higher.' },
      { deprecated: 'Something else' },
    );
    expect(hints).toEqual([
      { kind: 'deprecation-notice', text: 'Please upgrade to version 7 or higher.', sourceUrl: null },
    ]);
  });

  it('falls back to the /latest hint when the version notice is empty', () => {
    const hints = combineNpmHints({ deprecated: '' }, { deprecated: 'Latest notice' });
    expect(hints).toEqual([{ kind: 'deprecation-notice', text: 'Latest notice', sourceUrl: null }]);
  });

  it('falls back to the /latest hint when the version body is absent', () => {
    const hints = combineNpmHints(undefined, { deprecated: 'Latest notice' });
    expect(hints).toHaveLength(1);
    expect(hints[0]?.sourceUrl).toBeNull();
  });

  it('gives no hints when both are absent', () => {
    expect(combineNpmHints(undefined, undefined)).toEqual([]);
  });

  it('gives no hints when neither body has a notice', () => {
    expect(combineNpmHints({ version: '1.0.0' }, {})).toEqual([]);
  });
});
