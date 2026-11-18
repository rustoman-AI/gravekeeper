// Requirements 14.2, 14.3, 14.4, 14.6, 14.9
import { describe, expect, it } from 'vitest';
import { GITHUB_BUDGET_THRESHOLD } from '../../../pipeline/constants';
import { GithubBudget } from '../../../pipeline/scan/github-budget';

const rest = (remaining: string, reset?: string) => ({
  'x-ratelimit-remaining': remaining,
  ...(reset === undefined ? {} : { 'x-ratelimit-reset': reset }),
});

const gql = (remaining: unknown, resetAt?: unknown) => ({
  data: { rateLimit: { remaining, ...(resetAt === undefined ? {} : { resetAt }) } },
});

describe('GithubBudget', () => {
  it('is unknown at start and allows attempts', () => {
    const b = new GithubBudget();
    expect(b.remaining).toBeNull();
    expect(b.resetAt).toBeNull();
    expect(b.allow()).toBe(true);
  });

  it.each([
    [GITHUB_BUDGET_THRESHOLD - 1, false],
    [GITHUB_BUDGET_THRESHOLD, true],
    [GITHUB_BUDGET_THRESHOLD + 1, true],
    [0, false],
  ])('REST remaining %i gives allow() %s', (n, allowed) => {
    const b = new GithubBudget();
    b.observe(rest(String(n)));
    expect(b.remaining).toBe(n);
    expect(b.allow()).toBe(allowed);
  });

  it.each([
    [GITHUB_BUDGET_THRESHOLD - 1, false],
    [GITHUB_BUDGET_THRESHOLD, true],
    [GITHUB_BUDGET_THRESHOLD + 1, true],
  ])('GraphQL remaining %i gives allow() %s', (n, allowed) => {
    const b = new GithubBudget();
    b.observeGraphql(gql(n));
    expect(b.remaining).toBe(n);
    expect(b.allow()).toBe(allowed);
  });

  it('ignores non-integer and empty REST values', () => {
    const b = new GithubBudget();
    b.observe(rest('5'));
    for (const v of ['', '3.5', 'abc', '-1', '1e2']) b.observe(rest(v));
    b.observe({});
    expect(b.remaining).toBe(5);
    expect(b.allow()).toBe(false);
  });

  it('ignores non-integer and empty GraphQL values', () => {
    const b = new GithubBudget();
    b.observeGraphql(gql(5));
    for (const v of [3.5, '7', null, -1, undefined]) b.observeGraphql(gql(v));
    for (const body of [null, 'x', {}, { data: null }, { data: { rateLimit: null } }]) {
      b.observeGraphql(body);
    }
    expect(b.remaining).toBe(5);
  });

  it('stays unknown and open when the first readings are unusable', () => {
    const b = new GithubBudget();
    b.observe({});
    b.observeGraphql({});
    expect(b.remaining).toBeNull();
    expect(b.allow()).toBe(true);
  });

  it('a later higher value reopens the gate', () => {
    const b = new GithubBudget();
    b.observe(rest('2'));
    expect(b.allow()).toBe(false);
    b.observeGraphql(gql(4000));
    expect(b.allow()).toBe(true);
    b.observe(rest('0'));
    expect(b.allow()).toBe(false);
    b.observe(rest(String(GITHUB_BUDGET_THRESHOLD)));
    expect(b.allow()).toBe(true);
  });

  it('keeps resetAt from REST headers and across unusable readings', () => {
    const b = new GithubBudget();
    b.observe(rest('3', '1700000000'));
    expect(b.resetAt).toBe('2023-11-14T22:13:20Z');
    b.observe(rest('2', 'soon'));
    b.observe(rest('1'));
    b.observe({});
    expect(b.resetAt).toBe('2023-11-14T22:13:20Z');
    expect(b.remaining).toBe(1);
  });

  it('keeps resetAt from GraphQL bodies and across unusable readings', () => {
    const b = new GithubBudget();
    b.observeGraphql(gql(3, '2024-01-02T03:04:05Z'));
    expect(b.resetAt).toBe('2024-01-02T03:04:05Z');
    b.observeGraphql(gql(2, 'not a date'));
    b.observeGraphql(gql(1));
    b.observeGraphql({});
    expect(b.resetAt).toBe('2024-01-02T03:04:05Z');
  });

  it('keeps remaining when a reading has only resetAt', () => {
    const b = new GithubBudget();
    b.observe(rest('4'));
    b.observeGraphql(gql(undefined, '2024-01-02T03:04:05Z'));
    expect(b.remaining).toBe(4);
    expect(b.resetAt).toBe('2024-01-02T03:04:05Z');
  });

  it('instances do not share state', () => {
    const a = new GithubBudget();
    a.observe(rest('0'));
    expect(new GithubBudget().allow()).toBe(true);
  });
});
