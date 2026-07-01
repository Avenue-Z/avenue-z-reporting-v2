import { cache } from 'react'
import { eq, and, lt } from 'drizzle-orm'
import { db } from './client'
import { clients, users, healthState, smDimensionValueCache, dashboardShares, sectionTemplates, type Client, type User, type ClientRole } from './schema'
import type { SectionTemplate } from '@/lib/report-sections/types'
import type { HealthStatus, StoredHealth } from '@/lib/health/types'
import { cached } from '@/lib/cache'
import { timed } from '@/lib/perf'
import { HIDDEN_CLIENT_SLUGS } from '@/lib/constants'
import type { DashboardConfig } from '@/lib/dashboard/types'
import { parseDashboardConfig } from '@/lib/dashboard/persistence'

/**
 * Find one client by slug, including its users. Returns null if not found.
 *
 * Persistently cached (5-min TTL) so report navigations don't re-query Neon on
 * every server render — the dominant per-navigation cost once data fetches are
 * cache hits. React.cache (outer) dedups within a single render; cached() (inner)
 * persists across requests. Client config changes rarely; staleness is bounded
 * by the TTL and bustable via revalidateTag('db'). Slug-tagged for PERF logs.
 */
const getClientBySlugImpl = async (slug: string): Promise<(Client & { users: User[] }) | null> => {
  const row = await db.query.clients.findFirst({
    where: eq(clients.slug, slug),
    with: { users: true },
  })
  return row ?? null
}

export const getClientBySlug = cache(
  cached('db', 'getClientBySlug', getClientBySlugImpl, {
    ttlSeconds: 300,
    tags: ['db'],
    extractTags: ([slug]) => ({ client: slug }),
  }),
)

/**
 * Find one user by email. Returns the user's role and their client slug.
 * Returns null if not found.
 */
const getClientByEmailImpl = cache(async (email: string): Promise<{ email: string; role: ClientRole; slug: string } | null> => {
  const row = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
    with: { client: true },
  })
  if (!row) return null
  return { email: row.email, role: row.role, slug: row.client.slug }
})

export const getClientByEmail = timed('db', 'getClientByEmail', getClientByEmailImpl)

/**
 * Auth-time lookup: the user's role + their client's slug, id, and shared
 * password hash. Not cached — runs only on sign-in. Returns null if unknown.
 */
export async function getUserAuthRecord(email: string): Promise<{
  email: string
  role: ClientRole
  clientId: string
  slug: string
  sharedPasswordHash: string | null
} | null> {
  const row = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
    with: { client: true },
  })
  if (!row) return null
  return {
    email: row.email,
    role: row.role,
    clientId: row.clientId,
    slug: row.client.slug,
    sharedPasswordHash: row.client.sharedPasswordHash,
  }
}

/**
 * List all clients ordered by name, including their users.
 */
const getAllClientsImpl = async (): Promise<(Client & { users: User[] })[]> => {
  return db.query.clients.findMany({
    orderBy: (c, { asc }) => [asc(c.name)],
    with: { users: true },
  })
}

// Persistently cached (5-min TTL); called once per render by the dashboard
// layout. See getClientBySlug for the rationale and staleness tradeoff.
export const getAllClients = cache(
  cached('db', 'getAllClients', getAllClientsImpl, { ttlSeconds: 300, tags: ['db'] }),
)

/**
 * Clients shown in the /dashboard client lists. Excludes HIDDEN_CLIENT_SLUGS —
 * dashboard-only hosts (e.g. kind-patches) that are surfaced via Tools → Reporting,
 * not as real clients. Operational callers (cache-warm, health sweep) still use
 * getAllClients so those hosts keep working.
 */
export const getVisibleClients = cache(async (): Promise<(Client & { users: User[] })[]> => {
  const all = await getAllClients()
  return all.filter((c) => !HIDDEN_CLIENT_SLUGS.has(c.slug))
})

/**
 * All stored health rows. NOT cached — the sweep needs the live table, and it
 * writes to it in the same run.
 */
export async function getAllHealthState(): Promise<StoredHealth[]> {
  const rows = await db
    .select({ key: healthState.key, status: healthState.status, detail: healthState.detail })
    .from(healthState)
  return rows.map((r) => ({ key: r.key, status: r.status as HealthStatus, detail: r.detail }))
}

/**
 * Upsert each observed unit's status. `since` is bumped only when the status
 * actually changed (changed === true); unchanged rows keep their original
 * `since` so it reflects when the current state began.
 */
export async function upsertHealthState(
  rows: Array<{ key: string; status: HealthStatus; detail?: string; changed: boolean }>,
): Promise<void> {
  for (const r of rows) {
    await db
      .insert(healthState)
      .values({ key: r.key, status: r.status, detail: r.detail ?? null })
      .onConflictDoUpdate({
        target: healthState.key,
        set: {
          status: r.status,
          detail: r.detail ?? null,
          updatedAt: new Date(),
          ...(r.changed ? { since: new Date() } : {}),
        },
      })
  }
}

// --- Configurable dashboard ---

/**
 * Parsed dashboard config for a client, or null when the column is empty OR fails
 * validation (a corrupt/legacy row degrades to "no dashboard" rather than crashing).
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

// --- Public dashboard sharing ---

/** Resolve a public share token → the client + selected blocks. Returns null when the
 *  token is unknown or expired. React.cache for per-request dedup on the public page. */
export const getDashboardShareByToken = cache(
  async (token: string): Promise<{ clientSlug: string; title: string; blockIds: string[] } | null> => {
    const r = (await db.select().from(dashboardShares).where(eq(dashboardShares.token, token)).limit(1))[0]
    if (!r) return null
    if (r.expiresAt && r.expiresAt.getTime() <= Date.now()) return null
    return { clientSlug: r.clientSlug, title: r.title, blockIds: r.blockIds }
  },
)

/** The existing share for a client (to prefill the Share dialog), or null. */
export async function getDashboardShareForClient(
  slug: string,
): Promise<{ token: string; title: string; blockIds: string[]; expiresAt: Date | null } | null> {
  const r = (await db.select().from(dashboardShares).where(eq(dashboardShares.clientSlug, slug)).limit(1))[0]
  return r ? { token: r.token, title: r.title, blockIds: r.blockIds, expiresAt: r.expiresAt } : null
}

// --- Section templates ---

/**
 * Look up the stored composition for a report section by its slug.
 * Returns null when no row exists (caller should fall back to the code default).
 * React.cache-wrapped for per-render dedup.
 */
export const getSectionTemplate = cache(async (section: string): Promise<SectionTemplate | null> => {
  const rows = await db.select().from(sectionTemplates).where(eq(sectionTemplates.sectionSlug, section)).limit(1)
  return rows[0]?.composition ?? null
})
