import { describe, expect, test, vi } from 'vitest'

vi.mock('./client', () => ({ martRef: (t: string) => t, bqRows: vi.fn() }))
vi.mock('@/lib/cache', () => ({ cached: (_v: string, _f: string, impl: unknown) => impl }))

import { bqRows } from './client'
import { assertCovers } from './freshness'

describe('assertCovers', () => {
  test('passes when the mart holds the range end', async () => {
    vi.mocked(bqRows).mockResolvedValueOnce([{ d: '2026-10-12' }])
    await expect(assertCovers('mart_a', '2026-10-12')).resolves.toBeUndefined()
  })
  test('a range ending after the newest day is stale (this_month, or before the nightly)', async () => {
    vi.mocked(bqRows).mockResolvedValueOnce([{ d: '2026-10-11' }])
    await expect(assertCovers('mart_a', '2026-10-12')).rejects.toMatchObject({ reason: 'stale' })
  })
  test('an empty mart is stale', async () => {
    vi.mocked(bqRows).mockResolvedValueOnce([{ d: null }])
    await expect(assertCovers('mart_a', '2026-01-01')).rejects.toMatchObject({ reason: 'stale' })
  })
})
