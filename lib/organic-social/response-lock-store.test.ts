import { beforeEach, expect, test, vi } from 'vitest'

// The database seam is mocked: these tests pin the two queries' shape and the concurrent-write rule.
const { select, insert, from, where, limit, values, onConflictDoNothing, returning } = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), from: vi.fn(), where: vi.fn(), limit: vi.fn(),
  values: vi.fn(), onConflictDoNothing: vi.fn(), returning: vi.fn(),
}))
vi.mock('@/lib/db/client', () => ({ db: { select, insert } }))

import { readLock, writeLock } from './response-lock-store'

const readReturns = (rows: unknown[]) => {
  select.mockReturnValue({ from }); from.mockReturnValue({ where }); where.mockReturnValue({ limit }); limit.mockResolvedValue(rows)
}
const insertReturns = (rows: unknown[]) => {
  insert.mockReturnValue({ values }); values.mockReturnValue({ onConflictDoNothing }); onConflictDoNothing.mockReturnValue({ returning }); returning.mockResolvedValue(rows)
}

beforeEach(() => { for (const f of [select, insert, from, where, limit, values, onConflictDoNothing, returning]) f.mockReset() })

test('readLock returns the stored answer for a row, and null for none', async () => {
  readReturns([{ response: { data: 1 } }])
  expect(await readLock('c1', 'k')).toEqual({ response: { data: 1 } })
  readReturns([])
  expect(await readLock('c1', 'k')).toBeNull()
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
