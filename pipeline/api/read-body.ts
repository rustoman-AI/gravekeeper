/**
 * Bounded request body reader (R21.3 b, c).
 *
 * Checks the declared `Content-Length` first, then streams the body and
 * counts bytes. A body of exactly `maxBytes` is accepted. At the first byte
 * over the limit the stream is cancelled and nothing is decoded. Decoding is
 * strict UTF-8. An empty body and an invalid UTF-8 body both give
 * `invalid-json` (R21.3 c). Never throws.
 */

import { REQUEST_BODY_MAX_BYTES } from '../constants';

export type ReadBodyResult =
  | { readonly type: 'ok'; readonly text: string }
  | { readonly type: 'body-too-large' }
  | { readonly type: 'invalid-json' };

/** The part of `Request` the reader needs. */
export interface ReadableRequest {
  readonly headers: { get(name: string): string | null };
  readonly body: ReadableStream<Uint8Array> | null;
}

export async function readRequestBody(
  request: ReadableRequest,
  maxBytes: number = REQUEST_BODY_MAX_BYTES,
): Promise<ReadBodyResult> {
  const declared = parseDeclaredLength(request.headers.get('content-length'));
  if (declared !== null && declared > maxBytes) {
    await cancelQuietly(request.body);
    return { type: 'body-too-large' };
  }

  const body = request.body;
  if (body === null) return { type: 'invalid-json' };

  const chunks: Uint8Array[] = [];
  let total = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        chunks.length = 0;
        await reader.cancel().catch(() => undefined);
        return { type: 'body-too-large' };
      }
      chunks.push(value);
    }
  } catch {
    // A failing stream yields no usable body.
    return { type: 'invalid-json' };
  }

  if (total === 0) return { type: 'invalid-json' };

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    // ignoreBOM keeps a leading BOM in the text so the JSON parse rejects it.
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return { type: 'ok', text };
  } catch {
    return { type: 'invalid-json' };
  }
}

/** A well-formed non-negative decimal integer, else `null` (header ignored). */
function parseDeclaredLength(header: string | null): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

async function cancelQuietly(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (body === null) return;
  try {
    await body.cancel();
  } catch {
    // ignore
  }
}
