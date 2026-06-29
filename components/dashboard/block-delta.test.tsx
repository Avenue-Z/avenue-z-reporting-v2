// components/dashboard/block-delta.test.tsx
// Run: npx tsx components/dashboard/block-delta.test.tsx
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'
import type { ReactElement } from 'react'
import type { ResolveResult } from '@/lib/dashboard/types'

// tsx compiles this file as CJS, which rejects top-level await — wrap in an IIFE.
;(async () => {
  const { BlockDelta } = await import('./block-delta')

  // 110 vs 100 → +10.0%, up arrow, green, "vs prior period"
  {
    const el = await BlockDelta({
      valuePromise: Promise.resolve({ ok: true, value: 110, formatted: '110' } as ResolveResult),
      prevPromise: Promise.resolve({ ok: true, value: 100, formatted: '100' } as ResolveResult),
      compareRange: 'previous_period',
    })
    assert.notEqual(el, null)
    const html = renderToString(el as ReactElement)
    assert.equal(html.includes('↑'), true)
    assert.equal(html.includes('10.0%'), true)
    assert.equal(html.includes('vs prior period'), true)
    assert.equal(html.includes('text-brand-green'), true)
  }

  // previous_year suffix
  {
    const el = await BlockDelta({
      valuePromise: Promise.resolve({ ok: true, value: 90, formatted: '90' } as ResolveResult),
      prevPromise: Promise.resolve({ ok: true, value: 100, formatted: '100' } as ResolveResult),
      compareRange: 'previous_year',
    })
    const html = renderToString(el as ReactElement)
    assert.equal(html.includes('↓'), true)
    assert.equal(html.includes('vs prior year'), true)
  }

  // No prev promise → renders nothing
  {
    const el = await BlockDelta({
      valuePromise: Promise.resolve({ ok: true, value: 1, formatted: '1' } as ResolveResult),
      prevPromise: null,
      compareRange: null,
    })
    assert.equal(el, null)
  }

  console.log('ok')
})()
