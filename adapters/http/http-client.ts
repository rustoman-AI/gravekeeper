import {
  MAX_RESPONSE_BYTES,
  REQUEST_TIMEOUT_MS,
  REQUEST_TOTAL_TIMEOUT_MS,
} from '../../pipeline/constants';
import type {
  AdapterReason,
  HttpClient,
  HttpRequest,
  RequestContext,
  SourceHeaders,
  SourceName,
  WorkUnitOutcome,
} from '../../pipeline/ports/http';
import type { Clock, ConcurrencyLimiter, Logger, RandomSource, Timer } from '../../pipeline/ports/runtime';
import { readBodyLimited } from './body-reader';
import { createConcurrencyLimiter } from './concurrency-limiter';
import { scrubSecrets } from './redact';
import { decideAfterAttempt, resolveRedirect, type AttemptResult } from './retry-policy';

// Requirements 15.1 to 15.10, 15.15 to 15.17, 15.19 to 15.21, 16.5, 16.8, 16.9, 20.2 to 20.4

export interface LimiterConfig {
  readonly concurrency: number;
  readonly minIntervalMs: number;
}

export interface HttpClientOptions {
  readonly fetchImpl: typeof fetch;
  readonly clock: Clock;
  readonly timer: Timer;
  readonly random: RandomSource;
  readonly logger: Logger;
  readonly limiters: Readonly<Record<SourceName, LimiterConfig>>;
  /** Authorization header value for a URL, or null (R20.2). Called once per hop. */
  readonly authorizer: (url: URL) => string | null;
  /** Values to scrub from every returned string (the token, when set). */
  readonly secrets: () => readonly string[];
  /** Default User-Agent. A User-Agent in the request headers wins. */
  readonly userAgent: string;
}

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/** An attempt result plus what the Work_Unit needs to build its outcome. */
type AttemptRun = {
  readonly result: AttemptResult;
  readonly bodyText: string;
  readonly status: number | null;
  readonly headers: SourceHeaders | null;
};

function isAllowedHeader(name: string): boolean {
  return name === 'content-type' || name === 'retry-after' || name.startsWith('x-ratelimit-');
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { fetchImpl, clock, timer, random, logger, authorizer, secrets, userAgent } = options;

  const limiters = {} as Record<SourceName, ConcurrencyLimiter>;
  for (const name of Object.keys(options.limiters) as SourceName[]) {
    const cfg = options.limiters[name];
    limiters[name] = createConcurrencyLimiter(cfg.concurrency, cfg.minIntervalMs, { clock, timer });
  }

  function scrub(text: string): string {
    return scrubSecrets(text, secrets());
  }

  function readHeaders(response: Response): SourceHeaders {
    const out: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      const name = key.toLowerCase();
      if (isAllowedHeader(name)) out[name] = scrub(value);
    });
    return out;
  }

  /** Request headers + default User-Agent. Request-level values win; Authorization is never taken from the request. */
  function baseHeaders(req: HttpRequest): Map<string, string> {
    const map = new Map<string, string>();
    for (const [name, value] of Object.entries(req.headers)) {
      const lower = name.toLowerCase();
      if (lower === 'authorization') continue;
      map.set(lower, value);
    }
    if (!map.has('user-agent') && userAgent !== '') map.set('user-agent', userAgent);
    return map;
  }

  function failed(
    reason: AdapterReason,
    attempts: number,
    last: AttemptRun | null,
  ): WorkUnitOutcome {
    return {
      kind: 'failed',
      reason,
      status: last?.status ?? null,
      headers: last?.headers ?? null,
      attempts,
    };
  }

  function logAttempt(source: SourceName, run: AttemptRun, startedAt: number): void {
    try {
      const code = run.result.type === 'response' ? 'response' : run.result.type;
      logger.log({ source, status: run.status, durationMs: Math.max(0, Math.floor(clock() - startedAt)), code });
    } catch {
      // logging never affects the Work_Unit
    }
  }

  async function runWorkUnit(req: HttpRequest, ctx: RequestContext): Promise<WorkUnitOutcome> {
    let attempts = 0;
    let firstSentAt: number | null = null;
    let last: AttemptRun | null = null;

    /** One Attempt (R15.1 to R15.3, R15.19 to R15.21). Never throws. */
    async function attempt(): Promise<AttemptRun> {
            const controller = new AbortController();
      let handle: ReturnType<Timer['setTimeout']> | null = null;
      const noResponse = (type: 'network-error' | 'timeout' | 'deadline' | 'oversize' | 'redirect-refused'): AttemptRun => ({
        result: { type } as AttemptResult,
        bodyText: '',
        status: null,
        headers: null,
      });
      // R16.5 first, then the attempt controller.
      const classify = (): AttemptRun =>
        ctx.signal.aborted
          ? noResponse('deadline')
          : controller.signal.aborted
            ? noResponse('timeout')
            : noResponse('network-error');

      try {
        const budget =
          firstSentAt === null
            ? REQUEST_TIMEOUT_MS
            : Math.min(REQUEST_TIMEOUT_MS, REQUEST_TOTAL_TIMEOUT_MS - (clock() - firstSentAt));
        if (!(budget > 0)) return noResponse('timeout');
        if (ctx.signal.aborted) return noResponse('deadline');

        handle = timer.setTimeout(() => controller.abort(), budget);
        const signal = AbortSignal.any([ctx.signal, controller.signal]);
        const aborted = new Promise<'aborted'>((resolve) => {
          if (signal.aborted) resolve('aborted');
          else signal.addEventListener('abort', () => resolve('aborted'), { once: true });
        });

        const headers = baseHeaders(req);
        const firstUrl = req.url;
        let currentUrl = req.url;
        let hops = 0;
        if (firstSentAt === null) firstSentAt = clock();

        for (;;) {
          const url = new URL(currentUrl);
          const init: Record<string, string> = {};
          for (const [name, value] of headers) init[name] = value;
          if (req.auth === 'github') {
            const authorization = authorizer(url);
            if (authorization !== null) init['authorization'] = authorization;
          }
          const response = await Promise.race([
            fetchImpl(currentUrl, {
              method: req.method,
              headers: init,
              body: req.method === 'POST' ? req.body : null,
              signal,
              redirect: 'manual',
            }),
            aborted,
          ]);
          if (response === 'aborted') return classify();

          const responseHeaders = readHeaders(response);
          const status = response.status;

          if (REDIRECT_STATUSES.has(status)) {
            const location = response.headers.get('location') ?? undefined;
            await response.body?.cancel().catch(() => undefined);
            const decision = resolveRedirect(firstUrl, currentUrl, location, hops, req.method);
            if (decision.kind === 'refuse') {
              return { result: { type: 'redirect-refused' }, bodyText: '', status, headers: responseHeaders };
            }
            hops += 1;
            currentUrl = decision.url;
            continue;
          }

          req.gate?.observe(responseHeaders);

          if (status < 200 || status >= 300) {
            await response.body?.cancel().catch(() => undefined);
            return { result: { type: 'response', status, headers: responseHeaders }, bodyText: '', status, headers: responseHeaders };
          }

          const body = await readBodyLimited(response, MAX_RESPONSE_BYTES, signal);
          if (body.type === 'oversize') {
            return { result: { type: 'oversize' }, bodyText: '', status, headers: responseHeaders };
          }
          if (body.type === 'aborted') return classify();
          if (body.type === 'error') return noResponse('network-error');
          return {
            result: { type: 'response', status, headers: responseHeaders },
            bodyText: scrub(body.bodyText),
            status,
            headers: responseHeaders,
          };
        }
      } catch {
        return classify();
      } finally {
        if (handle !== null) timer.clearTimeout(handle);
      }
    }

    for (;;) {
      if (ctx.signal.aborted) return failed('deadline', attempts, last);
      if (req.gate && !req.gate.allow()) return failed('budget', attempts, last);

      const startedAt = clock();
      const slot = await limiters[req.source].run(attempt, ctx.signal);
      if (!slot.acquired) return failed('deadline', attempts, last);
      const run = slot.value;
      attempts += 1;
      last = run;
      logAttempt(req.source, run, startedAt);

      const decision = decideAfterAttempt({
        source: req.source,
        attempts,
        result: run.result,
        notFound: req.notFound,
        now: clock(),
        firstSentAt,
        deadlineAtMs: ctx.deadlineAtMs,
        random: random(),
        gateAllows: req.gate ? req.gate.allow() : true,
      });

      switch (decision.kind) {
        case 'ok':
          return {
            kind: 'ok',
            status: run.status ?? 200,
            bodyText: run.bodyText,
            headers: run.headers ?? {},
            attempts,
            fromCache: false,
          };
        case 'absent':
          return { kind: 'absent', status: 404, headers: run.headers ?? {}, attempts, fromCache: false };
        case 'failed':
          return failed(decision.reason, attempts, run);
        case 'retry': {
          const slept = await timer.sleep(decision.waitMs, ctx.signal);
          if (slept === 'aborted') return failed('deadline', attempts, run);
          break;
        }
      }
    }
  }

  return {
    async execute(request, context): Promise<WorkUnitOutcome> {
      try {
        return await runWorkUnit(request, context);
      } catch {
        return { kind: 'failed', reason: 'network', status: null, headers: null, attempts: 0 };
      }
    },
  };
}
