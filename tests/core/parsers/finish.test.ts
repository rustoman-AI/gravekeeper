import { describe, expect, it } from 'vitest';
import { finish } from '../../../core/parsers/finish';
import type { Candidate } from '../../../core/parsers/finish';
import type { Dependency, Scope, SourceKind } from '../../../core/model';

function dep(name: string, over: Partial<Dependency> = {}): Dependency {
  return { name, rawName: name, ecosystem: 'npm', versionSpec: '1.0.0', scope: 'runtime', sourceKind: 'registry', ...over };
}

function cand(dependency: Dependency, rank: number[] = [], where = 'package.json'): Candidate {
  return { dependency, rank, where };
}

describe('finish', () => {
  it('returns empty output for no candidates and passes parser warnings through', () => {
    expect(finish({ candidates: [], warnings: [] })).toEqual({ dependencies: [], warnings: [] });
    expect(finish({ candidates: [], warnings: ['w'] }).warnings).toEqual(['w']);
  });

  it.each<[SourceKind, SourceKind]>([
    ['registry', 'git'],
    ['git', 'registry'],
    ['path', 'registry'],
  ])('keeps the first occurrence regardless of sourceKind (%s before %s)', (first, second) => {
    const a = dep('left-pad', { sourceKind: first, versionSpec: 'first' });
    const b = dep('left-pad', { sourceKind: second, versionSpec: 'second' });
    const result = finish({ candidates: [cand(a, [1]), cand(b, [2])], warnings: [] });
    expect(result.dependencies).toEqual([a]);
    expect(result.warnings).toHaveLength(1);
  });

  it('ranks by rank, not by candidate array order', () => {
    const early = dep('x', { versionSpec: 'early' });
    const late = dep('x', { versionSpec: 'late' });
    const result = finish({ candidates: [cand(late, [5]), cand(early, [2])], warnings: [] });
    expect(result.dependencies).toEqual([early]);
  });

  it('adds one warning per discard naming package and scope', () => {
    const candidates = [1, 2, 3].map((n) => cand(dep('serde', { scope: 'dev' }), [n], `Cargo.toml table ${n}`));
    const result = finish({ candidates, warnings: ['own'] });
    expect(result.dependencies).toHaveLength(1);
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings[0]).toBe('own');
    for (const w of result.warnings.slice(1)) {
      expect(w).toContain('"serde"');
      expect(w).toContain('"dev"');
    }
    expect(result.warnings[1]).toContain('Cargo.toml table 2');
    expect(result.warnings[2]).toContain('Cargo.toml table 3');
  });

  it('keeps Foo_Bar over foo.bar and warns naming foo-bar', () => {
    const first = dep('foo-bar', { ecosystem: 'pypi', rawName: 'Foo_Bar' });
    const second = dep('foo-bar', { ecosystem: 'pypi', rawName: 'foo.bar' });
    const result = finish({
      candidates: [cand(second, [3], 'requirements.txt line 3'), cand(first, [1], 'requirements.txt line 1')],
      warnings: [],
    });
    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0]?.rawName).toBe('Foo_Bar');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('"foo-bar"');
    expect(result.warnings[0]).toContain('"runtime"');
    expect(result.warnings[0]).toContain('requirements.txt line 3');
  });

  it('sorts output in Dependency_Order independent of candidate order', () => {
    const items: Dependency[] = [
      dep('zeta'),
      dep('alpha', { scope: 'peer' }),
      dep('alpha', { scope: 'runtime' }),
      dep('alpha', { scope: 'dev' }),
      dep('beta', { scope: 'optional' }),
      dep('Alpha'),
    ];
    const forward = finish({ candidates: items.map((d) => cand(d)), warnings: [] });
    const backward = finish({ candidates: [...items].reverse().map((d) => cand(d)), warnings: [] });
    expect(forward.dependencies.map((d) => `${d.name}:${d.scope}`)).toEqual([
      'Alpha:runtime',
      'alpha:runtime',
      'alpha:dev',
      'alpha:peer',
      'beta:optional',
      'zeta:runtime',
    ]);
    expect(backward).toEqual(forward);
  });

  it('keeps the same name in two scopes as two entries without warnings', () => {
    const scopes: Scope[] = ['runtime', 'dev'];
    const result = finish({ candidates: scopes.map((s, i) => cand(dep('lodash', { scope: s }), [i])), warnings: [] });
    expect(result.dependencies.map((d) => d.scope)).toEqual(['runtime', 'dev']);
    expect(result.warnings).toEqual([]);
  });

  it('does not collide names containing separators', () => {
    const names = ['a", "runtime', 'a', '["a","runtime"]', 'a,runtime', 'a|runtime', 'a\u0000runtime', '@s/a', 's/a'];
    const result = finish({ candidates: names.map((n, i) => cand(dep(n), [i])), warnings: [] });
    expect(result.dependencies).toHaveLength(names.length);
    expect(result.warnings).toEqual([]);
  });

  it('treats __proto__ as an ordinary name', () => {
    const result = finish({ candidates: [cand(dep('__proto__'), [1]), cand(dep('__proto__'), [2])], warnings: [] });
    expect(result.dependencies).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
  });

  it('truncates where to 80 characters ending in an ellipsis', () => {
    const long = 'x'.repeat(200);
    const result = finish({ candidates: [cand(dep('a'), [1]), cand(dep('a'), [2], long)], warnings: [] });
    const w = result.warnings[0] as string;
    const prefix = w.slice(0, w.indexOf(': duplicate'));
    expect(Array.from(prefix)).toHaveLength(80);
    expect(prefix).toBe(`${'x'.repeat(79)}\u2026`);
  });

  it('leaves where of exactly 80 characters untouched and counts code points', () => {
    const exact = 'y'.repeat(80);
    const astral = '\u{1F480}'.repeat(80);
    const result = finish({
      candidates: [cand(dep('a'), [1]), cand(dep('a'), [2], exact), cand(dep('a'), [3], astral + 'z')],
      warnings: [],
    });
    expect(result.warnings[0]?.startsWith(`${exact}: duplicate`)).toBe(true);
    expect(result.warnings[1]?.startsWith(`${'\u{1F480}'.repeat(79)}\u2026: duplicate`)).toBe(true);
  });

  it('does not mutate its input', () => {
    const candidates = [cand(dep('b'), [2]), cand(dep('a'), [1])];
    const raw = { candidates, warnings: ['w'] };
    finish(raw);
    expect(raw.candidates).toBe(candidates);
    expect(candidates.map((c) => c.dependency.name)).toEqual(['b', 'a']);
    expect(raw.warnings).toEqual(['w']);
  });
});
