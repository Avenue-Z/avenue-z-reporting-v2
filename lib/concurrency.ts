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
 * A rejected `fn` rejects the whole call, matching Promise.all semantics.
 * Note: like raw Promise.all, in-flight siblings are NOT cancelled on rejection
 * — they run to completion, and a second rejection surfaces as an unhandled
 * rejection. Current callers can't reject (they try/catch internally).
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

  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}
