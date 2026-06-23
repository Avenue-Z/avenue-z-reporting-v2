'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import { parseDashboardConfig } from '@/lib/dashboard/persistence'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import type { DashboardConfig } from '@/lib/dashboard/types'
import { resolveBlockNL } from '@/lib/dashboard/nl/resolve'
import { resolveAggregateNL } from '@/lib/dashboard/nl/aggregate-resolve'
import type { ResolutionResult } from '@/lib/dashboard/nl/types'
import type { AggregateResolutionResult } from '@/lib/dashboard/nl/aggregate-types'

export type ProposeBlockInput = {
  source: 'supermetrics' | 'triplewhale' | 'aggregate'
  prompt: string // NL prompt for leaf sources; the formula for aggregate
  slug: string
}

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

/**
 * Resolve a natural-language block request into a proposal (or clarify/error)
 * via the server-side resolvers. Same edit-permission gate as save.
 */
export async function proposeBlock(
  input: ProposeBlockInput,
): Promise<ResolutionResult | AggregateResolutionResult> {
  const session = await auth()
  if (!session?.user) return { kind: 'error', error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, input.slug)) {
    return { kind: 'error', error: 'forbidden' }
  }
  const actAsEmail = session.user.email ?? ''
  if (input.source === 'aggregate') {
    return resolveAggregateNL({ formula: input.prompt, actAsEmail })
  }
  return resolveBlockNL({ source: input.source, prompt: input.prompt, actAsEmail })
}
