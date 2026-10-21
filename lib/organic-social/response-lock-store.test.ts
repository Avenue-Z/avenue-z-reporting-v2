import { beforeEach, expect, test, vi } from 'vitest'

// The database seam is mocked: these tests pin the two queries' shape and the concurrent-write rule.
const { select, insert, from, where, limit, values, onConflictDoNothing, returning } = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), from: vi.fn(), where: vi.fn(), limit: vi.fn(),
  values: vi.fn(), onConflictDoNothing: vi.fn(), returning: vi.fn(),
}))
vi.mock('@/lib/db/client', () => ({ db: { select, insert } }))
// Next's data cache, as a Map that never expires: enough to show which reads it absorbs.
const { unstableCache, cacheStore } = vi.hoisted(() => {
  const cacheStore = new Map<string, unknown>()
  const unstableCache = vi.fn((fn: (...a: string[]) => Promise<unknown>, keyParts: string[]) => async (...args: string[]) => {
    const key = JSON.stringify([keyParts, args])
    if (!cacheStore.has(key)) cacheStore.set(key, await fn(...args))
    return cacheStore.get(key)
  })
  return { unstableCache, cacheStore }
})
vi.mock('next/cache', () => ({ unstable_cache: unstableCache }))

import { readLock, writeLock } from './response-lock-store'

const readReturns = (rows: unknown[]) => {
  select.mockReturnValue({ from }); from.mockReturnValue({ where }); where.mockReturnValue({ limit }); limit.mockResolvedValue(rows)
}
const insertReturns = (rows: unknown[]) => {
  insert.mockReturnValue({ values }); values.mockReturnValue({ onConflictDoNothing }); onConflictDoNothing.mockReturnValue({ returning }); returning.mockResolvedValue(rows)
}

beforeEach(() => {
  for (const f of [select, insert, from, where, limit, values, onConflictDoNothing, returning]) f.mockReset()
  cacheStore.clear()
})

test('readLock returns the stored answer for a row, and null for none', async () => {
  readReturns([{ response: { data: 1 } }])
  expect(await readLock('c1', 'k')).toEqual({ response: { data: 1 } })
  readReturns([])
  expect(await readLock('c1', 'other')).toBeNull()
})

test('a stored answer is read from Neon once, then served from the data cache for a day', async () => {
  readReturns([{ response: { data: 1 } }])
  await readLock('c1', 'k')
  expect(await readLock('c1', 'k')).toEqual({ response: { data: 1 } })
  expect(limit).toHaveBeenCalledTimes(1)
  expect((unstableCache.mock.calls[0] as unknown[])[2]).toEqual({ revalidate: 86400 })
})

test('the cache is per client and request', async () => {
  readReturns([{ response: { data: 1 } }])
  await readLock('c1', 'k')
  readReturns([{ response: { data: 2 } }])
  expect(await readLock('c2', 'k')).toEqual({ response: { data: 2 } })
  expect(await readLock('c1', 'k2')).toEqual({ response: { data: 2 } })
})

test('a cached miss is re-checked against Neon, so a lock captured after it is found', async () => {
  // The first read of every lock is a miss (it is what triggers the capture). If that cached null
  // were trusted, every read for the next day would capture again and serve live numbers.
  readReturns([])
  expect(await readLock('c1', 'k')).toBeNull()
  readReturns([{ response: { data: 'captured' } }])
  expect(await readLock('c1', 'k')).toEqual({ response: { data: 'captured' } })
})

test('writeLock returns what it inserted', async () => {
  insertReturns([{ response: { data: 2 } }])
  expect(await writeLock('c1', 'k', '2026-09-30', { data: 2 })).toEqual({ data: 2 })
  expect(values).toHaveBeenCalledWith({ clientId: 'c1', requestKey: 'k', periodEnd: '2026-09-30', response: { data: 2 } })
})

test('when another request stored this lock first, writeLock returns the stored winner', async () => {
  insertReturns([])
  readReturns([{ response: { data: 'winner' } }])
  expect(await writeLock('c1', 'k', '2026-09-30', { data: 'mine' })).toEqual({ data: 'winner' })
})

test('if the winner cannot be read back, the answer just fetched is returned', async () => {
  insertReturns([])
  readReturns([])
  expect(await writeLock('c1', 'k', '2026-09-30', { data: 'mine' })).toEqual({ data: 'mine' })
})
