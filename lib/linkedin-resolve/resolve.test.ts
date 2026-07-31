import { expect, test, vi } from 'vitest'
import { resolveWith, type ResolutionStore } from './resolve'

test('returns a stored row without fetching', async () => {
  const store: ResolutionStore = {
    read: vi.fn(async () => ({ urlKey: 'k', canonicalUrl: 'https://x/posts/a-activity-1', authorUrl: null, status: 'ok' as const })),
    write: vi.fn(),
  }
  const fetcher = vi.fn()
  const r = await resolveWith('https://www.linkedin.com/feed/update/urn:li:ugcPost:1', store, fetcher as never)
  expect(r.canonicalUrl).toContain('/posts/')
  expect(fetcher).not.toHaveBeenCalled()
})

test('on miss, fetches, persists, and returns ok', async () => {
  const writes: unknown[] = []
  const store: ResolutionStore = { read: async () => null, write: async (row) => { writes.push(row) } }
  const fetcher = async () => ({ canonicalUrl: 'https://www.linkedin.com/posts/x-activity-2', authorUrl: null, status: 'ok' as const })
  const r = await resolveWith('https://www.linkedin.com/feed/update/urn:li:ugcPost:2', store, fetcher)
  expect(r.status).toBe('ok')
  expect(writes).toHaveLength(1)
})

test('a fetch/DB failure yields an unresolved sentinel, never throws', async () => {
  const store: ResolutionStore = { read: async () => { throw new Error('db down') }, write: async () => {} }
  const r = await resolveWith('https://www.linkedin.com/feed/update/urn:li:ugcPost:3', store, async () => { throw new Error('net') })
  expect(r.status).toBe('unresolved')
})

test('a transient fetcher failure (throw) is NOT persisted, so a later report retries', async () => {
  const write = vi.fn(async () => {})
  const store: ResolutionStore = { read: async () => null, write }
  const fetcher = async () => { throw new Error('linkedin transient 429') }
  const r = await resolveWith('https://www.linkedin.com/feed/update/urn:li:ugcPost:4', store, fetcher)
  expect(r.status).toBe('unresolved')
  expect(write).not.toHaveBeenCalled()
})

test('a definitive unresolved result (fetcher returns, does not throw) IS persisted', async () => {
  const write = vi.fn(async () => {})
  const store: ResolutionStore = { read: async () => null, write }
  const fetcher = async () => ({ canonicalUrl: null, authorUrl: null, status: 'unresolved' as const })
  const r = await resolveWith('https://www.linkedin.com/feed/update/urn:li:ugcPost:5', store, fetcher)
  expect(r.status).toBe('unresolved')
  expect(write).toHaveBeenCalledTimes(1)
})
