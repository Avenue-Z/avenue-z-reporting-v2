/**
 * Who may save a client's configurable dashboard.
 * Internal Avenue Z staff (INTERNAL_ADMIN, INTERNAL_ANALYST): any client — every
 * @avenuez.com sign-in resolves to one of these (see auth.ts). CLIENT_ADMIN: only
 * its own client. Everyone else: no.
 * `role`/`clientSlug` come straight off session.user (typed string / string|null).
 */
const INTERNAL_ROLES = new Set(['INTERNAL_ADMIN', 'INTERNAL_ANALYST'])

export function canEditDashboard(role: string, clientSlug: string | null, targetSlug: string): boolean {
  if (INTERNAL_ROLES.has(role)) return true
  if (role === 'CLIENT_ADMIN') return clientSlug === targetSlug
  return false
}
