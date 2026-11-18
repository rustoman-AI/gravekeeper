import * as fc from 'fast-check';

// Requirement 13.10, 13.15: one mutation of a valid body at one path.

export type PathSegment = string | number;
export type JsonPath = readonly PathSegment[];

export type MutationKind =
  | 'delete'
  | 'null'
  | 'wrong-type'
  | 'duplicate-entry'
  | 'shuffle'
  | 'unknown-keys'
  | 'invalid-timestamp';

export const MUTATION_KINDS: readonly MutationKind[] = [
  'delete',
  'null',
  'wrong-type',
  'duplicate-entry',
  'shuffle',
  'unknown-keys',
  'invalid-timestamp',
];

export type Mutation = {
  readonly kind: MutationKind;
  readonly path: JsonPath;
  /** Seed for the deterministic choices (wrong type, shuffle order). */
  readonly pick: number;
};

const INVALID_TIMESTAMPS: readonly unknown[] = [
  '',
  'not a date',
  '2024-13-01T00:00:00Z',
  '2024-02-30T00:00:00Z',
  '2024-01-01',
  '2024-01-01T25:00:00Z',
  0,
  null,
  {},
];

const isContainer = (value: unknown): value is Record<string, unknown> | unknown[] =>
  typeof value === 'object' && value !== null;

const clone = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(clone);
  if (isContainer(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      Object.defineProperty(out, key, {
        value: clone((value as Record<string, unknown>)[key]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  }
  return value;
};

/** Every path of a plain JSON value, root included (empty path). */
export const listPaths = (value: unknown): JsonPath[] => {
  const paths: JsonPath[] = [[]];
  const walk = (node: unknown, prefix: PathSegment[]): void => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => {
        paths.push([...prefix, index]);
        walk(child, [...prefix, index]);
      });
    } else if (isContainer(node)) {
      for (const key of Object.keys(node)) {
        paths.push([...prefix, key]);
        walk((node as Record<string, unknown>)[key], [...prefix, key]);
      }
    }
  };
  walk(value, []);
  return paths;
};

export const getAt = (root: unknown, path: JsonPath): unknown => {
  let node: unknown = root;
  for (const segment of path) {
    if (!isContainer(node)) return undefined;
    node = (node as Record<PathSegment, unknown>)[segment];
  }
  return node;
};

const wrongTypeOf = (current: unknown, pick: number): unknown => {
  const candidates: unknown[] = [
    'text',
    42,
    true,
    [],
    [current],
    {},
    { value: current },
    -0,
    1e308,
    '12',
  ].filter((candidate) => JSON.stringify(candidate) !== JSON.stringify(current));
  return candidates[pick % candidates.length];
};

const shuffled = <T>(items: readonly T[], pick: number): T[] => {
  const out = [...items];
  let state = pick >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
};

const setOwn = (target: Record<string, unknown>, key: string, value: unknown): void => {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
};

const replaceAt = (root: unknown, path: JsonPath, next: (current: unknown) => unknown): unknown => {
  if (path.length === 0) return next(root);
  const copy = clone(root);
  let node: unknown = copy;
  for (const segment of path.slice(0, -1)) {
    if (!isContainer(node)) return copy;
    node = (node as Record<PathSegment, unknown>)[segment];
  }
  if (!isContainer(node)) return copy;
  const last = path[path.length - 1] as PathSegment;
  const parent = node as Record<PathSegment, unknown>;
  setOwn(parent as Record<string, unknown>, String(last), next(parent[last]));
  return copy;
};

const deleteAt = (root: unknown, path: JsonPath): unknown => {
  if (path.length === 0) return undefined;
  const copy = clone(root);
  const parent = getAt(copy, path.slice(0, -1));
  const last = path[path.length - 1] as PathSegment;
  if (Array.isArray(parent) && typeof last === 'number') parent.splice(last, 1);
  else if (isContainer(parent)) delete (parent as Record<PathSegment, unknown>)[last];
  return copy;
};

/** Applies one mutation to a copy of `root`; the input is never changed. */
export const applyMutation = (root: unknown, mutation: Mutation): unknown => {
  const { kind, path, pick } = mutation;
  switch (kind) {
    case 'delete':
      return deleteAt(root, path);
    case 'null':
      return replaceAt(root, path, () => null);
    case 'wrong-type':
      return replaceAt(root, path, (current) => wrongTypeOf(current, pick));
    case 'duplicate-entry':
      return replaceAt(root, path, (current) =>
        Array.isArray(current) && current.length > 0
          ? [...current, clone(current[pick % current.length])]
          : current,
      );
    case 'shuffle':
      return replaceAt(root, path, (current) =>
        Array.isArray(current) ? shuffled(current, pick) : current,
      );
    case 'unknown-keys':
      return replaceAt(root, path, (current) => {
        if (!isContainer(current) || Array.isArray(current)) return current;
        const out = clone(current) as Record<string, unknown>;
        for (const key of ['__proto__', 'constructor', 'prototype', 'x-unknown']) {
          setOwn(out, key, { nested: [pick] });
        }
        return out;
      });
    case 'invalid-timestamp':
      return replaceAt(root, path, () => INVALID_TIMESTAMPS[pick % INVALID_TIMESTAMPS.length]);
  }
};

/** Mutation applied at one path chosen from `root` (any kind, any path). */
export const arbMutation = (root: unknown): fc.Arbitrary<Mutation> =>
  fc.record({
    kind: fc.constantFrom(...MUTATION_KINDS),
    path: fc.constantFrom(...listPaths(root)),
    pick: fc.nat({ max: 1_000_000 }),
  });

/** Valid body together with one mutation of it and the mutated result. */
export const arbMutated = <T>(
  arbValid: fc.Arbitrary<T>,
): fc.Arbitrary<{ valid: T; mutation: Mutation; mutated: unknown }> =>
  arbValid
    .chain((valid) =>
      arbMutation(valid).map((mutation) => ({
        valid,
        mutation,
        mutated: applyMutation(valid, mutation),
      })),
    );
