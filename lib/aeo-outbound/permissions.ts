import { isAvenueZEmail } from '@/lib/commentary/permissions'
import { isStaff } from '@/lib/auth/route-access'

/** AEO_OUTBOUND_USERS parsed: trimmed, lowercased, blanks dropped. Unset or empty means nobody. */
export function outboundUsers(env: string | undefined): Set<string> {
  return new Set((env ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))
}

/**
 * The caller's email and admin flag when they are staff, @avenuez.com, and on AEO_OUTBOUND_USERS or a settings list;
 * otherwise null (spec v1.1 §8). The env list is the floor: everyone on it is a user and an admin. A settings admin is
 * also a user.
 */
export function accessFor(
  user: { role?: string | null; email?: string | null } | null | undefined,
  envUsers: Set<string>,
  lists: { users: readonly string[]; admins: readonly string[] },
): { email: string; admin: boolean } | null {
  if (!user || !isStaff({ role: user.role ?? null })) return null
  const email = user.email?.trim().toLowerCase()
  if (!email || !isAvenueZEmail(email)) return null
  const admin = envUsers.has(email) || lists.admins.includes(email)
  return admin || lists.users.includes(email) ? { email, admin } : null
}

/** Browser writes must come from this same host. No Origin header (server-to-server, curl) passes;
 *  the session check still applies. */
export function originAllowed(origin: string | null, host: string | null): boolean {
  if (origin === null) return true
  if (!host) return false
  try { return new URL(origin).host === host } catch { return false }
}
