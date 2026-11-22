# Session 21 root cause: production scan timeouts

## Symptom
An outside tester ran 9 uncached scans of `request/request` on
`https://gravekeeper-chi.vercel.app` in a row. All 9 hit the 30 s function timeout (Vercel 504).
Only after the cache warmed did one return, and it took 16 s. The design says the scan returns
partial results at `SCAN_DEADLINE_MS = 25000`, before `maxDuration = 30`, so a timeout should never
reach the user.

## What I could and could not observe
- I reproduced scans against production with `scripts/demo/repro-timeout.mts` and
  `scripts/demo/repro-concurrent.mts`. On **warm** instances every scan returned 200 well under the
  deadline (0.5 to 3.3 s), including 9 concurrent uncached scans of a large npm repo. I did not
  reproduce a 504 on a warm instance.
- I could **not** pull the Vercel function logs: there is no Vercel CLI or `VERCEL_TOKEN` in this
  environment and the project is not linked locally (`.vercel/` absent). The logs for the tester's 9
  requests should be read from the Vercel dashboard (Functions, `/api/scan`) to confirm the cold-start
  timing below; that step is noted as not done here.

## The budget and where it is measured
- `pipeline/constants.ts`: `SCAN_DEADLINE_MS = 25000`, `SCAN_RESPONSE_MARGIN_MS = 1500`.
- `app/api/scan/route.ts`: `export const maxDuration = 30`.
- `pipeline/api/handle-scan-request.ts`:
  - `const startedAtMs = deps.clock();` is read **after** method, media-type, body read and request
    validation (line 128).
  - The margin timer is scheduled **even later**: `deps.timer.setTimeout(resolve, SCAN_DEADLINE_MS +
    SCAN_RESPONSE_MARGIN_MS)` (line 161), i.e. 26 500 ms **from when that line runs**.
  - `runScan` sets its own abort at `deadlineMs` (`run-scan.ts` line 89) and the context carries
    `deadlineAtMs = input.startedAtMs + deadlineMs`.

So the whole deadline machinery is anchored to the injected clock reading taken **inside the handler**,
not to the moment Vercel started the function (which is when the `maxDuration` clock starts).

## Root cause
The deadline and the response margin are measured from `deps.clock()` read inside the handler, while
Vercel's 30 s `maxDuration` is measured from function invocation. The gap between the two is not
counted against the 26 500 ms budget:

1. **Cold start.** On a cold Lambda, the Node runtime boots and the route module and its imports are
   evaluated, then `buildDeps()` runs (`createProductionDeps`, `getCache()`), before `handle()` reads
   `startedAtMs`. On Node serverless this is commonly 1 to 5 s, and more when several cold instances
   start at once (the tester's 9-in-a-row case: 9 cold starts contending for CPU).
2. **Pre-clock request work.** Method/media checks and the streamed body read in `readRequestBody`
   happen before `startedAtMs`.
3. **Post-margin work.** After the margin fires, `assemblePartial` / `assembleResult` builds the body
   and `Response.json` serializes it. For a 40-dependency result this is non-trivial.

The headroom between the margin and `maxDuration` is only `30000 - 26500 = 3500 ms`. Items 1 to 3 are
not inside the 26 500 ms window, so when they exceed ~3.5 s the function runs past 30 s and Vercel
returns a 504 before the handler's own margin response is sent. Warm instances skip item 1 and most of
item 2, which is why warm scans never time out and the tester's scans only recovered once instances
were warm (and even then one still took 16 s, i.e. near the deadline on a slow path).

## Why the existing properties did not catch it
`tests/pipeline/scan/deadline.property.test.ts` proves P48 (no attempt at/after the deadline) and P49
(a response by `startedAtMs + SCAN_DEADLINE_MS + SCAN_RESPONSE_MARGIN_MS`, even with a never-settling
scan). Both are correct, but both measure from `startedAtMs` **on the injected clock**, which is the
value read inside the handler. They cannot see the cold-start, pre-clock and serialize time that lives
outside that window, so they are green while production times out.

## Ruled out (with evidence)
- **Rate-limit sleeps outlasting the deadline (crates.io 1 req/s).** `concurrency-limiter.ts`
  `waitForSpacing` sleeps on `timer.sleep(waitMs, signal)` and returns `false` the moment the signal
  aborts; the spacing reservation is given back. P48 passes with crates spacing on.
- **HTTP work ignoring the AbortSignal.** `http-client.ts` races every fetch and body read against
  `ctx.signal` and returns `deadline` when it is aborted; P48 passes even when the fake fetch ignores
  the signal.
- **Blocking cache writes.** L2 writes are bounded to `L2_OPERATION_TIMEOUT_MS = 300` and never throw
  (`runtime-cache-store.ts`), and the tiered store hands L2 writes to the Deferrer (`after()`), so they
  do not block the response (`tiered-cache-store.ts`).
- **The margin never firing.** The margin is a real `setTimeout` on the system timer and P49 shows it
  answers a never-settling scan at exactly deadline + margin on the injected clock.

## Fix direction (implemented next)
Tighten the end-to-end wall-time budget so the margin response is sent well before 30 s even with a
cold start:
- Lower the margin trigger so the handler answers by ~27 s of **handler** time, leaving headroom for
  cold start and serialize under `maxDuration = 30`.
- Make the deadline/margin budget shrink by the time already spent since invocation, measured from a
  monotonic marker captured at module load (the earliest point the function is alive), not only from
  the in-handler clock reading.
- Keep cache writes off the response path (already deferred) and confirm nothing is awaited after the
  margin fires.

See `pipeline/constants.ts` and `pipeline/api/handle-scan-request.ts` for the change, and the new
fake-clock test that asserts the response is produced no later than the shrunk budget regardless of
source delays, plus the production e2e test under `E2E_BASE_URL`.
