import { describe, expect, test } from 'vitest'
import { weekStart, bucketToWeeks, blendTrend } from './trend'
import type { ChannelSeriesPoint } from './trend'

describe('weekStart (Monday, UTC)', () => {
  test('maps every day of a week to that week Monday', () => {
    expect(weekStart('2026-08-03')).toBe('2026-08-03') // Monday
    expect(weekStart('2026-08-06')).toBe('2026-08-03') // Thursday → same Monday
    expect(weekStart('2026-08-09')).toBe('2026-08-03') // Sunday → same Monday
    expect(weekStart('2026-08-10')).toBe('2026-08-10') // next Monday
  })
})

describe('bucketToWeeks', () => {
  test('sums daily points into their Monday-keyed weeks', () => {
    const pts: ChannelSeriesPoint[] = [
      { date: '2026-08-06', spend: 100, clicks: 10 },
      { date: '2026-08-07', spend: 50, clicks: 5 },
      { date: '2026-08-10', spend: 200, clicks: 20 },
    ]
    const m = bucketToWeeks(pts)
    expect(m.get('2026-08-03')).toEqual({ spend: 150, clicks: 15 })
    expect(m.get('2026-08-10')).toEqual({ spend: 200, clicks: 20 })
  })
})

describe('blendTrend (align by week key, not index)', () => {
  test('two channels with different week sets align on the shared week', () => {
    // Paid Search has weeks W1 (Aug 3) + W2 (Aug 10); Meta has ONLY W2 (Aug 10).
    // An index-join would pair Meta's single week with W1 and corrupt the total.
    const ps = new Map([
      ['2026-08-03', { spend: 100, clicks: 10 }],
      ['2026-08-10', { spend: 300, clicks: 30 }],
    ])
    const meta = new Map([['2026-08-10', { spend: 50, clicks: 5 }]])
    const points = blendTrend([
      { key: 'paid-search', weeks: ps },
      { key: 'meta', weeks: meta },
    ])
    expect(points.map((p) => p.week)).toEqual(['2026-08-03', '2026-08-10']) // sorted union
    // W1: paid-search only (Meta absent, NOT mis-joined here).
    expect(points[0].channels['paid-search']).toEqual({ spend: 100, clicks: 10 })
    expect(points[0].channels.meta).toBeUndefined()
    // W2: both channels, on the same week key.
    expect(points[1].channels['paid-search']).toEqual({ spend: 300, clicks: 30 })
    expect(points[1].channels.meta).toEqual({ spend: 50, clicks: 5 })
    expect(points[1].label).toBeTruthy()
  })
})
