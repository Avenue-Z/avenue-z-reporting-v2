import { beforeEach, expect, test, vi } from 'vitest'

// PR 254, after Paul's review: the guard must see the request that is actually sent. These
// tests drive the two real GRAPH getters with a mocked Dash client and brand id 1.
const { getReportsData } = vi.hoisted(() => ({ getReportsData: vi.fn() }))
vi.mock('./base', () => ({
  dashClientFor: vi.fn(async () => ({ client: { getReportsData }, brandId: 1, channels: ['INSTAGRAM', 'FACEBOOK'] })),
  isoRangeTz: () => ({ start: 'S', end: 'E' }),
}))
// Wrap the real helper so the test can see whether the getters send through it.
vi.mock('./graph-guard', async (importOriginal) => {
  const real = await importOriginal<typeof import('./graph-guard')>()
  return { ...real, getGraphData: vi.fn(real.getGraphData) }
})

import { getFollowerGraph } from './followers'
import { getEngagementTrend } from './trends'
import { getGraphData } from './graph-guard'

beforeEach(() => {
  getReportsData.mockReset()
  getReportsData.mockImplementation(async (p: { metrics: string[] }) => ({
    data: { metrics: { [p.metrics[0]]: { ALL_CHANNELS: { '2026-08-01': 1 } } } },
  }))
})

const graphRequest = (channel: string, metric: string) => ({
  brandId: 1, channels: [channel], reportType: 'GRAPH', timeScale: 'DAILY', metrics: [metric], startDate: 'S', endDate: 'E',
})

// Characterization: today's exact request, one per channel. Written before the refactor and
// unchanged by it, so the refactor provably sends the same request.
test('the follower graph sends exactly one single-channel GRAPH request per channel', async () => {
  await getFollowerGraph('c', 'r', null)
  expect(getReportsData.mock.calls.map((c) => c[0])).toEqual([
    graphRequest('INSTAGRAM', 'TOTAL_FOLLOWERS'),
    graphRequest('FACEBOOK', 'TOTAL_FOLLOWERS'),
  ])
})

test('the engagement graph sends exactly one single-channel GRAPH request per channel', async () => {
  await getEngagementTrend('c', 'r', null)
  expect(getReportsData.mock.calls.map((c) => c[0])).toEqual([
    graphRequest('INSTAGRAM', 'TOTAL_ENGAGEMENTS'),
    graphRequest('FACEBOOK', 'TOTAL_ENGAGEMENTS_POSTS_V2'),
  ])
})

// Wiring: both getters send through getGraphData, so the guard checks the real request.
// Going back to client.getReportsData at either call site fails this test.
test('both graph getters send through getGraphData, so the guard checks the real request', async () => {
  const spy = vi.mocked(getGraphData)
  spy.mockClear()
  await getFollowerGraph('c2', 'r', null)
  await getEngagementTrend('c2', 'r', null)
  expect(spy).toHaveBeenCalledTimes(4)
  // Each checked request is the very object that reached Dash.
  expect(spy.mock.calls.map((c) => c[1])).toEqual(getReportsData.mock.calls.map((c) => c[0]))
})
