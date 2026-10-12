// The store behind lock every number: one row per (client, exact request) of a locked month.
// Written once, then served forever. Only clients with reportingMonths reach it.
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { dashResponseLocks } from '@/lib/db/schema'

export async function readLock(clientId: string, requestKey: string): Promise<{ response: unknown } | null> {
  const rows = await db.select({ response: dashResponseLocks.response }).from(dashResponseLocks)
    .where(and(eq(dashResponseLocks.clientId, clientId), eq(dashResponseLocks.requestKey, requestKey))).limit(1)
  return rows[0] ?? null
}

/** Insert once. If another request stored this lock first, return the stored answer so every
 *  reader agrees. */
export async function writeLock(clientId: string, requestKey: string, periodEnd: string, response: unknown): Promise<unknown> {
  const inserted = await db.insert(dashResponseLocks).values({ clientId, requestKey, periodEnd, response })
    .onConflictDoNothing().returning({ response: dashResponseLocks.response })
  if (inserted[0]) return inserted[0].response
  return (await readLock(clientId, requestKey))?.response ?? response
}
