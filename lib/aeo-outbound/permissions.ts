import { isAvenueZEmail } from '@/lib/commentary/permissions'
import { isStaff } from '@/lib/auth/route-access'

/** AEO_OUTBOUND_USERS parsed: trimmed, lowercased, blanks dropped. Unset or empty means nobody. */
export function outboundUsers(env: string | undefined): Set<string> {
  return new Set((env ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))
}

/** The caller's email when they are staff, @avenuez.com and on AEO_OUTBOUND_USERS; otherwise null. */
export function outboundEmail(
  user: { role?: string | null; email?: string | null } | null | undefined,
  env: string | undefined = process.env.AEO_OUTBOUND_USERS,
): string | null {
  if (!user || !isStaff({ role: user.role ?? null })) return null
  const email = user.email?.trim().toLowerCase()
  if (!email || !isAvenueZEmail(email)) return null
  return outboundUsers(env).has(email) ? email : null
}

/** Browser writes must come from this same host. No Origin header (server-to-server, curl) passes;
 *  the session check still applies. */
export function originAllowed(origin: string | null, host: string | null): boolean {
  if (origin === null) return true
  if (!host) return false
  try { return new URL(origin).host === host } catch { return false }
}
