import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { clients, users, healthState, type Client, type User, type ClientRole } from './schema'
import type { HealthStatus, StoredHealth } from '@/lib/health/types'
import { cached } from '@/lib/cache'
import { timed } from '@/lib/perf'

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
