import type {
  HttpClient,
  HttpRequest,
  RequestContext,
  WorkUnitOutcome,
} from '../../pipeline/ports/http';
import { requestKey } from '../../pipeline/ports/request-key';
import type { FixtureResponseFile } from '../../tests/support/fixture-http-client';
import { allowHeaders } from './allow-headers';

// Requirement 23.2, 23.3, 23.7

export interface RecordedResponse {
  readonly key: string;
  readonly file: FixtureResponseFile;
}

/**
 * Wraps the production `HttpClient`. Every `ok` or `absent` outcome is stored with its request
 * descriptor (no request header) and the allow-listed response headers. `failed` outcomes are
 * not stored. The same request key keeps its first response. The outcome is returned unchanged.
 *
 * An `absent` outcome carries no body in `WorkUnitOutcome`, so its `bodyText` is the empty string.
 */
export class RecordingHttpClient implements HttpClient {
  private readonly recorded = new Map<string, RecordedResponse>();
  /** Number of `failed` outcomes seen; any of them makes the recording incomplete. */
  failures = 0;

  constructor(private readonly inner: HttpClient) {}

  async execute(request: HttpRequest, context: RequestContext): Promise<WorkUnitOutcome> {
    const outcome = await this.inner.execute(request, context);
    if (outcome.kind === 'failed') {
      this.failures += 1;
      return outcome;
    }
    const key = requestKey(request);
    if (!this.recorded.has(key)) {
      const descriptor = {
        source: request.source,
        method: request.method,
        url: request.url,
        body: request.body,
      };
      const file: FixtureResponseFile =
        outcome.kind === 'ok'
          ? {
              request: descriptor,
              response: {
                kind: 'ok',
                status: outcome.status,
                headers: allowHeaders(outcome.headers),
                bodyText: outcome.bodyText,
              },
            }
          : {
              request: descriptor,
              response: {
                kind: 'absent',
                status: outcome.status,
                headers: allowHeaders(outcome.headers),
                bodyText: '',
              },
            };
      this.recorded.set(key, { key, file });
    }
    return outcome;
  }

  /** Recorded responses in first-seen order. */
  responses(): readonly RecordedResponse[] {
    return [...this.recorded.values()];
  }
}
