import { describe, expect, it } from 'vitest';
import { patternOf, requestRows } from '../../scripts/live-report';

// Validates: Requirements 3.3 (resurrect-upgrade)
const npm = (path: string): string => patternOf('npm', 'registry.npmjs.org', path);

describe('live-report npm patterns', () => {
  it('splits /latest from version documents', () => {
    expect(npm('/left-pad/latest')).toBe('/{package}/latest');
    expect(npm('/left-pad/1.3.0')).toBe('/{package}/{version}');
    expect(npm('/@scope%2Fname/latest')).toBe('/{package}/latest');
    expect(npm('/@scope/name/1.0.0')).toBe('/{package}/{version}');
    expect(npm('/left-pad')).toBe('/{package}');
  });

  it('keeps the two npm rows separate', () => {
    const counts = new Map<string, number>([
      [`npm\tGET registry.npmjs.org${npm('/a/latest')}`, 3],
      [`npm\tGET registry.npmjs.org${npm('/a/1.0.0')}`, 2],
    ]);
    expect(requestRows(counts)).toEqual([
      ['npm', 'GET registry.npmjs.org/{package}/latest', 3],
      ['npm', 'GET registry.npmjs.org/{package}/{version}', 2],
    ]);
  });
});
