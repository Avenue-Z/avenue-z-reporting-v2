'use server'

import { auth } from '@/auth'
import { normalizeEmail, isValidEmail, loginUrl } from '@/lib/admin/access'
import { getClientAccessOverview, addClientUser, removeClientUser } from '@/lib/db/admin-queries'

/** Require a CLIENT_ADMIN acting on THEIR OWN client. Returns the clientId and caller's email. */
async function requireClientAdminOf(slug: string): Promise<{ clientId: string; email: string }> {
  const session = await auth()
  if (!session || session.user.role !== 'CLIENT_ADMIN' || session.user.clientSlug !== slug) {
    throw new Error('Forbidden')
  }
  const overview = await getClientAccessOverview(slug)
  if (!overview) throw new Error('Unknown client')
  const email = (session.user.email ?? '').toLowerCase()
  return { clientId: overview.clientId, email }
}

export async function inviteTeammateAction(slug: string, rawEmail: string) {
  const { clientId } = await requireClientAdminOf(slug)
  const email = normalizeEmail(rawEmail)
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email.' }
  const res = await addClientUser({ clientId, email, role: 'CLIENT_VIEWER' })
  if (!res.ok) {
    return { ok: false, error: res.reason === 'duplicate' ? 'That email already has access.' : 'You have reached your seat limit. Contact Avenue Z to add more.' }
  }
  return { ok: true, loginUrl: loginUrl() }
}

export async function removeTeammateAction(slug: string, userId: string) {
  const { clientId, email: selfEmail } = await requireClientAdminOf(slug)
  // Guard: an admin cannot remove themselves, and cannot remove another admin.
  const overview = await getClientAccessOverview(slug)
  const target = overview?.users.find((u) => u.id === userId)
  if (!target) return { ok: false, error: 'User not found.' }
  if (target.role === 'CLIENT_ADMIN') return { ok: false, error: 'Cannot remove an admin seat.' }
  if (target.email === selfEmail) return { ok: false, error: 'Cannot remove yourself.' }
  const res = await removeClientUser({ clientId, userId })
  if (!res.ok) return { ok: false, error: 'User not found.' }
  return { ok: true }
}
