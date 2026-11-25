import { isAvenueZEmail } from '@/lib/commentary/permissions'
import { viewerForRole } from '@/lib/organic-social/reporting-months'

/** Staff = an internal team role AND an @avenuez.com email. A client role is a client whatever its email. */
export function isTechAuditStaff(session: { user?: { email?: string | null; role?: unknown } } | null): boolean {
  const user = session?.user
  return viewerForRole(user?.role) === 'team' && isAvenueZEmail(user?.email)
}
