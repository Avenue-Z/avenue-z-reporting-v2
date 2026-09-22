import { expect, test, vi } from 'vitest'

const { getReportsData } = vi.hoisted(() => ({ getReportsData: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
// The real window helpers, so the request shape below is the one Dash receives.
vi.mock('./base', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./base')>()),
  dashClientFor: vi.fn(async () => ({ client: { getReportsData }, brandId: 42, channels: ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN'] })),
}))

import { buildMediaKpis, getOutlineMediaKpis } from './outline-media'

const SPEC = [{ key: 'videoViews', label: 'Video Views', mediaType: 'reel', metric: 'VIEWS' }]
const brand = { 42: { metrics: {} } }

test('reads Views on Reels with its change from the context value', () => {
  const k = buildMediaKpis('INSTAGRAM', { ...brand, reel: { metrics: { VIEWS: { ALL_CHANNELS: { value: 150, context: 100, context_change: 50 } } } } }, 42, SPEC)
  expect(k.videoViews).toMatchObject({ key: 'videoViews', label: 'Video Views', format: 'number', value: 150, delta: 50 })
})
test('no reels in the window is zero, with no arrow', () => {
  expect(buildMediaKpis('INSTAGRAM', brand, 42, SPEC).videoViews).toMatchObject({ value: 0, delta: undefined })
})
test('a 200 without the brand entry throws rather than showing zero', () => {
  expect(() => buildMediaKpis('INSTAGRAM', { reel: { metrics: {} } }, 42, SPEC)).toThrow('INSTAGRAM: Dash returned no media data for this brand')
})
test('one MULTI_METRIC_MEDIA_TYPE request in the tiles window shape, with require_posts and no aggregate_by', async () => {
  getReportsData.mockResolvedValue({ data: { ...brand, reel: { metrics: { VIEWS: { ALL_CHANNELS: { value: 5, context: 4, context_change: 25 } } } } } })
  const k = await getOutlineMediaKpis('c', 'custom:2026-08-01,2026-08-31', 'custom:2026-07-01,2026-07-31', 'INSTAGRAM')
  expect(getReportsData).toHaveBeenCalledTimes(1)
  const p = getReportsData.mock.calls[0][0]
  expect(p).toMatchObject({
    brandId: 42, channels: ['INSTAGRAM'], reportType: 'MULTI_METRIC_MEDIA_TYPE', metrics: ['VIEWS'], requirePosts: true,
    startDate: '2026-08-01T04:00:00Z', endDate: '2026-08-31T04:00:00Z',
    contextStartDate: '2026-07-01T04:00:00Z', contextEndDate: '2026-07-31T04:00:00Z',
  })
  expect('aggregateBy' in p).toBe(false)
  expect(k.videoViews).toMatchObject({ value: 5, delta: 25 })
})
