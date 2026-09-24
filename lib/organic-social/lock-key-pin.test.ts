import { beforeEach, afterEach, expect, test, vi } from 'vitest'

// Paul, PR 256: "The lock key hashes the literal request ... Any later change to request shape
// misses every existing lock and silently recaptures live numbers for months clients have
// already seen. The only signal is a `late lock` warning. Please add a test that pins the
// request keys the getters produce for a fixed month, so a shape change fails CI and forces a
// deliberate decision (recapture, or map old keys)."
//
// So this file pins the keys the GETTERS hand the lock store, not keys it recomputes itself:
// recomputing would pin params to hash, which is not the thing that breaks.
//
// If a hash below changes, the request shape changed. That is not automatically a bug, but it
// is never free: every lock already stored under the old key becomes unreachable, and those
// months silently recapture from live Dash. Decide deliberately, then update the pin:
//   - recapture is fine for a month no client has seen, or
//   - map the old keys forward first.

const { getClientBySlug, readLock, writeLock } = vi.hoisted(() => ({
  getClientBySlug: vi.fn(),
  readLock: vi.fn(async (_clientId: string, _key: string): Promise<{ response: unknown } | null> => null),
  writeLock: vi.fn(async (_c: string, _k: string, _p: string, response: unknown): Promise<unknown> => response),
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('./response-lock-store', () => ({ readLock, writeLock }))

import { DashSocialClient } from '@/lib/dash-social/client'
import { getPlatformHeadlines } from './headlines'
import { getFollowerGraph } from './followers'
import { getEngagementTrend } from './trends'
import { fetchTopContent } from './top-content'

// A fixed month, as a `custom:` range on both sides. A preset would resolve against today and
// every hash below would rot on the next calendar change.
const MONTH = 'custom:2026-08-01,2026-08-31'
const COMPARE = 'custom:2026-07-01,2026-07-31'
const CLIENT = {
  id: 'c1', slug: 'client-a',
  dashSocialConfig: { brandId: 7, channels: ['instagram'], reportingMonths: { firstMonth: '2026-08' } },
}

// Every request's params, recorded as the getters make them, so a failing hash can be read as
// "this request changed shape" rather than two hex strings.
let params: Record<string, unknown>[]

beforeEach(() => {
  process.env.DASH_API_TOKEN = 'test-token'
  // Frozen: settledThrough decides whether a key is computed at all, and it comes from the clock.
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T14:00:00Z'))
  params = []
  getClientBySlug.mockResolvedValue(CLIENT)
  readLock.mockClear(); writeLock.mockClear()
  // Shape-correct answers, built from the request: an INCOMPLETE answer makes locked() return
  // before it reads the compare baseline, so the headline case would silently pin one key
  // instead of two (locking-client.ts, the complete() gate sits above the priorParams read).
  vi.spyOn(DashSocialClient.prototype, 'getReportsData').mockImplementation(async (p) => {
    params.push(p as unknown as Record<string, unknown>)
    const metrics = Object.fromEntries((p.metrics ?? []).map((m) => [m, { value: 1, context: null, context_change: null }]))
    return (p.reportType === 'GRAPH'
      ? { data: { metrics: Object.fromEntries((p.metrics ?? []).map((m) => [m, { ALL_CHANNELS: { '2026-08-01': 1 } }])) } }
      : { data: { 7: { metrics } } }) as never
  })
  vi.spyOn(DashSocialClient.prototype, 'getContent').mockImplementation(async (p) => {
    params.push(p as unknown as Record<string, unknown>)
    return { data: { content: [] } } as never
  })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

/** The keys one getter hands the lock store, in order. */
const keysFrom = async (run: () => Promise<unknown>): Promise<string[]> => {
  readLock.mockClear(); params = []
  await run()
  return readLock.mock.calls.map((c) => String(c[1]))
}

test('the headline tiles: one key for the month, one for the locked compare baseline', async () => {
  const keys = await keysFrom(() => getPlatformHeadlines('client-a', MONTH, COMPARE, 'INSTAGRAM'))
  // The request that produced them. isoRangeTz appends the T04:00:00Z suffix Paul named.
  expect(params).toHaveLength(1)
  expect(params[0]).toMatchObject({
    brandId: 7, channels: ['INSTAGRAM'], reportType: 'TOTAL_GROUPED_METRIC', aggregateBy: 'BRAND',
    requirePosts: true,
    startDate: '2026-08-01T04:00:00Z', endDate: '2026-08-31T04:00:00Z',
    contextStartDate: '2026-07-01T04:00:00Z', contextEndDate: '2026-07-31T04:00:00Z',
  })
  // Two reads: this month's own key, then the prior month's, for the locked baseline.
  expect(keys).toHaveLength(2)
  expect(keys).toEqual([
    '96598044f4ea2ffdec1556f7bb1bb34b9aff3eedb54c04e24e618738647f3145',
    'ff4c349debb51a7cd3176ea5d274a228041c1b22ac46f72c37b3e3d84faf53bc',
  ])
})

test('the follower graph: one key, and no baseline key because it sends no compare window', async () => {
  const keys = await keysFrom(() => getFollowerGraph('client-a', MONTH, 'INSTAGRAM'))
  expect(params[0]).toMatchObject({
    brandId: 7, channels: ['INSTAGRAM'], reportType: 'GRAPH', timeScale: 'DAILY',
    metrics: ['TOTAL_FOLLOWERS'], startDate: '2026-08-01T04:00:00Z', endDate: '2026-08-31T04:00:00Z',
  })
  // priorParams needs both context dates; this request sends neither, so there is no baseline key.
  expect(params[0].contextStartDate).toBeUndefined()
  expect(keys).toEqual(['9fe3c263981759304d3db0cf610bb3b8a63825aeb9453f24a7452c58c32e2d9f'])
})

test('the engagement graph: one key, same shape as the follower graph with its own metric', async () => {
  const keys = await keysFrom(() => getEngagementTrend('client-a', MONTH, 'INSTAGRAM'))
  expect(params[0]).toMatchObject({ reportType: 'GRAPH', timeScale: 'DAILY', metrics: ['TOTAL_ENGAGEMENTS'] })
  expect(keys).toEqual(['2a00cce8f59df2eb456a6a33412efd18500a4716d733e965a94340d78fe49d0b'])
})

test('top content: two keys, the owned read and the Instagram UGC read, on plain dates', async () => {
  const keys = await keysFrom(() => fetchTopContent('client-a', MONTH, 'INSTAGRAM'))
  // isoRange, not isoRangeTz: these dates carry no time suffix, unlike the three above.
  expect(params).toHaveLength(2)
  expect(params[0]).toMatchObject({ brandId: 7, channel: 'INSTAGRAM', startDate: '2026-08-01', endDate: '2026-08-31', limit: 500 })
  expect(params[1]).toMatchObject({ brandId: 7, channel: 'INSTAGRAM_UGC', metric: 'UGC_TOTAL_ENGAGEMENTS' })
  expect(keys).toEqual([
    '1d8d580dfaf15613c4ba23d95fc67368ca33a742e2b70f93619b59cf038319ac',
    '47b613c93f747b607e46c4f56eee81358375619ce48a17f376c4b06c93355066',
  ])
})
