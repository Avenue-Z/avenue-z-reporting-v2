import { beforeEach, expect, test, vi } from 'vitest'

const { getReportsData } = vi.hoisted(() => ({ getReportsData: vi.fn() }))
vi.mock('./base', () => ({
  dashClientFor: vi.fn(async () => ({ client: { getReportsData }, brandId: 1, channels: ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN'] })),
  isoRangeTz: () => ({ start: 'S', end: 'E' }),
  resolveCompareIso: () => ({ start: 'CS', end: 'CE' }),
}))

import { buildOutlineKpis, getOutlineKpis, selectOutlineRows } from './outline-headlines'
import { outlineSpecsFor, OUTLINE_DATA_ROWS } from './outline-layout'
import { PLATFORM_KPIS, metricFor } from './metrics'
import type { TotalMetric } from '@/lib/dash-social/types'

const m = (value: number | null, context: number | null = null): TotalMetric => ({ value, context, context_change: null })
// Every requested metric present with made-up values.
const allOf = (ch: 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN', value: number | null = 10) =>
  Object.fromEntries(outlineSpecsFor(ch).map((s) => [metricFor(s), m(value)]))

beforeEach(() => getReportsData.mockReset())

// One getOutlineKpis call sends one request. That the Data part and the breakdown then share
// it comes from React.cache within one server render, which a unit test cannot observe:
// outside a render, cache does not dedupe.
test('one getOutlineKpis call sends one request: shared tile metrics plus the extras, in the tiles request shape', async () => {
  getReportsData.mockResolvedValue({ data: { '1': { metrics: allOf('INSTAGRAM') } } })
  await getOutlineKpis('c', 'range-a', 'previous_period', 'INSTAGRAM')
  expect(getReportsData).toHaveBeenCalledTimes(1)
  const p = getReportsData.mock.calls[0][0]
  expect(p).toMatchObject({
    brandId: 1, channels: ['INSTAGRAM'], reportType: 'TOTAL_GROUPED_METRIC', aggregateBy: 'BRAND', requirePosts: true,
    startDate: 'S', endDate: 'E', contextStartDate: 'CS', contextEndDate: 'CE',
  })
  // Engagement Rate follows the decks in the outline block (Jasmine, 2026-09-21); the rest are the shared tiles.
  const shared = PLATFORM_KPIS.INSTAGRAM.map((k) => (k.key === 'engagementRate' ? 'AVG_ENGAGEMENT_RATE_VIEWS' : metricFor(k)))
  expect(p.metrics).toEqual([...shared, 'PROFILE_CLICKS'])
})

test('a tab for a channel outside the client allowlist errors, as the tiles do', async () => {
  await expect(getOutlineKpis('c', 'range-b', 'previous_period', 'TWITTER')).rejects.toThrow(/allowlist/)
  expect(getReportsData).not.toHaveBeenCalled()
})

test('a 200 with no entry for the brand errors instead of showing zeros', async () => {
  getReportsData.mockResolvedValue({ data: {} })
  await expect(getOutlineKpis('c', 'range-c', 'previous_period', 'FACEBOOK')).rejects.toThrow(/no metrics/)
})

test('a requested metric missing from a 200 throws and names it', () => {
  const metrics = allOf('FACEBOOK')
  delete metrics.PAID_AND_ORGANIC_VIDEO_VIEWS
  expect(() => buildOutlineKpis('FACEBOOK', metrics, outlineSpecsFor('FACEBOOK'))).toThrow(/PAID_AND_ORGANIC_VIDEO_VIEWS/)
})

test('every metric null is no data, with zero values', () => {
  const b = buildOutlineKpis('LINKEDIN', allOf('LINKEDIN', null), outlineSpecsFor('LINKEDIN'))
  expect(b.noData).toBe(true)
  expect(b.kpis.videoViews.value).toBe(0)
})

test('percents scale by 100, deltas come from the context value, footnotes carry through', () => {
  const metrics = allOf('FACEBOOK')
  metrics.AVG_ENGAGEMENT_RATE_V2 = m(0.25)
  metrics.PAID_AND_ORGANIC_VIDEO_VIEWS = m(150, 100)
  metrics.REACTIONS = m(5, 0)
  const b = buildOutlineKpis('FACEBOOK', metrics, outlineSpecsFor('FACEBOOK'))
  expect(b.noData).toBe(false)
  expect(b.kpis.engagementRate.value).toBe(25)
  expect(b.kpis.videoViews.delta).toBe(50)
  expect(b.kpis.reactions.delta).toBeUndefined()
  expect(b.kpis.engagements.footnote).toMatch(/Influencer/)
})

test('selectOutlineRows picks the rows in outline order with the outline labels', () => {
  const b = buildOutlineKpis('INSTAGRAM', allOf('INSTAGRAM'), outlineSpecsFor('INSTAGRAM'))
  const h = selectOutlineRows('INSTAGRAM', b, OUTLINE_DATA_ROWS.standard.INSTAGRAM!)
  expect(h).toMatchObject({ channel: 'INSTAGRAM', label: 'Instagram', noData: false })
  expect(h.kpis.map((k) => [k.key, k.label])).toEqual([
    ['followers', 'Total Followers'], ['netNewFollowers', 'Net New Followers'], ['exposure', 'Views'],
    ['engagements', 'Total Engagements'], ['engagementRate', 'Engagement Rate'], ['profileViews', 'Profile Views'],
  ])
})

test('selectOutlineRows throws on a row with no tile', () => {
  const b = buildOutlineKpis('INSTAGRAM', allOf('INSTAGRAM'), outlineSpecsFor('INSTAGRAM'))
  expect(() => selectOutlineRows('INSTAGRAM', b, [{ key: 'nope', label: 'Nope' }])).toThrow(/nope/)
})
