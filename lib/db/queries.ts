import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { clients, users, type Client, type User, type ClientRole } from './schema'
import { timed } from '@/lib/perf'

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
