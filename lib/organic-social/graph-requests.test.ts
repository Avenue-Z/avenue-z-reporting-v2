import { beforeEach, expect, test, vi } from 'vitest'

// A real DashSocialClient with a fake fetch, so each test sees the exact request the app
// would send to Dash and gets back a canned GRAPH payload: a null day in the middle and a
// day past the month, the two shapes the gap rules exist for. No network. Made-up numbers.
const requests: URL[] = []
vi.mock('./base', async () => {
  const actual = await vi.importActual<typeof import('./base')>('./base')
  const { DashSocialClient } = await vi.importActual<typeof import('@/lib/dash-social/client')>('@/lib/dash-social/client')
  const fakeFetch = (async (url: string) => {
    const u = new URL(url)
    requests.push(u)
    const metric = u.searchParams.get('metrics')!
    const daily = { '2026-08-01': 100, '2026-08-02': null, '2026-08-03': 104, '2026-09-01': 110 }
    return new Response(JSON.stringify({ data: { metrics: { [metric]: { ALL_CHANNELS: daily } } } }), { status: 200 })
  }) as unknown as typeof fetch
  return {
    ...actual,
    dashClientFor: async () => ({
      client: new DashSocialClient({ token: 'test-token', fetchImpl: fakeFetch }),
      brandId: 1,
      channels: ['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN'],
    }),
  }
})

import { getFollowerGraph } from './followers'
import { getEngagementTrend } from './trends'

const AUG = '2026-08-01,2026-08-31'
const EASTERN = { start_date: '2026-08-01T04:00:00Z', end_date: '2026-08-31T04:00:00Z' }
const sent = (i = 0) => Object.fromEntries(requests[i].searchParams)
// Every test uses its own slug, so React's cache can never hand one test another's result.
beforeEach(() => { requests.length = 0 })

// v1: what Renaissance's graphs send and plot today. These must never change.
test('v1 follower graph asks Dash for total followers over the Eastern window', async () => {
  await getFollowerGraph('slug-a', AUG, 'INSTAGRAM')
  expect(requests).toHaveLength(1)
  expect(sent()).toMatchObject({
    channels: 'INSTAGRAM', metrics: 'TOTAL_FOLLOWERS', report_type: 'GRAPH', time_scale: 'DAILY', ...EASTERN,
  })
})

test('v1 follower graph carries a missing day forward and keeps every day Dash returns', async () => {
  expect(await getFollowerGraph('slug-b', AUG, 'INSTAGRAM')).toEqual({
    channels: ['Instagram'],
    points: [
      { date: '2026-08-01', Instagram: 100 },
      { date: '2026-08-02', Instagram: 100 },
      { date: '2026-08-03', Instagram: 104 },
      { date: '2026-09-01', Instagram: 110 },
    ],
  })
})

test('v1 engagement graph asks each platform for its own engagement metric over the Eastern window', async () => {
  const expected = {
    INSTAGRAM: 'TOTAL_ENGAGEMENTS', FACEBOOK: 'TOTAL_ENGAGEMENTS_POSTS_V2',
    TWITTER: 'TOTAL_ENGAGEMENTS_POSTS', LINKEDIN: 'ENGAGEMENTS_BY_POST',
  } as const
  for (const [channel, metric] of Object.entries(expected)) {
    requests.length = 0
    await getEngagementTrend(`slug-c-${channel}`, AUG, channel as keyof typeof expected)
    expect(sent()).toMatchObject({ channels: channel, metrics: metric, report_type: 'GRAPH', time_scale: 'DAILY', ...EASTERN })
  }
})

test('v1 engagement graph treats a missing day as zero', async () => {
  const s = await getEngagementTrend('slug-d', AUG, 'INSTAGRAM')
  expect(s.points.find((p) => p.date === '2026-08-02')).toEqual({ date: '2026-08-02', Instagram: 0 })
})

test('v1 Overview engagement graph asks every configured platform, one request each', async () => {
  const s = await getEngagementTrend('slug-e', AUG, null)
  expect(requests.map((u) => u.searchParams.get('channels')).sort()).toEqual(['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'TWITTER'])
  expect(s.channels).toEqual(['Instagram', 'Facebook', 'X', 'LinkedIn'])
})
