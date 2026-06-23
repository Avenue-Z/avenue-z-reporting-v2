/**
 * Even-spacing rate limiter. Guarantees no more than `maxPerSec` scheduled
 * functions START per rolling second by assigning each call the next free time
 * slot, `1000/maxPerSec` ms after the previous one.
 *
 * It throttles starts, not concurrency — a slow fn may still overlap the next,
 * which is exactly what we want against a req/s API quota (HubSpot search:
 * 4 req/s). Call sites can fan out with Promise.all; the limiter spaces the
 * actual HTTP calls so they stay under quota without serializing everything.
 *
 * `now`/`sleep` are injectable for deterministic tests.
 */
export interface RateLimiterDeps {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createRateLimiter(maxPerSec: number, deps: RateLimiterDeps = {}) {
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? realSleep
  const spacingMs = 1000 / maxPerSec
  let nextSlot = 0

  return function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const current = now()
    const slot = Math.max(current, nextSlot)
    nextSlot = slot + spacingMs
    const delay = slot - current
    return (delay > 0 ? sleep(delay) : Promise.resolve()).then(fn)
  }
}
