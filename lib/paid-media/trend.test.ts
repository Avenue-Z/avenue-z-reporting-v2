import { describe, expect, test, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { blendDaily, getPaidMediaTrend } from './trend'
import type { ChannelSeriesPoint } from './trend'

vi.mock('@/lib/paid-search/base', () => ({ awQuery: vi.fn() }))
vi.mock('@/lib/meta/base', () => ({ metaQuery: vi.fn() }))
vi.mock('@/lib/linkedin/base', () => ({ linkedinQuery: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))

import { awQuery } from '@/lib/paid-search/base'
import { metaQuery } from '@/lib/meta/base'
import { linkedinQuery } from '@/lib/linkedin/base'
import { getClientBySlug } from '@/lib/db/queries'

const aw = awQuery as Mock, meta = metaQuery as Mock, li = linkedinQuery as Mock, client = getClientBySlug as Mock

beforeEach(() => { aw.mockReset(); meta.mockReset(); li.mockReset(); client.mockReset() })

describe('blendDaily (align by date key, not index)', () => {
  test('one row per day, sorted; channels with different date sets align on the shared date', () => {
    // Paid Search has Aug 3 + Aug 5; Meta has ONLY Aug 5. Daily granularity — no weekly
    // rollup — and an index-join would wrongly pair Meta's single day with Aug 3.
    const ps: ChannelSeriesPoint[] = [
      { date: '2026-08-03', spend: 100, clicks: 10 },
      { date: '2026-08-05', spend: 300, clicks: 30 },
    ]
    const metaPts: ChannelSeriesPoint[] = [{ date: '2026-08-05', spend: 50, clicks: 5 }]
    const points = blendDaily([
      { key: 'paid-search', points: ps },
      { key: 'meta', points: metaPts },
    ])
    expect(points.map((p) => p.date)).toEqual(['2026-08-03', '2026-08-05']) // sorted union, per-day
    // Aug 3: Paid Search only (Meta absent, NOT mis-joined here).
    expect(points[0].channels['paid-search']).toEqual({ spend: 100, clicks: 10 })
    expect(points[0].channels.meta).toBeUndefined()
    // Aug 5: both channels, on the same date key.
    expect(points[1].channels['paid-search']).toEqual({ spend: 300, clicks: 30 })
    expect(points[1].channels.meta).toEqual({ spend: 50, clicks: 5 })
  })
})

describe('getPaidMediaTrend', () => {
  test('blends configured channels per day; Meta clicks come from link clicks', async () => {
    client.mockResolvedValue({ paidSearchConfig: {}, metaConfig: {}, linkedinConfig: null })
    aw.mockResolvedValue([{ Date: '2026-08-06', Cost: '100', Clicks: '10' }])
    meta.mockResolvedValue([{ Date: '2026-08-06', cost: '50', inline_link_clicks: '4' }])

    const t = await getPaidMediaTrend('acme', 'last_30_days')
    expect(t.channels).toEqual(['paid-search', 'meta']) // LinkedIn not configured → absent
    expect(li).not.toHaveBeenCalled()
    const day = t.points.find((p) => p.date === '2026-08-06')!
    expect(day.channels['paid-search']).toEqual({ spend: 100, clicks: 10 })
    expect(day.channels.meta).toEqual({ spend: 50, clicks: 4 }) // 4 = inline_link_clicks
  })

  test('daily points are kept per day (no weekly rollup); LinkedIn lowercase `date` is read', async () => {
    // Live-verified: linkedinQuery returns the day dimension keyed `date` (lowercase),
    // not `Date` like Paid Search/Meta. Reading only `r.Date` dropped every LinkedIn row.
    // Two days must stay two points, not sum into one week.
    client.mockResolvedValue({ paidSearchConfig: null, metaConfig: null, linkedinConfig: {} })
    li.mockResolvedValue([
      { date: '2026-08-06', spend: '271.46', clicks: '52' },
      { date: '2026-08-07', spend: '271.45', clicks: '60' },
    ])

    const t = await getPaidMediaTrend('acme', 'last_30_days')
    expect(t.channels).toEqual(['linkedin'])
    expect(t.points.map((p) => p.date)).toEqual(['2026-08-06', '2026-08-07']) // two daily points
    expect(t.points[0].channels.linkedin).toEqual({ spend: 271.46, clicks: 52 })
    expect(t.points[1].channels.linkedin).toEqual({ spend: 271.45, clicks: 60 })
  })

  test('a configured channel that fails is omitted (best-effort), never throws', async () => {
    client.mockResolvedValue({ paidSearchConfig: {}, metaConfig: {}, linkedinConfig: {} })
    aw.mockResolvedValue([{ Date: '2026-08-06', Cost: '100', Clicks: '10' }])
    meta.mockRejectedValue(new Error('meta series failed'))
    li.mockResolvedValue([{ Date: '2026-08-06', spend: '30', clicks: '3' }])

    const t = await getPaidMediaTrend('acme', 'last_30_days')
    expect(t.channels).toEqual(['paid-search', 'linkedin']) // meta dropped
    expect(t.points[0].channels.meta).toBeUndefined()
    expect(t.points[0].channels.linkedin).toEqual({ spend: 30, clicks: 3 })
  })

  test('malformed / rolled-over / calendar-invalid date rows are dropped, never throws', async () => {
    // JS rolls '2026-02-30' → Mar 2 (finite), so a finiteness-only check would keep it and
    // mis-place it. The round-trip validity check drops it, along with a bad shape and month 13.
    client.mockResolvedValue({ paidSearchConfig: {}, metaConfig: null, linkedinConfig: null })
    aw.mockResolvedValue([
      { Date: '2026-08-06', Cost: '100', Clicks: '10' },
      { Date: 'not-a-date', Cost: '5', Clicks: '1' },
      { Date: '2026-02-30', Cost: '5', Clicks: '1' }, // shape-valid but Feb 30 doesn't exist
      { Date: '2026-13-01', Cost: '5', Clicks: '1' }, // shape-valid but month 13 doesn't exist
    ])

    await expect(getPaidMediaTrend('acme', 'last_30_days')).resolves.toBeDefined()
    const t = await getPaidMediaTrend('acme', 'last_30_days')
    expect(t.channels).toEqual(['paid-search'])
    expect(t.points).toHaveLength(1) // only the valid Aug 6 day; the three bad rows are dropped
    expect(t.points[0].date).toBe('2026-08-06')
    expect(t.points[0].channels['paid-search']).toEqual({ spend: 100, clicks: 10 })
  })
})
