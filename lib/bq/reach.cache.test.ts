import { describe, expect, test, vi } from 'vitest'

// Every cached() call is recorded with its options, as lib/organic-social/ytd-sheet.test.ts does.
const { cachedCalls } = vi.hoisted(() => ({ cachedCalls: [] as unknown[][] }))
vi.mock('@/lib/cache', () => ({ cached: (...a: unknown[]) => { cachedCalls.push(a); return a[2] } }))
vi.mock('./client', () => ({ martRef: (t: string) => t, bqRows: vi.fn() }))

import './reach'
import './meta'
import './linkedin'

const opts = (fn: string) => cachedCalls.find((c) => c[1] === fn)?.[3] as { healthCritical?: boolean } | undefined

describe('health beacon (Paul, on Thomas\'s review of #513)', () => {
  test('a reach failure never raises the page-down alert: both reach fetchers are not health-critical', () => {
    // The tile already degrades to — with a notice and a bq_fallback line; a down alert is the wrong severity.
    expect(opts('reachPulledOn')?.healthCritical).toBe(false)
    expect(opts('reachRows')?.healthCritical).toBe(false)
  })
  test('the sums fetchers stay health-critical (the default)', () => {
    for (const fn of ['readMetaMarts', 'readLinkedInMarts']) {
      expect(cachedCalls.some((c) => c[1] === fn)).toBe(true)
      expect(opts(fn)?.healthCritical).not.toBe(false)
    }
  })
})
