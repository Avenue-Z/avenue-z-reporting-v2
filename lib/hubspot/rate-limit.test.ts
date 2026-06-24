import { strict as assert } from 'node:assert'
import { createRateLimiter } from './rate-limit'

async function main() {
  // 1. Passthrough — the scheduled function's result is returned unchanged.
  {
    const limit = createRateLimiter(4)
    const out = await limit(() => Promise.resolve('value'))
    assert.equal(out, 'value')
  }

  // 2. Throttle spacing — a burst of tasks scheduled "at once" (now fixed) is
  //    spaced 1000/maxPerSec ms apart, so no more than maxPerSec start per second.
  {
    const delays: number[] = []
    const limit = createRateLimiter(4, {
      now: () => 0,
      sleep: (ms) => { delays.push(ms); return Promise.resolve() },
    })
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => limit(() => Promise.resolve(i))),
    )
    // First task runs immediately (no sleep); the next 7 are spaced 250ms apart.
    assert.deepEqual(delays, [250, 500, 750, 1000, 1250, 1500, 1750])
  }

  console.log('ok')
}

main()
