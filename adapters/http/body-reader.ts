/**
 * Limited response body reader (R15.2).
 *
 * Streams the body, counts bytes, and at the first byte over `maxBytes`
 * cancels the reader and discards everything read so far. A body of exactly
 * `maxBytes` is accepted. Never throws: every outcome is a typed result.
 */

export type BodyReadResult =
  | { readonly type: 'ok'; readonly bodyText: string }
  | { readonly type: 'oversize' }
  | { readonly type: 'aborted' }
  | { readonly type: 'error' };

/** The part of `Response` the reader needs. */
export interface ReadableResponse {
  readonly body: ReadableStream<Uint8Array> | null;
}

export async function readBodyLimited(
  response: ReadableResponse,
  maxBytes: number,
  signal: AbortSignal,
): Promise<BodyReadResult> {
  if (signal.aborted) {
    await cancelQuietly(response.body);
    return { type: 'aborted' };
  }
  const body = response.body;
  if (body === null) return { type: 'ok', bodyText: '' };

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = body.getReader();
  } catch {
    return { type: 'error' };
  }

  let aborted = false;
  const onAbort = (): void => {
    aborted = true;
    // Rejects the pending read() so an abort stops a stalled body.
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', onAbort, { once: true });

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (aborted || signal.aborted) return { type: 'aborted' };
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        chunks.length = 0;
        await reader.cancel().catch(() => undefined);
        return { type: 'oversize' };
      }
      chunks.push(value);
    }
  } catch {
    chunks.length = 0;
    return aborted || signal.aborted ? { type: 'aborted' } : { type: 'error' };
  } finally {
    signal.removeEventListener('abort', onAbort);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // Replacement decoding (non-fatal); a mapper's JSON parse rejects bad text.
  return { type: 'ok', bodyText: new TextDecoder('utf-8', { fatal: false }).decode(bytes) };
}

async function cancelQuietly(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (body === null) return;
  try {
    await body.cancel();
  } catch {
    // ignore
  }
}
