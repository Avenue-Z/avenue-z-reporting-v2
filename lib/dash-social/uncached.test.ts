import { expect, test } from 'vitest'
import { DashSocialClient, uncached } from './client'

// The lock capture must never be served from Next's data cache. Dash calls carry
// `next: { revalidate: 3600 }`, and on a dynamic request Next serves an expired entry stale while
// it revalidates behind it, so a capture through the ordinary client can store an answer Dash gave
// days earlier and lock it forever (Paul, 2026-09-23).

const recorder = (body: unknown = { data: {} }) => {
  const calls: (RequestInit & { next?: { revalidate?: number } })[] = []
  const fetchImpl = (async (_u: string | URL | Request, i?: RequestInit) => {
    calls.push(i as RequestInit & { next?: { revalidate?: number } })
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

test('uncached() opts a fetch out of the data cache, and removes the revalidate rather than fighting it', async () => {
  const { calls, fetchImpl } = recorder()
  await uncached(fetchImpl)('https://example.test', {
    next: { revalidate: 3600 }, headers: { Accept: 'application/json' },
  } as RequestInit)
  expect(calls[0].cache).toBe('no-store')
  // Load-bearing, not tidiness: `cache: 'no-store'` sent ALONGSIDE a live `next.revalidate` is a
  // conflict Next resolves by unsetting BOTH, which silently restores the cached path. The opt-out
  // would look right and do nothing.
  expect(calls[0].next).toBeUndefined()
  // Everything else the caller set survives, including the abort signal's siblings.
  expect((calls[0].headers as Record<string, string>).Accept).toBe('application/json')
})

test('a client built on uncached() sends no-store on a real Dash call', async () => {
  const { calls, fetchImpl } = recorder()
  await new DashSocialClient({ token: 't', fetchImpl: uncached(fetchImpl) }).getReportsData({
    brandId: 1, channels: ['INSTAGRAM'], metrics: ['TOTAL_FOLLOWERS'],
    startDate: '2026-09-01T04:00:00Z', endDate: '2026-09-30T04:00:00Z',
  })
  expect(calls[0].cache).toBe('no-store')
  expect(calls[0].next).toBeUndefined()
  // The timeout guard still applies to the capture: no-store must not cost us the hang guard.
  expect(calls[0].signal).toBeDefined()
})

test('the ordinary client still asks for the shared hourly cache', async () => {
  const { calls, fetchImpl } = recorder()
  await new DashSocialClient({ token: 't', fetchImpl }).getReportsData({
    brandId: 1, channels: ['INSTAGRAM'], metrics: ['TOTAL_FOLLOWERS'],
    startDate: '2026-09-01T04:00:00Z', endDate: '2026-09-30T04:00:00Z',
  })
  expect(calls[0].next?.revalidate).toBe(3600)
  expect(calls[0].cache).toBeUndefined()
})
