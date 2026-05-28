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
      const start = performance.now()
      try {
        const result = await cachedFn(today, ...args)
        const ms = Math.round(performance.now() - start)
        if (PERF_LOG_ENABLED) {
          emit({ ts: new Date().toISOString(), vendor, fn, ms, ok: true, cached: !wasInvoked.current, ...tags })
        }
        return result
      } catch (err) {
        const ms = Math.round(performance.now() - start)
        const message = err instanceof Error ? err.message : String(err)
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
