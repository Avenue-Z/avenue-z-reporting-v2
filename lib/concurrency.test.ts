// lib/concurrency.test.ts — vitest suite (included in vitest.config.ts, gated by CI)
import { describe, test, expect } from 'vitest'
import { mapWithConcurrency } from './concurrency'

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

describe('mapWithConcurrency', () => {
  test('returns results in input order, regardless of completion order', async () => {
    const out = await mapWithConcurrency([10, 30, 20], 2, async (n) => {
      await delay(n)
      return n * 2
    })
    expect(out).toEqual([20, 60, 40])
  })

  test('empty input → empty output, no work, no hang', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([])
  })

  test('peak in-flight never exceeds the limit', async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async (i) => {
      active++
      peak = Math.max(peak, active)
      await delay(5)
      active--
      return i
    })
    expect(peak).toBe(3)
  })

  test('limit >= length behaves like Promise.all (all run at once)', async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency([1, 2, 3], 10, async (n) => {
      active++
      peak = Math.max(peak, active)
      await delay(5)
      active--
      return n
    })
    expect(peak).toBe(3)
  })

  test('limit <= 0 is clamped to 1 rather than deadlocking', async () => {
    expect(await mapWithConcurrency([1, 2, 3], 0, async (n) => n)).toEqual([1, 2, 3])
  })

  test('a rejected fn rejects the whole call, like Promise.all', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom')
        return n
      }),
    ).rejects.toThrow('boom')
  })

  test('the index is passed through to fn', async () => {
    const withIdx = await mapWithConcurrency(['a', 'b', 'c'], 2, async (s, i) => `${s}${i}`)
    expect(withIdx).toEqual(['a0', 'b1', 'c2'])
  })
})
