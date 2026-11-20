import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkLandingHtml } from '../../scripts/verify-deployment'

// Mirrors the relevant parts of the prerendered shell in .next/server/app/index.html.
const SNIPPET = `<!DOCTYPE html><html lang="en" class="A7bnrW_variable uJwZvG_variable"><head><meta charSet="utf-8"/><title>Gravekeeper</title></head><body><main><h1 class="text-4xl text-bone">Gravekeeper</h1><div aria-hidden="true" class="min-h-28"></div></main></body></html>`

const BUILT = path.resolve(__dirname, '../../.next/server/app/index.html')
const shells: Array<[string, string]> = [['fixed snippet', SNIPPET]]
if (existsSync(BUILT)) shells.push(['built index.html', readFileSync(BUILT, 'utf8')])

describe('checkLandingHtml', () => {
  it.each(shells)('accepts the prerendered shell (%s)', (_name, html) => {
    expect(checkLandingHtml(html)).toEqual([])
  })

  it('rejects the starter page', () => {
    const html = '<html lang="en"><head><title>Create Next App</title></head><body><main><h1>To get started, edit the page.tsx file.</h1></main></body></html>'
    const failures = checkLandingHtml(html)
    expect(failures.length).toBeGreaterThan(0)
    expect(failures.join('\n')).toContain('To get started, edit')
  })

  it('rejects an HTML without the h1 "Gravekeeper"', () => {
    const failures = checkLandingHtml(SNIPPET.replace(/<h1[^>]*>Gravekeeper<\/h1>/, '<h1>Other</h1>'))
    expect(failures).toEqual(['there is no h1 with the text "Gravekeeper"'])
  })

  it('rejects the wrong title', () => {
    const failures = checkLandingHtml(SNIPPET.replace('<title>Gravekeeper</title>', '<title>Create Next App</title>'))
    expect(failures).toEqual(['the title is not "Gravekeeper"'])
  })

  it('rejects an html element without lang="en"', () => {
    const failures = checkLandingHtml(SNIPPET.replace('<html lang="en"', '<html'))
    expect(failures).toEqual(['the html element has no lang="en"'])
  })

  it('rejects a missing reserved min-h-28 block', () => {
    const failures = checkLandingHtml(SNIPPET.replace('<div aria-hidden="true" class="min-h-28"></div>', ''))
    expect(failures).toEqual(['the reserved form block of the fallback is missing'])
  })
})
