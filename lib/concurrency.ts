/**
 * Runs `fn` over `items` with at most `limit` invocations in flight at once,
 * returning results in input order (a bounded Promise.all).
 *
 * Why this exists: the cron self-fetch routes (`/api/cache-warm`,
 * `/api/health/sweep`) used to fire every client×report page render at once via
 * an unbounded `Promise.all`. Each self-fetch renders a full report server-side,
 * and every render fans out several Neon queries — so an unbounded map produced
 * a burst of dozens of concurrent renders (worst at :30, where both crons
 * overlapped), spiking Function CPU Duration and tripping Neon errors. A rolling
 * window keeps peak concurrency flat while still overlapping work.
 *
 * A rejected `fn` rejects the whole call with the first error, matching Promise.all semantics, and no new item
 * starts after it: the YTD blocks (parts/ytd-review*.tsx) throw a month's answer away once any month fails, so starting
 * more would only spend Dash requests. Items already in flight are not cancelled; they run to completion, and a later
 * rejection is handled by the Promise.all below, so it is never unhandled. The cache warmer and the health sweep catch
 * inside `fn` and never reject, so none of this changes them.
 * `limit` is clamped to at least 1 so a zero/negative value can't deadlock.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const workers = Math.max(1, Math.min(limit, items.length))
  let next = 0
  let failed = false

  async function worker(): Promise<void> {
    while (!failed && next < items.length) {
      const i = next++
      try {
        results[i] = await fn(items[i], i)
      } catch (e) {
        failed = true
        throw e
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}
