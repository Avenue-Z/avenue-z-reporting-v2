import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { clients, users, type Client, type User, type ClientRole } from './schema'

/**
 * Find one client by slug, including its users.
 * Returns null if not found. Per-render deduplicated via React.cache.
 */
export const getClientBySlug = cache(async (slug: string): Promise<(Client & { users: User[] }) | null> => {
  const row = await db.query.clients.findFirst({
    where: eq(clients.slug, slug),
    with: { users: true },
  })
  return row ?? null
})

/**
 * Find one user by email, returning a flattened shape that matches
 * the legacy getClientByEmail contract: { email, role, slug }.
 * Returns null if not found.
 */
export const getClientByEmail = cache(async (email: string): Promise<{ email: string; role: ClientRole; slug: string } | null> => {
  const row = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
    with: { client: true },
  })
  if (!row) return null
  return { email: row.email, role: row.role, slug: row.client.slug }
})

/**
 * List all clients ordered by name, including their users.
 */
export const getAllClients = cache(async (): Promise<(Client & { users: User[] })[]> => {
  return db.query.clients.findMany({
    orderBy: (c, { asc }) => [asc(c.name)],
    with: { users: true },
  })
})
