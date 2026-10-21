// The store behind lock every number: one row per (client, exact request) of a locked month.
// Written once, then served forever. Only clients with reportingMonths reach it.
import { and, eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db/client'
import { dashResponseLocks } from '@/lib/db/schema'

async function selectLock(clientId: string, requestKey: string): Promise<{ response: unknown } | null> {
  const rows = await db.select({ response: dashResponseLocks.response }).from(dashResponseLocks)
    .where(and(eq(dashResponseLocks.clientId, clientId), eq(dashResponseLocks.requestKey, requestKey))).limit(1)
  return rows[0] ?? null
}

/** A stored answer never changes, so it is kept in Next's data cache for a day instead of pulling
 *  the whole JSON answer from Neon on every render (that used up the monthly network transfer).
 *  A day is also how long a manual unlock (deleting the rows) can keep showing the old numbers,
 *  unless the data cache is purged. A miss is cached as null and never trusted: the first read of
 *  every lock is a miss, and trusting it would hide the answer captured right after it. A miss is
 *  not thrown either, because Next keeps serving the stale entry when a refresh throws, and an
 *  unlocked row would then never go away. */
const cachedSelectLock = unstable_cache(selectLock, ['dash-response-lock', 'v1'], { revalidate: 86400 })

export async function readLock(clientId: string, requestKey: string): Promise<{ response: unknown } | null> {
  return (await cachedSelectLock(clientId, requestKey)) ?? selectLock(clientId, requestKey)
}

/** Insert once. If another request stored this lock first, return the stored answer so every
 *  reader agrees. */
export async function writeLock(clientId: string, requestKey: string, periodEnd: string, response: unknown): Promise<unknown> {
  const inserted = await db.insert(dashResponseLocks).values({ clientId, requestKey, periodEnd, response })
    .onConflictDoNothing().returning({ response: dashResponseLocks.response })
  if (inserted[0]) return inserted[0].response
  return (await readLock(clientId, requestKey))?.response ?? response
}
