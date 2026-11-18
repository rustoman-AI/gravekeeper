import { describe, expect, it } from 'vitest';
import { readBodyLimited } from '../../adapters/http/body-reader';
import { MAX_RESPONSE_BYTES } from '../../pipeline/constants';

// Requirement 15.2: the response body is read with a byte limit.

interface Probe {
  readonly response: { readonly body: ReadableStream<Uint8Array> | null };
  readonly state: { cancelled: boolean };
}

function streamOf(chunks: readonly Uint8Array[]): Probe {
  const state = { cancelled: false };
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[i++];
      if (chunk === undefined) controller.close();
      else controller.enqueue(chunk);
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { response: { body }, state };
}

function stalled(): Probe {
  const state = { cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull: () => new Promise<void>(() => undefined),
    cancel() {
      state.cancelled = true;
    },
  });
  return { response: { body }, state };
}

const bytes = (n: number, fill = 0x61): Uint8Array => new Uint8Array(n).fill(fill);
const live = (): AbortSignal => new AbortController().signal;

describe('readBodyLimited', () => {
  it('accepts a body of exactly MAX_RESPONSE_BYTES', async () => {
    const { response, state } = streamOf([bytes(MAX_RESPONSE_BYTES)]);
    const result = await readBodyLimited(response, MAX_RESPONSE_BYTES, live());
    expect(result.type).toBe('ok');
    if (result.type === 'ok') expect(result.bodyText.length).toBe(MAX_RESPONSE_BYTES);
    expect(state.cancelled).toBe(false);
  });

  it('rejects MAX_RESPONSE_BYTES + 1 and cancels the reader', async () => {
    const { response, state } = streamOf([bytes(MAX_RESPONSE_BYTES + 1)]);
    const result = await readBodyLimited(response, MAX_RESPONSE_BYTES, live());
    expect(result).toEqual({ type: 'oversize' });
    expect(state.cancelled).toBe(true);
  });

  it('rejects when the limit is crossed by a later chunk', async () => {
    const { response, state } = streamOf([bytes(6), bytes(5), bytes(5)]);
    const result = await readBodyLimited(response, 10, live());
    expect(result).toEqual({ type: 'oversize' });
    expect(state.cancelled).toBe(true);
  });

  it('concatenates multi-chunk bodies, including a multibyte char split across chunks', async () => {
    const euro = new TextEncoder().encode('€'); // 3 bytes
    const { response } = streamOf([
      new TextEncoder().encode('a'),
      euro.slice(0, 1),
      euro.slice(1),
      new TextEncoder().encode('b'),
    ]);
    const result = await readBodyLimited(response, 100, live());
    expect(result).toEqual({ type: 'ok', bodyText: 'a€b' });
  });

  it('returns empty text for a null body and an empty stream', async () => {
    expect(await readBodyLimited({ body: null }, 10, live())).toEqual({ type: 'ok', bodyText: '' });
    const { response } = streamOf([]);
    expect(await readBodyLimited(response, 10, live())).toEqual({ type: 'ok', bodyText: '' });
  });

  it('returns aborted when the signal fires during a stalled read', async () => {
    const { response, state } = stalled();
    const controller = new AbortController();
    const pending = readBodyLimited(response, 10, controller.signal);
    controller.abort();
    expect(await pending).toEqual({ type: 'aborted' });
    expect(state.cancelled).toBe(true);
  });

  it('returns aborted without reading when the signal is already aborted', async () => {
    const { response, state } = streamOf([bytes(3)]);
    const controller = new AbortController();
    controller.abort();
    expect(await readBodyLimited(response, 10, controller.signal)).toEqual({ type: 'aborted' });
    expect(state.cancelled).toBe(true);
  });

  it('returns error when the stream fails', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('boom'));
      },
    });
    expect(await readBodyLimited({ body }, 10, live())).toEqual({ type: 'error' });
  });

  it('decodes invalid UTF-8 non-fatally as U+FFFD', async () => {
    const { response } = streamOf([new Uint8Array([0x61, 0xff, 0xc3, 0x28, 0x62])]);
    const result = await readBodyLimited(response, 10, live());
    expect(result).toEqual({ type: 'ok', bodyText: 'a\uFFFD\uFFFD(b' });
  });
});
