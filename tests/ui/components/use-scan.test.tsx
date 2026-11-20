// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { ScanClientOutcome } from '../../../client/scan-client';
import { useScan } from '../../../components/hooks/use-scan';
import type { ScanRunner } from '../../../components/hooks/use-scan';
import { canonicalRepoUrl } from '../../../view-model/index';
import type { ParsedScanResult, ScanRequestBody, UrlState } from '../../../view-model/index';
import { buildScanResult } from '../../support/ui/scan-result-builder';

interface Call {
  readonly request: ScanRequestBody;
  readonly signal: AbortSignal;
  resolve(outcome: ScanClientOutcome): void;
}

function fakeClient(): { client: ScanRunner; calls: Call[] } {
  const calls: Call[] = [];
  const client: ScanRunner = {
    run(request, signal) {
      return new Promise<ScanClientOutcome>((resolve) => {
        calls.push({ request, signal, resolve });
      });
    },
  };
  return { client, calls };
}

const state = (repo: string | null, manifests: readonly string[] = []): UrlState => ({
  repo,
  manifests,
  view: 'scene',
});

const result = (): ParsedScanResult =>
  buildScanResult([{ name: 'left-pad', kind: 'alive' }]) as unknown as ParsedScanResult;

const resultOutcome = (): ScanClientOutcome => ({ kind: 'result', result: result(), cache: 'miss' });

const flush = () => act(async () => {});

function setup(initial: UrlState, wrapper?: (props: { children: ReactNode }) => ReactNode) {
  const fake = fakeClient();
  const hook = renderHook(({ url }: { url: UrlState }) => useScan(url, { client: fake.client }), {
    initialProps: { url: initial },
    ...(wrapper === undefined ? {} : { wrapper }),
  });
  return { ...fake, ...hook };
}

describe('useScan', () => {
  it('starts exactly one request for a repo value', async () => {
    const { calls, result: hook } = setup(state('github.com/A/B', ['package.json']));
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.request).toEqual({ repoUrl: 'github.com/A/B', manifests: ['package.json'] });
    expect(hook.current.session.phase).toBe('scanning');
  });

  it('sends one request when activated twice under StrictMode', async () => {
    const { calls } = setup(state('github.com/A/B'), ({ children }) => <StrictMode>{children}</StrictMode>);
    await flush();
    expect(calls).toHaveLength(1);
  });

  it('aborts the old request when the key changes, before the new one is sent', async () => {
    const { calls, rerender } = setup(state('github.com/A/B'));
    await flush();
    rerender({ url: state('github.com/C/D') });
    expect(calls[0]?.signal.aborted).toBe(true);
    await flush();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.request.repoUrl).toBe('github.com/C/D');
    expect(calls[1]?.signal.aborted).toBe(false);
  });

  it('ignores a result that arrives for an aborted request', async () => {
    const { calls, rerender, result: hook } = setup(state('github.com/A/B'));
    await flush();
    rerender({ url: state('github.com/C/D') });
    await flush();
    await act(async () => {
      calls[0]?.resolve(resultOutcome());
    });
    expect(hook.current.session.phase).toBe('scanning');
    await act(async () => {
      calls[1]?.resolve(resultOutcome());
    });
    expect(hook.current.session.phase).toBe('result');
  });

  it('does not rescan when repo is replaced by the canonical repository URL', async () => {
    const { calls, rerender, result: hook } = setup(state('github.com/A/B'));
    await flush();
    await act(async () => {
      calls[0]?.resolve(resultOutcome());
    });
    expect(hook.current.session.phase).toBe('result');
    const canonical = canonicalRepoUrl(result().repo);
    rerender({ url: state(canonical) });
    await flush();
    expect(calls).toHaveLength(1);
    expect(hook.current.session.phase).toBe('result');
  });

  it('rescans when Back returns to a different value', async () => {
    const { calls, rerender, result: hook } = setup(state('github.com/A/B'));
    await flush();
    await act(async () => {
      calls[0]?.resolve(resultOutcome());
    });
    rerender({ url: state('github.com/C/D') });
    await flush();
    expect(calls).toHaveLength(2);
    expect(hook.current.session.phase).toBe('scanning');
    rerender({ url: state('github.com/A/B') });
    await flush();
    expect(calls).toHaveLength(3);
    expect(calls[2]?.request.repoUrl).toBe('github.com/A/B');
  });

  it('is idle and sends nothing without a repo', async () => {
    const { calls, result: hook } = setup(state(null));
    await flush();
    expect(calls).toHaveLength(0);
    expect(hook.current.session.phase).toBe('idle');
  });
});
