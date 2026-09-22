import { beforeEach, expect, test, vi } from 'vitest'
import { completeContent, completeReportsData, lockingClient, withLockedBaseline, type DashReader } from './locking-client'
import { requestKey } from './lock-day'
import { buildPlatformHeadline } from './headline-build'
import { normalizePost } from './top-content'
import type { ReportsDataParams } from '@/lib/dash-social/types'

const BRAND = 7
const OPTS = { clientId: 'c1', slug: 'client-a', settled: '2026-09-30', late: () => false }
const SEPT: ReportsDataParams = {
  brandId: BRAND, channels: ['INSTAGRAM'], metrics: ['TOTAL_FOLLOWERS', 'TOTAL_ENGAGEMENTS'],
  startDate: '2026-09-01T04:00:00Z', endDate: '2026-09-30T04:00:00Z',
  contextStartDate: '2026-08-01T04:00:00Z', contextEndDate: '2026-08-31T04:00:00Z',
  reportType: 'TOTAL_GROUPED_METRIC', aggregateBy: 'BRAND', requirePosts: true,
}
const LIVE: ReportsDataParams = { ...SEPT, startDate: '2026-10-01T04:00:00Z', endDate: '2026-10-19T04:00:00Z', contextStartDate: '2026-09-01T04:00:00Z', contextEndDate: '2026-09-19T04:00:00Z' }
const total = (followers: number, context: number | null) => ({ data: { [BRAND]: { metrics: {
  TOTAL_FOLLOWERS: { value: followers, context, context_change: null },
  TOTAL_ENGAGEMENTS: { value: 40, context: 20, context_change: 100 },
} } } })
const graphParams: ReportsDataParams = { ...SEPT, reportType: 'GRAPH', metrics: ['TOTAL_FOLLOWERS'], timeScale: 'DAILY' }
const graph = { data: { metrics: { TOTAL_FOLLOWERS: { ALL_CHANNELS: { '2026-09-01': 5, '2026-09-02': 6 } } } } }
const mediaParams = { ...SEPT, reportType: 'MULTI_METRIC_MEDIA_TYPE', metrics: ['VIEWS'] } as unknown as ReportsDataParams
const media = { data: { [BRAND]: { metrics: {} }, reel: { metrics: { VIEWS: { ALL_CHANNELS: { value: 3, context: 2, context_change: 50 } } } } } }
const contentParams = { brandId: BRAND, channel: 'INSTAGRAM', metric: 'TOTAL_ENGAGEMENTS', startDate: '2026-09-01', endDate: '2026-09-30', limit: 500 }
const content = { data: { content: [{ id: 1, source: 'INSTAGRAM', type: 'IMAGE', source_created_at: '2026-09-02T00:00:00Z', instagram: { caption: 'a post', sum_total_engagements: 10, views: 100 } }] } }

const innerFake = () => ({ getReportsData: vi.fn(), getContent: vi.fn(), getMedia: vi.fn() }) as unknown as DashReader & { getReportsData: ReturnType<typeof vi.fn>; getContent: ReturnType<typeof vi.fn>; getMedia: ReturnType<typeof vi.fn> }
const depsFake = () => ({
  read: vi.fn(async (_clientId: string, _key: string): Promise<{ response: unknown } | null> => null),
  write: vi.fn(async (_clientId: string, _key: string, _periodEnd: string, response: unknown): Promise<unknown> => response),
})
let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })

test('a locked month: the first read stores Dash\'s answer, the next read never reaches Dash', async () => {
  const inner = innerFake(); const deps = depsFake()
  inner.getReportsData.mockResolvedValue(total(100, 80))
  const c = lockingClient(inner, OPTS, deps)
  expect(await c.getReportsData(SEPT)).toEqual(total(100, 80))
  expect(inner.getReportsData).toHaveBeenCalledTimes(1)
  expect(deps.write).toHaveBeenCalledTimes(1)
  expect(deps.write.mock.calls[0][2]).toBe('2026-09-30')
  // Only this request is stored: the prior month is not, so the compare value stays Dash's.
  const own = requestKey('getReportsData', SEPT as unknown as Record<string, unknown>)
  deps.read.mockImplementation(async (_c, key) => (key === own ? { response: total(100, 80) } : null))
  expect(await c.getReportsData(SEPT)).toEqual(total(100, 80))
  expect(inner.getReportsData).toHaveBeenCalledTimes(1)
})

test('never locked: the live month, a client with nothing settled, or a request with no end date', async () => {
  for (const [opts, params] of [[OPTS, LIVE], [{ ...OPTS, settled: null }, SEPT], [OPTS, { ...SEPT, endDate: undefined } as unknown as ReportsDataParams]] as const) {
    const inner = innerFake(); const deps = depsFake()
    inner.getReportsData.mockResolvedValue(total(1, 1))
    expect(await lockingClient(inner, opts, deps).getReportsData(params)).toEqual(total(1, 1))
    expect(inner.getReportsData).toHaveBeenCalledTimes(1)
    expect(deps.read).not.toHaveBeenCalled()
    expect(deps.write).not.toHaveBeenCalled()
  }
})

test('fail closed: a Dash error, a lock read failure and a lock write failure all propagate, and nothing is stored', async () => {
  const inner = innerFake(); const deps = depsFake()
  inner.getReportsData.mockRejectedValueOnce(new Error('dash down'))
  await expect(lockingClient(inner, OPTS, deps).getReportsData(SEPT)).rejects.toThrow('dash down')
  expect(deps.write).not.toHaveBeenCalled()
  const deps2 = depsFake(); deps2.read.mockRejectedValueOnce(new Error('no table'))
  await expect(lockingClient(innerFake(), OPTS, deps2).getReportsData(SEPT)).rejects.toThrow('no table')
  const inner3 = innerFake(); const deps3 = depsFake()
  inner3.getReportsData.mockResolvedValue(total(5, 4)); deps3.write.mockRejectedValueOnce(new Error('write failed'))
  await expect(lockingClient(inner3, OPTS, deps3).getReportsData(SEPT)).rejects.toThrow('write failed')
})

test('an incomplete answer is served, never stored, and warned once', async () => {
  const cases: [string, ReportsDataParams, unknown][] = [
    ['no brand entry', SEPT, { data: {} }],
    ['a requested metric missing', SEPT, { data: { [BRAND]: { metrics: { TOTAL_FOLLOWERS: { value: 1, context: null, context_change: null } } } } }],
    ['no data.metrics on a graph', graphParams, { data: {} }],
    ['a graph metric missing', graphParams, { data: { metrics: {} } }],
    ['no brand entry on a media answer', mediaParams, { data: { reel: { metrics: {} } } }],
  ]
  for (const [, params, answer] of cases) {
    const inner = innerFake(); const deps = depsFake()
    inner.getReportsData.mockResolvedValue(answer)
    warn.mockClear()
    expect(await lockingClient(inner, OPTS, deps).getReportsData(params)).toEqual(answer)
    expect(deps.write).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/^\[organic-social\] lock skipped \(incomplete answer\) slug=client-a period_end=2026-09-30 key=[0-9a-f]{12}$/)
  }
  const inner = innerFake(); const deps = depsFake()
  inner.getContent.mockResolvedValue({ data: {} })
  expect(await lockingClient(inner, OPTS, deps).getContent(contentParams)).toEqual({ data: {} })
  expect(deps.write).not.toHaveBeenCalled()
})

test('a media answer with the brand entry but no reels is complete: no reels is a real answer', async () => {
  const inner = innerFake(); const deps = depsFake()
  const noReels = { data: { [BRAND]: { metrics: {} } } }
  inner.getReportsData.mockResolvedValue(noReels)
  warn.mockClear()
  expect(await lockingClient(inner, OPTS, deps).getReportsData(mediaParams)).toEqual(noReels)
  expect(deps.write).toHaveBeenCalledTimes(1)
  expect(warn).not.toHaveBeenCalled()
})

test('Top Content locks the same way, and a complete answer is stored', async () => {
  const inner = innerFake(); const deps = depsFake()
  inner.getContent.mockResolvedValue(content)
  const c = lockingClient(inner, OPTS, deps)
  expect(await c.getContent(contentParams)).toEqual(content)
  expect(deps.write).toHaveBeenCalledTimes(1)
  const own = requestKey('getContent', contentParams as unknown as Record<string, unknown>)
  deps.read.mockImplementation(async (_c, key) => (key === own ? { response: content } : null))
  expect(await c.getContent(contentParams)).toEqual(content)
  expect(inner.getContent).toHaveBeenCalledTimes(1)
})

test('when another request stored this lock first, the stored winner is what every reader gets', async () => {
  const inner = innerFake(); const deps = depsFake()
  inner.getReportsData.mockResolvedValue(total(100, 80))
  deps.write.mockResolvedValueOnce(total(999, 80))
  expect(await lockingClient(inner, OPTS, deps).getReportsData(SEPT)).toEqual(total(999, 80))
})

test('a capture after the lock day warns once, on the capture only', async () => {
  const inner = innerFake(); const deps = depsFake()
  inner.getReportsData.mockResolvedValue(total(100, 80))
  const c = lockingClient(inner, { ...OPTS, late: () => true }, deps)
  await c.getReportsData(SEPT)
  const lateLines = warn.mock.calls.map((a) => String(a[0])).filter((l) => l.startsWith('[organic-social] late lock'))
  expect(lateLines).toHaveLength(1)
  expect(lateLines[0]).toMatch(/^\[organic-social\] late lock slug=client-a period_end=2026-09-30 key=[0-9a-f]{12}$/)
  warn.mockClear()
  const own = requestKey('getReportsData', SEPT as unknown as Record<string, unknown>)
  deps.read.mockImplementation(async (_c, key) => (key === own ? { response: total(100, 80) } : null))
  await c.getReportsData(SEPT)
  expect(warn.mock.calls.filter((a) => String(a[0]).includes('late lock'))).toHaveLength(0)
})

test("a locked month compares against the prior month's locked value, not Dash's", async () => {
  const inner = innerFake(); const deps = depsFake()
  const august = total(90, 70)
  inner.getReportsData.mockResolvedValue(total(100, 80))
  const own = requestKey('getReportsData', SEPT as unknown as Record<string, unknown>)
  deps.read.mockImplementation(async (_c, key) => (key === own ? null : { response: august }))
  const answer = await lockingClient(inner, OPTS, deps).getReportsData(SEPT) as unknown as ReturnType<typeof total>
  expect(answer.data[BRAND].metrics.TOTAL_FOLLOWERS).toEqual({ value: 100, context: 90, context_change: null })
  expect(answer.data[BRAND].metrics.TOTAL_ENGAGEMENTS.context).toBe(40)
})

test("without the prior month stored, Dash's own compare value is kept", async () => {
  const inner = innerFake(); const deps = depsFake()
  inner.getReportsData.mockResolvedValue(total(100, 80))
  const answer = await lockingClient(inner, OPTS, deps).getReportsData(SEPT) as unknown as ReturnType<typeof total>
  expect(answer.data[BRAND].metrics.TOTAL_FOLLOWERS.context).toBe(80)
})

test('withLockedBaseline only touches value/context pairs the prior answer also has', () => {
  expect(withLockedBaseline({ a: { value: 2, context: 1 }, b: 'x' }, { a: { value: 9 } })).toEqual({ a: { value: 2, context: 9 }, b: 'x' })
  expect(withLockedBaseline({ a: { value: 2, context: 1 } }, {})).toEqual({ a: { value: 2, context: 1 } })
  expect(withLockedBaseline([1, 2], { 0: 5 })).toEqual([1, 2])
  expect(withLockedBaseline(media, { [BRAND]: {} })).toEqual(media)
})

test('a stored answer read back from jsonb builds the same tiles, graph series and posts', () => {
  const round = <T>(x: T): T => JSON.parse(JSON.stringify(x))
  const m = total(100, 80).data[BRAND].metrics
  expect(buildPlatformHeadline('INSTAGRAM', round(m), ['followers', 'engagements'], true))
    .toEqual(buildPlatformHeadline('INSTAGRAM', m, ['followers', 'engagements'], true))
  // The getters read this exact path for a graph (followers.ts, trends.ts).
  expect(round(graph).data.metrics.TOTAL_FOLLOWERS.ALL_CHANNELS).toEqual(graph.data.metrics.TOTAL_FOLLOWERS.ALL_CHANNELS)
  const raw = content.data.content[0] as never
  expect(normalizePost(round(raw), 'INSTAGRAM')).toEqual(normalizePost(raw, 'INSTAGRAM'))
})

test('getMedia is never locked, and no log line carries the response, the brand id or the config', async () => {
  const inner = innerFake(); const deps = depsFake()
  inner.getMedia.mockResolvedValue({ data: { media: [] } })
  const c = lockingClient(inner, OPTS, deps)
  await c.getMedia({ brandId: BRAND, startDate: '2026-09-01', endDate: '2026-09-30' })
  expect(inner.getMedia).toHaveBeenCalledTimes(1)
  expect(deps.read).not.toHaveBeenCalled()
  inner.getReportsData.mockResolvedValue({ data: {} })
  await c.getReportsData(SEPT)
  for (const call of warn.mock.calls) {
    const line = String(call[0])
    expect(line).not.toContain(String(BRAND))
    expect(line).not.toContain('TOTAL_FOLLOWERS')
    expect(line).not.toContain('metrics')
  }
})

test('the completeness rules are exported and pure', () => {
  expect(completeReportsData(SEPT, total(1, 1))).toBe(true)
  expect(completeReportsData(SEPT, { data: {} })).toBe(false)
  expect(completeReportsData(SEPT, null)).toBe(false)
  expect(completeReportsData(graphParams, graph)).toBe(true)
  expect(completeContent(content)).toBe(true)
  expect(completeContent({ data: { content: 'nope' } })).toBe(false)
  expect(completeContent(null)).toBe(false)
})
