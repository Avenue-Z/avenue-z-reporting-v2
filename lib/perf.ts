/**
 * Wraps an async function. When `PERF_LOG=1`, emits one JSON log line per call
 * (`PERF {...}`). When off, returns the impl unchanged (zero per-call overhead).
 *
 * Pattern for adding to a new vendor client:
 *   async function getFooImpl(slug: string) { ... }
 *   export const getFoo = timed(
 *     'vendor', 'getFoo', getFooImpl,
 *     ([slug]) => ({ client: slug }),
 *   )
 *
 * `PERF_LOG` is read once at module import — set it in the environment of the
 * process that imports this file (e.g. `PERF_LOG=1 npm run start`).
 */
const ENABLED = process.env.PERF_LOG === '1'

export type PerfTags = Record<string, string | number | undefined>
export type PerfExtractor<TArgs extends unknown[]> = (args: TArgs) => PerfTags

export function timed<TArgs extends unknown[], TRet>(
  vendor: string,
  fn: string,
  impl: (...args: TArgs) => Promise<TRet>,
  extractTags?: PerfExtractor<TArgs>,
): (...args: TArgs) => Promise<TRet> {
  if (!ENABLED) return impl

  return async (...args: TArgs): Promise<TRet> => {
    let tags: PerfTags = {}
    if (extractTags) {
      try {
        tags = extractTags(args) ?? {}
      } catch {
        tags = {}
      }
    }
    const start = performance.now()
    try {
      const result = await impl(...args)
      const ms = Math.round(performance.now() - start)
      emit({ ts: new Date().toISOString(), vendor, fn, ms, ok: true, ...tags })
      return result
    } catch (err) {
      const ms = Math.round(performance.now() - start)
      const message = err instanceof Error ? err.message : String(err)
      emit({ ts: new Date().toISOString(), vendor, fn, ms, ok: false, ...tags, err: message })
      throw err
    }
  }
}

function emit(payload: Record<string, unknown>): void {
  console.log('PERF ' + JSON.stringify(payload))
}
