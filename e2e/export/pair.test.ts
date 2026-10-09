import { expect, test, vi } from 'vitest'
import { exportPair } from './pair'

// A fake export: the n-th call returns the n-th value (null = the export failed).
const exports = (...values: (string | null)[]) => { let i = 0; return vi.fn(async (_attempt: number) => values[i++] ?? null) }
const differ = (a: string, b: string) => (a === b ? null : `${a} vs ${b}`)

test('a pair that matches is exported once', async () => {
  const staff = exports('A'), client = exports('A')
  expect(await exportPair(staff, client, differ)).toEqual({ staff: 'A', client: 'A', difference: null, retried: null })
  expect([staff.mock.calls, client.mock.calls]).toEqual([[[1]], [[1]]])
})

// A stale cache refreshing between the two exports (the first served stale while revalidating) differs once, then not.
test('a pair that differs is exported once more; matching then, it passes and says it retried', async () => {
  const staff = exports('stale', 'fresh'), client = exports('fresh', 'fresh')
  expect(await exportPair(staff, client, differ)).toEqual({ staff: 'fresh', client: 'fresh', difference: null, retried: 'stale vs fresh' })
  expect([staff.mock.calls, client.mock.calls]).toEqual([[[1], [2]], [[1], [2]]])
})

test('a pair that differs twice is a difference: the second one', async () => {
  const staff = exports('A', 'A2'), client = exports('B', 'B2')
  expect(await exportPair(staff, client, differ)).toEqual({ staff: 'A2', client: 'B2', difference: 'A2 vs B2', retried: 'A vs B' })
})

test('a failed export is not compared or retried (its own checks report it)', async () => {
  const staff = exports(null), client = exports('B')
  expect(await exportPair(staff, client, differ)).toEqual({ staff: null, client: 'B', difference: null, retried: null })
  expect(staff.mock.calls).toHaveLength(1)
  expect(client.mock.calls).toHaveLength(1)
})

test('a retry that fails to export leaves the first difference standing', async () => {
  const staff = exports('A', null), client = exports('B', 'B')
  expect(await exportPair(staff, client, differ)).toEqual({ staff: 'A', client: 'B', difference: 'A vs B', retried: 'A vs B' })
})
