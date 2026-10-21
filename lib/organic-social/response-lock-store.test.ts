import { beforeEach, expect, test, vi } from 'vitest'

// The database seam is mocked: these tests pin the queries' shape and the concurrent-write rule.
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

/** The table holds `row` (or nothing). Each select returns only the columns it asked for, as Drizzle does. */
let row: { id: string; response: unknown } | null = null
const responseReads = () => select.mock.calls.filter(([cols]) => 'response' in cols).length
const insertReturns = (rows: unknown[]) => {
  insert.mockReturnValue({ values }); values.mockReturnValue({ onConflictDoNothing }); onConflictDoNothing.mockReturnValue({ returning }); returning.mockResolvedValue(rows)
}

beforeEach(() => {
  for (const f of [select, insert, from, where, limit, values, onConflictDoNothing, returning]) f.mockReset()
  cacheStore.clear()
  row = null
  select.mockImplementation((cols: Record<string, unknown>) => {
    limit.mockImplementation(async () => (row ? [Object.fromEntries(Object.keys(cols).map((k) => [k, row![k as keyof typeof row]]))] : []))
    where.mockReturnValue({ limit }); from.mockReturnValue({ where })
    return { from }
  })
})

test('readLock returns the stored answer for a row, and null for none', async () => {
  row = { id: 'r1', response: { data: 1 } }
  expect(await readLock('c1', 'k')).toEqual({ response: { data: 1 } })
  row = null
  expect(await readLock('c1', 'other')).toBeNull()
})

test('a stored answer is pulled from Neon once; later reads only look up its id', async () => {
  row = { id: 'r1', response: { data: 1 } }
  for (let i = 0; i < 3; i++) expect(await readLock('c1', 'k')).toEqual({ response: { data: 1 } })
  expect(responseReads()).toBe(1)
  expect((unstableCache.mock.calls[0] as unknown[])[2]).toEqual({ revalidate: 86400 })
})

test('a miss is never cached, so the answer captured right after it is cached from its first read', async () => {
  // The first read of every lock is a miss (it is what triggers the capture).
  expect(await readLock('c1', 'k')).toBeNull()
  expect(responseReads()).toBe(0)
  row = { id: 'r1', response: { data: 'captured' } }
  expect(await readLock('c1', 'k')).toEqual({ response: { data: 'captured' } })
  expect(await readLock('c1', 'k')).toEqual({ response: { data: 'captured' } })
  expect(responseReads()).toBe(1)
})

test('an unlock shows on the next read: a deleted row reads as none, and its recapture is a new row', async () => {
  row = { id: 'r1', response: { data: 'old' } }
  await readLock('c1', 'k')
  row = null
  expect(await readLock('c1', 'k')).toBeNull()
  row = { id: 'r2', response: { data: 'recaptured' } }
  expect(await readLock('c1', 'k')).toEqual({ response: { data: 'recaptured' } })
})

test('writeLock returns what it inserted', async () => {
  insertReturns([{ response: { data: 2 } }])
  expect(await writeLock('c1', 'k', '2026-09-30', { data: 2 })).toEqual({ data: 2 })
  expect(values).toHaveBeenCalledWith({ clientId: 'c1', requestKey: 'k', periodEnd: '2026-09-30', response: { data: 2 } })
})

test('when another request stored this lock first, writeLock returns the stored winner', async () => {
  insertReturns([])
  row = { id: 'r1', response: { data: 'winner' } }
  expect(await writeLock('c1', 'k', '2026-09-30', { data: 'mine' })).toEqual({ data: 'winner' })
})

test('if the winner cannot be read back, the answer just fetched is returned', async () => {
  insertReturns([])
  expect(await writeLock('c1', 'k', '2026-09-30', { data: 'mine' })).toEqual({ data: 'mine' })
})
