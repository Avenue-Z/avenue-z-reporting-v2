/**
 * Request-scoped health collector.
 *
 * runWithCollector() establishes a fresh bucket for one page render (health
 * mode). The cached() wrapper calls recordFetch() for every data fetch; when
 * no collector is active (all normal traffic) recordFetch() is a no-op, so
 * this carries zero risk to live pages. <ReportHealthBeacon> reads
 * getCollected() after the section has rendered.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { SourceHealth } from './types'

const store = new AsyncLocalStorage<SourceHealth[]>()

export function runWithCollector<T>(fn: () => T): T {
  return store.run([], fn)
}

export function recordFetch(rec: SourceHealth): void {
  const bucket = store.getStore()
  if (bucket) bucket.push(rec)
}

export function getCollected(): SourceHealth[] {
  return store.getStore() ?? []
}
