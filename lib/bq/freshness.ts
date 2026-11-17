import { cached } from '@/lib/cache'
import { bqRows, martRef } from './client'
import { BqUnavailable } from './errors'

async function freshThroughImpl(table: string): Promise<string | null> {
  const rows = await bqRows(`select cast(max(event_date) as string) as d from ${martRef(table)}`, {})
  return (rows[0]?.d as string | null | undefined) ?? null
}

/** Newest event_date the mart holds (marts end at yesterday after the 08:00 UTC nightly). */
export const martFreshThrough = cached('bigquery', 'martFreshThrough', freshThroughImpl, {
  ttlSeconds: 3600,
  version: 'v1',
})

/** Throws `stale` unless the mart holds every day up to endDate, so a partial range is never served. */
export async function assertCovers(table: string, endDate: string): Promise<void> {
  const through = await martFreshThrough(table)
  if (!through || endDate > through) {
    throw new BqUnavailable('stale', `${table} holds data through ${through ?? 'nothing'}; range ends ${endDate}`)
  }
}
