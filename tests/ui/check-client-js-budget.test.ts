import { gzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import {
  budgetMessage,
  budgetVerdict,
  collectInitialFiles,
  dedupeFiles,
  extractManifestChunks,
  extractScriptUrls,
  largestChunks,
  sumGzipBytes,
  urlToNextFile,
} from '../../scripts/check-client-js-budget'
import { CLIENT_JS_BUDGET_BYTES } from '../../view-model/constants'

const gz = (s: string): number => gzipSync(Buffer.from(s), { level: 9 }).length

describe('sumGzipBytes', () => {
  it('sums level-9 gzip sizes computed independently', () => {
    const a = 'console.log("a");'.repeat(50)
    const b = new Uint8Array(Array.from({ length: 300 }, (_, i) => i % 7))
    const { total, chunks } = sumGzipBytes([
      { file: 'static/a.js', bytes: a },
      { file: 'static/b.js', bytes: b },
    ])
    const expA = gz(a)
    const expB = gzipSync(b, { level: 9 }).length
    expect(chunks).toEqual([
      { file: 'static/a.js', gzipBytes: expA },
      { file: 'static/b.js', gzipBytes: expB },
    ])
    expect(total).toBe(expA + expB)
  })

  it('counts a chunk listed twice once', () => {
    const a = 'x'.repeat(200)
    const { total, chunks } = sumGzipBytes([
      { file: 'static/a.js', bytes: a },
      { file: 'static/a.js', bytes: a },
    ])
    expect(chunks).toHaveLength(1)
    expect(total).toBe(gz(a))
  })

  it('returns zero for no files', () => {
    expect(sumGzipBytes([])).toEqual({ total: 0, chunks: [] })
  })
})

describe('dedupeFiles', () => {
  it('keeps first occurrences in order', () => {
    expect(dedupeFiles(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
  })
})

describe('budgetVerdict', () => {
  it('passes below the budget', () => {
    expect(budgetVerdict(99, 100)).toEqual({ ok: true, total: 99, budget: 100, margin: 1 })
  })
  it('passes exactly at the budget', () => {
    expect(budgetVerdict(100, 100)).toEqual({ ok: true, total: 100, budget: 100, margin: 0 })
  })
  it('fails above the budget', () => {
    expect(budgetVerdict(101, 100)).toEqual({ ok: false, total: 101, budget: 100, margin: -1 })
  })
})

describe('budgetMessage', () => {
  const chunks = [
    { file: 'static/small.js', gzipBytes: 10 },
    { file: 'static/big.js', gzipBytes: 500 },
  ]
  it('names CLIENT_JS_BUDGET_BYTES when over budget', () => {
    const msg = budgetMessage(budgetVerdict(510, 400), chunks)
    expect(msg).toContain('CLIENT_JS_BUDGET_BYTES')
    expect(msg).toContain('over budget')
    expect(msg).toContain('510')
    expect(msg).toContain('400')
    expect(msg.indexOf('static/big.js')).toBeLessThan(msg.indexOf('static/small.js'))
  })
  it('names CLIENT_JS_BUDGET_BYTES when within budget', () => {
    const msg = budgetMessage(budgetVerdict(10, CLIENT_JS_BUDGET_BYTES), chunks)
    expect(msg).toContain('CLIENT_JS_BUDGET_BYTES')
    expect(msg).toContain('within budget')
  })
})

describe('largestChunks', () => {
  it('returns the top five sorted by size then name', () => {
    const chunks = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((f, i) => ({ file: f, gzipBytes: i === 6 ? 1 : 5 }))
    expect(largestChunks(chunks).map((c) => c.file)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

describe('extractScriptUrls', () => {
  it('collects script src and preload-as-script links, skipping noModule', () => {
    const html = [
      '<link rel="preload" as="script" href="/_next/static/chunks/p.js"/>',
      '<link rel="stylesheet" href="/_next/static/css/s.css"/>',
      '<link rel="preload" as="font" href="/f.woff2"/>',
      '<script src="/_next/static/chunks/a.js" async=""></script>',
      '<script src="/_next/static/chunks/poly.js" noModule=""></script>',
      '<script>inline()</script>',
    ].join('')
    expect(extractScriptUrls(html)).toEqual(['/_next/static/chunks/p.js', '/_next/static/chunks/a.js'])
  })
})

describe('extractManifestChunks', () => {
  it('returns chunks of the graveyard-app module only', () => {
    const manifest = {
      clientModules: {
        '[project]/components/graveyard-app.tsx': { chunks: ['/_next/static/chunks/g1.js', '/_next/static/chunks/g2.js'] },
        '[project]/components/other.tsx': { chunks: ['/_next/static/chunks/o.js'] },
      },
    }
    const src = `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST["/page"] = ${JSON.stringify(manifest)}\n`
    expect(extractManifestChunks(src)).toEqual(['/_next/static/chunks/g1.js', '/_next/static/chunks/g2.js'])
  })
})

describe('urlToNextFile', () => {
  it('maps URLs to .next-relative files and drops queries', () => {
    expect(urlToNextFile('/_next/static/chunks/a.js?dpl=x')).toBe('static/chunks/a.js')
    expect(urlToNextFile('/_next/static/css/a.css')).toBeUndefined()
  })
})

describe('collectInitialFiles', () => {
  it('merges HTML and manifest URLs without duplicates', () => {
    const html = '<script src="/_next/static/chunks/a.js"></script>'
    const manifest = {
      clientModules: { 'x/components/graveyard-app.tsx': { chunks: ['/_next/static/chunks/a.js', '/_next/static/chunks/b.js'] } },
    }
    const src = `globalThis.__RSC_MANIFEST["/page"] = ${JSON.stringify(manifest)}`
    expect(collectInitialFiles(html, src)).toEqual(['static/chunks/a.js', 'static/chunks/b.js'])
  })
})
