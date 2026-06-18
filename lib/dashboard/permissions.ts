/**
 * Who may save a client's configurable dashboard.
 * INTERNAL_ADMIN: any client. CLIENT_ADMIN: only its own client. Everyone else: no.
 * `role`/`clientSlug` come straight off session.user (typed string / string|null).
 */
export function canEditDashboard(role: string, clientSlug: string | null, targetSlug: string): boolean {
  if (role === 'INTERNAL_ADMIN') return true
  if (role === 'CLIENT_ADMIN') return clientSlug === targetSlug
  return false
}
