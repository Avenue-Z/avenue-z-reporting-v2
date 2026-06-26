'use server'

import { auth } from '@/auth'
import { hashPassword } from '@/lib/auth/password'
import { normalizeEmail, isValidEmail, loginUrl } from '@/lib/admin/access'
import {
  getClientAccessOverview,
  setClientSharedPassword,
  setClientMaxSeats,
  addClientUser,
} from '@/lib/db/admin-queries'

async function requireInternalAdmin() {
  const session = await auth()
  if (!session || session.user.role !== 'INTERNAL_ADMIN') {
    throw new Error('Forbidden')
  }
}

export async function setSharedPasswordAction(slug: string, password: string) {
  await requireInternalAdmin()
  if (!password || password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' }
  const client = await getClientAccessOverview(slug)
  if (!client) return { ok: false, error: 'Unknown client.' }
  await setClientSharedPassword(client.clientId, await hashPassword(password))
  return { ok: true }
}

export async function setMaxSeatsAction(slug: string, maxSeats: number) {
  await requireInternalAdmin()
  if (!Number.isInteger(maxSeats) || maxSeats < 1 || maxSeats > 100) {
    return { ok: false, error: 'Seat limit must be between 1 and 100.' }
  }
  const client = await getClientAccessOverview(slug)
  if (!client) return { ok: false, error: 'Unknown client.' }
  const res = await setClientMaxSeats(client.clientId, maxSeats)
  if (!res.ok) return { ok: false, error: 'Seat limit is below the current number of users.' }
  return { ok: true }
}

export async function assignClientAdminAction(slug: string, rawEmail: string) {
  await requireInternalAdmin()
  const email = normalizeEmail(rawEmail)
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email.' }
  const client = await getClientAccessOverview(slug)
  if (!client) return { ok: false, error: 'Unknown client.' }
  const res = await addClientUser({ clientId: client.clientId, email, role: 'CLIENT_ADMIN' })
  if (!res.ok) {
    return { ok: false, error: res.reason === 'duplicate' ? 'That email is already assigned to a client.' : 'Seat limit reached — raise it first.' }
  }
  return { ok: true, loginUrl: loginUrl() }
}
