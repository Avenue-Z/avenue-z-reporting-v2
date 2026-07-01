// lib/dashboard/retry-controller.test.ts
// Run: npx tsx lib/dashboard/retry-controller.test.ts
import { strict as assert } from 'node:assert'
import { createRetryController, type RetryTimers } from './retry-controller'
import { RL_BASE_DELAY_MS, RL_MAX_ATTEMPTS } from './retry-policy'

/** Minimal fake timer harness driven by a manual clock. */
function harness() {
  let clock = 0
  let nextId = 1
  let scheduled: { id: number; fn: () => void; at: number }[] = []
  const timers: RetryTimers = {
    now: () => clock,
    setTimer: (fn, ms) => { const id = nextId++; scheduled.push({ id, fn, at: clock + ms }); return id },
    clearTimer: (h) => { scheduled = scheduled.filter((s) => s.id !== h) },
  }
  function advanceTo(t: number) {
    for (;;) {
      const due = scheduled.filter((s) => s.at <= t).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      scheduled = scheduled.filter((s) => s !== due)
      clock = due.at
      due.fn()
    }
    clock = t
  }
  return { timers, advanceTo, clockAt: () => clock }
}

const expectedTimes = (() => {
  const out: number[] = []
  let t = 0
  for (let i = 0; i < RL_MAX_ATTEMPTS; i++) { t += RL_BASE_DELAY_MS * 2 ** i; out.push(t) }
  return out
})()

// ROOT-CAUSE REGRESSION: a SINGLE acquire (one mount, never re-acquired) must drive
// the full backed-off sequence — the old version fired only once.
{
  const h = harness()
  const ctrl = createRetryController(h.timers)
  const fires: number[] = []
  ctrl.acquire(() => fires.push(h.clockAt()))
  h.advanceTo(10 * 60_000)
  assert.deepEqual(fires, expectedTimes, `single acquire → ${fires}, expected ${expectedTimes}`)
}

// Releasing before the budget is spent stops further refreshes.
{
  const h = harness()
  const ctrl = createRetryController(h.timers)
  let count = 0
  const release = ctrl.acquire(() => { count++ })
  h.advanceTo(expectedTimes[1] + 1) // let the first two fire
  const afterTwo = count
  release()
  h.advanceTo(10 * 60_000)
  assert.equal(count, afterTwo, 'no refreshes after release')
  assert.ok(afterTwo >= 1 && afterTwo < RL_MAX_ATTEMPTS, 'fired some but not all before release')
}

// Two blocks share ONE chain — refresh fires once per step, not per block.
{
  const h = harness()
  const ctrl = createRetryController(h.timers)
  let count = 0
  const r1 = ctrl.acquire(() => { count++ })
  const r2 = ctrl.acquire(() => { count++ })
  h.advanceTo(10 * 60_000)
  assert.equal(count, RL_MAX_ATTEMPTS, `shared chain fired ${count}, expected ${RL_MAX_ATTEMPTS}`)
  r1(); r2()
}

console.log('ok')
