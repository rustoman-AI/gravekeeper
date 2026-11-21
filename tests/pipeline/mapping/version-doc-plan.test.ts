import { describe, expect, it } from 'vitest';
import {
  latestVersionOf,
  needsVersionDocument,
  versionDeprecated,
} from '../../../pipeline/mapping/version-doc-plan';

function entry(version: string, extra: Record<string, unknown> = {}) {
  return { versionKey: { system: 'NPM', name: 'uuid', version }, ...extra };
}

const uuidBody = {
  versions: [
    entry('3.4.0', { isDeprecated: true }),
    entry('11.1.0', { isDefault: true, isDeprecated: false }),
  ],
};

const plan = (over: Record<string, unknown> = {}) =>
  needsVersionDocument({
    ecosystem: 'npm',
    depsdevBody: uuidBody,
    selected: '3.4.0',
    latestBody: { version: '11.1.0' },
    ...over,
  } as Parameters<typeof needsVersionDocument>[0]);

describe('needsVersionDocument', () => {
  it('is true for a deprecated version that differs from the latest', () => {
    expect(plan()).toBe(true);
  });
  it('is false when the checked version equals the latest', () => {
    expect(plan({ selected: '11.1.0', latestBody: { version: '11.1.0' } })).toBe(false);
  });
  it('is false when the version is not deprecated', () => {
    expect(
      plan({ depsdevBody: { versions: [entry('3.4.0', { isDeprecated: false })] } }),
    ).toBe(false);
  });
  it('is false for a string isDeprecated', () => {
    expect(
      plan({ depsdevBody: { versions: [entry('3.4.0', { isDeprecated: 'true' })] } }),
    ).toBe(false);
  });
  it('is true when the latest is unknown', () => {
    expect(
      plan({
        depsdevBody: { versions: [entry('3.4.0', { isDeprecated: true })] },
        latestBody: undefined,
      }),
    ).toBe(true);
  });
  it('is false for pypi and cargo', () => {
    expect(plan({ ecosystem: 'pypi' })).toBe(false);
    expect(plan({ ecosystem: 'cargo' })).toBe(false);
  });
  it('is false for a selected version with a space or a semicolon', () => {
    for (const selected of ['3.4.0 x', '3.4.0;rm', null]) {
      const body = { versions: [entry(String(selected), { isDeprecated: true })] };
      expect(plan({ selected, depsdevBody: body })).toBe(false);
    }
  });
  it('is false when the versions getter throws', () => {
    const body = {
      get versions(): unknown {
        throw new Error('boom');
      },
    };
    expect(plan({ depsdevBody: body })).toBe(false);
  });
});

describe('latestVersionOf and versionDeprecated', () => {
  it('prefers the /latest version, then the default, then null', () => {
    expect(latestVersionOf({ version: '2.0.0' }, '1.0.0')).toBe('2.0.0');
    expect(latestVersionOf({ version: '' }, '1.0.0')).toBe('1.0.0');
    expect(latestVersionOf(null, null)).toBeNull();
  });
  it('reads only a boolean true', () => {
    expect(versionDeprecated(uuidBody, '3.4.0')).toBe(true);
    expect(versionDeprecated(uuidBody, '11.1.0')).toBe(false);
    expect(versionDeprecated(uuidBody, null)).toBe(false);
    expect(versionDeprecated(uuidBody, '9.9.9')).toBe(false);
  });
});
