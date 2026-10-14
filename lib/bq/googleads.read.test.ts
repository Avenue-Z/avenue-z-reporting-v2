import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _f: string, impl: unknown) => impl }))
vi.mock('./client', () => ({ martRef: (t: string) => t, bqRows: vi.fn(async () => [{ Cost: 1 }]) }))
vi.mock('./freshness', () => ({ assertCovers: vi.fn(async () => undefined) }))

import { bqRows } from './client'
import { AW_HISTORY_FROM, readAwMart } from './googleads'

describe('readAwMart history floor', () => {
  test('prod holds pre-backfill Google Ads history before the floor, so earlier ranges go live', async () => {
    await expect(readAwMart('4136001852', ['Cost'], '2026-03-15', '2026-04-14')).rejects.toMatchObject({ reason: 'unsupported' })
    expect(bqRows).not.toHaveBeenCalled()
  })
  test('a range starting on the floor is served from the marts', async () => {
    expect(await readAwMart('4136001852', ['Cost'], AW_HISTORY_FROM, '2026-04-30')).toEqual([{ Cost: '1' }])
  })
})
