'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import { parseDashboardConfig } from '@/lib/dashboard/persistence'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import type { DashboardConfig } from '@/lib/dashboard/types'

/**
 * Save a client's configurable dashboard. Internal admins may edit any client;
 * client admins only their own. Validates the config before writing.
 */
export async function saveDashboardConfig(
  slug: string,
  config: DashboardConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) {
    return { ok: false, error: 'forbidden' }
  }
  const parsed = parseDashboardConfig(config)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  await db
    .update(clients)
    .set({ dashboardConfig: parsed.config, updatedAt: new Date() })
    .where(eq(clients.slug, slug))

  revalidatePath('/', 'layout')
  return { ok: true }
}
