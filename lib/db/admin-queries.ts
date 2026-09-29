import { sql, eq, and, inArray, type SQL } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { CLIENT_ROLES } from '@/lib/admin/access'
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

/**
 * The rows that take a seat: this client's own logins. Staff rows attached to a client are not
 * seats, which is what both screens already show (getClientAccessOverview above).
 */
function seatedUsers(clientId: string): SQL {
  return and(eq(users.clientId, clientId), inArray(users.role, [...CLIENT_ROLES]))!
}

export function seatCountQuery(clientId: string) {
  return db.select({ count: sql<number>`count(*)::int` }).from(users).where(seatedUsers(clientId))
}

export async function setClientMaxSeats(
  clientId: string,
  maxSeats: number,
): Promise<{ ok: boolean; reason?: 'below_current_count' }> {
  const [{ count }] = await seatCountQuery(clientId)
  if (maxSeats < count) return { ok: false, reason: 'below_current_count' }
  await db.update(clients).set({ maxSeats, updatedAt: new Date() }).where(eq(clients.id, clientId))
  revalidateTag('db', 'max')
  return { ok: true }
}

type NewClientUser = {
  clientId: string
  email: string
  role: 'CLIENT_ADMIN' | 'CLIENT_VIEWER'
}

/**
 * Atomic seat-capped insert. The neon-http driver has no interactive
 * transactions, so the count check and the insert are one statement:
 * the row is inserted only if the client's seats are below max_seats.
 */
export function addClientUserStatement(args: NewClientUser): SQL {
  return sql`
      INSERT INTO users (email, role, client_id)
      SELECT ${args.email.toLowerCase()}, ${args.role}::client_role, ${args.clientId}::uuid
      WHERE (SELECT count(*) FROM users WHERE ${seatedUsers(args.clientId)})
            < (SELECT max_seats FROM clients WHERE id = ${args.clientId}::uuid)
      RETURNING id
    `
}

/** The unique email constraint distinguishes "duplicate" from "seat limit". */
export async function addClientUser(args: NewClientUser): Promise<{ ok: boolean; reason?: 'seat_limit' | 'duplicate' }> {
  const email = args.email.toLowerCase()
  let insertedRows = 0
  let duplicate = false
  try {
    const res = await db.execute(addClientUserStatement(args))
    // neon-http returns { rows: [...] }; fall back to array shape defensively.
    const rows = (res as { rows?: unknown[] }).rows ?? (res as unknown as unknown[])
    insertedRows = Array.isArray(rows) ? rows.length : 0
  } catch (e) {
    // Unique violation on users.email -> the email is already provisioned somewhere.
    if (e instanceof Error && /unique|duplicate key/i.test(e.message)) duplicate = true
    else throw e
  }
  // When the client is AT its seat cap, the conditional INSERT inserts 0 rows
  // without ever attempting the insert, so a unique violation never fires. A
  // re-invite of an already-provisioned email would otherwise be misreported as
  // 'seat_limit'. Disambiguate with an existence check before classifying.
  if (insertedRows === 0 && !duplicate) {
    const exists = await db.execute(sql`SELECT 1 FROM users WHERE email = ${email} LIMIT 1`)
    const rows = (exists as { rows?: unknown[] }).rows ?? (exists as unknown as unknown[])
    if (Array.isArray(rows) && rows.length > 0) duplicate = true
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
