'use server'

// Its own file, not report-sections.ts: the Edit KPIs panel (a client component inside the part registry's import graph)
// imports this statically, and report-sections.ts imports the registries, which would be a cycle.

import { updateTag } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import { getClientBySlug } from '@/lib/db/queries'
import { auth } from '@/auth'
import { isInternalStaff } from '@/lib/dashboard/permissions'
import { applyAeoKpis } from '@/lib/report-sections/mutations'
import { parseKpiSelection } from '@/lib/report-sections/aeo-kpis'

type Result = { ok: true } | { ok: false; error: string }

/** Sets the AEO Snapshot KPIs for one client. Internal staff only (never CLIENT_ADMIN). */
export async function setAeoKpis(slug: string, kpis: unknown): Promise<Result> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!isInternalStaff(session.user.role)) return { ok: false, error: 'forbidden' }
  let parsed: ReturnType<typeof parseKpiSelection>
  try {
    parsed = parseKpiSelection(kpis)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  const client = await getClientBySlug(slug)
  if (!client) return { ok: false, error: 'client not found' }
  await db
    .update(clients)
    .set({ reportSectionConfig: applyAeoKpis(client.reportSectionConfig ?? {}, parsed), updatedAt: new Date() })
    .where(eq(clients.slug, slug))
  updateTag('db')
  return { ok: true }
}
