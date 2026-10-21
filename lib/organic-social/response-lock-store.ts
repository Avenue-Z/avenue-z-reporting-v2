// The store behind lock every number: one row per (client, exact request) of a locked month.
// Written once, then served forever. Only clients with reportingMonths reach it.
import { and, eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db/client'
import { dashResponseLocks } from '@/lib/db/schema'

async function selectResponse(id: string): Promise<{ response: unknown } | null> {
  const rows = await db.select({ response: dashResponseLocks.response }).from(dashResponseLocks)
    .where(eq(dashResponseLocks.id, id)).limit(1)
  return rows[0] ?? null
}

/** Pulling the whole JSON answer from Neon on every render used up the monthly network transfer,
 *  so the answer is kept in Next's data cache for a day, keyed by its row id. A row's answer never
 *  changes, and an unlock (deleting the rows) followed by a recapture writes a new row with a new
 *  id, so a cached answer can never be the wrong one. Only the small id lookup goes to Neon every
 *  time. That lookup is what keeps a miss out of the cache: a cached miss would sit in front of the
 *  answer captured right after it, and nothing can replace it early (a capture runs during a
 *  render, where Next refuses revalidateTag). */
const cachedSelectResponse = unstable_cache(selectResponse, ['dash-response-lock', 'v2'], { revalidate: 86400 })

export async function readLock(clientId: string, requestKey: string): Promise<{ response: unknown } | null> {
  const rows = await db.select({ id: dashResponseLocks.id }).from(dashResponseLocks)
    .where(and(eq(dashResponseLocks.clientId, clientId), eq(dashResponseLocks.requestKey, requestKey))).limit(1)
  return rows[0] ? cachedSelectResponse(rows[0].id) : null
}

/** Insert once. If another request stored this lock first, return the stored answer so every
 *  reader agrees. */
export async function writeLock(clientId: string, requestKey: string, periodEnd: string, response: unknown): Promise<unknown> {
  const inserted = await db.insert(dashResponseLocks).values({ clientId, requestKey, periodEnd, response })
    .onConflictDoNothing().returning({ response: dashResponseLocks.response })
  if (inserted[0]) return inserted[0].response
  return (await readLock(clientId, requestKey))?.response ?? response
}
