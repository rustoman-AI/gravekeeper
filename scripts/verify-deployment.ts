// Deployment check (Requirement 15.8). Deployment is Vercel's git integration on push to `main`;
// this script only reads the deployed page: `npm run verify:deploy` or
// `tsx scripts/verify-deployment.ts <url>`.
//
// The landing page renders on the client under Suspense (design D1), so the static HTML holds
// only the shell. The interactive parts are checked in a browser by tests/e2e/deployed.spec.ts.

import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_ATTEMPTS = 30
export const ATTEMPT_DELAY_MS = 20_000

/** Returns one message per failed check; an empty array means the static HTML is as expected. */
export function checkLandingHtml(html: string): string[] {
  const failures: string[] = []
  if (!/<html\b[^>]*\blang="en"/i.test(html)) failures.push('the html element has no lang="en"')
  if (!/<title\b[^>]*>\s*Gravekeeper\s*<\/title>/i.test(html)) {
    failures.push('the title is not "Gravekeeper"')
  }
  if (!/<h1\b[^>]*>\s*Gravekeeper\s*<\/h1>/i.test(html)) {
    failures.push('there is no h1 with the text "Gravekeeper"')
  }
  // GateFallback: the aria-hidden block reserved at the height of the form (class min-h-28).
  const reserved = (html.match(/<div\b[^>]*>/gi) ?? []).some(
    (tag) => /\baria-hidden="true"/i.test(tag) && /\bclass="[^"]*\bmin-h-28\b/i.test(tag),
  )
  if (!reserved) failures.push('the reserved form block of the fallback is missing')
  if (html.includes('To get started, edit')) failures.push('the starter text "To get started, edit" is present')
  return failures
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchHtml(url: string): Promise<string | string[]> {
  try {
    const response = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
    if (!response.ok) return [`GET ${url} answered ${response.status}`]
    return await response.text()
  } catch (error) {
    return [`GET ${url} failed: ${error instanceof Error ? error.message : String(error)}`]
  }
}

/** Retries so that a build in progress can finish. Returns the failures of the last attempt. */
export async function verifyDeployment(
  url: string,
  attempts = MAX_ATTEMPTS,
  delayMs = ATTEMPT_DELAY_MS,
): Promise<string[]> {
  let failures: string[] = []
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const html = await fetchHtml(url)
    failures = typeof html === 'string' ? checkLandingHtml(html) : html
    if (failures.length === 0) {
      console.log(`verify:deploy: ${url} is as expected (attempt ${attempt}).`)
      return []
    }
    console.error(`verify:deploy: attempt ${attempt} of ${attempts} failed for ${url}`)
    for (const failure of failures) console.error(`  - ${failure}`)
    if (attempt < attempts) await sleep(delayMs)
  }
  return failures
}

async function main(): Promise<number> {
  const url = process.argv[2]
  if (!url) {
    console.error('usage: tsx scripts/verify-deployment.ts <url>')
    return 1
  }
  const failures = await verifyDeployment(url)
  if (failures.length > 0) {
    console.error(`verify:deploy: ${url} failed ${failures.length} check(s):`)
    for (const failure of failures) console.error(`  - ${failure}`)
    return 1
  }
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code))
}
