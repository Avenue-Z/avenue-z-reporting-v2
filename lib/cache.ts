/**
 * Vendor-layer caching helper.
 *
 * Wraps an async fetcher with Next.js `unstable_cache` (1-hour TTL by
 * default), emits one structured PERF log line per call when `PERF_LOG=1`
 * with an explicit `cached: true|false` field derived via AsyncLocalStorage.
 *
 * Pattern for adding a new wrap:
 *   async function getFooImpl(slug: string) { ... }
 *   export const getFoo = cached('vendor', 'getFoo', getFooImpl, {
 *     extractTags: ([slug]) => ({ client: slug }),
 *   })
 *
 * Cache-busting policy: bump `options.version` whenever a fetcher's
 * response shape OR fetch logic (auth, endpoint, filters) changes.
 *
 * Operational escape: set `CACHE_DISABLE=1` in the environment to bypass
 * unstable_cache entirely. The wrapper falls through to `timed()` so
 * PERF logs still emit; the cache layer is transparent.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { unstable_cache } from 'next/cache'
import { timed, type PerfExtractor } from '@/lib/perf'
import { recordFetch } from '@/lib/health/collector'

const CACHE_DISABLED = process.env.CACHE_DISABLE === '1'
const PERF_LOG_ENABLED = process.env.PERF_LOG === '1'

const cacheStore = new AsyncLocalStorage<{ wasInvoked: { current: boolean } }>()

export interface CachedOptions<TArgs extends unknown[]> {
  /** Bump when response shape or fetch logic changes. */
  version?: string
  /** TTL in seconds. Default 3600 (1 hour). */
  ttlSeconds?: number
  /** Next.js cache tags for explicit invalidation via revalidateTag(). */
  tags?: string[]
  /** Tag extractor for PERF log lines. */
  extractTags?: PerfExtractor<TArgs>
  /**
   * Seconds to remember a FAILURE for. Off by default. See NEGATIVE CACHING
   * below for when a fetcher wants it.
   */
  negativeTtlSeconds?: number
  /**
   * Whether a failure of this fetcher means the page is down. Default true.
   *
   * Set false for a fetch whose absence costs a garnish rather than a number —
   * a compare/prior window that only supplies a delta, say. Such a fetcher
   * still logs and still emits its PERF line; it just does not put the section
   * into the beacon's failed set, where deriveStatus (lib/health/derive.ts)
   * would turn it into a `down` and page Slack.
   *
   * This is a two-value stand-in for a severity the health model does not have
   * yet. The honest shape is a third `degraded` HealthStatus, which the beacon,
   * the differ, the Slack formatter and the health_state enum would all have to
   * learn; until then, a non-critical fetcher is silent to the probe rather
   * than falsely loud.
   */
  healthCritical?: boolean
}

/**
 * NEGATIVE CACHING — why a fetcher would ask to remember its own failures.
 *
 * unstable_cache stores fulfilled results only: a rejected call writes no
 * entry. That is usually the behaviour you want, and it is precisely what lets
 * a per-query cache boundary retry one failed query on the next render while
 * its siblings serve warm (lib/salesforce/pipeline.ts).
 *
 * The flip side is that a PERSISTENTLY failing fetcher is then re-issued in
 * full on every single render, forever, and it pays its whole timeout each
 * time. A fetcher with a 60s ceiling turns every render of that page into a 60s
 * render for as long as the failure lasts, and a health sweep probing those
 * pages under a 60s function ceiling can lose the entire run to one of them.
 * Caching the assembled composite used to hide this by storing the degraded
 * result; splitting the boundary per query removes that accidental brake, so
 * the brake has to become deliberate.
 *
 * A short negative TTL is that brake: a failure is replayed for a few seconds
 * instead of re-issued, which bounds a persistent failure to one real attempt
 * per window while still letting a transient one clear almost immediately. Pick
 * it far below the positive TTL — the cost of being wrong is that stale dashes
 * linger for exactly this long.
 *
 * Scope, stated plainly: this memo is per process. Serverless runs many
 * instances and each keeps its own, so it bounds the repeat-render storm on a
 * warm instance — the case that actually hurts — and does nothing for a cold
 * one. That is the whole of the claim.
 */
interface FailureMemo {
  until: number
  error: unknown
}
const failureMemo = new Map<string, FailureMemo>()

function pruneFailureMemo(now: number): void {
  for (const [k, v] of failureMemo) {
    if (v.until <= now) failureMemo.delete(k)
  }
}

export function cached<TArgs extends unknown[], TRet>(
  vendor: string,
  fn: string,
  impl: (...args: TArgs) => Promise<TRet>,
  options: CachedOptions<TArgs> = {},
): (...args: TArgs) => Promise<TRet> {
  // Bypass: behave like timed() only, no caching.
  if (CACHE_DISABLED) {
    return timed(vendor, fn, impl, options.extractTags)
  }

  const version = options.version ?? 'v1'
  const ttlSeconds = options.ttlSeconds ?? 3600
  const negativeTtlMs = (options.negativeTtlSeconds ?? 0) * 1000
  const healthCritical = options.healthCritical ?? true

  // implWithMarker: runs inside unstable_cache. Strips the prepended `today`
  // arg before calling the real impl. Flips wasInvoked when it runs (= miss).
  const implWithMarker = async (...allArgs: unknown[]): Promise<TRet> => {
    const store = cacheStore.getStore()
    if (store) store.wasInvoked.current = true
    const [, ...realArgs] = allArgs  // discard `today`
    return impl(...(realArgs as TArgs))
  }

  const cachedFn = unstable_cache(
    implWithMarker,
    [vendor, fn, version],
    { revalidate: ttlSeconds, tags: options.tags },
  )

  // Same identity the positive entry has: the fetcher plus the arguments that
  // distinguish one of its entries from another. `today` is deliberately left
  // out — a memo measured in seconds cannot outlive a day boundary anyway.
  const memoKey = (args: TArgs): string => `${vendor}:${fn}:${version}:${JSON.stringify(args)}`

  return async (...args: TArgs): Promise<TRet> => {
    const wasInvoked = { current: false }
    const today = new Date().toISOString().slice(0, 10)

    return cacheStore.run({ wasInvoked }, async () => {
      let tags: Record<string, string | number | undefined> = {}
      if (options.extractTags) {
        try {
          tags = options.extractTags(args) ?? {}
        } catch {
          tags = {}
        }
      }

      // A failure still inside its negative window is replayed rather than
      // re-issued. It is reported exactly as the real failure would be — the
      // fetcher IS unhealthy, and suppressing that here would hide a live
      // outage from the probe for as long as the outage kept refreshing the
      // memo. Only the round trip is skipped.
      if (negativeTtlMs > 0) {
        const memo = failureMemo.get(memoKey(args))
        if (memo && memo.until > Date.now()) {
          const message = memo.error instanceof Error ? memo.error.message : String(memo.error)
          if (healthCritical) recordFetch({ vendor, fn, ok: false, error: message })
          if (PERF_LOG_ENABLED) {
            emit({ ts: new Date().toISOString(), vendor, fn, ms: 0, ok: false, cached: true, ...tags, err: message })
          }
          throw memo.error
        }
      }

      const start = performance.now()
      try {
        const result = await cachedFn(today, ...args)
        const ms = Math.round(performance.now() - start)
        recordFetch({ vendor, fn, ok: true })
        if (PERF_LOG_ENABLED) {
          emit({ ts: new Date().toISOString(), vendor, fn, ms, ok: true, cached: !wasInvoked.current, ...tags })
        }
        return result
      } catch (err) {
        const ms = Math.round(performance.now() - start)
        const message = err instanceof Error ? err.message : String(err)
        if (negativeTtlMs > 0) {
          const now = Date.now()
          pruneFailureMemo(now)
          failureMemo.set(memoKey(args), { until: now + negativeTtlMs, error: err })
        }
        // healthCritical: false keeps a delta-only fetcher out of the beacon's
        // failed set, which deriveStatus reads as a page-wide `down`. The log
        // line below and the caller's own console.error still fire, so the
        // failure is observable — it just is not an outage.
        if (healthCritical) recordFetch({ vendor, fn, ok: false, error: message })
        if (PERF_LOG_ENABLED) {
          emit({ ts: new Date().toISOString(), vendor, fn, ms, ok: false, cached: false, ...tags, err: message })
        }
        throw err
      }
    })
  }
}

function emit(payload: Record<string, unknown>): void {
  console.log('PERF ' + JSON.stringify(payload))
}
