import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { getClientBySlug, readLock, writeLock } = vi.hoisted(() => ({
  getClientBySlug: vi.fn(),
  readLock: vi.fn(async (_clientId: string, _key: string): Promise<{ response: unknown } | null> => null),
  writeLock: vi.fn(async (_clientId: string, _key: string, _periodEnd: string, response: unknown): Promise<unknown> => response),
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('./response-lock-store', () => ({ readLock, writeLock }))

import { dashClientFor } from './base'
import { DashSocialClient } from '@/lib/dash-social/client'

const SEPT = {
  brandId: 7, channels: ['INSTAGRAM'], metrics: ['TOTAL_FOLLOWERS'],
  startDate: '2026-09-01T04:00:00Z', endDate: '2026-09-30T04:00:00Z',
  reportType: 'TOTAL_GROUPED_METRIC' as const, aggregateBy: 'BRAND', requirePosts: true,
}
const client = (reportingMonths: unknown, id = 'c1') => ({
  id, slug: 'client-a', dashSocialConfig: { brandId: 7, channels: ['instagram'], ...(reportingMonths === undefined ? {} : { reportingMonths }) },
})

beforeEach(() => {
  process.env.DASH_API_TOKEN = 'test-token'
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T14:00:00Z'))
  for (const f of [getClientBySlug, readLock, writeLock]) f.mockClear()
  vi.spyOn(DashSocialClient.prototype, 'getReportsData').mockResolvedValue({ data: { 7: { metrics: { TOTAL_FOLLOWERS: { value: 1, context: null, context_change: null } } } } } as never)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('a client on locked months reads September through the lock store', async () => {
  getClientBySlug.mockResolvedValue(client({ firstMonth: '2026-08' }))
  const r = await dashClientFor('client-a')
  expect(r.client).not.toBeInstanceOf(DashSocialClient)
  expect({ brandId: r.brandId, channels: r.channels }).toEqual({ brandId: 7, channels: ['INSTAGRAM'] })
  await r.client.getReportsData(SEPT)
  expect(readLock).toHaveBeenCalledTimes(1)
  expect(readLock.mock.calls[0][0]).toBe('c1')
  expect(writeLock).toHaveBeenCalledTimes(1)
  expect(writeLock.mock.calls[0][2]).toBe('2026-09-30')
})

test('a client without reportingMonths still gets a plain DashSocialClient and never touches the store', async () => {
  getClientBySlug.mockResolvedValue(client(undefined))
  const r = await dashClientFor('client-a')
  expect(r.client).toBeInstanceOf(DashSocialClient)
  await r.client.getReportsData(SEPT)
  expect(readLock).not.toHaveBeenCalled()
  expect(writeLock).not.toHaveBeenCalled()
})

test('a malformed reportingMonths locks nothing: the wrapper is live', async () => {
  getClientBySlug.mockResolvedValue(client({ firstMonth: 'nope' }))
  const r = await dashClientFor('client-a')
  expect(r.client).not.toBeInstanceOf(DashSocialClient)
  await r.client.getReportsData(SEPT)
  expect(readLock).not.toHaveBeenCalled()
  expect(writeLock).not.toHaveBeenCalled()
})

test('a bad lockDay is logged by slug and falls back to the 5th', async () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  getClientBySlug.mockResolvedValue(client({ firstMonth: '2026-08', lockDay: 99 }))
  const r = await dashClientFor('client-a')
  expect(err).toHaveBeenCalledWith('[organic-social] reportingMonths.lockDay is invalid slug=client-a')
  expect(err.mock.calls.every((c) => !String(c[0]).includes('7'))).toBe(true)
  await r.client.getReportsData(SEPT) // September locked on Oct 5, so it still locks
  expect(writeLock).toHaveBeenCalledTimes(1)
})

// The wrapper can only be as good as what it is handed. Without this test, wiring `capture: inner`
// in base.ts would leave every other test green while the stale-answer bug is fully back.
test('the capture goes out with no-store, so base.ts cannot hand the wrapper a cached reader', async () => {
  ;(DashSocialClient.prototype.getReportsData as unknown as { mockRestore: () => void }).mockRestore()
  const inits: (RequestInit & { next?: { revalidate?: number } })[] = []
  vi.stubGlobal('fetch', (async (_u: string | URL | Request, i?: RequestInit) => {
    inits.push(i as RequestInit & { next?: { revalidate?: number } })
    return new Response(JSON.stringify({ data: { 7: { metrics: { TOTAL_FOLLOWERS: { value: 1, context: null, context_change: null } } } } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch)

  getClientBySlug.mockResolvedValue(client({ firstMonth: '2026-08' }))
  const r = await dashClientFor('client-a')
  await r.client.getReportsData(SEPT)

  // One request: the capture. The prior-month lookup is a lock-store read, not a Dash call.
  expect(inits).toHaveLength(1)
  expect(inits[0].cache).toBe('no-store')
  expect(inits[0].next).toBeUndefined()
  expect(writeLock).toHaveBeenCalledTimes(1)
})
