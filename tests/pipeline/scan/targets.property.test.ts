import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import type { Dependency, Ecosystem, Scope, SourceKind } from '@/core';
import { SCAN_MAX_DEPENDENCIES } from '../../../pipeline/constants';
import { planLookupTargets, targetKey } from '../../../pipeline/scan/targets';
import { cfg } from '../../support/fc-config';

// Requirements 16.6, 16.7, 16.10

const ECOSYSTEMS: readonly Ecosystem[] = ['npm', 'cargo', 'pypi'];
const SCOPES: readonly Scope[] = ['runtime', 'dev', 'build', 'optional', 'peer'] as unknown as readonly Scope[];

/** Compares by Unicode code point, independent of the implementation. */
function cmp(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0) as number);
  const y = Array.from(b, (c) => c.codePointAt(0) as number);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i]! - y[i]!;
  }
  return x.length - y.length;
}
const cmpTarget = (a: { ecosystem: string; name: string }, b: { ecosystem: string; name: string }): number =>
  cmp(a.ecosystem, b.ecosystem) || cmp(a.name, b.name);

const arbName = fc.constantFrom(
  'a', 'b', 'A', 'B', 'ab', 'aB', 'Ab', 'z', '_x', '-y', '@s/p', '@S/p', 'é', 'É', 'e\u0301', 'ß', '日本', '😀', '\uffff', '\u{10000}', 'a\u{1F600}', 'a\uffff',
);
const arbEcosystem = fc.constantFrom<Ecosystem>(...ECOSYSTEMS);
const arbSourceKind = fc.constantFrom<SourceKind>('registry', 'registry', 'registry', 'git', 'path');

const arbDependency: fc.Arbitrary<Dependency> = fc
  .tuple(
    arbName,
    arbEcosystem,
    arbSourceKind,
    fc.constantFrom(...SCOPES),
    fc.constantFrom('', '1.0.0', '^1.2.3', '*', 'git+https://x/y', '../p'),
  )
  .map(([name, ecosystem, sourceKind, scope, versionSpec]) => ({
    name,
    rawName: name,
    ecosystem,
    versionSpec,
    scope,
    sourceKind,
  }));

/** Many distinct registry targets so the real SCAN_MAX_DEPENDENCIES cap is exceeded. */
const arbLargeList: fc.Arbitrary<Dependency[]> = fc
  .tuple(
    fc.integer({ min: SCAN_MAX_DEPENDENCIES - 3, max: SCAN_MAX_DEPENDENCIES + 40 }),
    fc.array(arbDependency, { maxLength: 30 }),
  )
  .chain(([n, extra]) =>
    fc.shuffledSubarray(
      Array.from({ length: n }, (_, i) => i),
      { minLength: n, maxLength: n },
    ).map((order) => [
      ...order.map<Dependency>((i) => ({
        name: `pkg-${String(i).padStart(4, '0')}`,
        rawName: `pkg-${i}`,
        ecosystem: ECOSYSTEMS[i % ECOSYSTEMS.length]!,
        versionSpec: '1.0.0',
        scope: 'runtime' as Scope,
        sourceKind: 'registry' as SourceKind,
      })),
      ...extra,
    ]),
  );

const arbLimit = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: 0, max: 6 }) },
  { weight: 1, arbitrary: fc.constant(SCAN_MAX_DEPENDENCIES) },
  { weight: 1, arbitrary: fc.integer({ min: SCAN_MAX_DEPENDENCIES - 2, max: SCAN_MAX_DEPENDENCIES + 2 }) },
);

function check(dependencies: readonly Dependency[], limit: number): void {
  const plan = planLookupTargets(dependencies, limit);
  const expected = new Set<string>();
  for (const d of dependencies) {
    if (d.sourceKind === 'registry') expected.add(targetKey(d.ecosystem, d.name));
  }
  const looked = plan.targets.map((t) => targetKey(t.ecosystem, t.name));
  const skipped = plan.capped.skipped.map((t) => targetKey(t.ecosystem, t.name));
  const fail = (m: string): never => {
    throw new Error(`${m}: limit=${limit} targets=${JSON.stringify(looked)} skipped=${JSON.stringify(skipped)}`);
  };

  if (plan.targets.length > limit) fail('more targets than limit');
  if (plan.capped.limit !== limit) fail('capped.limit differs from limit');
  const all = [...looked, ...skipped];
  if (new Set(all).size !== all.length) fail('repeat between looked-up and skipped');
  if (all.length !== expected.size || !all.every((k) => expected.has(k))) fail('loss or extra target');
  if (plan.capped.total !== looked.length + skipped.length) fail('total mismatch');
  if (plan.capped.total !== expected.size) fail('total differs from distinct registry targets');
  if (skipped.length > 0 && looked.length !== limit) fail('skipped although below the limit');
  for (const s of plan.capped.skipped) {
    for (const t of plan.targets) {
      if (cmpTarget(s, t) <= 0) fail('skipped target does not sort after looked-up target');
    }
  }
  for (let i = 1; i < plan.targets.length; i++) {
    if (cmpTarget(plan.targets[i - 1]!, plan.targets[i]!) >= 0) fail('targets not strictly ascending');
  }
  for (let i = 1; i < plan.capped.skipped.length; i++) {
    if (cmpTarget(plan.capped.skipped[i - 1]!, plan.capped.skipped[i]!) >= 0) fail('skipped not strictly ascending');
  }
}

describe('targets property tests', () => {
  // Feature: scan-pipeline, Property 47: The dependency cap partitions the Lookup_Targets
  // Validates: Requirements 16.6, 16.7, 16.10
  it('P47 the dependency cap partitions the Lookup_Targets (small limits)', () => {
    fc.assert(
      fc.property(fc.array(arbDependency, { maxLength: 40 }), arbLimit, (deps, limit) => {
        check(deps, limit);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 47: The dependency cap partitions the Lookup_Targets
  // Validates: Requirements 16.6, 16.7, 16.10
  it('P47 the dependency cap partitions the Lookup_Targets (SCAN_MAX_DEPENDENCIES)', () => {
    fc.assert(
      fc.property(arbLargeList, (deps) => {
        check(deps, SCAN_MAX_DEPENDENCIES);
      }),
      cfg({ numRuns: Math.min(Number(process.env.FC_NUM_RUNS ?? 100), 100) }),
    );
  });
});
