// Requirement 21.1, 21.9, 21.10, 21.11, 21.13, 21.16, 22.10
import { after } from 'next/server';
import { createProductionDeps } from '../../../adapters/composition';
import { readRuntimeEnv } from '../../../adapters/runtime/env';
import { readGithubConfig } from '../../../pipeline/config/github-config';
import { createScanCache, handleScanRequest } from '../../../pipeline';
import type { ApiDeps, ApiResponse, RawScanRequest } from '../../../pipeline';
import type { Deferrer } from '../../../pipeline/ports/runtime';
import { renderErrorMessage } from '../../../pipeline/scan/messages';

// A number literal, so Next.js can read it statically.
export const maxDuration = 30;

/** Runs deferred work (L2 writes) after the response. A rejected promise is swallowed. */
const deferrer: Deferrer = {
  defer(work) {
    after(async () => {
      try {
        await work;
      } catch {
        // Deferred writes are best effort.
      }
    });
  },
};

function buildDeps(): ApiDeps {
  const env = readRuntimeEnv();
  // An invalid GitHub configuration must not crash the route. `handleScanRequest` reads the same
  // variables through `readEnv` and answers `internal-error` at its R21.14 (a) step, before any
  // source is called, so the sources built here from the defaults are never used in that case.
  const parsed = readGithubConfig(env);
  const config = parsed.ok ? parsed.value : readDefaultConfig();
  const { scanStore, ...rest } = createProductionDeps(env, deferrer, config);
  return { ...rest, scanCache: createScanCache(scanStore) };
}

function readDefaultConfig() {
  const fallback = readGithubConfig({});
  if (!fallback.ok) throw new Error('default GitHub configuration is invalid');
  return fallback.value;
}

function toRawRequest(request: Request): RawScanRequest {
  return {
    method: request.method,
    contentType: request.headers.get('content-type'),
    contentLength: request.headers.get('content-length'),
    body: request.body,
  };
}

function internalErrorResponse(isHead: boolean): Response {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (isHead) return new Response(null, { status: 500, headers });
  return Response.json(
    {
      ok: false,
      error: { code: 'internal-error', message: renderErrorMessage('internal-error', undefined, '') },
    },
    { status: 500, headers },
  );
}

async function handle(request: Request): Promise<Response> {
  // Captured before buildDeps and the body read so the scan's wall budget (Session 21) counts the
  // time spent building dependencies and reading the body, not only the in-handler clock reading.
  const receivedAtMs = Date.now();
  const isHead = request.method === 'HEAD';
  let result: ApiResponse;
  try {
    result = await handleScanRequest(toRawRequest(request), { ...buildDeps(), receivedAtMs });
  } catch {
    return internalErrorResponse(isHead);
  }
  if (isHead) return new Response(null, { status: result.status, headers: result.headers });
  return Response.json(result.body, { status: result.status, headers: result.headers });
}

export const POST = handle;
export const GET = handle;
export const HEAD = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
