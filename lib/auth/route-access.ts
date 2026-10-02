import { isClientRole } from '@/lib/admin/access'
import { isInternalStaff } from '@/lib/dashboard/permissions'

export type RouteAccess = 'allow' | 'login' | 'unauthorized'
type Who = { role?: string | null; clientSlug?: string | null }

/** Internal Avenue Z staff (INTERNAL_ADMIN, INTERNAL_ANALYST). */
export function isStaff(who: Who): boolean {
  return isInternalStaff(who.role ?? '')
}

/** Whether this session may open client `slug`'s portal: staff always; a client role only its own
 *  slug. The slug is compared exactly as given, so anything that is not literally the client's own
 *  slug is refused, and any role that is not one of ours is refused (fail closed). */
export function canOpenPortal(slug: string, who: Who): boolean {
  if (isStaff(who)) return true
  return isClientRole(who.role ?? '') && slug !== '' && slug === who.clientSlug
}

/** Who may open a path under /dashboard, /tools or /portal (the proxy's matcher). The same rule the
 *  layouts apply (they call isStaff and canOpenPortal), enforced where every request passes: staff reach everything, a client reaches only
 *  /portal/<its own slug>. A layout alone cannot guard a page, because a navigation request tells the
 *  server which layouts the browser already holds and Next skips rendering those. Each page also
 *  checks its own slug (lib/auth/page-access.ts), so no single check is the only one. */
export function routeAccess(pathname: string, session: Who | null): RouteAccess {
  if (!session) return 'login'
  if (isStaff(session)) return 'allow'
  const [, area, slug] = pathname.split('/')
  return area === 'portal' && canOpenPortal(slug ?? '', session) ? 'allow' : 'unauthorized'
}
