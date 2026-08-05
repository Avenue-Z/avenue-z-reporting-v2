// lib/concurrency.test.ts
// Run: npx tsx lib/concurrency.test.ts
import { strict as assert } from 'node:assert'
import { mapWithConcurrency } from './concurrency'

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function main() {
  // Results come back in INPUT order, regardless of completion order.
  const out = await mapWithConcurrency([10, 30, 20], 2, async (n) => {
    await delay(n)
    return n * 2
  })
  assert.deepEqual(out, [20, 60, 40])

  // Empty input → empty output, no work, no hang.
  assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), [])

  // Peak in-flight never exceeds the limit.
  let active = 0
  let peak = 0
  await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async (i) => {
    active++
    peak = Math.max(peak, active)
    await delay(5)
    active--
    return i
  })
  assert.equal(peak, 3, `peak concurrency ${peak} exceeded limit 3`)

  // limit >= length behaves like Promise.all (all run at once).
  let active2 = 0
  let peak2 = 0
  await mapWithConcurrency([1, 2, 3], 10, async (n) => {
    active2++
    peak2 = Math.max(peak2, active2)
    await delay(5)
    active2--
    return n
  })
  assert.equal(peak2, 3)

  // limit <= 0 is clamped to 1 rather than deadlocking.
  assert.deepEqual(await mapWithConcurrency([1, 2, 3], 0, async (n) => n), [1, 2, 3])

  // A rejected fn rejects the whole call, like Promise.all.
  await assert.rejects(() =>
    mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom')
      return n
    }),
  )

  // The index is passed through to fn.
  const withIdx = await mapWithConcurrency(['a', 'b', 'c'], 2, async (s, i) => `${s}${i}`)
  assert.deepEqual(withIdx, ['a0', 'b1', 'c2'])

  console.log('concurrency.test.ts: all assertions passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
