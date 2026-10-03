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
  // Fix list X5: a failed YTD month should not keep sending Dash requests whose answers are thrown away.
  test('after a rejection no new item starts; items in flight finish; the call rejects with the first error', async () => {
    const started: number[] = []
    const finished: number[] = []
    const run = mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async (i) => {
      started.push(i)
      if (i === 0) { await delay(1); throw new Error('first') }
      await delay(10)
      finished.push(i)
      return i
    })
    await expect(run).rejects.toThrow('first')
    await delay(30)
    expect(started).toEqual([0, 1, 2])
    expect(finished.sort()).toEqual([1, 2])
  })

  // A pin, not a fix: Promise.all already subscribes to every worker, so a later rejection is never unhandled.
  test('a sibling that rejects after the first rejection raises no unhandledRejection', async () => {
    const seen: unknown[] = []
    const onUnhandled = (e: unknown) => { seen.push(e) }
    process.on('unhandledRejection', onUnhandled)
    try {
      const run = mapWithConcurrency([0, 1], 2, async (i) => {
        await delay(i === 0 ? 1 : 10)
        throw new Error(i === 0 ? 'first' : 'second')
      })
      await expect(run).rejects.toThrow('first')
      await delay(30)
      expect(seen).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})
