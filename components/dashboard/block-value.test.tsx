// components/dashboard/block-value.test.tsx
// Run: npx tsx components/dashboard/block-value.test.tsx
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'
import type { ResolveResult } from '@/lib/dashboard/types'

// BlockValue transitively imports the DB client (via metric-block-states); it is
// never queried here, but the module needs a non-empty URL to construct. Set a
// placeholder, then dynamic-import inside the async IIFE (tsx compiles this file
// as CJS, which rejects top-level await).
process.env.DATABASE_URL ??= 'postgresql://user:password@host.tld/dbname'

;(async () => {
  const { BlockValue } = await import('./block-value')

  // Renders the formatted value via MetricValue typography
  {
    const el = await BlockValue({
      valuePromise: Promise.resolve({ ok: true, value: 100, formatted: '100' } as ResolveResult),
      slug: 'demo',
    })
    const html = renderToString(el)
    assert.equal(html.includes('100'), true)
    assert.equal(html.includes('text-3xl'), true)
    assert.equal(html.includes('font-extrabold'), true)
  }

  // Value at/above ceiling is colored (band class applied, not plain white)
  {
    const el = await BlockValue({
      valuePromise: Promise.resolve({ ok: true, value: 100, formatted: '100' } as ResolveResult),
      slug: 'demo',
      target: 50,
      ceiling: 90,
    })
    const html = renderToString(el)
    assert.equal(html.includes('text-white'), false)
  }

  console.log('ok')
})()
