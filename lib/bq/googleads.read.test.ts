import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _f: string, impl: unknown) => impl }))
vi.mock('./client', () => ({ martRef: (t: string) => t, bqRows: vi.fn(async () => [{ Cost: 1 }]) }))
vi.mock('./freshness', () => ({ assertCovers: vi.fn(async () => undefined) }))

import { bqRows } from './client'
import { AW_HISTORY_FROM, awHistoryFrom, readAwMart } from './googleads'

const RENAISSANCE = '4136001852'
const PRE_BACKFILL = '3449727460' // holds unreconciled rows back to 2025-02

describe('awHistoryFrom', () => {
  test("Renaissance's account is verified exact from its first day of data", () => {
    expect(awHistoryFrom(RENAISSANCE)).toBe('2026-02-27')
  })
  test.each([[PRE_BACKFILL], [''], ['unknown'], ['constructor']])('any other account (%s) keeps the default floor', (id) => {
    expect(awHistoryFrom(id)).toBe(AW_HISTORY_FROM)
  })
})

describe('readAwMart history floor', () => {
  test('prod holds pre-backfill Google Ads history before the floor, so earlier ranges are refused', async () => {
    await expect(readAwMart(PRE_BACKFILL, ['Cost'], '2026-03-15', '2026-04-14')).rejects.toMatchObject({ reason: 'unsupported' })
    expect(bqRows).not.toHaveBeenCalled()
  })
  test('the refusal names the history floor (scripts/bq-shadow-compare.ts greps for it)', async () => {
    await expect(readAwMart(PRE_BACKFILL, ['Cost'], '2026-03-15', '2026-04-14')).rejects.toThrow(/history floor 2026-04-01/)
    await expect(readAwMart(RENAISSANCE, ['Cost'], '2026-02-26', '2026-03-31')).rejects.toThrow(/history floor 2026-02-27/)
  })
  test("a range before Renaissance's own floor is refused", async () => {
    await expect(readAwMart(RENAISSANCE, ['Cost'], '2026-02-26', '2026-03-31')).rejects.toMatchObject({ reason: 'unsupported' })
    expect(bqRows).not.toHaveBeenCalled()
  })
  test.each([['2026-1-1', '2026-11-16'], ['2026-04-01', '2026-11-1'], ['2026-04-01', 'undefined']])(
    'a date that is not YYYY-MM-DD (%s..%s) is refused: it would sort past the floor as text (C3)',
    async (start, end) => {
      await expect(readAwMart(RENAISSANCE, ['Cost'], start, end)).rejects.toMatchObject({ reason: 'unsupported' })
      expect(bqRows).not.toHaveBeenCalled()
    },
  )
  test('a range starting on the default floor is served from the marts', async () => {
    expect(await readAwMart(PRE_BACKFILL, ['Cost'], AW_HISTORY_FROM, '2026-04-30')).toEqual([{ Cost: '1' }])
  })
  test("Renaissance's account is served from its own floor, before the default one", async () => {
    expect(await readAwMart(RENAISSANCE, ['Cost'], '2026-02-27', '2026-03-31')).toEqual([{ Cost: '1' }])
  })
})
