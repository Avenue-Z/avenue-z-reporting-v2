/**
 * lib/concurrency.test.ts — unit tests for mapWithConcurrency.
 * Run with: npx tsx lib/concurrency.test.ts
 */
import { strict as assert } from 'node:assert'
import { mapWithConcurrency } from './concurrency'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function run() {
  // 1) never exceeds the concurrency limit
  let inFlight = 0
  let peak = 0
  const make = (ms: number) => async () => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await sleep(ms)
    inFlight--
    return ms
  }
  const res = await mapWithConcurrency(
    [make(20), make(20), make(20), make(20), make(20), make(20)],
    2,
  )
  assert.equal(peak, 2, `peak concurrency should be 2, got ${peak}`)

  // 2) preserves input order and values
  assert.deepEqual(
    res.map((r) => (r.status === 'fulfilled' ? r.value : null)),
    [20, 20, 20, 20, 20, 20],
  )

  // 3) a rejection is captured per-element; siblings still fulfil
  const mixed = await mapWithConcurrency(
    [async () => 1, async () => { throw new Error('boom') }, async () => 3],
    2,
  )
  assert.equal(mixed[0].status, 'fulfilled')
  assert.equal(mixed[1].status, 'rejected')
  assert.equal(mixed[2].status, 'fulfilled')

  // 4) empty input — spawns 1 worker that immediately exits; returns []
  assert.deepEqual(await mapWithConcurrency([], 4), [])

  console.log('OK lib/concurrency.test.ts passed')
}

run().catch((e) => { console.error(e); process.exit(1) })
