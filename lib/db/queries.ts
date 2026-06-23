import { cache } from 'react'
import { eq, and, lt } from 'drizzle-orm'
import { db } from './client'
import { clients, users, smDimensionValueCache, type Client, type User, type ClientRole } from './schema'
import { timed } from '@/lib/perf'
import type { DashboardConfig } from '@/lib/dashboard/types'
import { parseDashboardConfig } from '@/lib/dashboard/persistence'

/**
 * Find one client by slug, including its users.
 * Returns null if not found. Per-render deduplicated via React.cache.
 */
const getClientBySlugImpl = cache(async (slug: string): Promise<(Client & { users: User[] }) | null> => {
  const row = await db.query.clients.findFirst({
    where: eq(clients.slug, slug),
    with: { users: true },
  })
  return row ?? null
})

export const getClientBySlug = timed(
  'db',
  'getClientBySlug',
  getClientBySlugImpl,
  ([slug]) => ({ client: slug }),
)

/**
 * Find one user by email. `demoMode` is the users.demoMode column —
 * when true, the auth callback bakes a `demoMode: true` claim into the
 * session JWT and the route handlers flip on the demo-fill behavior for
 * every page that user views.
 * Returns null if not found.
 */
const getClientByEmailImpl = cache(async (email: string): Promise<{ email: string; role: ClientRole; slug: string; demoMode: boolean } | null> => {
  const row = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
    with: { client: true },
  })
  if (!row) return null
  return { email: row.email, role: row.role, slug: row.client.slug, demoMode: row.demoMode }
})

export const getClientByEmail = timed('db', 'getClientByEmail', getClientByEmailImpl)

/**
 * List all clients ordered by name, including their users.
 */
const getAllClientsImpl = cache(async (): Promise<(Client & { users: User[] })[]> => {
  return db.query.clients.findMany({
    orderBy: (c, { asc }) => [asc(c.name)],
    with: { users: true },
  })
})

export const getAllClients = timed('db', 'getAllClients', getAllClientsImpl)

/**
 * Read + validate a client's configurable dashboard. Returns null when the
 * column is empty OR fails validation (a corrupt/legacy row degrades to
 * "no dashboard" rather than crashing the page).
 */
const getDashboardConfigImpl = cache(async (slug: string): Promise<DashboardConfig | null> => {
  const client = await getClientBySlug(slug)
  if (!client?.dashboardConfig) return null
  const parsed = parseDashboardConfig(client.dashboardConfig)
  return parsed.ok ? parsed.config : null
})

export const getDashboardConfig = timed(
  'db',
  'getDashboardConfig',
  getDashboardConfigImpl,
  ([slug]) => ({ client: slug }),
)

/** Cached distinct values for one SM dimension (per client/dsId/account). null if not cached. */
export async function getCachedSmDimensionValues(
  slug: string, dsId: string, account: string, column: string,
): Promise<{ values: string[]; fetchedAt: Date } | null> {
  const row = await db
    .select({ values: smDimensionValueCache.values, fetchedAt: smDimensionValueCache.fetchedAt })
    .from(smDimensionValueCache)
    .where(and(
      eq(smDimensionValueCache.clientSlug, slug),
      eq(smDimensionValueCache.dsId, dsId),
      eq(smDimensionValueCache.account, account),
      eq(smDimensionValueCache.column, column),
    ))
    .limit(1)
  return row[0] ?? null
}

/** Insert-or-update the cached values, stamping fetchedAt = now. */
export async function upsertSmDimensionValues(
  slug: string, dsId: string, account: string, column: string, values: string[],
): Promise<void> {
  await db
    .insert(smDimensionValueCache)
    .values({ clientSlug: slug, dsId, account, column, values })
    .onConflictDoUpdate({
      target: [smDimensionValueCache.clientSlug, smDimensionValueCache.dsId, smDimensionValueCache.account, smDimensionValueCache.column],
      set: { values, fetchedAt: new Date() },
    })
}

/** Cache rows older than `olderThan` (the cron re-warm list). */
export async function listStaleSmDimensionCacheRows(
  olderThan: Date,
): Promise<{ clientSlug: string; dsId: string; account: string; column: string }[]> {
  return db
    .select({
      clientSlug: smDimensionValueCache.clientSlug,
      dsId: smDimensionValueCache.dsId,
      account: smDimensionValueCache.account,
      column: smDimensionValueCache.column,
    })
    .from(smDimensionValueCache)
    .where(lt(smDimensionValueCache.fetchedAt, olderThan))
}
