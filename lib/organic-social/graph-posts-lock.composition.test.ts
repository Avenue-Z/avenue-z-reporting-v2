import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// The one thing neither PR could test alone. #252's graphPosts reads posts through
// fetchTopContentFrozen, which #256 short-circuits for a client on locked months
// (frozen.ts: responseLocked -> fetchLive), so on the merged branch the graphs' post read and
// Top Content's read BOTH go through the locking client. Two things must hold for a locked month
// to look the same everywhere, and both are asserted here through the real code paths:
//
// 1. The graphs and Top Content hand the lock store the SAME keys. Top Content v3 asks for
//    authors and UGC marking (withAuthor, markUgc) and the graphs do not, but both are applied to
//    the answer after the fetch (top-content.ts), not sent in the request, so they cannot split
//    the lock into two rows that could disagree.
// 2. Whichever reader captures the month first, the other can still build its view from the
//    stored row. The row is Dash's raw answer, which carries instagram_user, so Top Content gets
//    its authors from a row the graphs captured, with no second call to Dash.

const { getClientBySlug, readLock, writeLock, readSnapshot, writeSnapshot } = vi.hoisted(() => ({
  getClientBySlug: vi.fn(),
  readLock: vi.fn(),
  writeLock: vi.fn(),
  readSnapshot: vi.fn(),
  writeSnapshot: vi.fn(),
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('./response-lock-store', () => ({ readLock, writeLock }))
// The OLD freeze table, seeded with a different post. It must be mocked and it must answer: left
// unmocked, its read throws for lack of a database, frozen.ts catches that and falls through to
// live, and live also goes through the lock, so the test could not tell "skipped the freeze table"
// from "tried it and failed". In production that read succeeds, which is the case that matters.
vi.mock('./snapshot', () => ({ readSnapshot, writeSnapshot }))

import { DashSocialClient } from '@/lib/dash-social/client'
import { graphPosts } from './graph-posts'
import { fetchTopContentFrozen } from './frozen'
import { fetchTopContent } from './top-content'

const MONTH = 'custom:2026-08-01,2026-08-31'
const LOCKED_CLIENT = {
  id: 'c1', slug: 'client-a',
  dashSocialConfig: { brandId: 7, channels: ['instagram'], reportingMonths: { firstMonth: '2026-08' } },
}
// All values made up. The owned post carries its author the way Dash returns it.
const OWNED = { data: { content: [{
  id: 11, source: 'INSTAGRAM', type: 'IMAGE', source_created_at: '2026-08-10T12:00:00Z',
  instagram_user: { handle: '@Brand_Handle' },
  instagram: { caption: 'a post', sum_total_engagements: 10, views: 100 },
}] } }
const UGC = { data: { content: [] } }

// An in-memory lock store with the real store's contract: read by (client, key), write once.
let store: Map<string, unknown>
let dashCalls: number

beforeEach(() => {
  process.env.DASH_API_TOKEN = 'test-token'
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T14:00:00Z')) // August is settled
  getClientBySlug.mockResolvedValue(LOCKED_CLIENT)
  store = new Map(); dashCalls = 0
  readLock.mockImplementation(async (clientId: string, key: string) =>
    store.has(`${clientId}|${key}`) ? { response: store.get(`${clientId}|${key}`) } : null)
  writeLock.mockImplementation(async (clientId: string, key: string, _end: string, response: unknown) => {
    if (!store.has(`${clientId}|${key}`)) store.set(`${clientId}|${key}`, response)
    return store.get(`${clientId}|${key}`)
  })
  // A frozen window from before the client went on locked months, holding a post (99) the live
  // answer does not have. A locked client must never be served this.
  readSnapshot.mockReset().mockResolvedValue({ frozen: true, posts: [{ id: 99 }] })
  writeSnapshot.mockReset().mockResolvedValue(undefined)
  vi.spyOn(DashSocialClient.prototype, 'getContent').mockImplementation(async (p) => {
    dashCalls++
    return (p.channel === 'INSTAGRAM_UGC' ? UGC : OWNED) as never
  })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const keysReadBy = async (run: () => Promise<unknown>) => {
  readLock.mockClear()
  await run()
  return readLock.mock.calls.map((c) => String(c[1])).sort()
}

// Top Content v3's exact call (parts/top-content-outline.tsx).
const topContentV3 = () => fetchTopContentFrozen('client-a', MONTH, 'INSTAGRAM', {
  fetchLive: (s, d, c) => fetchTopContent(s, d, c, { withAuthor: true, markUgc: true }),
})

test('on a locked month the graphs and Top Content read the same lock rows', async () => {
  const graphKeys = await keysReadBy(() => graphPosts('client-a', MONTH, 'INSTAGRAM'))
  store.clear()
  const topContentKeys = await keysReadBy(topContentV3)
  // Owned read and Instagram UGC read, for each.
  expect(graphKeys).toHaveLength(2)
  expect(topContentKeys).toEqual(graphKeys)
})

test('when the graphs capture the month first, Top Content is served from their row, authors included', async () => {
  await graphPosts('client-a', MONTH, 'INSTAGRAM')
  expect(dashCalls).toBe(2) // the graphs' capture: owned and UGC
  expect(writeLock).toHaveBeenCalledTimes(2)

  const posts = await topContentV3()
  expect(dashCalls).toBe(2) // nothing more went to Dash: Top Content read the locked rows
  // The author came out of the stored raw answer, normalised the way authorOf does it.
  expect(posts.find((p) => p.id === 11)?.author).toBe('brand_handle')
})

test('a locked client never reads the old freeze table, from either reader', async () => {
  const graph = await graphPosts('client-a', MONTH, 'INSTAGRAM')
  const top = await topContentV3()
  expect(readSnapshot).not.toHaveBeenCalled()
  expect(writeSnapshot).not.toHaveBeenCalled()
  // The discriminating assertion: the freeze table holds post 99, the lock holds post 11.
  expect(graph.map((p) => p.id)).toEqual([11])
  expect(top.map((p) => p.id)).toEqual([11])
})

test('the other order holds too: Top Content captures, the graphs read its row', async () => {
  await topContentV3()
  expect(dashCalls).toBe(2)
  const posts = await graphPosts('client-a', MONTH, 'INSTAGRAM')
  expect(dashCalls).toBe(2)
  expect(posts.map((p) => p.id)).toEqual([11])
})

// Plan 2026-09-24-qa-fixes §4 (F1): on a locked month the UGC marking happens after the stored row is
// read back, so a month the graphs captured first still comes back with its UGC post marked. Only this
// test serves a UGC post; the shared fixture above stays empty.
test('a UGC post in a month the graphs captured first comes back marked as UGC from the locked row', async () => {
  const ugcPost = { id: 51, source: 'INSTAGRAM', type: 'IMAGE', source_created_at: '2026-08-12T12:00:00Z',
    instagram: { caption: 'tagged the brand', sum_total_engagements: 30, views: 300 } }
  vi.mocked(DashSocialClient.prototype.getContent).mockImplementation(async (p) => {
    dashCalls++
    return (p.channel === 'INSTAGRAM_UGC' ? { data: { content: [ugcPost] } } : OWNED) as never
  })
  await graphPosts('client-a', MONTH, 'INSTAGRAM')
  expect(dashCalls).toBe(2)
  const posts = await topContentV3()
  expect(dashCalls).toBe(2) // served from the rows the graphs stored
  expect(posts.find((p) => p.id === 51)?.ugc).toBe(true)
  const own = posts.find((p) => p.id === 11)
  expect(own).toBeDefined()
  expect('ugc' in own!).toBe(false)
})
