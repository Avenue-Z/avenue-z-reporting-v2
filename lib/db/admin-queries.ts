import { sql, eq, and } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from './client'
import { clients, users, type ClientRole } from './schema'
import { interpretAddResult } from './seat-result'

export { interpretAddResult }

export async function getClientAccessOverview(slug: string) {
  const row = await db.query.clients.findFirst({
    where: eq(clients.slug, slug),
    with: { users: true },
  })
  if (!row) return null
  return {
    clientId: row.id,
    slug: row.slug,
    name: row.name,
    maxSeats: row.maxSeats,
    hasPassword: !!row.sharedPasswordHash,
    users: row.users
      .filter((u) => u.role === 'CLIENT_ADMIN' || u.role === 'CLIENT_VIEWER')
      .map((u) => ({ id: u.id, email: u.email, role: u.role })),
  }
}

export async function setClientSharedPassword(clientId: string, hash: string): Promise<void> {
  await db.update(clients).set({ sharedPasswordHash: hash, updatedAt: new Date() }).where(eq(clients.id, clientId))
  revalidateTag('db', 'max')
}

export async function setClientMaxSeats(
  clientId: string,
  maxSeats: number,
): Promise<{ ok: boolean; reason?: 'below_current_count' }> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.clientId, clientId))
  if (maxSeats < count) return { ok: false, reason: 'below_current_count' }
  await db.update(clients).set({ maxSeats, updatedAt: new Date() }).where(eq(clients.id, clientId))
  revalidateTag('db', 'max')
  return { ok: true }
}

/**
 * Atomic seat-capped insert. The neon-http driver has no interactive
 * transactions, so the count check and the insert are one statement:
 * the row is inserted only if the client is below max_seats. The unique
 * email constraint distinguishes "duplicate" from "seat limit".
 */
export async function addClientUser(args: {
  clientId: string
  email: string
  role: 'CLIENT_ADMIN' | 'CLIENT_VIEWER'
}): Promise<{ ok: boolean; reason?: 'seat_limit' | 'duplicate' }> {
  const email = args.email.toLowerCase()
  let insertedRows = 0
  let duplicate = false
  try {
    const res = await db.execute(sql`
      INSERT INTO users (email, role, client_id)
      SELECT ${email}, ${args.role}::client_role, ${args.clientId}::uuid
      WHERE (SELECT count(*) FROM users WHERE client_id = ${args.clientId}::uuid)
            < (SELECT max_seats FROM clients WHERE id = ${args.clientId}::uuid)
      RETURNING id
    `)
    // neon-http returns { rows: [...] }; fall back to array shape defensively.
    const rows = (res as { rows?: unknown[] }).rows ?? (res as unknown as unknown[])
    insertedRows = Array.isArray(rows) ? rows.length : 0
  } catch (e) {
    // Unique violation on users.email -> the email is already provisioned somewhere.
    if (e instanceof Error && /unique|duplicate key/i.test(e.message)) duplicate = true
    else throw e
  }
  if (insertedRows > 0) revalidateTag('db', 'max')
  return interpretAddResult({ insertedRows, duplicate })
}

export async function removeClientUser(args: {
  clientId: string
  userId: string
}): Promise<{ ok: boolean; reason?: 'not_found' }> {
  const deleted = await db
    .delete(users)
    .where(and(eq(users.id, args.userId), eq(users.clientId, args.clientId)))
    .returning({ id: users.id })
  if (deleted.length === 0) return { ok: false, reason: 'not_found' }
  revalidateTag('db', 'max')
  return { ok: true }
}
