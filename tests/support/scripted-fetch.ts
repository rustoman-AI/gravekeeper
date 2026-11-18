import type { Clock, Timer } from '../../pipeline/ports/runtime';

// Requirement 15.9, 15.19, 15.21, 16.13, 23.1

/** Body of a scripted response. `size` produces that many bytes lazily, in streamed chunks. */
export type ScriptedBody =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  | { readonly kind: 'size'; readonly size: number; readonly byte?: number };

export interface ScriptedResponse {
  readonly status: number;
  /** Header name/value pairs. Pairs (not a record) so duplicates and case are kept. */
  readonly headers?: readonly (readonly [string, string])[];
  /** Default: no body. Ignored for statuses that cannot carry one (204, 205, 304). */
  readonly body?: ScriptedBody;
}

export interface Step {
  /** Fake-timer milliseconds before the response headers arrive. 'never' waits for abort. */
  readonly latencyMs: number | 'never';
  readonly response: ScriptedResponse | 'network-error';
}

/** `attemptIndex` counts earlier calls with the same URL string, starting at 0. */
export type ScriptFn = (url: string, attemptIndex: number) => Step;

export interface RecordedCall {
  readonly url: string;
  readonly attemptIndex: number;
  readonly method: string;
  /** Request headers, names lowercased. */
  readonly headers: Readonly<Record<string, string>>;
  readonly redirect: RequestRedirect | undefined;
  readonly sentAtMs: number;
  /** Clock value when the request signal aborted this call, else null. */
  abortedAtMs: number | null;
}

export interface ScriptedFetch {
  readonly fetch: typeof fetch;
  readonly calls: readonly RecordedCall[];
}

const CHUNK_BYTES = 65536;
const NO_BODY_STATUSES: ReadonlySet<number> = new Set([204, 205, 304]);

function abortError(): Error {
  return new DOMException('This operation was aborted', 'AbortError');
}

function streamOfSize(size: number, byte: number, signal: AbortSignal | undefined): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener(
        'abort',
        () => {
          try {
            controller.error(abortError());
          } catch {
            // stream already closed
          }
        },
        { once: true },
      );
    },
    pull(controller) {
      if (sent >= size) {
        controller.close();
        return;
      }
      const length = Math.min(CHUNK_BYTES, size - sent);
      controller.enqueue(new Uint8Array(length).fill(byte));
      sent += length;
    },
  });
}

function buildResponse(scripted: ScriptedResponse, signal: AbortSignal | undefined): Response {
  const headers = new Headers();
  for (const [name, value] of scripted.headers ?? []) headers.append(name, value);
  const init: ResponseInit = { status: scripted.status, headers };
  const body = scripted.body;
  if (body === undefined || NO_BODY_STATUSES.has(scripted.status)) return new Response(null, init);
  switch (body.kind) {
    case 'text':
      return new Response(body.text, init);
    case 'bytes':
      return new Response(body.bytes as BodyInit, init);
    case 'size':
      return new Response(streamOfSize(body.size, body.byte ?? 0x61, signal), init);
  }
}

/**
 * A `fetch` replacement driven by `script`. Always pass it explicitly (injected);
 * it never touches `globalThis.fetch`.
 */
export function createScriptedFetch(
  script: ScriptFn,
  runtime: { readonly clock: Clock; readonly timer: Timer },
): ScriptedFetch {
  const calls: RecordedCall[] = [];
  const perUrl = new Map<string, number>();

  const scriptedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : undefined;
    const url = request !== undefined ? request.url : input instanceof URL ? input.href : String(input);
    const attemptIndex = perUrl.get(url) ?? 0;
    perUrl.set(url, attemptIndex + 1);

    const requestHeaders = new Headers(init?.headers ?? request?.headers);
    const headerRecord: Record<string, string> = {};
    requestHeaders.forEach((value, name) => {
      headerRecord[name.toLowerCase()] = value;
    });
    const signal = init?.signal ?? request?.signal ?? undefined;

    const call: RecordedCall = {
      url,
      attemptIndex,
      method: (init?.method ?? request?.method ?? 'GET').toUpperCase(),
      headers: headerRecord,
      redirect: init?.redirect ?? request?.redirect,
      sentAtMs: runtime.clock(),
      abortedAtMs: null,
    };
    calls.push(call);

    const markAborted = (): never => {
      call.abortedAtMs = runtime.clock();
      throw abortError();
    };

    if (signal?.aborted === true) return markAborted();

    const step = script(url, attemptIndex);
    if (signal === undefined) {
      if (step.latencyMs === 'never') return new Promise<Response>(() => undefined);
    } else if (step.latencyMs === 'never') {
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return markAborted();
    }

    const waitMs = step.latencyMs as number;
    if (signal !== undefined) {
      if ((await runtime.timer.sleep(waitMs, signal)) === 'aborted') return markAborted();
    } else {
      await runtime.timer.sleep(waitMs, new AbortController().signal);
    }

    if (step.response === 'network-error') throw new TypeError('fetch failed');
    return buildResponse(step.response, signal);
  };

  return { fetch: scriptedFetch as typeof fetch, calls };
}

/** Script from a step list: attempt N gets step N, and the last step repeats. */
export function scriptFromSteps(steps: readonly Step[]): ScriptFn {
  return (_url, attemptIndex) => {
    const step = steps[Math.min(attemptIndex, steps.length - 1)];
    if (step === undefined) throw new Error('scriptFromSteps needs at least one step');
    return step;
  };
}
