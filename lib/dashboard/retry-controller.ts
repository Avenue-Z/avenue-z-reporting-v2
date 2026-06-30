import { planRetry, RL_RESET_AFTER_MS } from './retry-policy'

/**
 * Drives auto-retry for rate-limited dashboard blocks.
 *
 * The previous version scheduled retries in a per-block effect and relied on the
 * component remounting to schedule each next attempt. But `router.refresh()` is a
 * transition — it keeps the rate-limited card mounted — so the effect never re-ran
 * and only the FIRST retry ever fired. This controller instead **self-reschedules**:
 * one mount starts a chain that re-arms the next backed-off attempt from inside the
 * timer callback, independent of React re-rendering.
 *
 * It is page-wide (a single shared chain across all rate-limited blocks) and tracks
 * how many rate-limited blocks are on screen, so the chain stops as soon as the last
 * one recovers or the user navigates away. Timer/clock are injected so the chain is
 * unit-testable with fake timers.
 */
export interface RetryTimers {
  now: () => number
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
}

export interface RetryController {
  /** A rate-limited block mounted. Starts/continues the refresh chain. Returns a
   *  release fn to call when the block unmounts (recovered or navigated away). */
  acquire: (refresh: () => void) => () => void
}

export function createRetryController(timers: RetryTimers): RetryController {
  let active = 0
  let attempts = 0
  let lastTickTs = 0
  let handle: unknown = null
  let refresh: () => void = () => {}

  function arm() {
    if (handle !== null || active === 0) return // already chained, or nothing on screen
    const plan = planRetry(attempts, lastTickTs, timers.now())
    if (!plan.retry) return // budget spent — stop (leaves the static "recover shortly" copy)
    handle = timers.setTimer(() => {
      handle = null
      attempts = plan.nextAttempts
      lastTickTs = timers.now()
      refresh()
      arm() // re-arm the next backoff step — does NOT depend on a remount
    }, plan.delayMs)
  }

  return {
    acquire(doRefresh) {
      refresh = doRefresh
      // A long quiet gap means a fresh rate-limit episode → restore the full budget.
      if (timers.now() - lastTickTs > RL_RESET_AFTER_MS) attempts = 0
      active += 1
      arm()
      return () => {
        active -= 1
        if (active === 0 && handle !== null) {
          timers.clearTimer(handle)
          handle = null
        }
      }
    },
  }
}

/** Browser singleton wired to real timers. One chain coordinates the whole page. */
export const retryController = createRetryController({
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
})
